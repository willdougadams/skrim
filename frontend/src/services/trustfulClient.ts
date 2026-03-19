import { GameClient, GameListItem, GameManagerData, TreeData, BudData } from './gameClient';

export class TrustfulClient implements GameClient {
    private baseUrl: string;
    private eventSource: EventSource | null = null;
    private banyanListeners: Set<(event: any) => void> = new Set();

    constructor(baseUrl: string = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api') {
        this.baseUrl = baseUrl;
    }

    public onBanyanUpdate(callback: (event: any) => void): () => void {
        this.banyanListeners.add(callback);

        if (!this.eventSource) {
            this.connectSSE();
        }

        return () => {
            this.banyanListeners.delete(callback);
            if (this.banyanListeners.size === 0 && this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        };
    }

    private connectSSE() {
        this.eventSource = new EventSource(`${this.baseUrl}/banyan/stream`);
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type !== 'connected') {
                    for (const listener of this.banyanListeners) {
                        listener(data);
                    }
                }
            } catch (e) {
                console.error('Failed to parse SSE message', e);
            }
        };
        this.eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            // EventSource auto-reconnects, but we might want to log it
        };
    }

    async getLobbyGames(type: 'rps' | 'chess'): Promise<GameListItem[]> {
        const response = await fetch(`${this.baseUrl}/lobby/${type}`);
        if (!response.ok) throw new Error('Failed to fetch lobby');
        const data = await response.json();
        return data.map((g: any) => ({
            id: g.game_address,
            name: g.name,
            description: g.description,
            status: g.state === 'WaitingForPlayers' ? 'waiting' :
                g.state === 'Finished' ? 'completed' : 'in_progress',
            players: g.player_addresses,
            maxPlayers: g.max_players,
            createdAt: new Date(g.last_action_timestamp * 1000).toISOString().split('T')[0],
            buyInSOL: Number(g.buy_in_lamports) / 1_000_000_000,
            creator: g.creator,
            prizePool: Number(g.prize_pool) / 1_000_000_000,
            winner: g.winner,
            lamports: g.lamports || 0
        }));
    }

    async getGameDetails(type: 'rps' | 'chess', address: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/game/${type}/${address}`);
        if (!response.ok) throw new Error('Failed to fetch game details');
        const data = await response.json();

        // Re-format to match direct RPC response (simplified)
        return {
            ...data,
            players: data.player_addresses.map((pk: string, i: number) => ({
                pubkey: pk,
                slot: i,
                eliminated: data.winner ? pk !== data.winner : false
            }))
        };
    }

    async getBanyanManager(): Promise<GameManagerData | null> {
        const response = await fetch(`${this.baseUrl}/banyan/manager`);
        if (!response.ok) return null;
        return response.json();
    }

    async getBanyanTree(epoch: bigint): Promise<{ address: string; state: TreeData } | null> {
        const response = await fetch(`${this.baseUrl}/banyan/tree/${epoch}`);
        if (!response.ok) return null;
        return response.json();
    }

    async getBanyanBud(address: string): Promise<BudData | null> {
        const response = await fetch(`${this.baseUrl}/banyan/bud/${address}`);
        if (!response.ok) return null;
        return response.json();
    }

    async getGlobalStats(): Promise<any | null> {
        const response = await fetch(`${this.baseUrl}/stats`);
        if (!response.ok) return null;
        return response.json();
    }

    async getCrankableTxns(): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/crank`);
        if (!response.ok) return [];
        return response.json();
    }
}
