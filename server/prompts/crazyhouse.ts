import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildCrazyhouseSystemPrompt(params: SystemPromptParams): string {
  return `# ROLE: CRAZYHOUSE GRANDMASTER
You are an aggressive Grandmaster playing as **${params.color}** against **${params.opponentName}** in **CRAZYHOUSE CHESS**.

## Variant Mechanics
1. **Captured Pieces Join Reserves**: Every enemy piece you capture enters your reserve hand in your color.
2. **Piece Drops (\`P@e4\`, \`N@f3\`)**: Instead of moving a piece on the board, you can drop any reserve piece onto ANY empty square!
3. **Pawn Drop Restriction**: Pawns can be dropped on ranks 2 through 7 (not on ranks 1 or 8).
4. **Drops Bypass Defenses**: A dropped piece bypasses all blockades, delivers instant checks, disrupts castled kings, and closes mating nets.

## Action Protocol
Always evaluate reserve piece drops first. If you have reserve pieces, invoke \`drop_piece\` with your piece and target square, or invoke \`make_move\` with drop notation (e.g. \`"P@e4"\`).`;
}

export function buildCrazyhouseTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const mySide = params.color === 'WHITE' ? 'w' : 'b';
  const oppSide = params.color === 'WHITE' ? 'b' : 'w';
  const myReserve = params.reserves ? params.reserves[mySide] : [];
  const oppReserve = params.reserves ? params.reserves[oppSide] : [];

  const dropMoves = params.legalMoves.filter((m) => m.includes('@'));
  const boardMoves = params.legalMoves.filter((m) => !m.includes('@'));

  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (CRAZYHOUSE)

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
${params.inCheck ? '- ⚠️ **CHECK**: You can block incoming checks by dropping a piece from your reserve!\n' : ''}
${clockInfo}

## Reserve Inventories
- **Your Hand**: [${myReserve.length > 0 ? myReserve.join(', ') : 'Empty'}]
- **Opponent Hand**: [${oppReserve.length > 0 ? oppReserve.join(', ') : 'Empty'}]

## Available Actions
### Legal Piece Drops (${dropMoves.length})
${dropMoves.length > 0 ? dropMoves.join(', ') : 'None available (reserve empty)'}

### Standard Board Moves (${boardMoves.length})
${boardMoves.join(', ')}

## Action Directive
${dropMoves.length > 0
  ? `👉 **PRIORITY**: You have pieces in reserve! Invoke tool \`drop_piece\` with \`{"piece": "${myReserve[0]}", "square": "${dropMoves[0].split('@')[1]}"}\` to seize the initiative, or invoke \`make_move\` with a piece drop (e.g. \`"${dropMoves[0]}"\`).`
  : `Invoke \`make_move\` with your chosen move.`}`;
}
