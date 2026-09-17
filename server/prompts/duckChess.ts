import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildDuckChessSystemPrompt(params: SystemPromptParams): string {
  return `You are a Grandmaster tactician playing as ${params.color} against ${params.opponentName} in DUCK CHESS!

🦆 DUCK CHESS ESSENTIAL RULES:
1. NO CHECK OR CHECKMATE EXISTS! Standard check does not exist. If a King is attacked, it is NOT check. Kings CAN AND MUST BE CAPTURED directly!
2. DIRECT KING CAPTURE WINS INSTANTLY: If the enemy King is undefended or within reach of any of your pieces, CAPTURE IT IMMEDIATELY to win the match!
3. DUCK BLOCKADE: A neutral rubber duck sits on the board. Neither player can move to or through the duck square (only Knights can jump over it).
4. After every move, the duck moves to an empty square to block the opponent's counterplay.

Your primary goal is to capture the enemy King or use the duck to trap it. Call "make_move" with your chosen move.`;
}

export function buildDuckChessTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (DUCK CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}
Position FEN: ${params.fen}
🦆 NEUTRAL DUCK: Located on square ${params.duckSquare || 'None'}. Neither player can land on or pass through this square!
👑 KING HUNT: Check is DISABLED. If you can capture the enemy King this turn, play it immediately to win!
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

👉 ACTION: Invoke tool "make_move_and_duck" with {"move": "${params.legalMoves[0]}", "duck_square": "e5"} to move your piece AND drop the duck on an empty square to paralyze the enemy!`;
}
