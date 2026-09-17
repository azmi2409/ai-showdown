import { ApiKeysConfig, GameResult, ModelConfig, NeuralLogEntry, ToolCallEntry } from '../types';
import { audioService } from './audioService';
import { CHESS_TOOLS } from './chessTools';
import { GameStateStore } from './GameStateStore';
import { AlgorithmEngine } from './algorithmEngine';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { SimulatedProvider } from './providers/SimulatedProvider';
import { AgentProvider } from './providers/types';
import { storageService } from './storageService';

export type SpeedMode = '1x' | '0.5s' | 'instant';

function formatClockTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s (${totalSec}s)`;
}

function buildSystemPrompt(color: 'WHITE' | 'BLACK', opponentName: string, playStyle?: string): string {
  return `You are a Grandmaster-level chess engine and tactician playing as ${color} against ${opponentName}${playStyle ? ` (${playStyle})` : ''}.
Your objective is to win with precision and principled play.

Evaluation checklist on every turn:
1. King Safety: Check for threats, king exposure, checks, mating nets, and back-rank weaknesses. Defend threats first.
2. Tactical Scanning: Find forcing moves (checks, captures, threats). Spot hanging or undefended pieces.
3. Positional Strategy: Control the center (e4/d4/e5/d5), develop pieces harmoniously, activate rooks on open files, secure outposts.
4. Calculation: Evaluate 2-3 candidate moves from the legal moves list. Consider opponent's strongest reply.
5. Clock Management & Time Strategy:
   - Digital clocks are running. Reaching 0s is an instant loss on time (Flag fall).
   - When your clock is comfortable (>60s): calculate deeply and seek best objective lines.
   - When under time pressure (15s-60s): play quickly, avoid speculative complications, pick clean, solid moves.
   - When in time scramble (<15s): avoid timeout at all costs—pick an immediate, safe, legal move without hesitation.
   - When opponent is in severe time trouble: pose practical tactical questions to pressure their clock.
6. Legal Execution: You MUST pick an exact legal SAN move from the provided list and invoke "make_move".

