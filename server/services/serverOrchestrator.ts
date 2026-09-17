import { Chess } from 'chess.js';
import { CHESS_TOOLS } from '../../src/services/chessTools';
import { OpenAIProvider } from '../../src/services/providers/OpenAIProvider';
import {
  ConversationMessage,
  GameResult,
  ModelConfig,
  MoveRecord,
  NeuralLogEntry,
  TimeControl,
  ToolCallEntry,
} from '../../src/types';
import { dbStore } from './dbStore';
import { sseHub } from './sseHub';

export type SpeedMode = '1x' | '0.5s' | 'instant';

export interface GameStateSnapshot {
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

export class ServerOrchestrator {
  private chess: Chess;
  private matchId: string;
  private tournamentId: string | null = null;
  private roundNumber?: number;
  private matchIndex?: number;

  private whiteModel: ModelConfig;
  private blackModel: ModelConfig;
  private timeControl: TimeControl;
  private speedMode: SpeedMode = '0.5s';

  private clocks: { w: number; b: number };
  private captures: { w: string[]; b: string[] } = { w: [], b: [] };
  private moves: MoveRecord[] = [];
  private status: 'idle' | 'active' | 'paused' | 'stepping' | 'finished' = 'idle';
  private result: GameResult | null = null;
  private illegalAttempts: { w: number; b: number } = { w: 0, b: 0 };
  private neuralLogs: NeuralLogEntry[] = [];
  private activeThinking: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string } = {
    side: null,
    modelName: '',
  };

  private agentMemory: { w: ConversationMessage[]; b: ConversationMessage[] } = { w: [], b: [] };
  private clockTimer: NodeJS.Timeout | null = null;
  private isLoopRunning: boolean = false;
  private isPaused: boolean = false;
  private isStepping: boolean = false;
  private matchStartTime: number = 0;

  constructor() {
    this.chess = new Chess();
    this.matchId = `match_${Date.now()}`;
    this.whiteModel = {
      id: 'cx-gpt-6-astra',
      name: 'GPT 6.0 Astra',
      provider: 'openai',
      modelIdentifier: 'cx/gpt-6-astra',
      avatar: '🌟',
      badgeColor: '#10b981',
      playStyle: 'Frontier supreme intelligence',
      description: 'GPT 6.0 Astra',
    };
    this.blackModel = {
      id: 'ag-gemini-38-flash',
      name: 'Gemini 3.8 Flash',
      provider: 'openai',
      modelIdentifier: 'ag/gemini-3.8-flash',
      avatar: '⚡',
      badgeColor: '#38bdf8',
      playStyle: 'Ultra-fast frontier tactician',
      description: 'Gemini 3.8 Flash',
    };
    this.timeControl = { name: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 };
    this.clocks = {
      w: this.timeControl.baseSeconds * 1000,
      b: this.timeControl.baseSeconds * 1000,
    };
  }

  public getState(): GameStateSnapshot {
    return {
      matchId: this.matchId,
      tournamentId: this.tournamentId,
      roundNumber: this.roundNumber,
      matchIndex: this.matchIndex,
      whiteModel: this.whiteModel,
      blackModel: this.blackModel,
      timeControl: this.timeControl,
      speedMode: this.speedMode,
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      clocks: { ...this.clocks },
      captures: { w: [...this.captures.w], b: [...this.captures.b] },
      moves: [...this.moves],
      status: this.status,
      result: this.result ? { ...this.result } : null,
      inCheck: this.chess.inCheck(),
      neuralLogs: [...this.neuralLogs],
      activeThinking: { ...this.activeThinking },
    };
  }

  public setSpeedMode(mode: SpeedMode): void {
    this.speedMode = mode;
    sseHub.broadcast('status', { speedMode: this.speedMode });
  }

