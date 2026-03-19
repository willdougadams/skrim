import express from 'express';
import { statsService } from '../services/statsService';

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const stats = statsService.getStats();
        res.json(stats);
    } catch (error: any) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to retrieve stats' });
    }
});

export default router;
