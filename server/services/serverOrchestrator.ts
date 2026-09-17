import { Chess, Square } from 'chess.js';
import { CHESS_TOOLS, getToolsForMode } from '../../src/services/chessTools';
import { OpenAIProvider } from '../../src/services/providers/OpenAIProvider';
import { AlgorithmEngine } from '../../src/services/algorithmEngine';
import { VariantsEngine } from '../../src/services/variantsEngine';
import {
  ConversationMessage,
  GameMode,
  GameResult,
  ModelConfig,
  MoveRecord,
  NeuralLogEntry,
  TimeControl,
  ToolCallEntry,
  AVAILABLE_MODIFIERS,
  AVAILABLE_SPELLS,
} from '../../src/types';
import { dbStore } from './dbStore';
import { sseHub } from './sseHub';
import { buildSystemPrompt, buildTurnPrompt } from '../prompts';

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

  private gameMode: GameMode = 'standard';
  private whiteModifiers: string[] = ['portal_squares', 'bounty_hunter', 'exploding_rooks'];
  private blackModifiers: string[] = ['ghost_knights', 'pawn_blitz', 'vampire_queen'];
  private portalSquares: [string, string] = ['d4', 'e5'];
  private fogVision: { w: string[]; b: string[] } = { w: [], b: [] };
  private duckSquare: string | null = null;
  private crazyhouseReserves: { w: string[]; b: string[] } = { w: [], b: [] };
  private whiteSpells: string[] = ['swap_pawns', 'catapult_knight'];
  private blackSpells: string[] = ['resurrection', 'frost_freeze'];
  private frozenSquare: { square: string; turnExpires: 'w' | 'b' } | null = null;

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
  private abortController: AbortController | null = null;
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
      id: 'ag-gemini-38-flash-medium',
      name: 'Gemini 3.8 Flash (Medium)',
      provider: 'openai',
      modelIdentifier: 'ag/gemini-3.8-flash-medium',
      avatar: '💎',
      badgeColor: '#0ea5e9',
      playStyle: 'Deep thinking, high strategic accuracy & tool calling',
      description: 'Gemini 3.8 Flash Medium reasoning tier.',
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
      gameMode: this.gameMode,
      whiteModifiers: [...this.whiteModifiers],
      blackModifiers: [...this.blackModifiers],
      portalSquares: this.portalSquares,
      fogVision: this.fogVision,
      duckSquare: this.duckSquare,
      crazyhouseReserves: { w: [...this.crazyhouseReserves.w], b: [...this.crazyhouseReserves.b] },
      whiteSpells: [...this.whiteSpells],
      blackSpells: [...this.blackSpells],
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

  private getLegalMoves(turn?: 'w' | 'b'): string[] {
    const activeTurn = turn || this.chess.turn();
    let verboseMoves = this.chess.moves({ verbose: true });

    if (this.gameMode === 'duck_chess' && this.duckSquare) {
      verboseMoves = verboseMoves.filter(
        (m) => !VariantsEngine.isMoveBlockedByDuck(m.from, m.to, m.piece, this.duckSquare)
      );
    }

    if (this.gameMode === 'spell_draft' && this.frozenSquare && this.frozenSquare.turnExpires === activeTurn) {
      verboseMoves = verboseMoves.filter(
        (m) => m.from.toLowerCase() !== this.frozenSquare!.square.toLowerCase()
      );
    }

    const sanMoves = verboseMoves.map((m) => m.san);

    if (this.gameMode === 'crazyhouse') {
      const drops = VariantsEngine.getLegalCrazyhouseDrops(
        this.chess,
        activeTurn,
        this.crazyhouseReserves[activeTurn]
      );
      return [...sanMoves, ...drops];
    }

    return sanMoves;
  }

  public async startMatch(params: {
    whiteModel?: ModelConfig;
    blackModel?: ModelConfig;
    timeControl?: TimeControl;
    speedMode?: SpeedMode;
    gameMode?: GameMode;
    whiteModifiers?: string[];
    blackModifiers?: string[];
    whiteSpells?: string[];
    blackSpells?: string[];
    tournamentId?: string | null;
    roundNumber?: number;
    matchIndex?: number;
  }): Promise<GameStateSnapshot> {
    this.stopMatch();

    if (params.whiteModel) this.whiteModel = params.whiteModel;
    if (params.blackModel) this.blackModel = params.blackModel;
    if (params.timeControl) this.timeControl = params.timeControl;
    if (params.speedMode) this.speedMode = params.speedMode;
    if (params.gameMode) this.gameMode = params.gameMode;
    if (params.whiteModifiers) this.whiteModifiers = params.whiteModifiers;
    if (params.blackModifiers) this.blackModifiers = params.blackModifiers;
    if (params.whiteSpells) this.whiteSpells = [...params.whiteSpells];
    if (params.blackSpells) this.blackSpells = [...params.blackSpells];
    this.tournamentId = params.tournamentId || null;
    this.roundNumber = params.roundNumber;
    this.matchIndex = params.matchIndex;

    this.matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.abortController = new AbortController();
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
    this.fogVision = VariantsEngine.computeFogVision(this.chess);
    this.duckSquare = null;
    this.crazyhouseReserves = { w: [], b: [] };
    this.frozenSquare = null;

    // Initialize agent memory
    this.agentMemory = {
      w: [
        {
          role: 'system',
          content: buildSystemPrompt({
            color: 'WHITE',
            opponentName: this.blackModel.name,
            playStyle: this.blackModel.playStyle,
            gameMode: this.gameMode,
            myModifiers: this.whiteModifiers,
            oppModifiers: this.blackModifiers,
            mySpells: this.whiteSpells,
            oppSpells: this.blackSpells,
          }),
        },
      ],
      b: [
        {
          role: 'system',
          content: buildSystemPrompt({
            color: 'BLACK',
            opponentName: this.whiteModel.name,
            playStyle: this.whiteModel.playStyle,
            gameMode: this.gameMode,
            myModifiers: this.blackModifiers,
            oppModifiers: this.whiteModifiers,
            mySpells: this.blackSpells,
            oppSpells: this.whiteSpells,
          }),
        },
      ],
    };

    const whiteLegalMoves = this.getLegalMoves('w');
    this.agentMemory.w.push({
      role: 'user',
      content: buildTurnPrompt({
        color: 'WHITE',
        moveNumber: 1,
        fen: this.chess.fen(),
        inCheck: this.chess.inCheck(),
        myClockMs: this.clocks.w,
        oppClockMs: this.clocks.b,
        incrementSec: this.timeControl.incrementSeconds,
        legalMoves: whiteLegalMoves,
        gameMode: this.gameMode,
        fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, 'w', this.fogVision.w) : undefined,
        portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
        duckSquare: this.duckSquare,
        reserves: this.crazyhouseReserves,
        spells: this.whiteSpells,
        frozenSquare: this.frozenSquare?.turnExpires === 'w' ? this.frozenSquare.square : undefined,
      }),
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
        const legalMoves = this.getLegalMoves(turn);
        this.agentMemory[turn].push({
          role: 'user',
          content: buildTurnPrompt({
            color: turn === 'w' ? 'WHITE' : 'BLACK',
            moveNumber: Math.floor(this.moves.length / 2) + 1,
            lastMove: this.moves.length > 0 ? {
              player: (turn === 'w' ? this.blackModel : this.whiteModel).name,
              san: this.moves[this.moves.length - 1].san,
            } : undefined,
            fen: this.chess.fen(),
            inCheck: this.chess.inCheck(),
            myClockMs: this.clocks[turn],
            oppClockMs: this.clocks[turn === 'w' ? 'b' : 'w'],
            incrementSec: this.timeControl.incrementSeconds,
            legalMoves,
            gameMode: this.gameMode,
            fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, turn, this.fogVision[turn]) : undefined,
            portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
            duckSquare: this.duckSquare,
            reserves: this.crazyhouseReserves,
          }),
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
    this.duckSquare = null;
    this.crazyhouseReserves = { w: [], b: [] };
    this.fogVision = { w: [], b: [] };
    this.whiteSpells = ['swap_pawns', 'catapult_knight'];
    this.blackSpells = ['resurrection', 'frost_freeze'];
    this.frozenSquare = null;

    const snapshot = this.getState();
    sseHub.broadcast('init', snapshot);
    return snapshot;
  }

  public forfeitMatch(side?: 'w' | 'b'): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
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
    this.status = 'idle';
    this.stopClock();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isPaused = false;
    this.isStepping = false;
    this.isLoopRunning = false;
  }

  // --- Internal Clock System ---
  private startClock(): void {
    this.stopClock();
    let lastTime = Date.now();

    this.clockTimer = setInterval(() => {
      if (this.status !== 'active') {
        this.stopClock();
        return;
      }
      if (this.isPaused) return;

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
    const loopMatchId = this.matchId;
    this.isLoopRunning = true;

    try {
      while (this.status === 'active' && this.matchId === loopMatchId) {
        if (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (this.matchId !== loopMatchId || this.status !== 'active') break;
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

        if (AlgorithmEngine.isAlgorithmModel(currentModel.modelIdentifier) || currentModel.provider === 'algorithm') {
          // --- Non-LLM Algorithm Bot Execution (100% Offline & Deterministic) ---
          if (this.gameMode === 'spell_draft') {
            const mySpells = turn === 'w' ? this.whiteSpells : this.blackSpells;
            const moveNum = Math.floor(this.moves.length / 2) + 1;
            if (mySpells.length > 0 && (moveNum === 2 || moveNum === 4)) {
              const spellToCast = mySpells.shift()!;
              const spellRes = VariantsEngine.castSpell(this.chess, spellToCast, turn);
              if (spellRes.success) {
                if (spellRes.frozenSquare) {
                  const opp = turn === 'w' ? 'b' : 'w';
                  this.frozenSquare = { square: spellRes.frozenSquare, turnExpires: opp };
                }
                capturedReasoning += ` ✨ [Cast Spell ${spellToCast}: ${spellRes.message}]`;
              }
            }
          }

          const algoResult = AlgorithmEngine.computeMove(currentModel.modelIdentifier, this.chess);
          capturedReasoning = (capturedReasoning ? capturedReasoning + ' ' : '') + algoResult.reasoning;

          this.activeThinking = {
            side: turn,
            modelName: currentModel.name,
            thoughtText: algoResult.reasoning,
          };
          sseHub.broadcast('thought', this.activeThinking);

          // Simulated thinking pace based on speed mode
          const thinkDelay =
            this.speedMode === 'instant' ? 40 : this.speedMode === '0.5s' ? 300 : 700;
          await new Promise((resolve) => setTimeout(resolve, thinkDelay));
          if (this.matchId !== loopMatchId || this.status !== 'active') break;

          const exec = this.applyMove(algoResult.san, {
            reasoning: algoResult.reasoning,
            latencyMs: algoResult.latencyMs,
            toolCallsCount: 1,
          });

          if (exec.success) {
            moveSuccessfullyMade = true;

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
              fogVision: this.fogVision,
              duckSquare: this.duckSquare,
              crazyhouseReserves: this.crazyhouseReserves,
              whiteSpells: this.whiteSpells,
              blackSpells: this.blackSpells,
              gameMode: this.gameMode,
              portalSquares: this.portalSquares,
            });

            toolCallEntries.push({
              id: `call_${Date.now()}_algo`,
              name: 'make_move',
              arguments: { move: algoResult.san, reasoning: algoResult.reasoning },
              result: { success: true, move: algoResult.san },
              latencyMs: algoResult.latencyMs,
              timestamp: Date.now(),
            });

            // Notify opponent of the move
            const opponent = turn === 'w' ? 'b' : 'w';
            const oppLegalMoves = this.getLegalMoves(opponent);
            this.agentMemory[opponent].push({
              role: 'user',
              content: buildTurnPrompt({
                color: opponent === 'w' ? 'WHITE' : 'BLACK',
                moveNumber: Math.floor(this.moves.length / 2) + 1,
                lastMove: { player: currentModel.name, san: algoResult.san },
                fen: this.chess.fen(),
                inCheck: this.chess.inCheck(),
                myClockMs: this.clocks[opponent],
                oppClockMs: this.clocks[turn],
                incrementSec: this.timeControl.incrementSeconds,
                legalMoves: oppLegalMoves,
                gameMode: this.gameMode,
                fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, opponent, this.fogVision[opponent]) : undefined,
                portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
                duckSquare: this.duckSquare,
                reserves: this.crazyhouseReserves,
                spells: opponent === 'w' ? this.whiteSpells : this.blackSpells,
                frozenSquare: this.frozenSquare?.turnExpires === opponent ? this.frozenSquare.square : undefined,
              }),
            });
          }
        } else {
          // --- LLM Network API Turn Execution ---
          while (!moveSuccessfullyMade && retries < MAX_RETRIES) {
            if (this.status !== 'active' || this.isPaused || this.matchId !== loopMatchId) break;

            try {
              // Prune old history to preserve focus and prevent context drift
              if (this.agentMemory[turn].length > 16) {
                const sys = this.agentMemory[turn][0];
                this.agentMemory[turn] = [sys, ...this.agentMemory[turn].slice(-10)];
              }

              const memory = this.agentMemory[turn];
              const signal = this.abortController?.signal;
              const tools = getToolsForMode(this.gameMode, {
                spells: turn === 'w' ? this.whiteSpells : this.blackSpells,
                reserves: this.crazyhouseReserves[turn],
                duckSquare: this.duckSquare,
              });
              const response = await provider.sendTurn(
                memory,
                tools,
                currentModel.modelIdentifier,
                undefined,
                'http://localhost:20128/v1',
                (chunk) => {
                  if (this.matchId !== loopMatchId || this.status !== 'active') return;
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
                },
                signal
              );

              if (this.matchId !== loopMatchId || this.status !== 'active') break;

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
                const legalMoves = this.getLegalMoves(turn);
                this.agentMemory[turn].push({
                  role: 'user',
                  content: `CRITICAL ERROR: You responded with raw text instead of invoking an action tool.
You MUST invoke an action tool like "make_move", "cast_spell", or "drop_piece". Available legal moves (${legalMoves.length}):
${legalMoves.join(', ')}`,
                });
                continue;
              }

              const sortedCalls = [...response.toolCalls].sort((a, b) => {
                if (a.name === 'cast_spell') return -1;
                if (b.name === 'cast_spell') return 1;
                return 0;
              });

              for (const tc of sortedCalls) {
                const toolCallStart = performance.now();
                let toolResult: any;

                if (
                  tc.name === 'make_move' ||
                  tc.name === 'make_move_and_duck' ||
                  tc.name === 'atomic_capture' ||
                  tc.name === 'use_portal'
                ) {
                  const moveArg = tc.arguments.move || '';
                  const reasoningArg = tc.arguments.reasoning || capturedReasoning || '';
                  if (reasoningArg && !capturedReasoning) capturedReasoning = reasoningArg;

                  const exec = this.applyMove(moveArg, {
                    reasoning: reasoningArg,
                    latencyMs: Math.round(performance.now() - turnStartTime),
                    toolCallsCount: toolCallEntries.length + 1,
                  });

                  if (exec.success) {
                    if (this.gameMode === 'duck_chess' && tc.arguments.duck_square) {
                      this.duckSquare = tc.arguments.duck_square;
                    }
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
                      fogVision: this.fogVision,
                      duckSquare: this.duckSquare,
                      crazyhouseReserves: this.crazyhouseReserves,
                      whiteSpells: this.whiteSpells,
                      blackSpells: this.blackSpells,
                      gameMode: this.gameMode,
                      portalSquares: this.portalSquares,
                    });

                    // Notify opponent of the move
                    const opponent = turn === 'w' ? 'b' : 'w';
                    const oppLegalMoves = this.getLegalMoves(opponent);
                    this.agentMemory[opponent].push({
                      role: 'user',
                      content: buildTurnPrompt({
                        color: opponent === 'w' ? 'WHITE' : 'BLACK',
                        moveNumber: Math.floor(this.moves.length / 2) + 1,
                        lastMove: { player: currentModel.name, san: exec.moveRecord?.san || moveArg },
                        fen: this.chess.fen(),
                        inCheck: this.chess.inCheck(),
                        myClockMs: this.clocks[opponent],
                        oppClockMs: this.clocks[turn],
                        incrementSec: this.timeControl.incrementSeconds,
                        legalMoves: oppLegalMoves,
                        gameMode: this.gameMode,
                        fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, opponent, this.fogVision[opponent]) : undefined,
                        portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
                        duckSquare: this.duckSquare,
                        reserves: this.crazyhouseReserves,
                        spells: opponent === 'w' ? this.whiteSpells : this.blackSpells,
                        frozenSquare: this.frozenSquare?.turnExpires === opponent ? this.frozenSquare.square : undefined,
                      }),
                    });
                  } else {
                    retries++;
                    illegalAttemptsThisTurn++;
                    this.illegalAttempts[turn]++;
                    const legal = this.getLegalMoves(turn);
                    toolResult = {
                      error: `ILLEGAL MOVE: "${moveArg}" is not valid in this position.`,
                      legal_moves: legal,
                    };
                    this.agentMemory[turn].push({
                      role: 'user',
                      content: `ILLEGAL MOVE: "${moveArg}" cannot be played.
Choose strictly from these legal moves (${legal.length}):
${legal.join(', ')}
Invoke an action tool with your chosen move.`,
                    });
                  }
                } else if (tc.name === 'drop_piece') {
                  const piece = (tc.arguments.piece || '').toUpperCase();
                  const square = (tc.arguments.square || '').toLowerCase();
                  const dropSan = `${piece}@${square}`;
                  const reasoningArg = tc.arguments.reasoning || capturedReasoning || '';
                  if (reasoningArg && !capturedReasoning) capturedReasoning = reasoningArg;

                  const exec = this.applyMove(dropSan, {
                    reasoning: reasoningArg,
                    latencyMs: Math.round(performance.now() - turnStartTime),
                    toolCallsCount: toolCallEntries.length + 1,
                  });

                  if (exec.success) {
                    moveSuccessfullyMade = true;
                    toolResult = {
                      success: true,
                      move_played: dropSan,
                      board_fen: this.chess.fen(),
                    };
                    this.clocks[turn] += this.timeControl.incrementSeconds * 1000;
                    sseHub.broadcast('move', {
                      moveRecord: exec.moveRecord,
                      fen: this.chess.fen(),
                      clocks: this.clocks,
                      captures: this.captures,
                      turn: this.chess.turn(),
                      inCheck: this.chess.inCheck(),
                      isCheckmate: this.chess.isCheckmate(),
                      isGameOver: this.chess.isGameOver(),
                      fogVision: this.fogVision,
                      duckSquare: this.duckSquare,
                      crazyhouseReserves: this.crazyhouseReserves,
                      whiteSpells: this.whiteSpells,
                      blackSpells: this.blackSpells,
                      gameMode: this.gameMode,
                      portalSquares: this.portalSquares,
                    });
                    const opponent = turn === 'w' ? 'b' : 'w';
                    const oppLegalMoves = this.getLegalMoves(opponent);
                    this.agentMemory[opponent].push({
                      role: 'user',
                      content: buildTurnPrompt({
                        color: opponent === 'w' ? 'WHITE' : 'BLACK',
                        moveNumber: Math.floor(this.moves.length / 2) + 1,
                        lastMove: { player: currentModel.name, san: dropSan },
                        fen: this.chess.fen(),
                        inCheck: this.chess.inCheck(),
                        myClockMs: this.clocks[opponent],
                        oppClockMs: this.clocks[turn],
                        incrementSec: this.timeControl.incrementSeconds,
                        legalMoves: oppLegalMoves,
                        gameMode: this.gameMode,
                        fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, opponent, this.fogVision[opponent]) : undefined,
                        portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
                        duckSquare: this.duckSquare,
                        reserves: this.crazyhouseReserves,
                        spells: opponent === 'w' ? this.whiteSpells : this.blackSpells,
                        frozenSquare: this.frozenSquare?.turnExpires === opponent ? this.frozenSquare.square : undefined,
                      }),
                    });
                  } else {
                    retries++;
                    illegalAttemptsThisTurn++;
                    this.illegalAttempts[turn]++;
                    const legal = this.getLegalMoves(turn);
                    toolResult = {
                      error: `ILLEGAL DROP: "${dropSan}" is not valid: ${exec.error}`,
                      legal_moves: legal,
                    };
                    this.agentMemory[turn].push({
                      role: 'user',
                      content: `ILLEGAL DROP: "${dropSan}" cannot be placed. Choose strictly from these legal moves:\n${legal.join(', ')}`,
                    });
                  }
                } else if (tc.name === 'place_duck') {
                  const sq = tc.arguments.square;
                  this.duckSquare = sq;
                  toolResult = {
                    success: true,
                    message: `Neutral Duck blocker repositioned to ${sq}.`,
                    duck_square: sq,
                  };
                } else if (tc.name === 'cast_spell') {
                  const spellId = tc.arguments.spell_id;
                  const mySpells = turn === 'w' ? this.whiteSpells : this.blackSpells;
                  const spellIdx = mySpells.indexOf(spellId);

                  if (spellIdx === -1) {
                    toolResult = {
                      success: false,
                      error: `Spell "${spellId}" not in inventory. Available: ${mySpells.join(', ') || 'None'}`,
                    };
                  } else {
                    const castRes = VariantsEngine.castSpell(this.chess, spellId, turn, {
                      sq1: tc.arguments.sq1,
                      sq2: tc.arguments.sq2,
                    });
                    if (castRes.success) {
                      mySpells.splice(spellIdx, 1);
                      if (castRes.frozenSquare) {
                        const opp = turn === 'w' ? 'b' : 'w';
                        this.frozenSquare = { square: castRes.frozenSquare, turnExpires: opp };
                      }
                      toolResult = {
                        success: true,
                        message: castRes.message,
                        fen: this.chess.fen(),
                        remaining_spells: mySpells,
                        legal_moves: this.getLegalMoves(turn),
                      };
                      this.activeThinking = {
                        side: turn,
                        modelName: currentModel.name,
                        thoughtText: `✨ [Cast Spell: ${castRes.message}]`,
                      };
                      sseHub.broadcast('thought', this.activeThinking);
                      sseHub.broadcast('move', {
                        fen: this.chess.fen(),
                        clocks: this.clocks,
                        captures: this.captures,
                        turn: this.chess.turn(),
                        inCheck: this.chess.inCheck(),
                        isCheckmate: this.chess.isCheckmate(),
                        isGameOver: this.chess.isGameOver(),
                        whiteSpells: this.whiteSpells,
                        blackSpells: this.blackSpells,
                        gameMode: this.gameMode,
                      });
                    } else {
                      toolResult = {
                        success: false,
                        error: castRes.message,
                      };
                    }
                  }
                } else if (tc.name === 'get_board_state') {
                  toolResult = {
                    fen: this.chess.fen(),
                    turn: this.chess.turn(),
                    in_check: this.chess.inCheck(),
                    legal_moves: this.getLegalMoves(turn),
                    duck_square: this.duckSquare,
                    reserves: this.gameMode === 'crazyhouse' ? this.crazyhouseReserves : undefined,
                    spells: this.gameMode === 'spell_draft' ? (turn === 'w' ? this.whiteSpells : this.blackSpells) : undefined,
                  };
                } else if (tc.name === 'get_legal_moves') {
                  toolResult = { legal_moves: this.getLegalMoves(turn) };
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
              if (this.matchId !== loopMatchId || this.status !== 'active') break;
              console.error(`Backend Agent error (${currentModel.name}):`, err.message);
              retries++;
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }

        if (this.matchId !== loopMatchId || this.status !== 'active') break;

        // Anti-Forfeit Safe Fallback
        if (!moveSuccessfullyMade && this.status === 'active') {
          const legalMoves = this.getLegalMoves(turn);
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
                fogVision: this.fogVision,
                duckSquare: this.duckSquare,
                crazyhouseReserves: this.crazyhouseReserves,
                gameMode: this.gameMode,
                portalSquares: this.portalSquares,
              });

              // Notify opponent of fallback move
              const opponent = turn === 'w' ? 'b' : 'w';
              const oppLegalMoves = this.getLegalMoves(opponent);
              this.agentMemory[opponent].push({
                role: 'user',
                content: buildTurnPrompt({
                  color: opponent === 'w' ? 'WHITE' : 'BLACK',
                  moveNumber: Math.floor(this.moves.length / 2) + 1,
                  lastMove: { player: currentModel.name, san: fallbackMove },
                  fen: this.chess.fen(),
                  inCheck: this.chess.inCheck(),
                  myClockMs: this.clocks[opponent],
                  oppClockMs: this.clocks[turn],
                  incrementSec: this.timeControl.incrementSeconds,
                  legalMoves: oppLegalMoves,
                  gameMode: this.gameMode,
                  fogBoard: this.gameMode === 'fog_of_war' ? VariantsEngine.formatFogBoard(this.chess, opponent, this.fogVision[opponent]) : undefined,
                  portalSquares: this.gameMode === 'mutators' ? this.portalSquares : undefined,
                  duckSquare: this.duckSquare,
                  reserves: this.crazyhouseReserves,
                }),
              });
            }
          }
        }

        if (this.matchId !== loopMatchId || this.status !== 'active') break;

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
        if (this.status === 'active' && this.matchId === loopMatchId) {
          const delayMs =
            this.speedMode === 'instant'
              ? 40
              : this.speedMode === '0.5s'
              ? 500
              : 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (this.matchId !== loopMatchId || this.status !== 'active') break;
        }
      }
    } finally {
      if (this.matchId === loopMatchId) {
        this.isLoopRunning = false;
      }
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

      // Crazyhouse Drop Moves (e.g. P@e4, N@f3)
      if (this.gameMode === 'crazyhouse' && /^[PNBRQpnbrq]@[a-h][1-8]$/i.test(cleaned)) {
        const currentTurn = this.chess.turn();
        const dropRes = VariantsEngine.applyCrazyhouseDrop(
          this.chess,
          cleaned,
          currentTurn,
          this.crazyhouseReserves
        );
        if (!dropRes.success) {
          return { success: false, error: dropRes.error || 'Illegal Crazyhouse drop' };
        }

        // Advance turn in FEN
        const tokens = this.chess.fen().split(' ');
        tokens[1] = currentTurn === 'w' ? 'b' : 'w';
        if (currentTurn === 'b') {
          tokens[5] = (parseInt(tokens[5], 10) + 1).toString();
        }
        tokens[4] = '0';
        this.chess.load(tokens.join(' '));

        const moveRecord: MoveRecord = {
          moveNumber: Math.floor(this.moves.length / 2) + 1,
          turn: currentTurn,
          san: cleaned.toUpperCase(),
          from: 'drop' as Square,
          to: dropRes.square!,
          piece: dropRes.piece!.toLowerCase(),
          fenAfter: this.chess.fen(),
          latencyMs: metadata.latencyMs,
          reasoning: (metadata.reasoning || '') + ` • 📦 [Crazyhouse Drop: ${dropRes.piece}@${dropRes.square}]`,
          toolCallsCount: metadata.toolCallsCount,
        };
        this.moves.push(moveRecord);
        return { success: true, moveRecord };
      }

      // Check Duck blocking before applying standard chess move
      if (this.gameMode === 'duck_chess' && this.duckSquare) {
        const verbose = this.chess.moves({ verbose: true });
        const cand = verbose.find(
          (m) =>
            m.san.toLowerCase() === cleaned.toLowerCase() ||
            `${m.from}${m.to}`.toLowerCase() === cleaned.toLowerCase() ||
            `${m.from}${m.to}${m.promotion || ''}`.toLowerCase() === cleaned.toLowerCase()
        );
        if (cand && VariantsEngine.isMoveBlockedByDuck(cand.from, cand.to, cand.piece, this.duckSquare)) {
          return { success: false, error: `Move "${cleaned}" is blocked by Duck on ${this.duckSquare}.` };
        }
      }

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
        return { success: false, error: `Illegal move: "${moveInput}". Legal: ${this.getLegalMoves().join(', ')}` };
      }

      // Track captures
      if (move.captured) {
        const captor = move.color;
        this.captures[captor].push(move.captured.toUpperCase());
        if (this.gameMode === 'crazyhouse') {
          this.crazyhouseReserves[captor].push(move.captured.toUpperCase());
        }
      }

      let extraEffectNote = '';

      // Atomic Chess Rules
      if (this.gameMode === 'atomic_chess' && move.captured) {
        const explosion = VariantsEngine.resolveAtomicCapture(this.chess, move.to as Square, move.color);
        extraEffectNote += ` • 💥 [Atomic explosion on ${move.to}: ${explosion.destroyedPieces.length} piece(s) vaporized]`;
        if (explosion.kingDestroyed) {
          const loser = explosion.kingDestroyed;
          const winner = loser === 'w' ? 'b' : 'w';
          this.status = 'finished';
          this.result = {
            winner,
            reason: 'checkmate',
            description: `${loser === 'w' ? 'White' : 'Black'} King destroyed in atomic blast!`,
            timestamp: Date.now(),
          };
          this.handleMatchFinished();
        }
      }

      // Duck Chess Rules: Relocate Duck
      if (this.gameMode === 'duck_chess') {
        const opponent = move.color === 'w' ? 'b' : 'w';
        const newDuck = VariantsEngine.chooseDuckSquare(this.chess, opponent, this.duckSquare);
        this.duckSquare = newDuck;
        extraEffectNote += ` • 🦆 [Duck moved to ${newDuck}]`;
      }

      // Fog of War Rules: Recompute Vision
      if (this.gameMode === 'fog_of_war') {
        this.fogVision = VariantsEngine.computeFogVision(this.chess);
      }

      // Special Mutator Game Rules Execution
      if (this.gameMode === 'mutators') {
        const myModifiers = move.color === 'w' ? this.whiteModifiers : this.blackModifiers;

        // 1. Bounty Hunter (+15s clock on capture)
        if (move.captured && myModifiers.includes('bounty_hunter')) {
          this.clocks[move.color] += 15000;
          extraEffectNote += ' • ⏳ [Bounty Hunter: +15s Clock Awarded]';
        }

        // 2. Portal Squares (d4 <-> e5 teleportation)
        if (myModifiers.includes('portal_squares')) {
          const isD4 = move.to === 'd4';
          const isE5 = move.to === 'e5';
          const destPortal: Square = isD4 ? 'e5' : 'd4';

          if ((isD4 || isE5) && !this.chess.get(destPortal)) {
            const pieceOnTo = this.chess.get(move.to as Square);
            if (pieceOnTo) {
              this.chess.remove(move.to as Square);
              this.chess.put(pieceOnTo, destPortal);
              extraEffectNote += ` • 🌀 [Quantum Portal Teleport: ${move.to} ➔ ${destPortal}]`;
            }
          }
        }

        // 3. Exploding Rooks (Rook capture shockwave takes adjacent enemy pawns)
        if (move.piece === 'r' && move.captured && myModifiers.includes('exploding_rooks')) {
          const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const fileIdx = files.indexOf(move.to[0]);
          const rankNum = parseInt(move.to[1], 10);
          const oppColor = move.color === 'w' ? 'b' : 'w';

          const adjCoords = [
            [fileIdx - 1, rankNum],
            [fileIdx + 1, rankNum],
            [fileIdx, rankNum - 1],
            [fileIdx, rankNum + 1],
          ];

          let explodedCount = 0;
          for (const [cf, cr] of adjCoords) {
            if (cf >= 0 && cf < 8 && cr >= 1 && cr <= 8) {
              const adjSq = `${files[cf]}${cr}` as Square;
              const adjPiece = this.chess.get(adjSq);
              if (adjPiece && adjPiece.color === oppColor && adjPiece.type === 'p') {
                this.chess.remove(adjSq);
                this.captures[move.color].push('P');
                explodedCount++;
              }
            }
          }
          if (explodedCount > 0) {
            extraEffectNote += ` • 💥 [Rook Shockwave destroyed ${explodedCount} adjacent enemy pawn(s)]`;
          }
        }

        // 4. Vampire Queen (Resurrect a friendly pawn on capture)
        if (move.piece === 'q' && move.captured && myModifiers.includes('vampire_queen')) {
          const oppColor = move.color === 'w' ? 'b' : 'w';
          const backRank = move.color === 'w' ? '1' : '8';
          const emptyBackSquare = ['d', 'e', 'c', 'f'].map((f) => `${f}${backRank}` as Square).find((sq) => !this.chess.get(sq));
          if (emptyBackSquare && this.captures[oppColor].includes('P')) {
            this.chess.put({ type: 'p', color: move.color }, emptyBackSquare);
            const pIdx = this.captures[oppColor].indexOf('P');
            this.captures[oppColor].splice(pIdx, 1);
            extraEffectNote += ` • 🩸 [Vampire Queen revived friendly Pawn on ${emptyBackSquare}]`;
          }
        }
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
        reasoning: (metadata.reasoning || '') + extraEffectNote,
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
