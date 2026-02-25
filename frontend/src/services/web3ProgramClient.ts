import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair
} from '@solana/web3.js';
import { getProgramId } from '../config/programIds';
import { TransactionPacker as TransactionPacker, AccountSizeCalculator } from './transactionPacker';

export interface CreateChallengeParams {
  entryFee: number; // in SOL
  gameName: string;
  moves: number[];
  salt: bigint;
}

interface GameCreationResult {
  gameId: string;
  signature: string;
}

export class Web3ProgramClient {
  private connection: Connection;
  private wallet: any;
  private programId: PublicKey;

  constructor(connection: Connection, wallet: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = getProgramId(); // Auto-detect network

    console.log('Web3ProgramClient created with program ID:', this.programId.toString());
  }

  async createChallenge(params: CreateChallengeParams): Promise<GameCreationResult> {
    if (!this.wallet.publicKey || !this.wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const gameKeypair = Keypair.generate();
    const gameAccount = gameKeypair.publicKey;

    // 1. Hash moves immediately
    const movesHash = TransactionPacker.hashMoves(params.moves as any, params.salt);
    const buyInLamports = BigInt(Math.floor(params.entryFee * 1_000_000_000));

    // 2. Pack CreateChallenge instruction
    const instructionData = TransactionPacker.packCreateChallenge(
      buyInLamports,
      movesHash,
      params.gameName
    );

    TransactionPacker.logInstruction('CreateChallenge', instructionData);

    const gameSpace = AccountSizeCalculator.calculateGameAccountSize();
    const gameRent = await this.connection.getMinimumBalanceForRentExemption(gameSpace);

    const instructions = [];

    // Create game account
    instructions.push(SystemProgram.createAccount({
      fromPubkey: this.wallet.publicKey,
      newAccountPubkey: gameAccount,
      lamports: gameRent,
      space: gameSpace,
      programId: this.programId,
    }));

    // Transfer buy-in
    instructions.push(SystemProgram.transfer({
      fromPubkey: this.wallet.publicKey,
      toPubkey: gameAccount,
      lamports: Number(buyInLamports),
    }));

    // Challenge instruction
    instructions.push(new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: gameAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: Buffer.from(instructionData),
    }));

    try {
      const transaction = new Transaction();
      instructions.forEach(ix => transaction.add(ix));
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      const signedTransaction = await this.wallet.signTransaction(transaction);
      signedTransaction.partialSign(gameKeypair);

      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return {
        gameId: gameAccount.toString(),
        signature
      };
    } catch (error) {
      console.error('CreateChallenge failed:', error);
      throw error;
    }
  }

  async acceptChallenge(gameId: string, moves: number[]): Promise<string> {
    if (!this.wallet.publicKey || !this.wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const gameAccount = new PublicKey(gameId);
    const accountInfo = await this.connection.getAccountInfo(gameAccount);
    if (!accountInfo) throw new Error('Challenge not found');

    const buyInLamports = accountInfo.data.readBigUInt64LE(368);
    const instructionData = TransactionPacker.packAcceptChallenge(moves as any);

    const transaction = new Transaction();

    // 1. Transfer buy-in
    transaction.add(SystemProgram.transfer({
      fromPubkey: this.wallet.publicKey,
      toPubkey: gameAccount,
      lamports: Number(buyInLamports),
    }));

    // 2. Accept instruction
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: gameAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: Buffer.from(instructionData),
    }));

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTransaction = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  async revealMoves(gameId: string, moves: number[], salt: bigint): Promise<string> {
    if (!this.wallet.publicKey || !this.wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const gameAccount = new PublicKey(gameId);

    const instructionData = TransactionPacker.packRevealMoves(moves as any, salt);

    const revealMovesInstruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: Buffer.from(instructionData),
    });

    const transaction = new Transaction().add(revealMovesInstruction);
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signedTransaction = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  async claimPrize(gameId: string): Promise<string> {
    console.log('claimPrize called with gameId:', gameId);

    if (!this.wallet.publicKey || !this.wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const gameAccount = new PublicKey(gameId);
    console.log('Game account:', gameAccount.toString());

    const instructionData = TransactionPacker.packClaimPrize();
    console.log('Instruction data:', instructionData);

    const claimPrizeInstruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: Buffer.from(instructionData),
    });
    console.log('Claim prize instruction created');

    try {
      const transaction = new Transaction().add(claimPrizeInstruction);
      console.log('Getting latest blockhash...');
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;
      console.log('Transaction constructed, signing...');

      const signedTransaction = await this.wallet.signTransaction(transaction);
      console.log('Transaction signed, sending...');

      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      console.log('Transaction sent:', signature);
      console.log('Confirming transaction...');

      await this.connection.confirmTransaction(signature, 'confirmed');
      console.log('Transaction confirmed!');

      return signature;
    } catch (error) {
      console.error('Error in claimPrize:', error);
      throw error;
    }
  }


  async getGameAccount(gameId: string) {
    try {
      const gameAccount = new PublicKey(gameId);
      const accountInfo = await this.connection.getAccountInfo(gameAccount);

      if (!accountInfo) {
        return null;
      }

      // Parse the account data manually based on the GameAccount structure
      // This would need to match your Rust struct layout
      return {
        data: accountInfo.data,
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        lamports: accountInfo.lamports,
      };
    } catch (error) {
      console.error('Error fetching game account:', error);
      return null;
    }
  }
}

// Factory function
export function createWeb3ProgramClient(connection: Connection, wallet: any): Web3ProgramClient {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet must be connected and have signing capabilities');
  }

  return new Web3ProgramClient(connection, wallet);
}