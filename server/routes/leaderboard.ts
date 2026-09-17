import { Router, Request, Response } from 'express';
import { dbStore } from '../services/dbStore';

export const leaderboardRouter = Router();

// GET /api/models/leaderboard
leaderboardRouter.get('/leaderboard', (_req: Request, res: Response) => {
  try {
    const metrics = dbStore.getModelMetrics();
    res.json({ success: true, models: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/models/recalculate-elo
leaderboardRouter.post('/recalculate-elo', (_req: Request, res: Response) => {
  try {
    const result = dbStore.recalculateAllElo();
    const updated = dbStore.getModelMetrics();
    res.json({
      success: true,
      message: `Recalculated ELO for ${result.totalMatchesRecalculated} matches`,
      models: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
