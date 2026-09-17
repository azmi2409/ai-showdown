import { audioService } from './audioService';
import {
  GameResult,
  ModelConfig,
  MoveRecord,
  NeuralLogEntry,
  TimeControl,
} from '../types';

export type SpeedMode = '1x' | '0.5s' | 'instant';

export interface LiveGameState {
  matchId: string;
  tournamentId: string | null;
  roundNumber?: number;
  matchIndex?: number;
  whiteModel: ModelConfig;
  blackModel: ModelConfig;
  timeControl: TimeControl;
  speedMode: SpeedMode;
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

type Listener = () => void;

class GameClient {
  private eventSource: EventSource | null = null;
  private state: LiveGameState;
  private listeners: Set<Listener> = new Set();
  private onGameOverCallback?: (result: GameResult, match: any) => void;

  constructor() {
    this.state = {
      matchId: '',
      tournamentId: null,
      whiteModel: {
        id: 'cx-gpt-6-astra',
        name: 'GPT 6.0 Astra',
        provider: 'openai',
        modelIdentifier: 'cx/gpt-6-astra',
        avatar: '🌟',
        badgeColor: '#10b981',
        playStyle: 'Frontier supreme intelligence',
        description: 'GPT 6.0 Astra',
      },
      blackModel: {
        id: 'ag-gemini-38-flash',
        name: 'Gemini 3.8 Flash',
        provider: 'openai',
        modelIdentifier: 'ag/gemini-3.8-flash',
        avatar: '⚡',
        badgeColor: '#38bdf8',
        playStyle: 'Ultra-fast frontier tactician',
        description: 'Gemini 3.8 Flash',
      },
      timeControl: { name: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 },
      speedMode: '0.5s',
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
    };

    this.connectSSE();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public getState(): LiveGameState {
    return this.state;
  }

  public setGameOverCallback(cb: (result: GameResult, match: any) => void): void {
    this.onGameOverCallback = cb;
  }

  // --- SSE Connection Manager ---
  private connectSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/game/events');

    this.eventSource.addEventListener('init', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        this.state = { ...this.state, ...data.payload };
        this.notify();
      } catch (err) {
        console.error('SSE init error:', err);
      }
    });

    this.eventSource.addEventListener('thought', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        this.state = {
          ...this.state,
          activeThinking: data.payload,
        };
        this.notify();
      } catch (err) {
        console.error('SSE thought error:', err);
      }
    });

    this.eventSource.addEventListener('move', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        const { moveRecord, fen, clocks, captures, turn, inCheck, isCheckmate } = payload;

        this.state = {
          ...this.state,
          moves: moveRecord ? [...this.state.moves, moveRecord] : this.state.moves,
          fen,
          clocks,
          captures,
          turn,
          inCheck,
        };

        // Sound effects based on move events
        if (isCheckmate) {
          audioService.playCheckmate();
        } else if (inCheck) {
          audioService.playCheck();
        } else if (moveRecord?.captured) {
          audioService.playCapture();
        } else {
          audioService.playMove();
        }

        this.notify();
      } catch (err) {
        console.error('SSE move error:', err);
      }
    });

    this.eventSource.addEventListener('clock', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        this.state = {
          ...this.state,
          clocks: payload.clocks,
        };
        this.notify();
      } catch {}
    });

    this.eventSource.addEventListener('log', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        this.state = {
          ...this.state,
          neuralLogs: [...this.state.neuralLogs, payload],
        };
        this.notify();
      } catch (err) {
        console.error('SSE log error:', err);
      }
    });

    this.eventSource.addEventListener('status', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        this.state = { ...this.state, ...payload };
        this.notify();
      } catch {}
    });

    this.eventSource.addEventListener('game_over', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        this.state = {
          ...this.state,
          status: 'finished',
          result: payload.result,
        };
        audioService.playCheckmate();
        this.notify();

        if (this.onGameOverCallback) {
          this.onGameOverCallback(payload.result, payload.match);
        }
      } catch (err) {
        console.error('SSE game_over error:', err);
      }
    });

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects natively
    };
  }

  // --- Backend Control Dispatchers ---
  public async startGame(payload: {
    whiteModel?: ModelConfig;
    blackModel?: ModelConfig;
    timeControl?: TimeControl;
    speedMode?: SpeedMode;
    tournamentId?: string | null;
    roundNumber?: number;
    matchIndex?: number;
  }): Promise<void> {
    try {
      await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Failed to start game on backend:', err);
    }
  }

  public async pauseGame(): Promise<void> {
    try {
      await fetch('/api/game/pause', { method: 'POST' });
    } catch (err) {
      console.error('Failed to pause game:', err);
    }
  }

  public async resumeGame(): Promise<void> {
    try {
      await fetch('/api/game/resume', { method: 'POST' });
    } catch (err) {
      console.error('Failed to resume game:', err);
    }
  }

  public async stepMove(): Promise<void> {
    try {
      await fetch('/api/game/step', { method: 'POST' });
    } catch (err) {
      console.error('Failed to step move:', err);
    }
  }

  public async forfeitGame(side?: 'w' | 'b'): Promise<void> {
    try {
      await fetch('/api/game/forfeit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side }),
      });
    } catch (err) {
      console.error('Failed to forfeit game:', err);
    }
  }

  public async resetGame(timeControl?: TimeControl): Promise<void> {
    try {
      await fetch('/api/game/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControl }),
      });
    } catch (err) {
      console.error('Failed to reset game:', err);
    }
  }

  public async setSpeedMode(speedMode: SpeedMode): Promise<void> {
    try {
      await fetch('/api/game/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speedMode }),
      });
    } catch (err) {
      console.error('Failed to set speed mode:', err);
    }
  }
}

export const gameClient = new GameClient();
