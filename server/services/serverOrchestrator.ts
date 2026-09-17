import { Chess, Square } from 'chess.js';
import { CHESS_TOOLS } from '../../src/services/chessTools';
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

function formatClockTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s (${totalSec}s)`;
}

function formatClockBlock(myClockMs: number, oppClockMs: number): string {
  const myTotalSec = Math.max(0, Math.floor(myClockMs / 1000));
  const oppTotalSec = Math.max(0, Math.floor(oppClockMs / 1000));
  const myFormatted = formatClockTime(myClockMs);
  const oppFormatted = formatClockTime(oppClockMs);
  const timeDelta = myTotalSec - oppTotalSec;
  const deltaText =
    timeDelta > 5
      ? `+${timeDelta}s ahead of opponent`
      : timeDelta < -5
      ? `${timeDelta}s behind opponent (accelerate tempo)`
      : `Clocks roughly even`;

  let alert = '';
  if (myTotalSec <= 10) {
    alert = '\n🚨 CRITICAL TIME SCRAMBLE (<10s): Move immediately to avoid losing on time!';
  } else if (myTotalSec <= 30) {
    alert = '\n⏱️ TIME PRESSURE WARNING (<30s): Keep it simple and move fast.';
  }

  return `Chess Clocks:
- Your remaining time: ${myFormatted}
- Opponent remaining time: ${oppFormatted} (${deltaText})${alert}`;
}

// 1. SPELL DRAFT CHESS PROMPTS
function buildSpellDraftSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
  mySpells?: string[];
  oppSpells?: string[];
}): string {
  const mySpellNames = (params.mySpells || []).map((s) => AVAILABLE_SPELLS.find((sp) => sp.id === s)?.name || s).join(', ');
  const oppSpellNames = (params.oppSpells || []).map((s) => AVAILABLE_SPELLS.find((sp) => sp.id === s)?.name || s).join(', ');

  return `You are a Grandmaster Battlemage playing as ${params.color} against ${params.opponentName}${params.playStyle ? ` (${params.playStyle})` : ''} in SPELL DRAFT CHESS!

🪄 YOUR SPELL CARDS INVENTORY:
- Your Active Spells: [${mySpellNames || 'None remaining'}]
- Opponent's Spells: [${oppSpellNames || 'None remaining'}]

⚡ DUAL ACTION SYSTEM (CAST SPELL + MAKE MOVE):
You possess mystical spells that bend chess reality. You can cast a spell using the "cast_spell" tool, AND you MUST make a legal chess move using the "make_move" tool!
Available Spell Arsenal:
1. "swap_pawns": Instantly swap the positions of two of your active pawns (arguments: sq1, sq2 or omit to auto-target).
2. "catapult_knight": Launch an active Knight directly across into ranks 4, 5, or 6 to create sudden forks or checkmate attacks! (arguments: sq1, sq2 or omit to auto-target).
3. "frost_freeze": Glacial freeze an enemy piece. That unit is paralyzed and CANNOT MOVE on the opponent's next turn! (arguments: sq1 = enemy square or omit to auto-freeze highest value unit).
4. "resurrection": Revive a captured friendly pawn back onto an open back-rank square!