Always invoke make_move with your chosen move and concise, sharp tactical reasoning incorporating board analysis and time situation.`;
}

function buildTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  incrementSec?: number;
  legalMoves: string[];
}): string {
  const myTotalSec = Math.max(0, Math.floor(params.myClockMs / 1000));
  const oppTotalSec = Math.max(0, Math.floor(params.oppClockMs / 1000));
  const myFormatted = formatClockTime(params.myClockMs);
  const oppFormatted = formatClockTime(params.oppClockMs);
  const timeDelta = myTotalSec - oppTotalSec;
  const deltaText =
    timeDelta > 5
      ? `Time Advantage: +${timeDelta}s ahead of opponent.`
      : timeDelta < -5
      ? `Time Deficit: ${timeDelta}s behind opponent (accelerate tempo).`
      : `Clocks roughly even.`;

  let timeUrgencyBanner = '';
  if (myTotalSec <= 10) {
    timeUrgencyBanner = `\n🚨 CRITICAL TIME SCRAMBLE: ONLY ${myTotalSec} SECONDS REMAINING! Move immediately to avoid losing on time (flag-fall)! Pick the safest immediate legal move.`;
  } else if (myTotalSec <= 30) {
    timeUrgencyBanner = `\n⏱️ TIME PRESSURE WARNING: Under 30s remaining (${myTotalSec}s). Simplify position and prioritize rapid, safe play.`;
  } else if (oppTotalSec <= 15) {
    timeUrgencyBanner = `\n⚡ OPPONENT TIME TROUBLE: Opponent has only ${oppTotalSec}s remaining. Play solid moves that demand precision to pressure their clock.`;
  }

  const checkAlert = params.inCheck ? `\n⚠️ CRITICAL ALERT: YOU ARE IN CHECK! Defend your King immediately.` : '';
  const lastMoveText = params.lastMove
    ? `Opponent (${params.lastMove.player}) played: ${params.lastMove.san}.`
    : `Match begins.`;

  return `[Turn: ${params.color} | Move #${params.moveNumber}]
${lastMoveText}${checkAlert}${timeUrgencyBanner}
Position FEN: ${params.fen}
Chess Clocks:
- Your remaining time: ${myFormatted}
- Opponent remaining time: ${oppFormatted}
- Clock status: ${deltaText}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Evaluate the position considering your clock situation, calculate candidate lines, and call make_move with your move and strategic reasoning.`;
}

export class GameOrchestrator {
  private store: GameStateStore;
  private whiteModel: ModelConfig;
  private blackModel: ModelConfig;
  private apiKeys: ApiKeysConfig;
  private speedMode: SpeedMode = '0.5s';
  private clockTimerId: any = null;
  private isStepping: boolean = false;
  private isPaused: boolean = false;
  private isLoopRunning: boolean = false;
  private abortController: AbortController | null = null;
  private gameStartTime: number = 0;
  private neuralLogs: NeuralLogEntry[] = [];
  private onNeuralLogCallback?: (logs: NeuralLogEntry[]) => void;
  private onGameFinishedCallback?: (result: GameResult) => void;

  constructor(
    store: GameStateStore,
    whiteModel: ModelConfig,
    blackModel: ModelConfig,
    apiKeys: ApiKeysConfig = {}
  ) {
    this.store = store;
    this.whiteModel = whiteModel;
    this.blackModel = blackModel;
    this.apiKeys = apiKeys;
  }

  public setNeuralLogCallback(cb: (logs: NeuralLogEntry[]) => void): void {
    this.onNeuralLogCallback = cb;
  }

  public setGameFinishedCallback(cb: (result: GameResult) => void): void {
    this.onGameFinishedCallback = cb;
  }

  public getNeuralLogs(): NeuralLogEntry[] {
    return [...this.neuralLogs];
  }

  public setSpeedMode(mode: SpeedMode): void {
    this.speedMode = mode;
  }

  public getSpeedMode(): SpeedMode {
    return this.speedMode;
  }

  public setModels(white: ModelConfig, black: ModelConfig): void {
    this.whiteModel = white;
    this.blackModel = black;
  }

  public setApiKeys(keys: ApiKeysConfig): void {
    this.apiKeys = keys;
  }

  private getProviderForModel(model: ModelConfig): {
    provider: AgentProvider;
    apiKey?: string;
    baseUrl?: string;
  } {
    if (model.isSimulated || model.provider === 'simulated') {
      return { provider: new SimulatedProvider(model.modelIdentifier) };
    }

    // Default all real models to http://localhost:20128/v1
    const endpoint = this.apiKeys.ollamaUrl || 'http://localhost:20128/v1';
    return {
      provider: new OpenAIProvider(endpoint),
      apiKey: this.apiKeys.openai,
      baseUrl: endpoint,
    };
  }

  public startClock(): void {
    this.stopClock();
    let lastTime = performance.now();

    this.clockTimerId = setInterval(() => {
      if (this.store.getStatus() !== 'active') return;

      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      const turn = this.store.getTurn();
      this.store.tickClock(turn, delta);

      // Low time alarm
      const clocks = this.store.getClocks();
      if (clocks[turn] < 10000 && clocks[turn] > 0) {
        if (Math.floor(clocks[turn] / 1000) !== Math.floor((clocks[turn] + delta) / 1000)) {
          audioService.playTick();
        }
      }

      if (this.store.getStatus() === 'finished') {
        this.handleGameFinished();
      }
    }, 100);
  }

  public stopClock(): void {
    if (this.clockTimerId) {
      clearInterval(this.clockTimerId);
      this.clockTimerId = null;
    }
  }

  public async startGame(): Promise<void> {
    this.stopGame();
    this.isPaused = false;
    this.isStepping = false;
    this.abortController = new AbortController();
    this.neuralLogs = [];
    this.gameStartTime = Date.now();

    this.store.setStatus('active');
    this.startClock();

    // Initialize system prompts in agent memories
    this.store.appendMemory('w', {
      role: 'system',
      content: buildSystemPrompt('WHITE', this.blackModel.name, this.blackModel.playStyle),
    });
    this.store.appendMemory('b', {
      role: 'system',
      content: buildSystemPrompt('BLACK', this.whiteModel.name, this.whiteModel.playStyle),
    });

    // Initial prompt to White with legal moves
    const whiteLegalMoves = this.store.getLegalMoves();
    const clocks = this.store.getClocks();
    this.store.appendMemory('w', {
      role: 'user',
      content: buildTurnPrompt({
        color: 'WHITE',
        moveNumber: 1,
        fen: this.store.getFEN(),
        inCheck: this.store.isCheck(),
        myClockMs: clocks.w,
        oppClockMs: clocks.b,
        legalMoves: whiteLegalMoves,
      }),
    });

    this.runTurnLoop();
  }

  private async runTurnLoop(): Promise<void> {
    this.isLoopRunning = true;
    try {
      while (this.store.getStatus() === 'active') {
        if (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }

      const turn = this.store.getTurn();
      const currentModel = turn === 'w' ? this.whiteModel : this.blackModel;
      const { provider, apiKey, baseUrl } = this.getProviderForModel(currentModel);

      // Signal active thinking in state store for live UI feedback
      this.store.setActiveThinking({
        side: turn,
        modelName: currentModel.name,
        thoughtText: 'Evaluating tactical possibilities and calculating best move...',
      });

      let moveSuccessfullyMade = false;
      let retries = 0;
      const MAX_RETRIES = 5;
      let illegalAttemptsThisTurn = 0;
      const toolCallEntries: ToolCallEntry[] = [];
      const turnStartTime = performance.now();
      let capturedReasoning = '';

      if (
        AlgorithmEngine.isAlgorithmModel(currentModel.modelIdentifier) ||
        currentModel.provider === 'algorithm'
      ) {
        // --- Non-LLM Algorithm Bot Execution ---
        const algoResult = AlgorithmEngine.computeMove(
          currentModel.modelIdentifier,
          this.store.getChess()
        );
        capturedReasoning = algoResult.reasoning;

        this.store.setActiveThinking({
          side: turn,
          modelName: currentModel.name,
          thoughtText: algoResult.reasoning,
        });

        const thinkDelay =
          this.speedMode === 'instant' ? 40 : this.speedMode === '0.5s' ? 300 : 700;
        await new Promise((resolve) => setTimeout(resolve, thinkDelay));

        const exec = this.store.applyMove(algoResult.san, {
          reasoning: algoResult.reasoning,
          latencyMs: algoResult.latencyMs,
          toolCallsCount: 1,
        });

        if (exec.success) {
          moveSuccessfullyMade = true;
          toolCallEntries.push({
            id: `call_${Date.now()}_algo`,
            name: 'make_move',
            arguments: { move: algoResult.san, reasoning: algoResult.reasoning },
            result: { success: true, move: algoResult.san },
            latencyMs: algoResult.latencyMs,
            timestamp: Date.now(),
          });

          // Sound effects
          if (exec.moveRecord?.captured) {
            audioService.playCapture();
          } else {
            audioService.playMove();
          }

          if (this.store.isCheckmate()) {
            audioService.playCheckmate();
          } else if (this.store.isCheck()) {
            audioService.playCheck();
          }

          // Notify opponent of the move with their legal moves
          const opponent = turn === 'w' ? 'b' : 'w';
          const opponentLegalMoves = this.store.getLegalMoves();
          const oppClocks = this.store.getClocks();
          this.store.appendMemory(opponent, {
            role: 'user',
            content: buildTurnPrompt({
              color: opponent === 'w' ? 'WHITE' : 'BLACK',
              moveNumber: Math.floor(this.store.getMoves().length / 2) + 1,
              lastMove: { player: currentModel.name, san: exec.moveRecord?.san || algoResult.san },
              fen: this.store.getFEN(),
              inCheck: this.store.isCheck(),
              myClockMs: oppClocks[opponent],
              oppClockMs: oppClocks[turn],
              legalMoves: opponentLegalMoves,
            }),
          });
        }
      } else {
        while (!moveSuccessfullyMade && retries < MAX_RETRIES) {
          if (this.store.getStatus() !== 'active' || this.isPaused) break;

          try {
            const memory = this.store.getMemory(turn);
            const response = await provider.sendTurn(
              memory,
              CHESS_TOOLS,
              currentModel.modelIdentifier,
              apiKey,
              baseUrl,
              (chunk) => {
                if (chunk.thinking || chunk.text) {
                  capturedReasoning = chunk.text || chunk.thinking || '';
                  this.store.setActiveThinking({
                    side: turn,
                    modelName: currentModel.name,
                    thoughtText: capturedReasoning,
                  });
                }
              },
              this.abortController?.signal
            );

            this.store.appendMemory(turn, response.rawAssistantMessage);

            if (response.textContent && !capturedReasoning) {
              capturedReasoning = response.textContent;
              this.store.setActiveThinking({
                side: turn,
                modelName: currentModel.name,
                thoughtText: response.textContent,
              });
            }

            if (response.toolCalls.length === 0) {
              // Model returned raw text without calling tools
              retries++;
              illegalAttemptsThisTurn++;
              this.store.incrementIllegalAttempts(turn);
              const legalMoves = this.store.getLegalMoves();
              this.store.appendMemory(turn, {
                role: 'user',
                content: `Error: You must invoke the make_move tool. Available legal moves: ${legalMoves.join(
                  ', '
                )}. Example: call make_move with {"move":"${legalMoves[0]}"}.`,
              });
              continue;
            }

            // Process tool calls
            for (const tc of response.toolCalls) {
              const toolCallStart = performance.now();
              let toolResult: any;

              if (tc.name === 'make_move') {
                const moveArg = tc.arguments.move || '';
                const reasoningArg = tc.arguments.reasoning || capturedReasoning || '';
                if (reasoningArg && !capturedReasoning) {
                  capturedReasoning = reasoningArg;
                }

                const exec = this.store.applyMove(moveArg, {
                  reasoning: reasoningArg,
                  latencyMs: Math.round(performance.now() - turnStartTime),
                  toolCallsCount: toolCallEntries.length + 1,
                });

                if (exec.success) {
                  moveSuccessfullyMade = true;
                  toolResult = {
                    success: true,
                    move_played: exec.moveRecord?.san,
                    board_fen: this.store.getFEN(),
                  };

                  // Sound effects
                  if (exec.moveRecord?.captured) {
                    audioService.playCapture();
                  } else {
                    audioService.playMove();
                  }

                  if (this.store.isCheckmate()) {
                    audioService.playCheckmate();
                  } else if (this.store.isCheck()) {
                    audioService.playCheck();
                  }

                  // Notify opponent of the move with their legal moves
                  const opponent = turn === 'w' ? 'b' : 'w';
                  const opponentLegalMoves = this.store.getLegalMoves();
                  const oppClocks = this.store.getClocks();
                  this.store.appendMemory(opponent, {
                    role: 'user',
                    content: buildTurnPrompt({
                      color: opponent === 'w' ? 'WHITE' : 'BLACK',
                      moveNumber: Math.floor(this.store.getMoves().length / 2) + 1,
                      lastMove: { player: currentModel.name, san: exec.moveRecord?.san || moveArg },
                      fen: this.store.getFEN(),
                      inCheck: this.store.isCheck(),
                      myClockMs: oppClocks[opponent],
                      oppClockMs: oppClocks[turn],
                      legalMoves: opponentLegalMoves,
                    }),
                  });
                } else {
                  retries++;
                  illegalAttemptsThisTurn++;
                  this.store.incrementIllegalAttempts(turn);
                  toolResult = {
                    success: false,
                    error: exec.error,
                    legal_moves: this.store.getLegalMoves(),
                  };
                  const legalMoves = this.store.getLegalMoves();
                  // Prompt with legal moves for retry
                  this.store.appendMemory(turn, {
                    role: 'user',
                    content: `Move rejected: "${moveArg}" is not legal. You MUST choose one of the following legal moves: ${legalMoves.join(
                      ', '
                    )}. Call make_move now.`,
                  });
                }
              } else if (tc.name === 'get_board_state') {
                toolResult = {
                  fen: this.store.getFEN(),
                  move_history: this.store.getMoves().map((m) => m.san),
                  material: this.store.getMaterialBalance(),
                  clocks: this.store.getClocks(),
                  turn: this.store.getTurn() === 'w' ? 'White' : 'Black',
                };
              } else if (tc.name === 'get_legal_moves') {
                toolResult = {
                  legal_moves: this.store.getLegalMoves(),
                };
              } else if (tc.name === 'resign') {
                this.store.forfeit(turn, 'resignation');
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

              // Append tool result into agent memory
              this.store.appendMemory(turn, provider.formatToolResult(tc.id, toolResult));

              if (moveSuccessfullyMade) break;
            }
          } catch (err: any) {
            console.error(`Agent error (${currentModel.name}):`, err);
            retries++;
            if (retries >= MAX_RETRIES) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // Safe Fallback: If retries exceeded, make the top legal move instead of early forfeit!
      if (!moveSuccessfullyMade && this.store.getStatus() === 'active') {
        const legalMoves = this.store.getLegalMoves();
        if (legalMoves.length > 0) {
          const fallbackMove = legalMoves[0];
          const exec = this.store.applyMove(fallbackMove, {
            reasoning: `⚠️ [RECOVERY ASSIST]: Played ${fallbackMove} to maintain live match after invalid attempts. Penalty counted.`,
            latencyMs: Math.round(performance.now() - turnStartTime),
            toolCallsCount: toolCallEntries.length + 1,
          });

          if (exec.success) {
            moveSuccessfullyMade = true;
            this.store.incrementIllegalAttempts(turn);
            audioService.playMove();

            const opponent = turn === 'w' ? 'b' : 'w';
            const opponentLegalMoves = this.store.getLegalMoves();
            this.store.appendMemory(opponent, {
              role: 'user',
              content: `Your opponent played: ${exec.moveRecord?.san}. Current position (FEN): ${this.store.getFEN()}.\nLegal moves available: ${opponentLegalMoves.join(
                ', '
              )}.\nIt is your turn.`,
            });
          }
        }
      }

      // Clear active thinking
      this.store.setActiveThinking({ side: null, modelName: '' });

      // Emit and store Neural Log
      const lastMove = this.store.getLastMove();
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

      this.store.addNeuralLog(neuralEntry);
      this.neuralLogs.push(neuralEntry);
      if (this.onNeuralLogCallback) {
        this.onNeuralLogCallback(this.store.getNeuralLogs());
      }

      // Check step mode
      if (this.isStepping) {
        this.isPaused = true;
      }

      // Speed delay
      if (this.store.getStatus() === 'active') {
        const delayMs =
          this.speedMode === 'instant'
            ? 30
            : this.speedMode === '0.5s'
            ? 500
            : 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    this.isLoopRunning = false;
  }

    if (this.store.getStatus() === 'finished') {
      this.handleGameFinished();
    }
  }

  public stepMove(): void {
    this.isStepping = true;
    this.isPaused = false;
    if (!this.isLoopRunning && this.store.getStatus() !== 'finished') {
      this.store.setStatus('active');
      this.runTurnLoop();
    }
  }

  public pauseGame(): void {
    this.isPaused = true;
    this.store.setStatus('paused');
  }

  public resumeGame(): void {
    this.isPaused = false;
    this.store.setStatus('active');
    this.startClock();

    if (!this.isLoopRunning && this.store.getStatus() === 'active') {
      const turn = this.store.getTurn();
      const currentMemory = this.store.getMemory(turn);
      if (currentMemory.length === 0) {
        const whiteSystemPrompt = `You are playing chess as WHITE against ${this.blackModel.name}. Use the provided tools (get_board_state, get_legal_moves, make_move, resign) to interact with the board. Calculate deeply and make legal moves in Standard Algebraic Notation (SAN).`;
        const blackSystemPrompt = `You are playing chess as BLACK against ${this.whiteModel.name}. Use the provided tools (get_board_state, get_legal_moves, make_move, resign) to interact with the board. Calculate deeply and make legal moves in Standard Algebraic Notation (SAN).`;
        this.store.appendMemory('w', { role: 'system', content: whiteSystemPrompt });
        this.store.appendMemory('b', { role: 'system', content: blackSystemPrompt });
      }
      const lastMsg = currentMemory[currentMemory.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') {
        const legalMoves = this.store.getLegalMoves();
        this.store.appendMemory(turn, {
          role: 'user',
          content: `Match resumed. You are ${turn === 'w' ? 'WHITE' : 'BLACK'}. Current position (FEN): ${this.store.getFEN()}.\nLegal moves available: ${legalMoves.join(
            ', '
          )}.\nInvoke make_move with your chosen move.`,
        });
      }
      this.runTurnLoop();
    }
  }

  public forfeitGame(side: 'w' | 'b'): void {
    this.store.forfeit(side, 'resignation');
    this.handleGameFinished();
  }

  public stopGame(): void {
    this.store.setStatus('idle');
    this.stopClock();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isPaused = false;
    this.isStepping = false;
    this.isLoopRunning = false;
  }

  private handleGameFinished(): void {
    this.stopClock();
    const result = this.store.getResult();
    if (!result) return;

    const moves = this.store.getMoves();
    const duration = Date.now() - this.gameStartTime;

    // Calculate stats
    let whiteLatency = 0;
    let blackLatency = 0;
    let whiteTools = 0;
    let blackTools = 0;

    for (const log of this.neuralLogs) {
      if (log.turn === 'w') {
        whiteLatency += log.totalLatencyMs;
        whiteTools += log.toolCalls.length;
      } else {
        blackLatency += log.totalLatencyMs;
        blackTools += log.toolCalls.length;
      }
    }

    // Record in storageService for benchmark ratings
    storageService.recordGameResult(
      this.whiteModel.id,
      this.blackModel.id,
      result.winner,
      moves.length,
      duration,
      {
        whiteIllegal: this.store.getIllegalAttempts('w'),
        blackIllegal: this.store.getIllegalAttempts('b'),
        whiteLatency,
        blackLatency,
        whiteToolCalls: whiteTools,
        blackToolCalls: blackTools,
        whiteForfeit: result.winner === 'b' && result.reason.includes('forfeit'),
        blackForfeit: result.winner === 'w' && result.reason.includes('forfeit'),
      }
    );

    // Archive game with PGN
    storageService.archiveGame({
      id: `game_${Date.now()}`,
      white: this.whiteModel.name,
      black: this.blackModel.name,
      winner: result.winner,
      reason: result.description,
      pgn: this.store.exportPGN(this.whiteModel.name, this.blackModel.name),
      movesCount: moves.length,
      durationMs: duration,
      timestamp: Date.now(),
    });

    if (this.onGameFinishedCallback) {
      this.onGameFinishedCallback(result);
    }
  }
}
