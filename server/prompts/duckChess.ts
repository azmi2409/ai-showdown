import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildDuckChessSystemPrompt(params: SystemPromptParams): string {
  return `# ROLE: DUCK CHESS GRANDMASTER
You are a Grandmaster tactician playing as **${params.color}** against **${params.opponentName}** in **DUCK CHESS**.

## Duck Chess Core Rules
1. **NO CHECK / NO CHECKMATE**: Standard check rules do not exist.
2. **KING CAPTURE WINS INSTANTLY**: If the enemy King is undefended or within range, capture it directly to win immediately!
3. **Neutral Duck Blocker**: A rubber duck sits on the board. Neither player can move to or through the duck square (only Knights can jump over it).
4. **Mandatory Duck Relocation**: After moving your piece, you must relocate the duck to an empty square to obstruct the opponent's counterplay.

## Action Protocol
Invoke tool \`make_move_and_duck\` with both \`move\` and \`duck_square\`. Capture the enemy King the moment it is exposed!`;
}

export function buildDuckChessTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (DUCK CHESS)

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
- **Neutral Duck Location**: Square \`${params.duckSquare || 'None'}\` (blocks movement/landing)
- **King Hunting**: Check is OFF. If you can capture the enemy King this turn, play it immediately to win!

${clockInfo}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Action Directive
👉 Invoke tool \`make_move_and_duck\` with \`{"move": "${params.legalMoves[0]}", "duck_square": "e5"}\` to move your piece AND place the duck on an empty square to obstruct your opponent.`;
}
