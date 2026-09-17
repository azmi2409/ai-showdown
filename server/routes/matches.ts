import { Router, Request, Response } from 'express';
import { dbStore } from '../services/dbStore';

export const matchesRouter = Router();

// GET /api/matches
matchesRouter.get('/', (req: Request, res: Response) => {
  try {
    const tournamentId = req.query.tournamentId as string | undefined;
    const modelId = req.query.modelId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = dbStore.getMatches({ tournamentId, modelId, limit, offset });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/matches/:id
matchesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const match = dbStore.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    res.json({ success: true, match });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/matches
matchesRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      matchId,
      tournamentId,
      roundNumber,
      matchIndex,
      whiteModelId,
      whiteModelName,
      blackModelId,
      blackModelName,
      winner,
      reason,
      movesCount,
      durationMs,
      pgn,
      finalFen,
      timeControl,
      telemetry,
    } = req.body;

    if (!whiteModelId || !blackModelId || !winner) {
      return res.status(400).json({
        success: false,
        error: 'Missing required match parameters (whiteModelId, blackModelId, winner)',
      });
    }

    const record = dbStore.recordMatch({
      matchId,
      tournamentId,
      roundNumber,
      matchIndex,
      whiteModelId,
      whiteModelName: whiteModelName || whiteModelId,
      blackModelId,
      blackModelName: blackModelName || blackModelId,
      winner,
      reason: reason || 'game_over',
      movesCount: movesCount || 0,
      durationMs: durationMs || 0,
      pgn: pgn || '',
      finalFen: finalFen || '',
      timeControl: timeControl || { name: 'Blitz', baseSeconds: 180, incrementSeconds: 2 },
      telemetry,
    });

    res.status(201).json({ success: true, match: record });
  } catch (err: any) {
    console.error('Error recording match:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
