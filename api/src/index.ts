import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lobbyRoutes from './routes/lobby';
import banyanRoutes from './routes/banyan';
import gameRoutes from './routes/game';
import statsRoutes from './routes/stats';
import crankRoutes from './routes/crank';
import { subscriptionManager } from './services/subscriptionManager';
import { statsService } from './services/statsService';

dotenv.config();

export const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const router = express.Router();

router.use('/lobby', lobbyRoutes);
router.use('/banyan', banyanRoutes);
router.use('/game', gameRoutes);
router.use('/stats', statsRoutes);
router.use('/crank', crankRoutes);

router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api', router);
app.use('/', router);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Trustful API listening at http://localhost:${port}`);
        subscriptionManager.startListening();
        statsService.start();
    });
}

export default app;
