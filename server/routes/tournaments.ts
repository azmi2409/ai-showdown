import { Router, Request, Response } from 'express';
import { dbStore } from '../services/dbStore';
import { StoredTournament } from '../types';

export const tournamentsRouter = Router();

// GET /api/tournaments
tournamentsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const list = dbStore.getTournaments();
    res.json({ success: true, tournaments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tournaments/:id
tournamentsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tournament = dbStore.getTournamentById(id);
    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }
    res.json({ success: true, tournament });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tournaments
tournamentsRouter.post('/', (req: Request, res: Response) => {
  try {
    const data: StoredTournament = req.body;
    if (!data.id || !data.title) {
      return res.status(400).json({ success: false, error: 'Tournament id and title required' });
    }
    const saved = dbStore.saveTournament(data);
    res.status(201).json({ success: true, tournament: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tournaments/:id
tournamentsRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const data: StoredTournament = { ...req.body, id: req.params.id };
    const saved = dbStore.saveTournament(data);
    res.json({ success: true, tournament: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
