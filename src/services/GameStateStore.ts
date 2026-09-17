import { Chess, Square } from 'chess.js';
import {
  ConversationMessage,
  GameResult,
  MoveRecord,
  NeuralLogEntry,
  SerializedGameState,
  TimeControl,
} from '../types';

export interface MaterialBalance {
  white: number;
  black: number;
  delta: number; // positive = White advantage, negative = Black advantage
}

export type StoreEvent = 'board' | 'clocks' | 'moves' | 'status' | 'memory' | 'neural' | 'all';
type Subscriber = (event: StoreEvent) => void;

export class GameStateStore {
  private chess: Chess;
  private fen: string;
  private turn: 'w' | 'b';
  private moves: MoveRecord[];
  private clocks: { w: number; b: number }; // milliseconds
  private timeControl: TimeControl;
  private captures: { w: string[]; b: string[] }; // pieces captured BY white, BY black
  private status: 'idle' | 'active' | 'paused' | 'stepping' | 'finished';
  private result: GameResult | null;
  private agentMemory: {
    w: ConversationMessage[];
    b: ConversationMessage[];
  };
  private illegalAttempts: { w: number; b: number };
  private neuralLogs: NeuralLogEntry[] = [];
  private activeThinking: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string } = {
    side: null,
    modelName: '',
  };
  private subscribers: Set<Subscriber> = new Set();

  constructor(timeControl: TimeControl = { name: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 }) {
    this.chess = new Chess();
    this.fen = this.chess.fen();
    this.turn = 'w';
    this.moves = [];
    this.timeControl = timeControl;
    this.clocks = {
      w: timeControl.baseSeconds * 1000,
      b: timeControl.baseSeconds * 1000,
    };
    this.captures = { w: [], b: [] };
    this.status = 'idle';
    this.result = null;
    this.agentMemory = { w: [], b: [] };
    this.illegalAttempts = { w: 0, b: 0 };
    this.neuralLogs = [];
    this.activeThinking = { side: null, modelName: '' };
  }

  // --- Pub / Sub ---
  public subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private publish(event: StoreEvent): void {
    this.subscribers.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    });
  }

  // --- Read Operations ---
  public getChess(): Chess {
    return this.chess;
  }

  public getFEN(): string {
    return this.fen;
  }

  public getTurn(): 'w' | 'b' {
    return this.turn;
  }

  public getMoves(): MoveRecord[] {
    return [...this.moves];
  }

  public getLastMove(): MoveRecord | undefined {
    return this.moves[this.moves.length - 1];
  }

  public getClocks(): { w: number; b: number } {
    return { ...this.clocks };
  }

  public getCaptures(): { w: string[]; b: string[] } {
    return { w: [...this.captures.w], b: [...this.captures.b] };
  }

  public getStatus(): 'idle' | 'active' | 'paused' | 'stepping' | 'finished' {
    return this.status;
  }

  public getResult(): GameResult | null {
    return this.result;
  }

  public getIllegalAttempts(side: 'w' | 'b'): number {
    return this.illegalAttempts[side];
  }

  public getMemory(side: 'w' | 'b'): ConversationMessage[] {
    return [...this.agentMemory[side]];
  }

  public getLegalMoves(): string[] {
    return this.chess.moves();
  }

  public isCheck(): boolean {
    return this.chess.inCheck();
  }

  public isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  public isDraw(): boolean {
    return this.chess.isDraw();
  }

  public isGameOver(): boolean {
    return this.chess.isGameOver() || this.status === 'finished';
  }

  public getMaterialBalance(): MaterialBalance {
    const pieceValues: Record<string, number> = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 0,
    };

    let whiteScore = 0;
    let blackScore = 0;

    const board = this.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const val = pieceValues[piece.type] || 0;
          if (piece.color === 'w') whiteScore += val;
          else blackScore += val;
        }
      }
    }

    return {
      white: whiteScore,
      black: blackScore,
      delta: whiteScore - blackScore,
    };
  }

  public getNeuralLogs(): NeuralLogEntry[] {
    return [...this.neuralLogs];
  }

  public addNeuralLog(entry: NeuralLogEntry): void {
    this.neuralLogs.push(entry);
    this.publish('all');
  }

  public clearNeuralLogs(): void {
    this.neuralLogs = [];
    this.publish('all');
  }

  public getActiveThinking(): { side: 'w' | 'b' | null; modelName: string; thoughtText?: string } {
    return { ...this.activeThinking };
  }

  public setActiveThinking(thinking: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string }): void {
    this.activeThinking = thinking;
    this.publish('all');
  }

  // --- Write Operations ---
  public applyMove(
    sanOrUci: string,
    metadata: {
      reasoning?: string;
      latencyMs: number;
      toolCallsCount: number;
    }
  ): { success: boolean; error?: string; moveRecord?: MoveRecord } {
    try {
      // 1. Clean input string
      let cleaned = (sanOrUci || '').trim().replace(/^["'`]|["'`]$/g, '');
      // Strip move prefixes like "1. " or "1... " or "move 1: "
      cleaned = cleaned.replace(/^(move\s*\d*[\:\.\s]*)?(\d+[\.\:\s\-]+)+/i, '').trim();
      // Strip trailing punctuation like "." or "!" or "?"
      cleaned = cleaned.replace(/[!?\.]+$/, '').trim();

      // Try exact move in chess.js
      let move;
      try {
        move = this.chess.move(cleaned);
      } catch {}

      // 2. Try case-insensitive match against legal SAN moves
      if (!move) {
        const legalMoves = this.chess.moves();
        const sanMatch = legalMoves.find(
          (m) => m.toLowerCase() === cleaned.toLowerCase()
        );
        if (sanMatch) {
          move = this.chess.move(sanMatch);
        }
      }

      // 3. Try UCI matching (e.g. e2e4, e7e5, b8c6, b8-c6)
      if (!move) {
        const uciClean = cleaned.replace(/[\s\-_]/g, '').toLowerCase();
        const verboseMoves = this.chess.moves({ verbose: true });
        const uciMatch = verboseMoves.find(
          (m) =>
            `${m.from}${m.to}`.toLowerCase() === uciClean ||
            `${m.from}${m.to}${m.promotion || ''}`.toLowerCase() === uciClean
        );
        if (uciMatch) {
          move = this.chess.move(uciMatch.san);
        }
      }

      // 4. Try destination match if unambiguous (e.g. model says "c6" or "Nc6")
      if (!move && cleaned.length >= 2) {
        const verboseMoves = this.chess.moves({ verbose: true });
        const dest = cleaned.slice(-2).toLowerCase();
        const candidates = verboseMoves.filter((m) => m.to === dest);
        if (candidates.length === 1) {
          move = this.chess.move(candidates[0].san);
        }
      }

      if (!move) {
        return {
          success: false,
          error: `Illegal move: "${sanOrUci}" is not valid in current position. Legal moves: ${this.chess.moves().join(', ')}`,
        };
      }

      const playedBy = this.turn;

      // Track captured pieces
      if (move.captured) {
        const capturedPiece = move.captured.toUpperCase();
        if (playedBy === 'w') {
          this.captures.w.push(capturedPiece);
        } else {
          this.captures.b.push(capturedPiece);
        }
      }

      // Add increment to current player's clock
      if (this.timeControl.incrementSeconds > 0) {
        this.clocks[playedBy] += this.timeControl.incrementSeconds * 1000;
      }

      this.fen = this.chess.fen();
      this.turn = this.chess.turn();

      const moveRecord: MoveRecord = {
        moveNumber: Math.ceil(this.chess.history().length / 2),
        turn: playedBy,
        san: move.san,
        from: move.from,
        to: move.to,
        piece: move.piece,
        captured: move.captured,
        fenAfter: this.fen,
        latencyMs: metadata.latencyMs,
        reasoning: metadata.reasoning,
        toolCallsCount: metadata.toolCallsCount,
      };

      this.moves.push(moveRecord);

      // Check standard game-ending conditions
      if (this.chess.isCheckmate()) {
        this.status = 'finished';
        this.result = {
          winner: playedBy,
          reason: 'checkmate',
          description: `Checkmate! ${playedBy === 'w' ? 'White' : 'Black'} wins by checkmate.`,
          timestamp: Date.now(),
        };
      } else if (this.chess.isStalemate()) {
        this.status = 'finished';
        this.result = {
          winner: 'draw',
          reason: 'stalemate',
          description: 'Game drawn by stalemate.',
          timestamp: Date.now(),
        };
      } else if (this.chess.isThreefoldRepetition()) {
        this.status = 'finished';
        this.result = {
          winner: 'draw',
          reason: 'threefold',
          description: 'Game drawn by threefold repetition.',
          timestamp: Date.now(),
        };
      } else if (this.chess.isInsufficientMaterial()) {
        this.status = 'finished';
        this.result = {
          winner: 'draw',
          reason: 'insufficient_material',
          description: 'Game drawn due to insufficient material.',
          timestamp: Date.now(),
        };
      } else if (this.chess.isDraw()) {
        this.status = 'finished';
        this.result = {
          winner: 'draw',
          reason: '50-move',
          description: 'Game drawn by 50-move rule.',
          timestamp: Date.now(),
        };
      }

      this.publish('all');
      return { success: true, moveRecord };
    } catch (err: any) {
      return {
        success: false,
        error: `Move "${sanOrUci}" is not legal. Available legal moves: ${this.chess.moves().join(', ')}`,
      };
    }
  }

  public incrementIllegalAttempts(side: 'w' | 'b'): void {
    this.illegalAttempts[side]++;
    this.publish('moves');
  }

  public tickClock(side: 'w' | 'b', deltaMs: number): void {
    if (this.status !== 'active') return;

    this.clocks[side] = Math.max(0, this.clocks[side] - deltaMs);
    if (this.clocks[side] <= 0) {
      this.flagFall(side);
    }
    this.publish('clocks');
  }

  public flagFall(side: 'w' | 'b'): void {
    this.status = 'finished';
    const winner = side === 'w' ? 'b' : 'w';
    this.result = {
      winner,
      reason: 'timeout',
      description: `${side === 'w' ? 'White' : 'Black'} ran out of time! ${winner === 'w' ? 'White' : 'Black'} wins on time.`,
      timestamp: Date.now(),
    };
    this.publish('all');
  }

  public forfeit(side: 'w' | 'b', reason: 'resignation' | 'illegal_move_forfeit' | 'api_error'): void {
    this.status = 'finished';
    const winner = side === 'w' ? 'b' : 'w';
    const reasonText =
      reason === 'resignation'
        ? `${side === 'w' ? 'White' : 'Black'} resigned.`
        : reason === 'illegal_move_forfeit'
        ? `${side === 'w' ? 'White' : 'Black'} forfeited due to repeated illegal moves.`
        : `${side === 'w' ? 'White' : 'Black'} suffered an API connection failure.`;

    this.result = {
      winner,
      reason,
      description: reasonText,
      timestamp: Date.now(),
    };
    this.publish('all');
  }

  public setStatus(status: 'idle' | 'active' | 'paused' | 'stepping' | 'finished'): void {
    this.status = status;
    this.publish('status');
  }

  public appendMemory(side: 'w' | 'b', message: ConversationMessage): void {
    this.agentMemory[side].push(message);
    this.publish('memory');
  }

  public reset(timeControl?: TimeControl): void {
    if (timeControl) {
      this.timeControl = timeControl;
    }
    this.chess = new Chess();
    this.fen = this.chess.fen();
    this.turn = 'w';
    this.moves = [];
    this.clocks = {
      w: this.timeControl.baseSeconds * 1000,
      b: this.timeControl.baseSeconds * 1000,
    };
    this.captures = { w: [], b: [] };
    this.status = 'idle';
    this.result = null;
    this.agentMemory = { w: [], b: [] };
    this.illegalAttempts = { w: 0, b: 0 };
    this.publish('all');
  }

  public exportPGN(whiteName: string, blackName: string): string {
    const headers = [
      `[Event "AI Showdown Arena"]`,
      `[Site "AI Showdown"]`,
      `[Date "${new Date().toISOString().split('T')[0]}"]`,
      `[White "${whiteName}"]`,
      `[Black "${blackName}"]`,
      `[Result "${
        this.result?.winner === 'w'
          ? '1-0'
          : this.result?.winner === 'b'
          ? '0-1'
          : this.result?.winner === 'draw'
          ? '1/2-1/2'
          : '*'
      }"]`,
      `[TimeControl "${this.timeControl.baseSeconds}+${this.timeControl.incrementSeconds}"]`,
      '',
    ];

    let moveText = '';
    for (let i = 0; i < this.moves.length; i++) {
      if (i % 2 === 0) {
        moveText += `${Math.floor(i / 2) + 1}. `;
      }
      moveText += `${this.moves[i].san} `;
    }

    if (this.result) {
      moveText +=
        this.result.winner === 'w'
          ? '1-0'
          : this.result.winner === 'b'
          ? '0-1'
          : '1/2-1/2';
    }

    return [...headers, moveText.trim()].join('\n');
  }

  public serialize(): SerializedGameState {
    return {
      fen: this.fen,
      turn: this.turn,
      moves: [...this.moves],
      clocks: { ...this.clocks },
      timeControl: { ...this.timeControl },
      captures: { w: [...this.captures.w], b: [...this.captures.b] },
      status: this.status,
      result: this.result ? { ...this.result } : null,
      agentMemory: {
        w: [...this.agentMemory.w],
        b: [...this.agentMemory.b],
      },
      illegalAttempts: { ...this.illegalAttempts },
      neuralLogs: [...this.neuralLogs],
    };
  }

  public restore(snapshot: SerializedGameState): boolean {
    try {
      this.chess = new Chess(snapshot.fen);
      this.fen = snapshot.fen;
      this.turn = snapshot.turn;
      this.moves = snapshot.moves || [];
      this.clocks = snapshot.clocks || {
        w: snapshot.timeControl.baseSeconds * 1000,
        b: snapshot.timeControl.baseSeconds * 1000,
      };
      this.timeControl = snapshot.timeControl;
      this.captures = snapshot.captures || { w: [], b: [] };
      // If was active when refreshed, restore as paused so user can deliberately resume
      this.status = snapshot.status === 'active' ? 'paused' : snapshot.status;
      this.result = snapshot.result;
      this.agentMemory = snapshot.agentMemory || { w: [], b: [] };
      this.illegalAttempts = snapshot.illegalAttempts || { w: 0, b: 0 };
      this.neuralLogs = snapshot.neuralLogs || [];
      this.activeThinking = { side: null, modelName: '' };
      this.publish('all');
      return true;
    } catch (err) {
      console.error('Failed to restore GameStateStore from snapshot:', err);
      return false;
    }
  }
}
