import { BenchmarkMetrics, GameResult, ModelConfig, TimeControl, TournamentMatch, TournamentState } from '../types';
import { storageService } from './storageService';

export interface RecordMatchPayload {
  matchId?: string;
  tournamentId?: string | null;
  roundNumber?: number;
  matchIndex?: number;
  whiteModelId: string;
  whiteModelName: string;
  blackModelId: string;
  blackModelName: string;
  winner: 'w' | 'b' | 'draw';
  reason: string;
  movesCount: number;
  durationMs: number;
  pgn: string;
  finalFen: string;
  timeControl: TimeControl;
  telemetry?: {
    whiteIllegalMoves: number;
    blackIllegalMoves: number;
    whiteAvgLatencyMs: number;
    blackAvgLatencyMs: number;
    whiteToolCallsCount: number;
    blackToolCallsCount: number;
    whiteForfeit?: boolean;
    blackForfeit?: boolean;
    recoveryAssistsCount?: number;
  };
}

class ApiService {
  private isServerAvailable: boolean = true;

  /**
   * Healthcheck to verify Express backend status
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
      this.isServerAvailable = res.ok;
      return res.ok;
    } catch {
      this.isServerAvailable = false;
      return false;
    }
  }

  /**
   * Record completed match with match ID, tournament ID, and telemetry
   */
  public async recordMatch(payload: RecordMatchPayload): Promise<any> {
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        return data.match;
      }
    } catch (err) {
      console.warn('Backend API /api/matches unreachable, recording locally in storage:', err);
    }

    // Fallback to local storageService
    storageService.recordGameResult(
      payload.whiteModelId,
      payload.blackModelId,
      payload.winner,
      payload.movesCount,
      payload.durationMs,
      {
        whiteIllegal: payload.telemetry?.whiteIllegalMoves || 0,
        blackIllegal: payload.telemetry?.blackIllegalMoves || 0,
        whiteLatency: payload.telemetry?.whiteAvgLatencyMs || 0,
        blackLatency: payload.telemetry?.blackAvgLatencyMs || 0,
        whiteToolCalls: payload.telemetry?.whiteToolCallsCount || 0,
        blackToolCalls: payload.telemetry?.blackToolCallsCount || 0,
        whiteForfeit: payload.telemetry?.whiteForfeit,
        blackForfeit: payload.telemetry?.blackForfeit,
      }
    );

    return null;
  }

  /**
   * Fetch match history
   */
  public async getMatches(params?: { tournamentId?: string; modelId?: string; limit?: number }): Promise<any[]> {
    try {
      const query = new URLSearchParams();
      if (params?.tournamentId) query.set('tournamentId', params.tournamentId);
      if (params?.modelId) query.set('modelId', params.modelId);
      if (params?.limit) query.set('limit', String(params.limit));

      const res = await fetch(`/api/matches?${query.toString()}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        return data.matches || [];
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Save or update tournament state
   */
  public async saveTournament(tournament: TournamentState | null): Promise<void> {
    if (!tournament) return;

    try {
      await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tournament,
          modelIds: tournament.models.map((m) => m.id),
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // StorageService persists in localStorage as well
    }
  }

  /**
   * Fetch benchmark leaderboard metrics
   */
  public async getLeaderboard(): Promise<BenchmarkMetrics[] | null> {
    try {
      const res = await fetch('/api/models/leaderboard', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          return data.models;
        }
      }
    } catch {
      // Fallback to local storage metrics
    }
    return null;
  }

  /**
   * Recalculate historical ELO ratings
   */
  public async recalculateElo(): Promise<any> {
    try {
      const res = await fetch('/api/models/recalculate-elo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Failed to recalculate ELO:', err);
    }
    return null;
  }
}

export const apiService = new ApiService();
