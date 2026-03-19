import { connection, programIds, Deserializer } from './solana';

export interface GlobalStats {
    totalUniquePlayers: number;
    banyanPoolContributionsLamports: string;
    totalGamesPlayed: number;
    lastUpdated: number;
}

class StatsService {
    private cachedStats: GlobalStats = {
        totalUniquePlayers: 0,
        banyanPoolContributionsLamports: '0',
        totalGamesPlayed: 0,
        lastUpdated: 0,
    };

    private isFetching = false;

    public start() {
        this.fetchStats();
        // Update stats every 5 minutes
        setInterval(() => this.fetchStats(), 5 * 60 * 1000);
    }

    public getStats(): GlobalStats {
        return this.cachedStats;
    }

    private async fetchStats() {
        if (this.isFetching) return;
        this.isFetching = true;

        try {
            console.log('Fetching global stats...');
            const uniquePlayers = new Set<string>();
            let banyanPoolLamports = 0n;
            let totalGames = 0;

            // Fetch RPS Games
            const rpsAccounts = await connection.getProgramAccounts(programIds.rps, {
                commitment: 'confirmed',
                filters: [{ dataSize: 528 }]
            });

            for (const { pubkey, account } of rpsAccounts) {
                try {
                    const game = Deserializer.deserializeRPSGame(account.data, pubkey.toString());
                    totalGames++;

                    game.player_addresses.forEach((addr: string) => uniquePlayers.add(addr));

                    // RPS Banyan Contribution: 1% of the prize pool goes to treasury if there's a winner
                    if (game.state === 'Finished' && game.winner) {
                        const prizePool = BigInt(game.prize_pool);
                        // Platform fee logic from smart contract: wait, it's prize_pool - (prize_pool * 99 / 100)
                        const amountToWinner = (prizePool * 99n) / 100n;
                        const fee = prizePool - amountToWinner;
                        banyanPoolLamports += fee;
                    }
                } catch (e) {
                    // Ignore deserialization errors for individual games
                }
            }

            // Fetch Chess Games
            const chessAccounts = await connection.getProgramAccounts(programIds.chess, {
                commitment: 'confirmed',
                filters: [{ dataSize: 272 }]
            });

            for (const { pubkey, account } of chessAccounts) {
                try {
                    const game = Deserializer.deserializeChessGame(account.data, pubkey.toString());
                    totalGames++;

                    game.player_addresses.forEach((addr: string) => uniquePlayers.add(addr));

                    // Chess Banyan Contribution: 1% of the prize pool if there's a payout (not a draw)
                    // The winner logic in UI is usually string. But looking at rust code it only collects fee if it's not a draw.
                    // winner == None is 0, White is 1, Black is 2, Draw is 3. 
                    // In deserializer, winner exists if it's < 3.
                    if (game.state === 'Finished' && game.winner) {
                        const prizePool = BigInt(game.prize_pool);
                        const platformFee = prizePool / 100n;
                        banyanPoolLamports += platformFee;
                    }
                } catch (e) {
                    // Ignore deserialization errors for individual games
                }
            }

            this.cachedStats = {
                totalUniquePlayers: uniquePlayers.size,
                banyanPoolContributionsLamports: banyanPoolLamports.toString(),
                totalGamesPlayed: totalGames,
                lastUpdated: Date.now(),
            };
            console.log('Global stats updated successfully.');

        } catch (error) {
            console.error('Failed to fetch global stats:', error);
        } finally {
            this.isFetching = false;
        }
    }
}

export const statsService = new StatsService(); 
