import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const keypairPath = process.argv[2];
if (!keypairPath) {
    console.error("Usage: tsx get-pubkey.ts <path-to-keypair-json>");
    process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), keypairPath);
if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
}

const keyData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keyData));
console.log(keypair.publicKey.toBase58());
