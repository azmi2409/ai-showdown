import { create } from 'zustand';
import { ActiveTab } from '../components/Header';
import {
  ApiKeysConfig,
  BenchmarkMetrics,
  GameMode,
  GameResult,
  ModelConfig,
  MoveRecord,
  NeuralLogEntry,
  SpectatorVision,
  TimeControl,
  TournamentMatch,
  TournamentState,
} from '../types';
import { storageService } from '../services/storageService';
import { DEFAULT_MODELS } from '../services/defaultModels';

export type SpeedMode = '1x' | '0.5s' | 'instant';

export interface PendingMatchIntro {
  match: TournamentMatch;
  roundIndex: number;
  matchIndex: number;
  roundName: string;
  totalMatchesInRound?: number;
  tournamentTitle: string;
  gameMode?: GameMode;
  white: ModelConfig;
  black: ModelConfig;
}

export interface LiveGameState {
  matchId: string;
  tournamentId: string | null;
  roundNumber?: number;
  matchIndex?: number;
  whiteModel: ModelConfig;
  blackModel: ModelConfig;
  timeControl: TimeControl;
  speedMode: SpeedMode;
  gameMode: GameMode;
  whiteModifiers: string[];
  blackModifiers: string[];
  portalSquares?: [string, string];
  fogVision?: { w: string[]; b: string[] };
  duckSquare?: string | null;
  crazyhouseReserves?: { w: string[]; b: string[] };
  whiteSpells?: string[];
  blackSpells?: string[];
  fen: string;
  turn: 'w' | 'b';
  clocks: { w: number; b: number };
  captures: { w: string[]; b: string[] };
  moves: MoveRecord[];
  status: 'idle' | 'active' | 'paused' | 'stepping' | 'finished';
  result: GameResult | null;
  inCheck: boolean;
  neuralLogs: NeuralLogEntry[];
  activeThinking: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string };
}

interface GameStoreState {
  // Navigation & Config
  activeTab: ActiveTab;
  audioEnabled: boolean;
  allModels: ModelConfig[];
  apiKeys: ApiKeysConfig;
  metrics: Record<string, BenchmarkMetrics>;
  customModels: ModelConfig[];

  // Mode & Spectator Settings
  gameMode: GameMode;
  spectatorVision: SpectatorVision;
  whiteModifiers: string[];
  blackModifiers: string[];
  whiteSpells: string[];
  blackSpells: string[];

  // Live Game State
  liveGame: LiveGameState;

  // Tournament State
  tournament: TournamentState | null;
  isAutoRunningTournament: boolean;
  introMatch: PendingMatchIntro | null;
  currentTourneyMatch: {
    match: TournamentMatch;
    roundIndex: number;
    matchIndex: number;
  } | null;

  // Actions
  setActiveTab: (tab: ActiveTab) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setAllModels: (models: ModelConfig[]) => void;
  setApiKeys: (keys: ApiKeysConfig) => void;
  setMetrics: (metrics: Record<string, BenchmarkMetrics>) => void;
  setCustomModels: (models: ModelConfig[]) => void;

  setGameMode: (gameMode: GameMode) => void;
  setSpectatorVision: (vision: SpectatorVision) => void;
  setWhiteModifiers: (modifiers: string[]) => void;
  setBlackModifiers: (modifiers: string[]) => void;
  setWhiteSpells: (spells: string[]) => void;
  setBlackSpells: (spells: string[]) => void;

  setLiveGame: (partial: Partial<LiveGameState>) => void;
  updateOnMove: (payload: {
    moveRecord?: MoveRecord;
    fen: string;
    clocks: { w: number; b: number };
    captures: { w: string[]; b: string[] };
    turn: 'w' | 'b';
    inCheck: boolean;
    fogVision?: { w: string[]; b: string[] };
    duckSquare?: string | null;
    crazyhouseReserves?: { w: string[]; b: string[] };
    whiteSpells?: string[];
    blackSpells?: string[];
  }) => void;
  updateClock: (clocks: { w: number; b: number }) => void;
  updateThought: (thinking: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string }) => void;
  appendNeuralLog: (log: NeuralLogEntry) => void;

  setTournament: (tournament: TournamentState | null) => void;
  setIsAutoRunningTournament: (running: boolean) => void;
  setIntroMatch: (match: PendingMatchIntro | null) => void;
  setCurrentTourneyMatch: (
    matchInfo: { match: TournamentMatch; roundIndex: number; matchIndex: number } | null
  ) => void;
}

const defaultWhiteModel = DEFAULT_MODELS[0] || {
  id: 'cx-gpt-6-astra',
  name: 'GPT 6.0 Astra',
  provider: 'openai',
  modelIdentifier: 'cx/gpt-6-astra',
  avatar: '🌟',
  badgeColor: '#10b981',
  playStyle: 'Frontier supreme intelligence',
  description: 'GPT 6.0 Astra',
};