🎯 STRATEGIC DIRECTIVE:
Spells are decisive weapons! If you have a spell available and it provides tactical advantage or disrupts enemy plans, INVOKE "cast_spell" to cast it!`;
}

function buildSpellDraftTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
  spells?: string[];
  frozenSquare?: string | null;
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const spellsLeft = params.spells || [];
  let spellSection = '';
  if (spellsLeft.length > 0) {
    spellSection = `\n🪄 READY SPELL CARDS (${spellsLeft.length}):\n${spellsLeft.map((s) => `   - ⭐ ${s}: Call "cast_spell" with {"spell_id": "${s}"}`).join('\n')}\n👉 TIP: Cast a spell now if it gives you a tactical strike or defensive save!`;
  } else {
    spellSection = `\n🪄 SPELLS: All spell cards consumed.`;
  }

  const freezeAlert = params.frozenSquare ? `\n❄️ GLACIAL FREEZE: Enemy unit on ${params.frozenSquare} is paralyzed and cannot move!` : '';

  return `[Turn: ${params.color} | Move #${params.moveNumber}] (SPELL DRAFT CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Defend King.' : ''}${freezeAlert}
Position FEN: ${params.fen}
${clockInfo}
${spellSection}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Evaluate whether to cast a spell with "cast_spell", then pick your best legal move with "make_move".`;
}

// 2. CRAZYHOUSE CHESS PROMPTS
function buildCrazyhouseSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
}): string {
  return `You are a hyper-aggressive Grandmaster playing as ${params.color} against ${params.opponentName} in CRAZYHOUSE CHESS!

📦 CRAZYHOUSE CORE RULES & TACTICS:
1. CAPTURES JOIN YOUR HAND: Every piece you capture changes to your color and enters your reserve hand.
2. DROP MOVES: Instead of moving a piece already on the board, you can DROP any piece from your reserve onto ANY empty square!
   - Drop syntax: P@e4 (drop Pawn on e4), N@f3 (drop Knight on f3), Q@g7 (drop Queen on g7), B@c4, R@d1.
   - Pawns can be dropped on ranks 2 through 7 (not ranks 1 or 8).
3. DROPS ARE OFTEN STRONGER THAN MOVES: A dropped piece bypasses all obstacles, delivers instant checks, blocks incoming threats, or forks multiple pieces.
4. KING HUNTING: Prioritize checking the enemy King with reserve drops or sealing mating nets with dropped pieces!

Always evaluate your DROP options first. Call "make_move" with a board move (e.g. "Nf3") or a drop move (e.g. "N@f3").`;
}

function buildCrazyhouseTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
  reserves?: { w: string[]; b: string[] };
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const mySide = params.color === 'WHITE' ? 'w' : 'b';
  const oppSide = params.color === 'WHITE' ? 'b' : 'w';
  const myReserve = params.reserves ? params.reserves[mySide] : [];
  const oppReserve = params.reserves ? params.reserves[oppSide] : [];

  const dropMoves = params.legalMoves.filter((m) => m.includes('@'));
  const boardMoves = params.legalMoves.filter((m) => !m.includes('@'));

  return `[Turn: ${params.color} | Move #${params.moveNumber}] (CRAZYHOUSE CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! You can block checks by dropping a piece from reserve between attacker and King!' : ''}
Position FEN: ${params.fen}
${clockInfo}

📦 CRAZYHOUSE RESERVES:
- Your Hand: [${myReserve.length > 0 ? myReserve.join(', ') : 'Empty'}]
- Opponent Hand: [${oppReserve.length > 0 ? oppReserve.join(', ') : 'Empty'}]

⚡ AVAILABLE PIECE DROPS (${dropMoves.length}):
${dropMoves.length > 0 ? dropMoves.join(', ') : 'None available (reserve empty)'}

Standard Board Moves (${boardMoves.length}):
${boardMoves.join(', ')}

Analyze if a piece drop (e.g. ${dropMoves[0] || 'N@f3'}) creates an immediate fork, check, or checkmate attack. Call make_move with your move.`;
}

// 3. DUCK CHESS PROMPTS
function buildDuckChessSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
}): string {
  return `You are a Grandmaster tactician playing as ${params.color} against ${params.opponentName} in DUCK CHESS!

🦆 DUCK CHESS ESSENTIAL RULES:
1. NO CHECK OR CHECKMATE EXISTS! Standard check does not exist. If a King is attacked, it is NOT check. Kings CAN AND MUST BE CAPTURED directly!
2. DIRECT KING CAPTURE WINS INSTANTLY: If the enemy King is undefended or within reach of any of your pieces, CAPTURE IT IMMEDIATELY to win the match!
3. DUCK BLOCKADE: A neutral rubber duck sits on the board. Neither player can move to or through the duck square (only Knights can jump over it).
4. After every move, the duck moves to an empty square to block the opponent's counterplay.

Your primary goal is to capture the enemy King or use the duck to trap it. Call "make_move" with your chosen move.`;
}

function buildDuckChessTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
  duckSquare?: string | null;
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (DUCK CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}
Position FEN: ${params.fen}
🦆 NEUTRAL DUCK: Located on square ${params.duckSquare || 'None'}. Neither player can land on or pass through this square!
👑 KING HUNT: Check is DISABLED. If you can capture the enemy King this turn, play it immediately to win!
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Calculate forcing lines, hunt the enemy King, and call make_move.`;
}

// 4. ATOMIC CHESS PROMPTS
function buildAtomicChessSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
}): string {
  return `You are a hyper-tactical explosive Grandmaster playing as ${params.color} against ${params.opponentName} in ATOMIC CHESS!

💥 ATOMIC CHESS RULES & SACRIFICIAL COMBOS:
1. EVERY CAPTURE DETONATES: When any piece captures another, a 3x3 square explosion detonates around the capture square!
   - The capturing piece is vaporized.
   - The captured piece is vaporized.
   - ALL non-pawn pieces in the 8 adjacent squares are destroyed and removed!
   - Pawns in the blast radius survive the shockwave.
2. KING DESTROYED = INSTANT VICTORY: If an explosion touches the enemy King, you win immediately!
3. KING SUICIDE FORBIDDEN: You cannot make a capture if your own King is in the blast radius.
4. KING CONTACT IMMUNITY: Opposing Kings can stand next to each other because neither King can capture without dying in the blast!
5. SACRIFICIAL BLASTS: You can sacrifice your Queen, Rook, or Knight by capturing ANY defended piece next to the enemy King to blow up the King and win instantly!

Spot any capture adjacent to the enemy King. Call make_move with your chosen move.`;
}

function buildAtomicChessTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (ATOMIC CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}
Position FEN: ${params.fen}
💥 EXPLOSION RADAR: Any capture will vaporize the capturing piece, target piece, and all adjacent non-pawns!
Look for:
- Captures adjacent to the enemy King for an INSTANT WIN!
- Captures that wipe out multiple enemy major pieces in a single explosion!
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Calculate explosive lines and call make_move with your move and reasoning.`;
}

// 5. CHAOS MUTATORS PROMPTS
function buildMutatorsSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
  myModifiers?: string[];
  oppModifiers?: string[];
}): string {
  const myModDesc = (params.myModifiers || [])
    .map((id) => AVAILABLE_MODIFIERS.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `   - ⭐ ${m!.name}: ${m!.description}`)
    .join('\n');
  const oppModDesc = (params.oppModifiers || [])
    .map((id) => AVAILABLE_MODIFIERS.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `   - ⚡ Enemy ${m!.name}: ${m!.description}`)
    .join('\n');

  return `You are a Grandmaster playing as ${params.color} against ${params.opponentName} in CHAOS MUTATOR AUTO-BATTLER CHESS!

🎲 YOUR DRAFTED MUTATOR CARDS:
${myModDesc || '   - None'}

⚡ OPPONENT'S MUTATOR CARDS:
${oppModDesc || '   - None'}

ACTIVELY EXPLOIT YOUR POWERS:
- Quantum Portals: Squares d4 and e5 are linked. Moving to d4 teleports you to e5 (if empty), and vice versa!
- Bounty Hunter: Every capture grants you +15 seconds on your digital clock!
- Exploding Rooks: When your Rook captures, it sends a shockwave destroying adjacent enemy pawns!
- Vampire Queen: When your Queen captures, it resurrects a friendly pawn!

Leverage your mutator advantages aggressively. Call make_move with your chosen move.`;
}

function buildMutatorsTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
  portalSquares?: [string, string];
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (CHAOS MUTATORS CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Defend your King.' : ''}
Position FEN: ${params.fen}
🌀 Quantum Portals: Active on ${params.portalSquares?.join(' <-> ') || 'd4 <-> e5'}
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Exploit your mutators and call make_move with your move and reasoning.`;
}

