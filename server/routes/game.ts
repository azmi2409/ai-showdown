import { Router, Request, Response } from 'express';
import { serverOrchestrator } from '../services/serverOrchestrator';
import { sseHub } from '../services/sseHub';
import { AlgorithmEngine } from '../../src/services/algorithmEngine';

export const gameRouter = Router();

// GET /api/game/events - Server-Sent Events real-time stream
gameRouter.get('/events', (_req: Request, res: Response) => {
  sseHub.addClient(res, serverOrchestrator.getState());
});

// GET /api/game/state - Current snapshot
gameRouter.get('/state', (_req: Request, res: Response) => {
  res.json({ success: true, state: serverOrchestrator.getState() });
});

// POST /api/game/start - Start or restart game
gameRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const { whiteModel, blackModel, gameMode } = req.body;
    const isAlgo = (m?: any) =>
      m && (m.provider === 'algorithm' || AlgorithmEngine.isAlgorithmModel(m.id) || AlgorithmEngine.isAlgorithmModel(m.modelIdentifier));

    if (isAlgo(whiteModel) && isAlgo(blackModel)) {
      return res.status(400).json({
        success: false,
        error: 'Algorithm vs Algorithm duels are not permitted. At least one participant must be an AI model.',
      });
    }

    if (gameMode && gameMode !== 'standard' && (isAlgo(whiteModel) || isAlgo(blackModel))) {
      return res.status(400).json({
        success: false,
        error: 'Non-LLM algorithm bots cannot play custom game modes. Select LLM models for variant modes.',
      });
    }

    const state = await serverOrchestrator.startMatch(req.body);
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/game/pause
gameRouter.post('/pause', (_req: Request, res: Response) => {
  serverOrchestrator.pauseMatch();
  res.json({ success: true, status: 'paused' });
});

// POST /api/game/resume
gameRouter.post('/resume', (_req: Request, res: Response) => {
  serverOrchestrator.resumeMatch();
  res.json({ success: true, status: 'active' });
});

// POST /api/game/step
gameRouter.post('/step', (_req: Request, res: Response) => {
  serverOrchestrator.stepMove();
  res.json({ success: true, status: 'stepping' });
});

// POST /api/game/forfeit
gameRouter.post('/forfeit', (req: Request, res: Response) => {
  serverOrchestrator.forfeitMatch(req.body?.side);
  res.json({ success: true, status: 'finished' });
});

// POST /api/game/reset
gameRouter.post('/reset', (req: Request, res: Response) => {
  const state = serverOrchestrator.resetMatch(req.body?.timeControl);
  res.json({ success: true, state });
});

// POST /api/game/speed
gameRouter.post('/speed', (req: Request, res: Response) => {
  serverOrchestrator.setSpeedMode(req.body?.speedMode || '0.5s');
  res.json({ success: true, speedMode: req.body?.speedMode });
});
