export type GameMode =
  | 'standard'
  | 'duck_chess'
  | 'fog_of_war'
  | 'crazyhouse'
  | 'atomic_chess'
  | 'spell_draft'
  | 'mutators';

export interface SpellCard {
  id: string;
  name: string;
  icon: string;
  description: string;
  manaCost: number;
}

export const AVAILABLE_SPELLS: SpellCard[] = [
  {
    id: 'swap_pawns',
    name: 'Pawn Warp',
    icon: '🔄',
    description: 'Swap positions of any two of your active pawns.',
    manaCost: 1,
  },
  {
    id: 'catapult_knight',
    name: 'Catapult Leap',
    icon: '🚀',
    description: 'Launch a Knight across 3 squares into enemy territory.',
    manaCost: 1,
  },
  {
    id: 'frost_freeze',
    name: 'Glacial Freeze',
    icon: '❄️',
    description: 'Freeze an enemy piece in place, blocking its move for 1 turn.',
    manaCost: 1,
  },
  {
    id: 'resurrection',
    name: 'Soul Revive',
    icon: '✨',
    description: 'Resurrect a captured pawn back onto an empty back-rank square.',
    manaCost: 1,
  },
];

export interface DraftModifier {
  id: string;
  name: string;
  icon: string;
  cost: number;
  description: string;
  tag: string;
}

export type SpectatorVision = 'all' | 'w' | 'b';

export const AVAILABLE_MODIFIERS: DraftModifier[] = [
  {
    id: 'exploding_rooks',
    name: 'Exploding Rooks',
    icon: '💥',
    cost: 1,
    description: 'Capturing with a Rook detonates a shockwave destroying enemy pawns on adjacent squares.',
    tag: 'AOE Blast',
  },
  {
    id: 'portal_squares',
    name: 'Portal Squares',
    icon: '🌀',
    cost: 1,
    description: 'Squares d4 and e5 are quantum portals. Landing on d4 teleports to e5 (and vice versa).',
    tag: 'Wormhole',
  },
  {
    id: 'ghost_knights',
    name: 'Ghost Knights',
    icon: '👻',
    cost: 1,
    description: 'Knights phase through pins and strike from hidden spectral angles.',
    tag: 'Phase Shift',
  },
  {
    id: 'bounty_hunter',
    name: 'Bounty Hunter',
    icon: '⏳',
    cost: 1,
    description: 'Every enemy capture instantly awards +15 seconds to your chess clock.',
    tag: 'Time Siphon',
  },
  {
    id: 'pawn_blitz',
    name: 'Pawn Blitz',
    icon: '⚡',
    cost: 1,
    description: 'Pawns can march 2 squares forward on any turn if unobstructed.',
    tag: 'Super March',
  },
  {
    id: 'king_aegis',
    name: "King's Aegis",
    icon: '🛡️',
    cost: 1,
    description: 'The King commands a titanium shield that absorbs the first fatal checkmate or check.',
    tag: 'Death Defiance',
  },
  {
    id: 'vampire_queen',
    name: 'Vampire Queen',
    icon: '🩸',
    cost: 1,
    description: 'Queen captures drain enemy life force, reviving a lost friendly pawn on the back rank.',
    tag: 'Resurrection',
  },
];

export type ModelProvider =
  | 'simulated'
  | 'algorithm'
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
  gameMode?: GameMode;
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

export interface SerializedGameState {
  fen: string;
  turn: 'w' | 'b';
  moves: MoveRecord[];
  clocks: { w: number; b: number };
  timeControl: TimeControl;
  captures: { w: string[]; b: string[] };
  status: 'idle' | 'active' | 'paused' | 'stepping' | 'finished';
  result: GameResult | null;
  agentMemory: {
    w: ConversationMessage[];
    b: ConversationMessage[];
  };
  illegalAttempts: { w: number; b: number };
  neuralLogs: NeuralLogEntry[];
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
  winner: 'w' | 'b' | 'draw';
  reason: string;
  movesCount: number;
  durationMs: number;
  pgn: string;
  finalFen: string;
  timeControl: TimeControl;
  telemetry: {
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
  eloChange: {
    whiteDelta: number;
    blackDelta: number;
    whiteBefore: number;
    blackBefore: number;
    whiteAfter: number;
    blackAfter: number;
  };
  createdAt: number;
}

export interface ArenaSelections {
  whiteModelId?: string;
  blackModelId?: string;
  timeControl?: TimeControl;
  speedMode?: '1x' | '0.5s' | 'instant';
  audioEnabled?: boolean;
  activeTab?: 'arena' | 'tournament' | 'matches' | 'leaderboard' | 'settings';
}