  public async startMatch(params: {
    whiteModel?: ModelConfig;
    blackModel?: ModelConfig;
    timeControl?: TimeControl;
    speedMode?: SpeedMode;
    tournamentId?: string | null;
    roundNumber?: number;
    matchIndex?: number;
  }): Promise<GameStateSnapshot> {
    this.stopMatch();

    if (params.whiteModel) this.whiteModel = params.whiteModel;
    if (params.blackModel) this.blackModel = params.blackModel;
    if (params.timeControl) this.timeControl = params.timeControl;
    if (params.speedMode) this.speedMode = params.speedMode;
    this.tournamentId = params.tournamentId || null;
    this.roundNumber = params.roundNumber;
    this.matchIndex = params.matchIndex;

    this.matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.chess = new Chess();
    this.moves = [];
    this.captures = { w: [], b: [] };
    this.clocks = {
      w: this.timeControl.baseSeconds * 1000,
      b: this.timeControl.baseSeconds * 1000,
    };
    this.status = 'active';
    this.result = null;
    this.neuralLogs = [];
    this.illegalAttempts = { w: 0, b: 0 };
    this.activeThinking = { side: null, modelName: '' };
    this.isPaused = false;
    this.isStepping = false;
    this.matchStartTime = Date.now();

    // Initialize agent memory
    this.agentMemory = {
      w: [
        {
          role: 'system',
          content: `You are playing chess as WHITE against ${this.blackModel.name}. Use the provided tools (get_board_state, get_legal_moves, make_move, resign) to interact with the board. Calculate deeply and make legal moves in Standard Algebraic Notation (SAN).`,
        },
      ],
      b: [
        {
          role: 'system',
          content: `You are playing chess as BLACK against ${this.whiteModel.name}. Use the provided tools (get_board_state, get_legal_moves, make_move, resign) to interact with the board. Calculate deeply and make legal moves in Standard Algebraic Notation (SAN).`,
        },
      ],
    };

    const whiteLegalMoves = this.chess.moves();
    this.agentMemory.w.push({
      role: 'user',
      content: `The game has started. You are WHITE. Current position (FEN): ${this.chess.fen()}.\nLegal moves available: ${whiteLegalMoves.join(
        ', '
      )}.\nYou MUST invoke the make_move tool with your chosen move from the list above and your strategic reasoning.`,
    });

    sseHub.broadcast('init', this.getState());
    this.startClock();
    this.runTurnLoop();

    return this.getState();
  }

  public pauseMatch(): void {
    this.isPaused = true;
    this.status = 'paused';
    this.stopClock();
    sseHub.broadcast('status', { status: this.status });
  }

  public resumeMatch(): void {
    if (this.status === 'finished') return;
    this.isPaused = false;
    this.status = 'active';
    this.startClock();
    sseHub.broadcast('status', { status: this.status });

    if (!this.isLoopRunning) {
      const turn = this.chess.turn();
      const currentMemory = this.agentMemory[turn];
      const lastMsg = currentMemory[currentMemory.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') {
        const legalMoves = this.chess.moves();
        this.agentMemory[turn].push({
          role: 'user',
          content: `Match resumed. You are ${turn === 'w' ? 'WHITE' : 'BLACK'}. Current position (FEN): ${this.chess.fen()}.\nLegal moves available: ${legalMoves.join(
            ', '
          )}.\nInvoke make_move with your chosen move.`,
        });
      }
      this.runTurnLoop();
    }
  }

  public stepMove(): void {
    if (this.status === 'finished') return;
    this.isStepping = true;
    this.isPaused = false;
    this.status = 'active';
    sseHub.broadcast('status', { status: this.status });

    if (!this.isLoopRunning) {
      this.runTurnLoop();
    }
  }

  public resetMatch(tc?: TimeControl): GameStateSnapshot {
    this.stopMatch();
    if (tc) this.timeControl = tc;

    this.chess = new Chess();
    this.moves = [];
    this.captures = { w: [], b: [] };
    this.clocks = {
      w: this.timeControl.baseSeconds * 1000,
      b: this.timeControl.baseSeconds * 1000,
    };
    this.status = 'idle';
    this.result = null;
    this.neuralLogs = [];
    this.illegalAttempts = { w: 0, b: 0 };
    this.activeThinking = { side: null, modelName: '' };
    this.agentMemory = { w: [], b: [] };

    const snapshot = this.getState();
    sseHub.broadcast('init', snapshot);
    return snapshot;
  }

  public forfeitMatch(side?: 'w' | 'b'): void {
    const forfeitSide = side || this.chess.turn();
    const winner = forfeitSide === 'w' ? 'b' : 'w';
    this.status = 'finished';
    this.result = {
      winner,
      reason: 'resignation',
      description: `${forfeitSide === 'w' ? 'White' : 'Black'} resigned.`,
      timestamp: Date.now(),
    };
    this.handleMatchFinished();
  }

  public stopMatch(): void {
    this.stopClock();
    this.isPaused = false;
    this.isStepping = false;
    this.isLoopRunning = false;
  }

