import express from 'express';
import { connection, programIds, Deserializer, withCache } from '../services/solana';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const crankable = await withCache('crankable_txns', 5, async () => {
            const results: any[] = [];
            const now = Math.floor(Date.now() / 1000);

            // 1. Great Banyan Buds
            const budAccounts = await connection.getProgramAccounts(programIds.banyan, {
                commitment: 'confirmed',
                filters: [{ dataSize: 456 }] // Exact size for BudAccount
            });

            for (const { pubkey, account } of budAccounts) {
                try {
                    const bud = Deserializer.deserializeBud(account.data);
                    
                    const isNew = !bud.isBloomed && !bud.isFruit;
                    const isReadyToBloom = BigInt(bud.vitalityCurrent) >= BigInt(bud.vitalityRequired) && !bud.isBloomed;
                    const hasUnclaimedPrizes = !bud.isPayoutComplete && bud.contributionCount > 0 && Number(bud.vitalityCurrent) > 0; // rough heuristic

                    if (isNew || isReadyToBloom || hasUnclaimedPrizes) {
                        results.push({
                            type: 'banyan_bud',
                            address: pubkey.toString(),
                            action: isNew ? 'Initialize/Nurture' : (isReadyToBloom ? 'Bloom' : 'Claim Prize'),
                            details: `Vit: ${bud.vitalityCurrent}/${bud.vitalityRequired}`,
                            timestamp: now
                        });
                    }
                } catch (e) {
                    // Ignore deserialization errors
                }
            }

            // 2. RPS Timeouts
            const rpsAccounts = await connection.getProgramAccounts(programIds.rps, {
                commitment: 'confirmed',
                filters: [{ dataSize: 528 }]
            });

            for (const { pubkey, account } of rpsAccounts) {
                try {
                    const game = Deserializer.deserializeRPSGame(account.data, pubkey.toString());
                    if (game.state === 'InProgress' || game.state === 'WaitingForPlayers') {
                        if (now > game.last_action_timestamp + 90) {
                            results.push({
                                type: 'rps_timeout',
                                address: pubkey.toString(),
                                action: 'Distribute/Forfeit',
                                details: `Stalled for ${now - game.last_action_timestamp}s`,
                                timestamp: game.last_action_timestamp
                            });
                        }
                    } else if (game.state === 'Finished' && account.lamports > Number(game.buy_in_lamports)) {
                        results.push({
                            type: 'rps_timeout',
                            address: pubkey.toString(),
                            action: 'Distribute Prize',
                            details: 'Game completed naturally',
                            timestamp: game.last_action_timestamp
                        });
                    }
                } catch (e) { }
            }

            // 3. Chess Timeouts 
            const chessAccounts = await connection.getProgramAccounts(programIds.chess, {
                commitment: 'confirmed',
                filters: [{ dataSize: 272 }]
            });

            for (const { pubkey, account } of chessAccounts) {
                 try {
                     const game = Deserializer.deserializeChessGame(account.data, pubkey.toString());
                     // For chess, we'd need to know whose turn it is and their remaining time to be exact.
                     // The deserializer currently doesn't expose the turn or exact remaining times easily.
                     // For now, if the game has been inactive for a long time (> 10 mins), it might be timed out.
                     if (game.state === 'InProgress') {
                         if (now > game.last_action_timestamp + 600) {
                             results.push({
                                 type: 'chess_timeout',
                                 address: pubkey.toString(),
                                 action: 'Distribute Timeout',
                                 details: `Inactive for ${Math.floor((now - game.last_action_timestamp) / 60)}m`,
                                 timestamp: game.last_action_timestamp
                             });
                         }
                     } else if (game.state === 'Finished' && account.lamports > Number(game.buy_in_lamports)) {
                         results.push({
                             type: 'chess_timeout',
                             address: pubkey.toString(),
                             action: 'Distribute Prize',
                             details: 'Game completed naturally',
                             timestamp: game.last_action_timestamp
                         });
                     }
                 } catch (e) {}
            }

            return results.sort((a, b) => a.timestamp - b.timestamp);
        });

        res.json(crankable);
    } catch (error) {
        console.error('Error fetching crankable txns:', error);
        res.status(500).json({ error: 'Failed to fetch crankable txns' });
    }
});

export default router;
