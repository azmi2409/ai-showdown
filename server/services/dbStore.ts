import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DatabaseSchema,
  MatchRecord,
  ModelMetricsRecord,
  StoredTournament,
  WinnerOutcome,
  MatchTelemetry,
} from '../types';
import { EloEngine } from './eloEngine';

const DB_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DB_DIR, 'showdown-db.json');

// Default initial model baseline ratings
const BASELINE_MODELS: { id: string; name: string; provider: string; elo: number }[] = [
  { id: 'cx-gpt-6-astra', name: 'GPT 6.0 Astra', provider: 'openai', elo: 2750 },
  { id: 'cx-gpt-56-sol', name: 'GPT 5.6 Sol', provider: 'openai', elo: 2680 },
  { id: 'cx-gpt-56-terra', name: 'GPT 5.6 Terra', provider: 'openai', elo: 2660 },
  { id: 'cx-gpt-56-luna', name: 'GPT 5.6 Luna', provider: 'openai', elo: 2650 },
  { id: 'cx-gpt-55', name: 'GPT 5.5', provider: 'openai', elo: 2600 },
  { id: 'cx-gpt-54', name: 'GPT 5.4', provider: 'openai', elo: 2550 },
  { id: 'cx-gpt-54-mini', name: 'GPT 5.4 Mini', provider: 'openai', elo: 2480 },
  { id: 'cx-gpt-53-codex-spark', name: 'GPT 5.3 Codex Spark', provider: 'openai', elo: 2520 },
  { id: 'ag-gemini-38-flash', name: 'Gemini 3.8 Flash', provider: 'openai', elo: 2580 },
  { id: 'ag-gemini-38-flash-medium', name: 'Gemini 3.8 Flash (Medium)', provider: 'openai', elo: 2600 },
  { id: 'ag-claude-opus-46', name: 'Claude Opus 4.6 (Thinking)', provider: 'openai', elo: 2620 },
  { id: 'ag-claude-sonnet-46', name: 'Claude Sonnet 4.6', provider: 'openai', elo: 2560 },
  { id: 'ag-gpt-oss-120b', name: 'GPT-OSS 120B (Medium)', provider: 'openai', elo: 2540 },
  { id: 'ag-gemini-37-flash-medium', name: 'Gemini 3.7 Flash (Medium)', provider: 'openai', elo: 2510 },
  { id: 'ag-gemini-36-flash-medium', name: 'Gemini 3.6 Flash (Medium)', provider: 'openai', elo: 2460 },
  { id: 'ag-gemini-3-flash', name: 'Gemini 3 Flash', provider: 'openai', elo: 2420 },
];

