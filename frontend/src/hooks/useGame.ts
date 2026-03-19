import { useState, useEffect, useCallback } from 'react';
import { useNetwork } from '../contexts/NetworkContext';

export function useGame(gameId: string, type: 'rps' | 'chess', intervalMs: number = 2000) {
  const { activeClient } = useNetwork();

  const [gameData, setGameData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGame = useCallback(async () => {
    try {
      if (!gameId) return;
      const data = await activeClient.getGameDetails(type, gameId);
      setGameData(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch game:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [activeClient, gameId, type]);
  useEffect(() => {
    setIsLoading(true);
    fetchGame();

    // Set up polling
    if (!gameId) return;
    const timer = setInterval(fetchGame, intervalMs);

    return () => clearInterval(timer);
  }, [fetchGame, gameId, intervalMs]);

  return {
    gameData,
    isLoading,
    error,
    refetch: fetchGame
  };
}
