export type ModelProvider =
  | 'simulated'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'xai'
  | 'ollama';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  modelIdentifier: string;
  avatar: string;
  badgeColor: string;
  playStyle: string;
  simulatedElo?: number;
  description: string;
  isSimulated?: boolean;
}

export type TimeControlPreset =
  | 'bullet-1-0'
  | 'bullet-2-1'
  | 'blitz-3-0'
  | 'blitz-3-2'
  | 'blitz-5-0'
  | 'blitz-5-3'
  | 'rapid-10-0'
  | 'rapid-15-10'
  | 'custom';

export interface TimeControl {
  name: string;
  baseSeconds: number;
  incrementSeconds: number;
}

export interface MoveRecord {
  moveNumber: number;
  turn: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  fenAfter: string;
  latencyMs: number;
  reasoning?: string;
  toolCallsCount: number;
}

export interface GameResult {
  winner: 'w' | 'b' | 'draw';
  reason:
    | 'checkmate'
    | 'stalemate'
    | 'timeout'
    | 'threefold'
    | '50-move'
    | 'insufficient_material'
    | 'resignation'
    | 'illegal_move_forfeit'
    | 'api_error';
  description: string;
  timestamp: number;
}

export interface ToolCallEntry {
  id: string;
  name: 'make_move' | 'get_board_state' | 'get_legal_moves' | 'resign';
  arguments: Record<string, any>;
  result?: any;
  latencyMs: number;
  timestamp: number;
}

export interface NeuralLogEntry {
  id: string;
  moveNumber: number;
  turn: 'w' | 'b';
  modelId: string;
  modelName: string;
  avatar: string;
  toolCalls: ToolCallEntry[];
  textContent?: string;
  finalMove?: string;
  illegalAttempts: number;
  totalLatencyMs: number;
  timestamp: number;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

export interface BenchmarkMetrics {
  modelId: string;
  modelName: string;
  provider: ModelProvider;
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
  history: { elo: number; timestamp: number }[];
}

export type TournamentType = 'knockout' | 'round-robin';

export interface TournamentMatch {
  id: string;
  round: number;
  matchIndex: number;
  white: ModelConfig | null;
  black: ModelConfig | null;
  winner: ModelConfig | null;
  result: GameResult | null;
  status: 'pending' | 'live' | 'completed' | 'bye';
  scoreWhite?: number;
  scoreBlack?: number;
}

export interface TournamentRound {
  roundNumber: number;
  name: string;
  matches: TournamentMatch[];
}

export interface TournamentStanding {
  modelId: string;
  modelName: string;
  avatar: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  elo: number;
}

export interface TournamentState {
  id: string;
  title: string;
  type: TournamentType;
  models: ModelConfig[];
  timeControl: TimeControl;
  rounds: TournamentRound[];
  currentRoundIndex: number;
  currentMatchIndex: number;
  status: 'setup' | 'running' | 'paused' | 'completed';
  winner: ModelConfig | null;
  standings: TournamentStanding[];
}

export interface ApiKeysConfig {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  gemini?: string;
  deepseek?: string;
  xai?: string;
  ollamaUrl?: string;
}