export class DbStore {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectoryExists();
    this.data = this.loadDatabase();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: DatabaseSchema = JSON.parse(raw);
        this.initializeMissingModels(parsed.models);
        return parsed;
      }
    } catch (err) {
      console.error('Warning: Failed to parse existing database file, initializing clean database:', err);
    }

    const initialData: DatabaseSchema = {
      matches: [],
      tournaments: [],
      models: {},
    };
    this.initializeMissingModels(initialData.models);
    this.saveDatabase(initialData);
    return initialData;
  }

  private initializeMissingModels(models: Record<string, ModelMetricsRecord>): void {
    const now = Date.now();
    for (const b of BASELINE_MODELS) {
      if (!models[b.id]) {
        models[b.id] = {
          modelId: b.id,
          modelName: b.name,
          provider: b.provider,
          elo: b.elo,
          peakElo: b.elo,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          illegalMoveAttempts: 0,
          totalMovesMade: 0,
          totalLatencyMs: 0,
          totalToolCalls: 0,
          forfeits: 0,
          provisional: true,
          history: [{ elo: b.elo, matchId: 'initial', delta: 0, timestamp: now }],
        };
      }
    }
  }

  private saveDatabase(data: DatabaseSchema): void {
    try {
      this.ensureDirectoryExists();
      const tempPath = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Fatal: Failed to write database file atomically:', err);
    }
  }

  // --- Matches API ---
  public getMatches(filters?: {
    tournamentId?: string;
    modelId?: string;
    limit?: number;
    offset?: number;
  }): { matches: MatchRecord[]; total: number } {
    let result = [...this.data.matches];

    if (filters?.tournamentId) {
      result = result.filter((m) => m.tournamentId === filters.tournamentId);
    }
    if (filters?.modelId) {
      result = result.filter(
        (m) => m.whiteModelId === filters.modelId || m.blackModelId === filters.modelId
      );
    }

    const total = result.length;
    // Sort descending by createdAt (newest first)
    result.sort((a, b) => b.createdAt - a.createdAt);

    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paginated = result.slice(offset, offset + limit);

    return { matches: paginated, total };
  }

  public getMatchById(id: string): MatchRecord | null {
    return this.data.matches.find((m) => m.id === id) || null;
  }

  public recordMatch(input: {
    matchId?: string;
    tournamentId?: string | null;
    roundNumber?: number;
    matchIndex?: number;
    whiteModelId: string;
    whiteModelName: string;
    blackModelId: string;
    blackModelName: string;
    winner: WinnerOutcome;
    reason: string;
    movesCount: number;
    durationMs: number;
    pgn: string;
    finalFen: string;
    timeControl: {
      name: string;
      baseSeconds: number;
      incrementSeconds: number;
    };
    telemetry?: MatchTelemetry;
  }): MatchRecord {
    const matchId = input.matchId || `match_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Ensure models exist in dictionary
    this.ensureModelExists(input.whiteModelId, input.whiteModelName);
    this.ensureModelExists(input.blackModelId, input.blackModelName);

    const whiteModel = this.data.models[input.whiteModelId];
    const blackModel = this.data.models[input.blackModelId];

    const telemetry: MatchTelemetry = input.telemetry || {
      whiteIllegalMoves: 0,
      blackIllegalMoves: 0,
      whiteAvgLatencyMs: 0,
      blackAvgLatencyMs: 0,
      whiteToolCallsCount: 0,
      blackToolCallsCount: 0,
    };

    // Calculate ELO using advanced EloEngine
    const eloChange = EloEngine.calculateEloChange({
      whiteRating: whiteModel.elo,
      blackRating: blackModel.elo,
      whiteGamesPlayed: whiteModel.gamesPlayed,
      blackGamesPlayed: blackModel.gamesPlayed,
      winner: input.winner,
      telemetry,
    });

    const now = Date.now();
    const matchRecord: MatchRecord = {
      id: matchId,
      tournamentId: input.tournamentId || null,
      roundNumber: input.roundNumber,
      matchIndex: input.matchIndex,
      whiteModelId: input.whiteModelId,
      whiteModelName: input.whiteModelName,
      blackModelId: input.blackModelId,
      blackModelName: input.blackModelName,
      winner: input.winner,
      reason: input.reason,
      movesCount: input.movesCount,
      durationMs: input.durationMs,
      pgn: input.pgn,
      finalFen: input.finalFen,
      timeControl: input.timeControl,
      telemetry,
      eloChange,
      createdAt: now,
    };

    // Update White Model metrics
    whiteModel.gamesPlayed++;
    whiteModel.elo = eloChange.whiteAfter;
    whiteModel.peakElo = Math.max(whiteModel.peakElo, whiteModel.elo);
    whiteModel.provisional = whiteModel.gamesPlayed < 10;
    whiteModel.illegalMoveAttempts += telemetry.whiteIllegalMoves;
    whiteModel.totalMovesMade += Math.ceil(input.movesCount / 2);
    whiteModel.totalLatencyMs += telemetry.whiteAvgLatencyMs * Math.ceil(input.movesCount / 2);
    whiteModel.totalToolCalls += telemetry.whiteToolCallsCount;
    if (telemetry.whiteForfeit) whiteModel.forfeits++;

    if (input.winner === 'w') {
      whiteModel.wins++;
    } else if (input.winner === 'b') {
      whiteModel.losses++;
    } else {
      whiteModel.draws++;
    }

    whiteModel.history.push({
      elo: whiteModel.elo,
      matchId,
      delta: eloChange.whiteDelta,
      timestamp: now,
    });

    // Update Black Model metrics
    blackModel.gamesPlayed++;
    blackModel.elo = eloChange.blackAfter;
    blackModel.peakElo = Math.max(blackModel.peakElo, blackModel.elo);
    blackModel.provisional = blackModel.gamesPlayed < 10;
    blackModel.illegalMoveAttempts += telemetry.blackIllegalMoves;
    blackModel.totalMovesMade += Math.floor(input.movesCount / 2);
    blackModel.totalLatencyMs += telemetry.blackAvgLatencyMs * Math.floor(input.movesCount / 2);
    blackModel.totalToolCalls += telemetry.blackToolCallsCount;
    if (telemetry.blackForfeit) blackModel.forfeits++;

    if (input.winner === 'b') {
      blackModel.wins++;
    } else if (input.winner === 'w') {
      blackModel.losses++;
    } else {
      blackModel.draws++;
    }

    blackModel.history.push({
      elo: blackModel.elo,
      matchId,
      delta: eloChange.blackDelta,
      timestamp: now,
    });

    // Append match and persist
    this.data.matches.push(matchRecord);
    this.saveDatabase(this.data);

    return matchRecord;
  }

  private ensureModelExists(modelId: string, modelName: string): void {
    if (!this.data.models[modelId]) {
      const defaultElo = 1500;
      this.data.models[modelId] = {
        modelId,
        modelName,
        provider: 'custom',
        elo: defaultElo,
        peakElo: defaultElo,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        illegalMoveAttempts: 0,
        totalMovesMade: 0,
        totalLatencyMs: 0,
        totalToolCalls: 0,
        forfeits: 0,
        provisional: true,
        history: [{ elo: defaultElo, matchId: 'initial', delta: 0, timestamp: Date.now() }],
      };
    }
  }

  // --- Tournaments API ---
  public getTournaments(): StoredTournament[] {
    return [...this.data.tournaments].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getTournamentById(id: string): StoredTournament | null {
    return this.data.tournaments.find((t) => t.id === id) || null;
  }

  public saveTournament(tournament: StoredTournament): StoredTournament {
    const existingIndex = this.data.tournaments.findIndex((t) => t.id === tournament.id);
    const now = Date.now();
    const updated: StoredTournament = {
      ...tournament,
      updatedAt: now,
      createdAt: tournament.createdAt || now,
    };

    if (existingIndex >= 0) {
      this.data.tournaments[existingIndex] = updated;
    } else {
      this.data.tournaments.push(updated);
    }

    this.saveDatabase(this.data);
    return updated;
  }

  // --- Leaderboard API ---
  public getModelMetrics(): ModelMetricsRecord[] {
    return Object.values(this.data.models).sort((a, b) => b.elo - a.elo);
  }

  // --- Recalculate All Elo ---
  public recalculateAllElo(): { totalMatchesRecalculated: number } {
    // Reset all models to initial starting Elo
    const initialMap = new Map<string, number>();
    for (const b of BASELINE_MODELS) {
      initialMap.set(b.id, b.elo);
    }

    for (const m of Object.values(this.data.models)) {
      const startElo = initialMap.get(m.modelId) || 1500;
      m.elo = startElo;
      m.peakElo = startElo;
      m.gamesPlayed = 0;
      m.wins = 0;
      m.losses = 0;
      m.draws = 0;
      m.illegalMoveAttempts = 0;
      m.totalMovesMade = 0;
      m.totalLatencyMs = 0;
      m.totalToolCalls = 0;
      m.forfeits = 0;
      m.provisional = true;
      m.history = [{ elo: startElo, matchId: 'initial', delta: 0, timestamp: Date.now() }];
    }

    // Sort matches chronologically
    const sortedMatches = [...this.data.matches].sort((a, b) => a.createdAt - b.createdAt);

    for (const match of sortedMatches) {
      const white = this.data.models[match.whiteModelId];
      const black = this.data.models[match.blackModelId];
      if (!white || !black) continue;

      const change = EloEngine.calculateEloChange({
        whiteRating: white.elo,
        blackRating: black.elo,
        whiteGamesPlayed: white.gamesPlayed,
        blackGamesPlayed: black.gamesPlayed,
        winner: match.winner,
        telemetry: match.telemetry,
      });

      match.eloChange = change;

      white.gamesPlayed++;
      white.elo = change.whiteAfter;
      white.peakElo = Math.max(white.peakElo, white.elo);
      white.provisional = white.gamesPlayed < 10;
      if (match.winner === 'w') white.wins++;
      else if (match.winner === 'b') white.losses++;
      else white.draws++;

      white.history.push({
        elo: white.elo,
        matchId: match.id,
        delta: change.whiteDelta,
        timestamp: match.createdAt,
      });

      black.gamesPlayed++;
      black.elo = change.blackAfter;
      black.peakElo = Math.max(black.peakElo, black.elo);
      black.provisional = black.gamesPlayed < 10;
      if (match.winner === 'b') black.wins++;
      else if (match.winner === 'w') black.losses++;
      else black.draws++;

      black.history.push({
        elo: black.elo,
        matchId: match.id,
        delta: change.blackDelta,
        timestamp: match.createdAt,
      });
    }

    this.saveDatabase(this.data);
    return { totalMatchesRecalculated: sortedMatches.length };
  }
}

export const dbStore = new DbStore();
