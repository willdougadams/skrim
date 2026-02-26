import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { IdiotChessEngine, Piece, PieceType, Player } from '../components/idiot_chess/GameEngine';
import Board from '../components/idiot_chess/Board';
import GameOverOverlay from '../components/idiot_chess/GameOverOverlay';
import GameInfo from '../components/idiot_chess/GameInfo';
import { createWeb3ProgramClient } from '../services/web3ProgramClient';
import { GameService } from '../services/gameService';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { Trophy, Users, Shield, Cpu, ExternalLink, RefreshCw } from 'lucide-react';

const IdiotChessPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { publicKey, connected } = useWallet();
    const wallet = useWallet();
    const { connection } = useConnection();
    const { showToast, updateToast } = useToast();

    const gameId = searchParams.get('gameId');
    const mode = searchParams.get('mode') || (gameId ? 'live' : 'practice');
    const isLive = mode === 'live' && gameId;

    // Use ref to keep engine instance stable, state to trigger re-renders
    const engineRef = useRef(new IdiotChessEngine());
    const [gameState, setGameState] = useState(engineRef.current.getState());
    const [onChainData, setOnChainData] = useState<any>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const refreshOnChain = useCallback(async (silent = false) => {
        if (!isLive || !gameId) return;
        if (!silent) setIsRefreshing(true);
        try {
            const gameService = new GameService(connection);
            const gameData = await gameService.fetchGameDetails(gameId, 'chess');
            console.log('[IdiotChessPage] Fetched gameData:', gameData);
            if (gameData) {
                console.log('[IdiotChessPage] gameData.pieces:', gameData.pieces);
                setOnChainData(gameData);

                // Sync engine if it's not our turn or if we just joined
                // Actually, just sync whenever on-chain state changes
                const board: (Piece | null)[][] = Array(5).fill(null).map(() => Array(5).fill(null));

                // Construct board from on-chain pieces
                if (gameData.pieces && Array.isArray(gameData.pieces)) {
                    gameData.pieces.forEach((p: any) => {
                        const player: Player = p.playerValue === 0 ? 'white' : 'black';
                        const type: PieceType = p.pieceType === 1 ? 'king' : 'pawn';
                        if (p.x < 5 && p.y < 5) {
                            board[p.y][p.x] = {
                                id: p.id || `${player}-${type}-${p.x}-${p.y}`,
                                type: type,
                                player: player
                            };
                        }
                    });
                }

                const turn: Player = gameData.turn === 0 ? 'white' : 'black';
                const winner: Player | 'draw' | null = gameData.winner === 1 ? 'white' : (gameData.winner === 2 ? 'black' : (gameData.winner === 3 ? 'draw' : null));

                engineRef.current.forceSetState({
                    board,
                    turn,
                    winner,
                    moveCount: gameData.moveCount || 0
                });
                setGameState({ ...engineRef.current.getState() });
            }
        } catch (e) {
            console.error('Failed to sync on-chain state:', e);
        } finally {
            if (!silent) setIsRefreshing(false);
        }
    }, [isLive, gameId, connection]);

    useEffect(() => {
        if (isLive) {
            refreshOnChain();
            const interval = setInterval(() => refreshOnChain(true), 5000);
            return () => clearInterval(interval);
        }
    }, [isLive, refreshOnChain]);

    const handleMove = async (from?: { x: number, y: number }, to?: { x: number, y: number }) => {
        // Local state update
        setGameState({ ...engineRef.current.getState() });

        if (isLive && from && to) {
            if (!connected) {
                showToast('Connect wallet to make on-chain moves', 'error');
                return;
            }

            setIsSubmitting(true);
            const toastId = showToast('Submitting move to Solana...', 'loading');
            try {
                const client = createWeb3ProgramClient(connection, wallet, 'chess');
                await client.makeChessMove(gameId as string, from.x, from.y, to.x, to.y);
                updateToast(toastId, 'Move confirmed!', 'success');
                refreshOnChain(true);
            } catch (e: any) {
                console.error(e);
                updateToast(toastId, e.message || 'Transaction failed', 'error');
                // Revert local engine state on failure
                refreshOnChain();
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleReset = () => {
        if (isLive) {
            refreshOnChain();
        } else {
            engineRef.current = new IdiotChessEngine();
            setGameState(engineRef.current.getState());
        }
    };

    const handleClaimPrize = async () => {
        if (!isLive || !gameId || !connected) return;
        const toastId = showToast('Claiming prize...', 'loading');
        try {
            const client = createWeb3ProgramClient(connection, wallet, 'chess');
            await client.claimChessPrize(gameId);
            updateToast(toastId, 'Prize claimed!', 'success');
            refreshOnChain();
        } catch (e: any) {
            console.error(e);
            updateToast(toastId, e.message || 'Claim failed', 'error');
        }
    };

    // Computer Player Logic (Practice Mode Only)
    useEffect(() => {
        if (!isLive && gameState.turn === 'black' && !gameState.winner) {
            const timer = setTimeout(() => {
                const moved = engineRef.current.makeSmartMove(3);
                if (moved) {
                    handleMove();
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isLive, gameState.turn, gameState.winner]);

    const isMyTurn = () => {
        if (!isLive) return true; // In practice mode, you can move whenever
        if (!onChainData || !publicKey) return false;

        const myPlayerType = onChainData.playerWhite === publicKey.toString() ? 'white' :
            (onChainData.playerBlack === publicKey.toString() ? 'black' : null);

        return myPlayerType === gameState.turn;
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/idiot-chess-lobby')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            backgroundColor: theme.colors.surface,
                            border: `1px solid ${theme.colors.border}`,
                            color: theme.colors.text.primary,
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        ← Lobby
                    </button>
                    <div>
                        <h1 style={{ margin: 0, color: theme.colors.text.primary, fontSize: '1.5rem' }}>Idiot Chess</h1>
                        <div style={{
                            fontSize: '0.8rem',
                            color: isLive ? theme.colors.success : theme.colors.primary.main,
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            marginTop: '0.2rem'
                        }}>
                            {isLive ? <Shield size={12} /> : <Cpu size={12} />}
                            {isLive ? 'LIVE ON-CHAIN MATCH' : 'LOCAL PRACTICE MODE'}
                        </div>
                    </div>
                </div>

                {isLive && (
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <button
                            onClick={() => refreshOnChain()}
                            disabled={isRefreshing}
                            style={{
                                padding: '0.6rem',
                                backgroundColor: theme.colors.surface,
                                border: `1px solid ${theme.colors.border}`,
                                color: theme.colors.text.secondary,
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                        </button>
                        {gameState.winner && onChainData && !onChainData.prizeClaimed && (
                            <button
                                onClick={handleClaimPrize}
                                style={{
                                    padding: '0.6rem 1.5rem',
                                    backgroundColor: theme.colors.success,
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Claim Prize Pool
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div style={{
                display: 'flex',
                flexDirection: window.innerWidth < 1000 ? 'column' : 'row',
                gap: '2rem',
                alignItems: 'stretch',
                flex: 1
            }}>
                <div style={{
                    position: 'relative',
                    flex: '1.5',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    minWidth: 0
                }}>
                    <Board
                        engine={engineRef.current}
                        state={gameState}
                        onMove={handleMove}
                        disabled={!!(isSubmitting || (isLive && !isMyTurn()))}
                    />
                    <GameOverOverlay
                        winner={gameState.winner}
                        onReset={handleReset}
                    />

                    {isLive && !isMyTurn() && !gameState.winner && (
                        <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            textAlign: 'center',
                            border: `1px solid ${theme.colors.border}`
                        }}>
                            <Users size={20} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                            <p style={{ margin: 0, color: theme.colors.text.secondary }}>
                                Waiting for opponent to move on-chain...
                            </p>
                        </div>
                    )}
                </div>

                <div style={{
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    minWidth: window.innerWidth < 1000 ? '100%' : '350px',
                    maxWidth: window.innerWidth < 1000 ? '100%' : '450px'
                }}>
                    <GameInfo state={gameState} />

                    {isLive && onChainData && (
                        <div style={{
                            padding: '1.5rem',
                            backgroundColor: theme.colors.surface,
                            borderRadius: '16px',
                            border: `1px solid ${theme.colors.border}`,
                            marginTop: '1rem'
                        }}>
                            <h3 style={{ margin: '0 0 1rem 0', color: theme.colors.text.primary, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Trophy size={18} color={theme.colors.warning} /> Prize Pool Details
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: theme.colors.text.secondary }}>Pot Total:</span>
                                    <span style={{ fontWeight: 'bold' }}>{(onChainData.buyIn / 1e9) * 2} SOL</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: theme.colors.text.secondary }}>Status:</span>
                                    <span style={{ color: onChainData.prizeClaimed ? theme.colors.success : theme.colors.warning }}>
                                        {onChainData.prizeClaimed ? 'Distributed' : 'Locked in Escrow'}
                                    </span>
                                </div>
                                <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '0.8rem', marginTop: '0.4rem' }}>
                                    <span style={{ color: theme.colors.text.secondary, fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' }}>Opponent Address:</span>
                                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {onChainData.playerWhite === publicKey?.toString() ? onChainData.playerBlack.slice(0, 8) : onChainData.playerWhite.slice(0, 8)}...
                                        <ExternalLink size={12} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IdiotChessPage;
