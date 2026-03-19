import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { keccak_256 } from 'js-sha3';
import { useTranslation } from 'react-i18next';
import { TrustfulClient } from '../services/trustfulClient';
import { createWeb3ProgramClient } from '../services/web3ProgramClient';
import { getProgramId } from '../config/programIds';
import { Settings, RefreshCw, HandMetal, AlertCircle, Clock } from 'lucide-react';
import { theme } from '../theme';
import { useToast } from '../contexts/ToastContext';

interface Crankable {
    type: 'banyan_bud' | 'rps_timeout' | 'chess_timeout';
    address: string;
    action: string;
    details: string;
    timestamp: number;
}

export default function CrankPage() {
    const { publicKey } = useWallet();
    const wallet = useWallet(); // Pass whole wallet to web3 client
    const { connection } = useConnection();
    const { showToast, updateToast } = useToast();
    const { t } = useTranslation();

    const [txns, setTxns] = useState<Crankable[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cranking, setCranking] = useState<string | null>(null);

    const refreshData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const client = new TrustfulClient();
            const data = await client.getCrankableTxns();
            setTxns(data);
        } catch (e) {
            console.error('Failed to fetch crankable txns:', e);
            showToast('Failed to fetch crankable transactions', 'error');
        } finally {
            setIsRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 15000);
        return () => clearInterval(interval);
    }, [refreshData]);

    const findBanyanPda = (data: Buffer[]) => {
        return PublicKey.findProgramAddressSync(data, getProgramId('banyan'));
    };

    const handleNurture = async (budAddressStr: string) => {
        if (!publicKey || !wallet.signTransaction) {
            throw new Error(t('common.connect_wallet'));
        }

        const banyanProgramId = getProgramId('banyan');
        const [managerPda] = findBanyanPda([Buffer.from('manager_v4')]);
        
        // Fetch manager to get current epoch
        const managerInfo = await connection.getAccountInfo(managerPda);
        if (!managerInfo) throw new Error('Failed to fetch Game Manager');
        
        const epoch = managerInfo.data.slice(0, 8).readBigUInt64LE(0);
        const epochBuf = Buffer.alloc(8);
        epochBuf.writeBigUInt64LE(epoch);
        const [treePda] = findBanyanPda([Buffer.from('tree_v4'), epochBuf]);
        
        const nextEpoch = epoch + 1n;
        const nextEpochBuf = Buffer.alloc(8);
        nextEpochBuf.writeBigUInt64LE(nextEpoch);
        const [nextTreePda] = findBanyanPda([Buffer.from('tree_v4'), nextEpochBuf]);
        const [nextRootPda] = findBanyanPda([Buffer.from('bud'), nextTreePda.toBuffer(), Buffer.from('root')]);
        const [nextLeftPda] = findBanyanPda([Buffer.from('bud'), nextRootPda.toBuffer(), Buffer.from('left')]);
        const [nextRightPda] = findBanyanPda([Buffer.from('bud'), nextRootPda.toBuffer(), Buffer.from('right')]);

        const budAddress = new PublicKey(budAddressStr);
        const [leftPda] = findBanyanPda([Buffer.from('bud'), budAddress.toBuffer(), Buffer.from('left')]);
        const [rightPda] = findBanyanPda([Buffer.from('bud'), budAddress.toBuffer(), Buffer.from('right')]);

        showToast('Mining nurture hash...', 'loading');
        
        // Mine the hash
        const essence = "water";
        const slot = await connection.getSlot();

        let bestNonce = 0n;
        let bestGain = 0;

        const essenceBytes = new TextEncoder().encode(essence);
        const buffer = Buffer.alloc(essenceBytes.length + 32 + 32 + 8 + 8);
        let offset = 0;
        buffer.set(essenceBytes, offset); offset += essenceBytes.length;
        buffer.set(budAddress.toBuffer(), offset); offset += 32;
        buffer.set(publicKey.toBuffer(), offset); offset += 32;
        
        const slotBytes = Buffer.alloc(8); slotBytes.writeBigUInt64LE(BigInt(slot));
        buffer.set(slotBytes, offset); offset += 8;
        const nonceOffset = offset; // last 8 bytes are nonce

        // Mine up to 5000 times to find a good hash (target gain >= 5 or best)
        for (let i = 0n; i < 5000n; i++) {
            buffer.writeBigUInt64LE(i, nonceOffset);
            const hash = (keccak_256 as any).array(new Uint8Array(buffer));
            const gain = (hash[0] % 3) + 3;

            if (gain > bestGain) {
                bestGain = gain;
                bestNonce = i;
                if (gain >= 5) break;
            }
        }

        const data = Buffer.alloc(1 + 8 + 8 + 4 + essenceBytes.length);
        data.writeUInt8(2, 0); // Command: Nurture
        data.writeBigUInt64LE(bestNonce, 1);
        data.writeBigUInt64LE(BigInt(slot), 9);
        data.writeUInt32LE(essenceBytes.length, 17);
        data.set(essenceBytes, 21);

        const tx = new Transaction().add({
            keys: [
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: managerPda, isSigner: false, isWritable: true },
                { pubkey: budAddress, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: treePda, isSigner: false, isWritable: false },
                { pubkey: leftPda, isSigner: false, isWritable: true },
                { pubkey: rightPda, isSigner: false, isWritable: true },
                { pubkey: nextTreePda, isSigner: false, isWritable: true },
                { pubkey: nextRootPda, isSigner: false, isWritable: true },
                { pubkey: nextLeftPda, isSigner: false, isWritable: true },
                { pubkey: nextRightPda, isSigner: false, isWritable: true },
            ],
            programId: banyanProgramId,
            data
        });

        // Web3Client style signature fetch
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        
        const signedTransaction = await wallet.signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
        return signature;
    };

    const handleCrank = async (item: Crankable) => {
        if (!publicKey) {
            showToast(t('common.connect_wallet'), 'error');
            return;
        }

        setCranking(item.address);
        const toastId = showToast(`Cranking ${item.action}...`, 'loading');

        try {
            let signature = '';
            if (item.type === 'rps_timeout') {
                const client = createWeb3ProgramClient(connection, wallet, 'rps');
                signature = await client.distributePrize(item.address);
            } else if (item.type === 'chess_timeout') {
                const client = createWeb3ProgramClient(connection, wallet, 'chess');
                signature = await client.distributeChessPrize(item.address);
            } else if (item.type === 'banyan_bud') {
                signature = await handleNurture(item.address);
            }

            updateToast(toastId, `Successfully cranked! TX: ${signature.slice(0, 8)}...`, 'success');
            // Remove from local list immediately
            setTxns(prev => prev.filter(t => t.address !== item.address));
        } catch (e: any) {
            console.error('Crank error:', e);
            updateToast(toastId, `Failed to crank: ${e.message || 'Unknown error'}`, 'error');
        } finally {
            setCranking(null);
        }
    };

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '1200px',
            margin: '0 auto',
            minHeight: '100vh',
            color: theme.colors.text.primary
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem',
                background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
                padding: '2rem',
                borderRadius: '16px',
                border: `1px solid ${theme.colors.border}`,
            }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', margin: '0 0 0.5rem 0', color: theme.colors.primary.main }}>
                        <Settings size={32} />
                        Crank Operations
                    </h1>
                    <p style={{ margin: 0, color: theme.colors.text.secondary }}>
                        Execute system transactions (timeouts, tree growth) to earn bounties.
                    </p>
                </div>
                <button
                    onClick={refreshData}
                    disabled={isRefreshing}
                    style={{
                        padding: '0.8rem 1.5rem',
                        backgroundColor: theme.colors.surface,
                        border: `1px solid ${theme.colors.border}`,
                        borderRadius: '8px',
                        color: theme.colors.text.primary,
                        cursor: isRefreshing ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.colors.text.primary}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.colors.border}
                >
                    <RefreshCw size={18} className={isRefreshing ? "spin" : ""} />
                    Refresh
                </button>
            </div>

            <style>
                {`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
                `}
            </style>

            <div style={{
                backgroundColor: theme.colors.surface,
                borderRadius: '16px',
                border: `1px solid ${theme.colors.border}`,
                overflow: 'hidden'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: `1px solid ${theme.colors.border}` }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={20} color={theme.colors.warning} />
                        Available Tasks
                    </h2>
                </div>

                {txns.length === 0 ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: theme.colors.text.secondary }}>
                        <HandMetal size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                        <p style={{ fontSize: '1.1rem', margin: 0 }}>No crankable transactions found.</p>
                        <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>The network is perfectly synchronized.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${theme.colors.border}` }}>
                                <th style={{ padding: '1rem 1.5rem', color: theme.colors.text.secondary, fontWeight: 500 }}>Type</th>
                                <th style={{ padding: '1rem 1.5rem', color: theme.colors.text.secondary, fontWeight: 500 }}>Account Address</th>
                                <th style={{ padding: '1rem 1.5rem', color: theme.colors.text.secondary, fontWeight: 500 }}>Action Needed</th>
                                <th style={{ padding: '1rem 1.5rem', color: theme.colors.text.secondary, fontWeight: 500 }}>Details</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>Execute</th>
                            </tr>
                        </thead>
                        <tbody>
                            {txns.map((item) => (
                                <tr key={item.address} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span style={{
                                            padding: '0.3rem 0.8rem',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            backgroundColor: item.type === 'banyan_bud' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                                            color: item.type === 'banyan_bud' ? theme.colors.success : theme.colors.error,
                                            border: `1px solid ${item.type === 'banyan_bud' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}`
                                        }}>
                                            {item.type.replace('_', ' ').toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                        {item.address.slice(0, 4)}...{item.address.slice(-4)}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>
                                        {item.action}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                                        {item.details}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleCrank(item)}
                                            disabled={cranking !== null || !publicKey}
                                            style={{
                                                padding: '0.6rem 1.2rem',
                                                backgroundColor: theme.colors.primary.main,
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: cranking ? 'wait' : (publicKey ? 'pointer' : 'not-allowed'),
                                                fontWeight: 'bold',
                                                opacity: cranking && cranking !== item.address ? 0.5 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                marginLeft: 'auto'
                                            }}
                                        >
                                            {cranking === item.address ? (
                                                <><RefreshCw size={14} className="spin" /> Executing...</>
                                            ) : (
                                                <><Settings size={14} /> Crank</>
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            
            {!publicKey && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme.colors.warning }}>
                    <AlertCircle size={16} /> <span>Connect your wallet to earn crank bounties.</span>
                </div>
            )}
        </div>
    );
}


