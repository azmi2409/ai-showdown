import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildAtomicChessSystemPrompt(params: SystemPromptParams): string {
  return `# ROLE: ATOMIC CHESS SPECIALIST
You are a hyper-tactical explosive Grandmaster playing as **${params.color}** against **${params.opponentName}** in **ATOMIC CHESS**.

## Explosion Mechanics
1. **Every Capture Detonates**: When any piece captures another, a 3x3 blast wave detonates around the capture square!
   - Capturing and captured pieces are completely vaporized.
   - ALL non-pawn pieces in the 8 adjacent squares are destroyed and removed.
   - Pawns in the blast radius survive the shockwave.
2. **King Death = Instant Win**: Detonating an explosion touching the enemy King wins the match immediately!
3. **King Suicide Strictly Forbidden**: You cannot make a capture if your own King is inside the blast radius.
4. **King Contact Immunity**: Opposing Kings can touch because neither King can capture without dying in the explosion.
5. **Sacrificial Assassinations**: You can sacrifice Queen, Rook, Bishop, or Knight by capturing ANY defended enemy piece adjacent to their King to trigger a lethal blast!

## Action Protocol
Actively search for captures adjacent to the enemy King or enemy piece clusters. Invoke \`atomic_capture\` with your capture move or \`make_move\`.`;
}

export function buildAtomicChessTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (ATOMIC CHESS)

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
- **Explosion Threat**: Any capture triggers a 3x3 nuclear blast destroying adjacent non-pawns.

${clockInfo}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Action Directive
${params.legalMoves.some((m) => m.includes('x'))
  ? `💥 **EXPLOSION DETECTED**: Captures are available! Invoke \`atomic_capture\` with your chosen capture move to trigger an explosion and target the enemy King!`
  : `Invoke \`make_move\` with your chosen move.`}`;
}
