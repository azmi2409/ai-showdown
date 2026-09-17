import { audioService } from './audioService';
import {
  GameMode,
  GameResult,
  ModelConfig,
  MoveRecord,
  NeuralLogEntry,
  TimeControl,
} from '../types';
import { useGameStore, LiveGameState, SpeedMode } from '../store/useGameStore';

export type { SpeedMode, LiveGameState };

type Listener = () => void;

class GameClient {
  private eventSource: EventSource | null = null;
  private state: LiveGameState;
  private listeners: Set<Listener> = new Set();
  private onGameOverCallback?: (result: GameResult, match: any) => void;

  constructor() {
    this.state = useGameStore.getState().liveGame;

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.disconnect();
      });
    }

    this.connectSSE();
  }

  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
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
    return useGameStore.getState().liveGame;
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
        useGameStore.getState().setLiveGame(data.payload);
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
        useGameStore.getState().updateThought(data.payload);
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

        useGameStore.getState().updateOnMove({
          moveRecord,
          fen,
          clocks,
          captures,
          turn,
          inCheck,
        });

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
        useGameStore.getState().updateClock(payload.clocks);
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
        useGameStore.getState().appendNeuralLog(payload);
        this.notify();
      } catch (err) {
        console.error('SSE log error:', err);
      }
    });

    this.eventSource.addEventListener('status', (e: MessageEvent) => {
      try {
        const { payload } = JSON.parse(e.data);
        this.state = { ...this.state, ...payload };
        useGameStore.getState().setLiveGame(payload);
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
        useGameStore.getState().setLiveGame({
          status: 'finished',
          result: payload.result,
        });
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
    matchId?: string;
    whiteModel?: ModelConfig;
    blackModel?: ModelConfig;
    timeControl?: TimeControl;
    speedMode?: SpeedMode;
    gameMode?: GameMode;
    whiteModifiers?: string[];
    blackModifiers?: string[];
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