// 6. FOG OF WAR PROMPTS
function buildFogOfWarSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
}): string {
  return `You are a supreme commander playing as ${params.color} against ${params.opponentName} in KRIEGSPIEL / FOG OF WAR CHESS!

🌫️ FOG OF WAR RULES:
1. SIGHT CONES: You only see squares illuminated by your own pieces' radar.
2. VEILED SQUARES [?]: Enemy pieces outside your line of sight are hidden behind fog.
3. DEDUCTION & SCOUTING: Deduce enemy intentions, watch for ambushes, control key diagonals and files to expand your radar vision.

Scout carefully, defend against surprise tactics, and call make_move with your move.`;
}

function buildFogOfWarTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
  fogBoard?: string;
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (FOG OF WAR KRIEGSPIEL)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Your King is threatened!' : ''}
🌫️ Scout Radar View:
${params.fogBoard || 'Radar offline'}
(Squares marked [?] are obscured by fog)
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Analyze visible enemy positions, deduce unseen threats, and call make_move.`;
}

// 7. STANDARD CLASSICAL PROMPTS
function buildStandardSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
}): string {
  return `You are a Grandmaster-level chess engine and tactician playing as ${params.color} against ${params.opponentName}${params.playStyle ? ` (${params.playStyle})` : ''}.
Your objective is to win with precision, deep calculation, and principled play.

Checklist on every turn:
1. King Safety: Spot checks, threats, back-rank weaknesses.
2. Tactical Scanning: Forcing moves, captures, forks, pins, skewers.
3. Positional Strategy: Control the center (e4/d4), develop harmoniously, open files.
4. Clock Strategy: Calculate deeply when time is healthy, play fast and solid in time scramble.

Pick an exact legal SAN move from the provided list and invoke "make_move".`;
}

function buildStandardTurnPrompt(params: {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  legalMoves: string[];
}): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}]
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Defend your King.' : ''}
Position FEN: ${params.fen}
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Evaluate the position considering your clock situation, calculate candidate lines, and call make_move.`;
}

// Prompt Dispatchers
function buildSystemPrompt(params: {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
  gameMode?: GameMode;
  myModifiers?: string[];
  oppModifiers?: string[];
  mySpells?: string[];
  oppSpells?: string[];
}): string {
  switch (params.gameMode) {
    case 'spell_draft':
      return buildSpellDraftSystemPrompt(params);
    case 'crazyhouse':
      return buildCrazyhouseSystemPrompt(params);
    case 'duck_chess':
      return buildDuckChessSystemPrompt(params);
    case 'atomic_chess':
      return buildAtomicChessSystemPrompt(params);
    case 'mutators':
      return buildMutatorsSystemPrompt(params);
    case 'fog_of_war':
      return buildFogOfWarSystemPrompt(params);
    default:
      return buildStandardSystemPrompt(params);
  }
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
  gameMode?: GameMode;
  fogBoard?: string;
  portalSquares?: [string, string];
  duckSquare?: string | null;
  reserves?: { w: string[]; b: string[] };
  spells?: string[];
  frozenSquare?: string | null;
}): string {
  switch (params.gameMode) {
    case 'spell_draft':
      return buildSpellDraftTurnPrompt(params);
    case 'crazyhouse':
      return buildCrazyhouseTurnPrompt(params);
    case 'duck_chess':
      return buildDuckChessTurnPrompt(params);
    case 'atomic_chess':
      return buildAtomicChessTurnPrompt(params);
    case 'mutators':
      return buildMutatorsTurnPrompt(params);
    case 'fog_of_war':
      return buildFogOfWarTurnPrompt(params);
    default:
      return buildStandardTurnPrompt(params);
  }
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
              const response = await provider.sendTurn(
                memory,
                CHESS_TOOLS,
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
                  content: `CRITICAL ERROR: You responded with raw text instead of invoking the "make_move" tool.
You MUST invoke the make_move tool. Available legal moves (${legalMoves.length}):
${legalMoves.join(', ')}
Call make_move immediately with {"move": "${legalMoves[0]}"} or another legal move from the list.`,
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
                      fogVision: this.fogVision,
                      duckSquare: this.duckSquare,
                      crazyhouseReserves: this.crazyhouseReserves,
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
Invoke make_move with your chosen legal move.`,
                    });
                  }
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
