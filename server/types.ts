export type WinnerOutcome = 'w' | 'b' | 'draw';

export interface MatchTelemetry {
  whiteIllegalMoves: number;
  blackIllegalMoves: number;
  whiteAvgLatencyMs: number;
  blackAvgLatencyMs: number;
  whiteToolCallsCount: number;
  blackToolCallsCount: number;
  whiteForfeit?: boolean;
  blackForfeit?: boolean;
  recoveryAssistsCount?: number;
}

export interface MatchEloChange {
  whiteDelta: number;
  blackDelta: number;
  whiteBefore: number;
  blackBefore: number;
  whiteAfter: number;
  blackAfter: number;
  kFactorWhite: number;
  kFactorBlack: number;
}

export interface MatchRecord {
  id: string;
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
  telemetry: MatchTelemetry;
  eloChange: MatchEloChange;
  createdAt: number;
}

export interface ModelMetricsRecord {
  modelId: string;
  modelName: string;
  provider: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  illegalMoveAttempts: number;
  totalMovesMade: number;
  totalLatencyMs: number;
  totalToolCalls: number;
  forfeits: number;
  peakElo: number;
  provisional: boolean; // < 10 games
  history: { elo: number; matchId: string; delta: number; timestamp: number }[];
}

export interface StoredTournament {
  id: string;
  title: string;
  type: 'knockout' | 'round-robin';
  modelIds: string[];
  timeControl: {
    name: string;
    baseSeconds: number;
    incrementSeconds: number;
  };
  rounds: any[];
  standings: any[];
  currentRoundIndex: number;
  currentMatchIndex: number;
  status: 'setup' | 'running' | 'paused' | 'completed';
  winnerModelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DatabaseSchema {
  matches: MatchRecord[];
  tournaments: StoredTournament[];
  models: Record<string, ModelMetricsRecord>;
}
