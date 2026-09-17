import express from 'express';
import cors from 'cors';
import { matchesRouter } from './routes/matches';
import { tournamentsRouter } from './routes/tournaments';
import { leaderboardRouter } from './routes/leaderboard';
import { gameRouter } from './routes/game';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/game/events') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-showdown-backend',
    version: '1.0.0',
    timestamp: Date.now(),
  });
});

// Mount Routes
app.use('/api/game', gameRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/models', leaderboardRouter);

app.listen(PORT, () => {
  console.log(`⚡ AI Showdown Backend running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