  // --- Internal Clock System ---
  private startClock(): void {
    this.stopClock();
    let lastTime = Date.now();

    this.clockTimer = setInterval(() => {
      if (this.status !== 'active' || this.isPaused) return;

      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      const turn = this.chess.turn();
      this.clocks[turn] = Math.max(0, this.clocks[turn] - delta);

      // Broadcast clock tick every second or on low time
      sseHub.broadcast('clock', { clocks: this.clocks, turn });

      if (this.clocks[turn] <= 0) {
        this.status = 'finished';
        const winner = turn === 'w' ? 'b' : 'w';
        this.result = {
          winner,
          reason: 'timeout',
          description: `${turn === 'w' ? 'White' : 'Black'} ran out of time!`,
          timestamp: Date.now(),
        };
        this.handleMatchFinished();
      }
    }, 200);
  }

  private stopClock(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  // --- Turn Loop Execution on Server ---
  private async runTurnLoop(): Promise<void> {
    this.isLoopRunning = true;

    try {
      while (this.status === 'active') {
        if (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }

        const turn = this.chess.turn();
        const currentModel = turn === 'w' ? this.whiteModel : this.blackModel;
        const provider = new OpenAIProvider('http://localhost:20128/v1');

        this.activeThinking = {
          side: turn,
          modelName: currentModel.name,
          thoughtText: 'Evaluating tactical possibilities and calculating best move...',
        };
        sseHub.broadcast('thought', this.activeThinking);

        let moveSuccessfullyMade = false;
        let retries = 0;
        const MAX_RETRIES = 5;
        let illegalAttemptsThisTurn = 0;
        const toolCallEntries: ToolCallEntry[] = [];
        const turnStartTime = performance.now();
        let capturedReasoning = '';

        while (!moveSuccessfullyMade && retries < MAX_RETRIES) {
          if (this.status !== 'active' || this.isPaused) break;

          try {
            const memory = this.agentMemory[turn];
            const response = await provider.sendTurn(
              memory,
              CHESS_TOOLS,
              currentModel.modelIdentifier,
              undefined,
              'http://localhost:20128/v1',
              (chunk) => {
                if (chunk.thinking || chunk.text) {
                  capturedReasoning = chunk.text || chunk.thinking || '';
                  this.activeThinking = {
                    side: turn,
                    modelName: currentModel.name,
                    thoughtText: capturedReasoning,
                  };
                  sseHub.broadcast('thought', this.activeThinking);
                } else if (chunk.toolArgs) {
                  try {
                    const match = chunk.toolArgs.match(/"reasoning"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/);
                    if (match && match[1]) {
                      const extracted = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                      capturedReasoning = extracted;
                      this.activeThinking = {
                        side: turn,
                        modelName: currentModel.name,
                        thoughtText: capturedReasoning,
                      };
                      sseHub.broadcast('thought', this.activeThinking);
                    }
                  } catch {}
                }
              }
            );

            this.agentMemory[turn].push(response.rawAssistantMessage);

            // Extract reasoning from tool calls if not already captured
            const toolReasoning = response.toolCalls
              .map((tc) => tc.arguments?.reasoning)
              .find(Boolean);

            if (toolReasoning && !capturedReasoning) {
              capturedReasoning = toolReasoning;
            } else if (response.textContent && !capturedReasoning) {
              capturedReasoning = response.textContent;
            }

            if (capturedReasoning) {
              this.activeThinking = {
                side: turn,
                modelName: currentModel.name,
                thoughtText: capturedReasoning,
              };
              sseHub.broadcast('thought', this.activeThinking);
            }

            if (response.toolCalls.length === 0) {
              retries++;
              illegalAttemptsThisTurn++;
              this.illegalAttempts[turn]++;
              const legalMoves = this.chess.moves();
              this.agentMemory[turn].push({
                role: 'user',
                content: `Error: You must invoke the make_move tool. Available legal moves: ${legalMoves.join(
                  ', '
                )}. Example: call make_move with {"move":"${legalMoves[0]}"}.`,
              });
              continue;
            }

            for (const tc of response.toolCalls) {
              const toolCallStart = performance.now();
              let toolResult: any;

              if (tc.name === 'make_move') {
                const moveArg = tc.arguments.move || '';
                const reasoningArg = tc.arguments.reasoning || capturedReasoning || '';
                if (reasoningArg && !capturedReasoning) capturedReasoning = reasoningArg;

                const exec = this.applyMove(moveArg, {
                  reasoning: reasoningArg,
                  latencyMs: Math.round(performance.now() - turnStartTime),
                  toolCallsCount: toolCallEntries.length + 1,
                });

                if (exec.success) {
                  moveSuccessfullyMade = true;
                  toolResult = {
                    success: true,
                    move_played: exec.moveRecord?.san,
                    board_fen: this.chess.fen(),
                  };

                  // Increment clock increment
                  this.clocks[turn] += this.timeControl.incrementSeconds * 1000;

                  // Broadcast Move Event
                  sseHub.broadcast('move', {
                    moveRecord: exec.moveRecord,
                    fen: this.chess.fen(),
                    clocks: this.clocks,
                    captures: this.captures,
                    turn: this.chess.turn(),
                    inCheck: this.chess.inCheck(),
                    isCheckmate: this.chess.isCheckmate(),
                    isGameOver: this.chess.isGameOver(),
                  });

                  // Notify Opponent
                  const opponent = turn === 'w' ? 'b' : 'w';
                  const opponentLegalMoves = this.chess.moves();
                  this.agentMemory[opponent].push({
                    role: 'user',
                    content: `Your opponent played: ${exec.moveRecord?.san}. Current position (FEN): ${this.chess.fen()}.\nLegal moves available: ${opponentLegalMoves.join(
                      ', '
                    )}.\nIt is your turn. Invoke make_move with your chosen move and strategic reasoning.`,
                  });
                } else {
                  retries++;
                  illegalAttemptsThisTurn++;
                  this.illegalAttempts[turn]++;
                  const legalMoves = this.chess.moves();
                  toolResult = {
                    success: false,
                    error: exec.error,
                    legal_moves: legalMoves,
                  };
                  this.agentMemory[turn].push({
                    role: 'user',
                    content: `Move rejected: "${moveArg}" is not legal. You MUST choose one of the following legal moves: ${legalMoves.join(
                      ', '
                    )}. Call make_move now.`,
                  });
                }
              } else if (tc.name === 'get_board_state') {
                toolResult = {
                  fen: this.chess.fen(),
                  move_history: this.moves.map((m) => m.san),
                  clocks: this.clocks,
                  turn: this.chess.turn() === 'w' ? 'White' : 'Black',
                };
              } else if (tc.name === 'get_legal_moves') {
                toolResult = { legal_moves: this.chess.moves() };
              } else if (tc.name === 'resign') {
                this.forfeitMatch(turn);
                toolResult = { resigned: true };
                break;
              }

              const toolLatency = Math.round(performance.now() - toolCallStart);
              toolCallEntries.push({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                result: toolResult,
                latencyMs: toolLatency,
                timestamp: Date.now(),
              });

              this.agentMemory[turn].push(provider.formatToolResult(tc.id, toolResult));
              if (moveSuccessfullyMade) break;
            }
          } catch (err: any) {
            console.error(`Backend Agent error (${currentModel.name}):`, err.message);
            retries++;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // Anti-Forfeit Safe Fallback
        if (!moveSuccessfullyMade && this.status === 'active') {
          const legalMoves = this.chess.moves();
          if (legalMoves.length > 0) {
            const fallbackMove = legalMoves[0];
            const exec = this.applyMove(fallbackMove, {
              reasoning: `⚠️ [RECOVERY ASSIST]: Played ${fallbackMove} to maintain live match after invalid attempts.`,
              latencyMs: Math.round(performance.now() - turnStartTime),
              toolCallsCount: toolCallEntries.length + 1,
            });

            if (exec.success) {
              moveSuccessfullyMade = true;
              this.illegalAttempts[turn]++;
              sseHub.broadcast('move', {
                moveRecord: exec.moveRecord,
                fen: this.chess.fen(),
                clocks: this.clocks,
                captures: this.captures,
                turn: this.chess.turn(),
                inCheck: this.chess.inCheck(),
                isCheckmate: this.chess.isCheckmate(),
                isGameOver: this.chess.isGameOver(),
              });
            }
          }
        }

        // Clear active thinking
        this.activeThinking = { side: null, modelName: '' };
        sseHub.broadcast('thought', this.activeThinking);

        // Emit Neural Log
        const lastMove = this.moves[this.moves.length - 1];
        const neuralEntry: NeuralLogEntry = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          moveNumber: lastMove?.moveNumber || 1,
          turn,
          modelId: currentModel.id,
          modelName: currentModel.name,
          avatar: currentModel.avatar,
          toolCalls: toolCallEntries,
          textContent: capturedReasoning || undefined,
          finalMove: lastMove?.san,
          illegalAttempts: illegalAttemptsThisTurn,
          totalLatencyMs: Math.round(performance.now() - turnStartTime),
          timestamp: Date.now(),
        };

        this.neuralLogs.push(neuralEntry);
        sseHub.broadcast('log', neuralEntry);

        // Check game over
        if (this.chess.isGameOver()) {
          this.status = 'finished';
          let winner: 'w' | 'b' | 'draw' = 'draw';
          let reason: any = 'draw';
          let description = 'Game drawn.';

          if (this.chess.isCheckmate()) {
            winner = turn;
            reason = 'checkmate';
            description = `Checkmate! ${winner === 'w' ? 'White' : 'Black'} wins!`;
          } else if (this.chess.isStalemate()) {
            reason = 'stalemate';
            description = 'Draw by stalemate.';
          } else if (this.chess.isThreefoldRepetition()) {
            reason = 'threefold';
            description = 'Draw by threefold repetition.';
          } else if (this.chess.isInsufficientMaterial()) {
            reason = 'insufficient_material';
            description = 'Draw due to insufficient material.';
          }

          this.result = { winner, reason, description, timestamp: Date.now() };
          this.handleMatchFinished();
          break;
        }

        // Stepping mode pause
        if (this.isStepping) {
          this.isStepping = false;
          this.isPaused = true;
          this.status = 'paused';
          sseHub.broadcast('status', { status: this.status });
          break;
        }

        // Delay between moves
        if (this.status === 'active') {
          const delayMs =
            this.speedMode === 'instant'
              ? 40
              : this.speedMode === '0.5s'
              ? 500
              : 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } finally {
      this.isLoopRunning = false;
    }
  }

  private applyMove(
    moveInput: string,
    metadata: { reasoning?: string; latencyMs: number; toolCallsCount: number }
  ): { success: boolean; error?: string; moveRecord?: MoveRecord } {
    try {
      let cleaned = (moveInput || '').trim().replace(/^["'`]|["'`]$/g, '');
      cleaned = cleaned.replace(/^(move\s*\d*[:.\s]*)?(\d+[.:\s-]+)+/i, '').trim();
      cleaned = cleaned.replace(/[!?.]+$/, '').trim();

      let move;
      try {
        move = this.chess.move(cleaned);
      } catch {}

      if (!move) {
        const legal = this.chess.moves();
        const sanMatch = legal.find((m) => m.toLowerCase() === cleaned.toLowerCase());
        if (sanMatch) move = this.chess.move(sanMatch);
      }

      if (!move) {
        const uciClean = cleaned.replace(/[\s\-_]/g, '').toLowerCase();
        const verbose = this.chess.moves({ verbose: true });
        const uciMatch = verbose.find(
          (m) =>
            `${m.from}${m.to}`.toLowerCase() === uciClean ||
            `${m.from}${m.to}${m.promotion || ''}`.toLowerCase() === uciClean
        );
        if (uciMatch) move = this.chess.move(uciMatch.san);
      }

      if (!move) {
        return { success: false, error: `Illegal move: "${moveInput}". Legal: ${this.chess.moves().join(', ')}` };
      }

      // Track captures
      if (move.captured) {
        const captor = move.color;
        this.captures[captor].push(move.captured.toUpperCase());
      }

      const moveRecord: MoveRecord = {
        moveNumber: Math.floor((this.moves.length) / 2) + 1,
        turn: move.color,
        san: move.san,
        from: move.from,
        to: move.to,
        piece: move.piece,
        captured: move.captured,
        fenAfter: this.chess.fen(),
        latencyMs: metadata.latencyMs,
        reasoning: metadata.reasoning,
        toolCallsCount: metadata.toolCallsCount,
      };

      this.moves.push(moveRecord);
      return { success: true, moveRecord };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private handleMatchFinished(): void {
    this.stopClock();
    if (!this.result) return;

    const durationMs = Date.now() - this.matchStartTime;
    const pgn = this.chess.pgn();

    // Automatically record to dbStore & calculate ELO
    const recorded = dbStore.recordMatch({
      matchId: this.matchId,
      tournamentId: this.tournamentId,
      roundNumber: this.roundNumber,
      matchIndex: this.matchIndex,
      whiteModelId: this.whiteModel.id,
      whiteModelName: this.whiteModel.name,
      blackModelId: this.blackModel.id,
      blackModelName: this.blackModel.name,
      winner: this.result.winner,
      reason: this.result.reason,
      movesCount: this.moves.length,
      durationMs,
      pgn,
      finalFen: this.chess.fen(),
      timeControl: this.timeControl,
      telemetry: {
        whiteIllegalMoves: this.illegalAttempts.w,
        blackIllegalMoves: this.illegalAttempts.b,
        whiteAvgLatencyMs: 0,
        blackAvgLatencyMs: 0,
        whiteToolCallsCount: 0,
        blackToolCallsCount: 0,
      },
    });

    sseHub.broadcast('game_over', {
      result: this.result,
      match: recorded,
      eloChange: recorded.eloChange,
    });
  }
}

export const serverOrchestrator = new ServerOrchestrator();
