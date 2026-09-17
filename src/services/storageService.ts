import { ApiKeysConfig, BenchmarkMetrics, ModelConfig, TimeControl } from '../types';
import { DEFAULT_MODELS } from './defaultModels';

const KEYS_STORAGE_KEY = 'ai_showdown_api_keys';
const METRICS_STORAGE_KEY = 'ai_showdown_benchmark_metrics';
const CUSTOM_MODELS_STORAGE_KEY = 'ai_showdown_custom_models';
const TIME_CONTROL_STORAGE_KEY = 'ai_showdown_time_control';
const ARCHIVE_STORAGE_KEY = 'ai_showdown_game_archive';

export interface ArchivedGame {
  id: string;
  white: string;
  black: string;
  winner: 'w' | 'b' | 'draw';
  reason: string;
  pgn: string;
  movesCount: number;
  durationMs: number;
  timestamp: number;
}

class StorageService {
  public getApiKeys(): ApiKeysConfig {
    try {
      const data = localStorage.getItem(KEYS_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  public saveApiKeys(keys: ApiKeysConfig): void {
    try {
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
    } catch (err) {
      console.error('Failed to save API keys:', err);
    }
  }

  public getCustomModels(): ModelConfig[] {
    try {
      const data = localStorage.getItem(CUSTOM_MODELS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public saveCustomModel(model: ModelConfig): void {
    const existing = this.getCustomModels();
    const updated = [...existing.filter((m) => m.id !== model.id), model];
    localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(updated));
  }

  public deleteCustomModel(modelId: string): void {
    const existing = this.getCustomModels();
    const updated = existing.filter((m) => m.id !== modelId);
    localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(updated));
  }

  public getAllModels(): ModelConfig[] {
    return [...DEFAULT_MODELS, ...this.getCustomModels()];
  }

  public getBenchmarkMetrics(): Record<string, BenchmarkMetrics> {
    let stored: Record<string, BenchmarkMetrics> = {};
    try {
      const data = localStorage.getItem(METRICS_STORAGE_KEY);
      if (data) {
        stored = JSON.parse(data);
      }
    } catch {
      // ignore
    }

    const allModels = this.getAllModels();
    const defaults: Record<string, BenchmarkMetrics> = {};

    for (const model of allModels) {
      if (stored[model.id]) {
        defaults[model.id] = stored[model.id];
      } else {
        defaults[model.id] = {
          modelId: model.id,
          modelName: model.name,
          provider: model.provider,
          elo: model.simulatedElo || 1500,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          illegalMoveAttempts: 0,
          totalMovesMade: 0,
          totalLatencyMs: 0,
          totalToolCalls: 0,
          forfeits: 0,
          history: [{ elo: model.simulatedElo || 1500, timestamp: Date.now() }],
        };
      }
    }

    return defaults;
  }

  public saveBenchmarkMetrics(metrics: Record<string, BenchmarkMetrics>): void {
    try {
      localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
    } catch (err) {
      console.error('Failed to save metrics:', err);
    }
  }

  public recordGameResult(
    whiteId: string,
    blackId: string,
    winner: 'w' | 'b' | 'draw',
    movesCount: number,
    durationMs: number,
    stats: {
      whiteIllegal: number;
      blackIllegal: number;
      whiteLatency: number;
      blackLatency: number;
      whiteToolCalls: number;
      blackToolCalls: number;
      whiteForfeit?: boolean;
      blackForfeit?: boolean;
    }
  ): void {
    const allMetrics = this.getBenchmarkMetrics();
    const whiteMetrics = allMetrics[whiteId] || {
      modelId: whiteId,
      modelName: whiteId,
      provider: 'simulated',
      elo: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      illegalMoveAttempts: 0,
      totalMovesMade: 0,
      totalLatencyMs: 0,
      totalToolCalls: 0,
      forfeits: 0,
      history: [],
    };

    const blackMetrics = allMetrics[blackId] || {
      modelId: blackId,
      modelName: blackId,
      provider: 'simulated',
      elo: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      illegalMoveAttempts: 0,
      totalMovesMade: 0,
      totalLatencyMs: 0,
      totalToolCalls: 0,
      forfeits: 0,
      history: [],
    };

    // Calculate Elo change
    const K = 32;
    const expectedWhite = 1 / (1 + Math.pow(10, (blackMetrics.elo - whiteMetrics.elo) / 400));
    const expectedBlack = 1 - expectedWhite;

    let scoreWhite = 0.5;
    let scoreBlack = 0.5;

    if (winner === 'w') {
      scoreWhite = 1;
      scoreBlack = 0;
      whiteMetrics.wins++;
      blackMetrics.losses++;
    } else if (winner === 'b') {
      scoreWhite = 0;
      scoreBlack = 1;
      whiteMetrics.losses++;
      blackMetrics.wins++;
    } else {
      whiteMetrics.draws++;
      blackMetrics.draws++;
    }

    const newEloWhite = Math.round(whiteMetrics.elo + K * (scoreWhite - expectedWhite));
    const newEloBlack = Math.round(blackMetrics.elo + K * (scoreBlack - expectedBlack));

    whiteMetrics.elo = newEloWhite;
    blackMetrics.elo = newEloBlack;

    whiteMetrics.gamesPlayed++;
    blackMetrics.gamesPlayed++;

    whiteMetrics.illegalMoveAttempts += stats.whiteIllegal;
    blackMetrics.illegalMoveAttempts += stats.blackIllegal;

    whiteMetrics.totalMovesMade += Math.ceil(movesCount / 2);
    blackMetrics.totalMovesMade += Math.floor(movesCount / 2);

    whiteMetrics.totalLatencyMs += stats.whiteLatency;
    blackMetrics.totalLatencyMs += stats.blackLatency;

    whiteMetrics.totalToolCalls += stats.whiteToolCalls;
    blackMetrics.totalToolCalls += stats.blackToolCalls;

    if (stats.whiteForfeit) whiteMetrics.forfeits++;
    if (stats.blackForfeit) blackMetrics.forfeits++;

    const now = Date.now();
    whiteMetrics.history.push({ elo: newEloWhite, timestamp: now });
    blackMetrics.history.push({ elo: newEloBlack, timestamp: now });

    allMetrics[whiteId] = whiteMetrics;
    allMetrics[blackId] = blackMetrics;

    this.saveBenchmarkMetrics(allMetrics);
  }

  public getArchivedGames(): ArchivedGame[] {
    try {
      const data = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public archiveGame(game: ArchivedGame): void {
    const list = this.getArchivedGames();
    list.unshift(game);
    // Keep max 50 recent games
    if (list.length > 50) list.pop();
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(list));
  }

  public resetAllData(): void {
    localStorage.removeItem(METRICS_STORAGE_KEY);
    localStorage.removeItem(ARCHIVE_STORAGE_KEY);
    localStorage.removeItem(CUSTOM_MODELS_STORAGE_KEY);
  }
}

export const storageService = new StorageService();
