import React, { useEffect, useState } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
import { theme } from '../theme';

export const StatsPage: React.FC = () => {
    const { trustfulMode, activeClient } = useNetwork();
    const [stats, setStats] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const fetchStats = async () => {
            if (!trustfulMode) return;
            setLoading(true);
            setError(null);
            try {
                // TrustfulClient has getGlobalStats
                if ('getGlobalStats' in activeClient) {
                    const data = await (activeClient as any).getGlobalStats();
                    if (mounted) setStats(data);
                } else {
                    if (mounted) setError("Client does not support global stats.");
                }
            } catch (err) {
                if (mounted) setError("Failed to load global stats.");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchStats();

        return () => {
            mounted = false;
        };
    }, [trustfulMode, activeClient]);

    return (
        <div style={{
            padding: theme.spacing.xl,
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
        }}>
            <h1 style={{
                fontSize: theme.fontSize['3xl'],
                fontWeight: theme.fontWeight.bold,
                marginBottom: theme.spacing.xl,
                color: theme.colors.text.primary
            }}>
                Platform Stats
            </h1>

            {!trustfulMode ? (
                <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--color-error)',
                    borderRadius: theme.borderRadius.lg,
                    padding: theme.spacing.lg,
                    marginBottom: theme.spacing.xl,
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                }}>
                    <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                    <div>
                        <h3 style={{ 
                            color: 'var(--color-error)', 
                            fontWeight: theme.fontWeight.bold,
                            marginBottom: theme.spacing.xs
                        }}>
                            Trustful Mode Required
                        </h3>
                        <p style={{ color: theme.colors.text.secondary }}>
                            Calculating global statistics requires aggregating hundreds of games. To avoid overwhelming public Solana RPCs with excessive requests, this page is only available when Trustful Mode is enabled. You can enable it in the network settings.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {loading && <p style={{ color: theme.colors.text.secondary }}>Loading global metrics...</p>}
                    {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}
                    
                    {stats && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            gap: theme.spacing.lg,
                        }}>
                            <StatCard 
                                title="Total Unique Players" 
                                value={stats.totalUniquePlayers.toLocaleString()} 
                                icon="👥"
                            />
                            <StatCard 
                                title="Total Games Played" 
                                value={stats.totalGamesPlayed.toLocaleString()} 
                                icon="⚔️"
                            />
                            <StatCard 
                                title="Banyan Pool Contributions" 
                                value={`◎ ${(Number(stats.banyanPoolContributionsLamports) / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`} 
                                icon="🌳"
                                subtitle="Generated from RPS & Chess fees"
                            />
                        </div>
                    )}

                    {stats && stats.lastUpdated > 0 && (
                        <p style={{
                            marginTop: theme.spacing.xl,
                            fontSize: theme.fontSize.sm,
                            color: theme.colors.text.secondary,
                            textAlign: 'right'
                        }}>
                            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: string; subtitle?: string }> = ({ title, value, icon, subtitle }) => (
    <div style={{
        backgroundColor: theme.colors.card,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
        boxShadow: theme.shadow.md,
        transition: theme.transition.base,
        ':hover': {
            transform: 'translateY(-2px)',
            boxShadow: theme.shadow.lg,
        }
    } as any}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, color: theme.colors.text.secondary }}>
            <span style={{ fontSize: '1.5rem' }}>{icon}</span>
            <span style={{ fontWeight: theme.fontWeight.medium, fontSize: theme.fontSize.lg }}>{title}</span>
        </div>
        <div style={{ 
            fontSize: theme.fontSize['4xl'], 
            fontWeight: theme.fontWeight.bold,
            color: theme.colors.primary.main,
            marginTop: theme.spacing.xs
        }}>
            {value}
        </div>
        {subtitle && (
            <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>
                {subtitle}
            </div>
        )}
    </div>
);
