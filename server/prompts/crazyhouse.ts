import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildCrazyhouseSystemPrompt(params: SystemPromptParams): string {
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

export function buildCrazyhouseTurnPrompt(params: TurnPromptParams): string {
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
