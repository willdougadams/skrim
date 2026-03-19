import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useNetwork } from './NetworkContext';
import { GameListItem } from '../services/gameClient';

export interface EnrichedGame extends GameListItem {
  gameType: 'rps' | 'chess';
  isParticipating: boolean;
  isCreator: boolean;
}

interface GamesContextType {
  rpsGames: EnrichedGame[];
  chessGames: EnrichedGame[];
  allChallenges: EnrichedGame[];
  loading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
}

const GamesContext = createContext<GamesContextType | undefined>(undefined);

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const { connection, activeClient } = useNetwork();
  const { publicKey } = useWallet();

  const [rpsGames, setRpsGames] = useState<EnrichedGame[]>([]);
  const [chessGames, setChessGames] = useState<EnrichedGame[]>([]);
  const [allChallenges, setAllChallenges] = useState<EnrichedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGames = useCallback(async () => {
    if (!connection) {
      console.log('No connection available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [_rpsGames, _chessGames] = await Promise.all([
        activeClient.getLobbyGames('rps'),
        activeClient.getLobbyGames('chess')
      ]);

      const enrichGame = (game: GameListItem, type: 'rps' | 'chess'): EnrichedGame => {
        const isCreator = publicKey ? game.creator === publicKey.toString() : false;
        const isParticipating = publicKey ? game.players.includes(publicKey.toString()) : false;
        return {
          ...game,
          gameType: type,
          isCreator,
          isParticipating
        };
      };

      const mappedRpsGames = _rpsGames.map(g => enrichGame(g, 'rps'));
      const mappedChessGames = _chessGames.map(g => enrichGame(g, 'chess'));

      setRpsGames(mappedRpsGames);
      setChessGames(mappedChessGames);

      // Construct a unified challenges list for the lobby
      // Only include waiting games, or games the active user is participating in
      const validRpsGames = mappedRpsGames.filter(g => g.status === 'waiting' || g.isParticipating);
      // For chess, 'in_progress' is also relevant to show for participants
      const validChessGames = mappedChessGames.filter(g => g.status === 'waiting' || (g.status === 'in_progress' && g.isParticipating));

      const merged = [...validRpsGames, ...validChessGames];
      // Sort: waiting first, then by highest buy-in
      merged.sort((a, b) => {
        if (a.status === 'waiting' && b.status !== 'waiting') return -1;
        if (a.status !== 'waiting' && b.status === 'waiting') return 1;
        return b.buyInSOL - a.buyInSOL;
      });

      setAllChallenges(merged);

    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to load games. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [connection, activeClient, publicKey]);

  // Initial fetch and setup polling interval
  useEffect(() => {
    refreshGames();
    const interval = setInterval(refreshGames, 10000);
    return () => clearInterval(interval);
  }, [refreshGames]);

  return (
    <GamesContext.Provider value={{
      rpsGames,
      chessGames,
      allChallenges,
      loading,
      error,
      refreshGames
    }}>
      {children}
    </GamesContext.Provider>
  );
}

export function useGames() {
  const context = React.useContext(GamesContext);
  if (context === undefined) {
    throw new Error('useGames must be used within a GamesProvider');
  }
  return context;
}