const defaultBlackModel = DEFAULT_MODELS[1] || {
  id: 'ag-gemini-38-flash-medium',
  name: 'Gemini 3.8 Flash (Medium)',
  provider: 'openai',
  modelIdentifier: 'ag/gemini-3.8-flash-medium',
  avatar: '💎',
  badgeColor: '#0ea5e9',
  playStyle: 'Deep thinking, high strategic accuracy & tool calling',
  description: 'Gemini 3.8 Flash Medium reasoning tier.',
};

export const useGameStore = create<GameStoreState>((set) => ({
  activeTab: 'arena',
  audioEnabled: true,
  allModels: storageService.getAllModels(),
  apiKeys: storageService.getApiKeys(),
  metrics: storageService.getBenchmarkMetrics(),
  customModels: storageService.getCustomModels(),

  gameMode: 'standard',
  spectatorVision: 'all',
  whiteModifiers: ['portal_squares', 'bounty_hunter', 'exploding_rooks'],
  blackModifiers: ['ghost_knights', 'pawn_blitz', 'vampire_queen'],
  whiteSpells: ['swap_pawns', 'catapult_knight'],
  blackSpells: ['resurrection', 'frost_freeze'],

  liveGame: {
    matchId: '',
    tournamentId: null,
    whiteModel: defaultWhiteModel,
    blackModel: defaultBlackModel,
    timeControl: { name: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 },
    speedMode: '0.5s',
    gameMode: 'standard',
    whiteModifiers: ['portal_squares', 'bounty_hunter', 'exploding_rooks'],
    blackModifiers: ['ghost_knights', 'pawn_blitz', 'vampire_queen'],
    whiteSpells: ['swap_pawns', 'catapult_knight'],
    blackSpells: ['resurrection', 'frost_freeze'],
    portalSquares: ['d4', 'e5'],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    clocks: { w: 180000, b: 180000 },
    captures: { w: [], b: [] },
    moves: [],
    status: 'idle',
    result: null,
    inCheck: false,
    neuralLogs: [],
    activeThinking: { side: null, modelName: '' },
  },

  tournament: storageService.getSavedTournament(),
  isAutoRunningTournament: false,
  introMatch: null,
  currentTourneyMatch: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setAudioEnabled: (audioEnabled) => set({ audioEnabled }),
  setAllModels: (allModels) => set({ allModels }),
  setApiKeys: (apiKeys) => set({ apiKeys }),
  setMetrics: (metrics) => set({ metrics }),
  setCustomModels: (customModels) => set({ customModels }),

  setGameMode: (gameMode) =>
    set((state) => ({
      gameMode,
      liveGame: { ...state.liveGame, gameMode },
    })),
  setSpectatorVision: (spectatorVision) => set({ spectatorVision }),
  setWhiteModifiers: (whiteModifiers) =>
    set((state) => ({
      whiteModifiers,
      liveGame: { ...state.liveGame, whiteModifiers },
    })),
  setBlackModifiers: (blackModifiers) =>
    set((state) => ({
      blackModifiers,
      liveGame: { ...state.liveGame, blackModifiers },
    })),
  setWhiteSpells: (whiteSpells) =>
    set((state) => ({
      whiteSpells,
      liveGame: { ...state.liveGame, whiteSpells },
    })),
  setBlackSpells: (blackSpells) =>
    set((state) => ({
      blackSpells,
      liveGame: { ...state.liveGame, blackSpells },
    })),

  setLiveGame: (partial) =>
    set((state) => ({
      liveGame: { ...state.liveGame, ...partial },
    })),

  updateOnMove: (payload) =>
    set((state) => ({
      liveGame: {
        ...state.liveGame,
        moves: payload.moveRecord
          ? [...state.liveGame.moves, payload.moveRecord]
          : state.liveGame.moves,
        fen: payload.fen,
        clocks: payload.clocks,
        captures: payload.captures,
        turn: payload.turn,
        inCheck: payload.inCheck,
        fogVision: payload.fogVision || state.liveGame.fogVision,
        duckSquare: payload.duckSquare !== undefined ? payload.duckSquare : state.liveGame.duckSquare,
        crazyhouseReserves: payload.crazyhouseReserves || state.liveGame.crazyhouseReserves,
        whiteSpells: payload.whiteSpells || state.liveGame.whiteSpells,
        blackSpells: payload.blackSpells || state.liveGame.blackSpells,
      },
    })),

  updateClock: (clocks) =>
    set((state) => ({
      liveGame: { ...state.liveGame, clocks },
    })),

  updateThought: (activeThinking) =>
    set((state) => ({
      liveGame: { ...state.liveGame, activeThinking },
    })),

  appendNeuralLog: (log) =>
    set((state) => ({
      liveGame: {
        ...state.liveGame,
        neuralLogs: [...state.liveGame.neuralLogs, log],
      },
    })),

  setTournament: (tournament) => set({ tournament }),
  setIsAutoRunningTournament: (isAutoRunningTournament) => set({ isAutoRunningTournament }),
  setIntroMatch: (introMatch) => set({ introMatch }),
  setCurrentTourneyMatch: (currentTourneyMatch) => set({ currentTourneyMatch }),
}));
