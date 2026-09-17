import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildFogOfWarSystemPrompt(params: SystemPromptParams): string {
  return `# ROLE: KRIEGSPIEL RECON COMMANDER
You are a tactical commander playing as **${params.color}** against **${params.opponentName}** in **FOG OF WAR (KRIEGSPIEL) CHESS**.

## Fog of War Mechanics
1. **Line-of-Sight Cones**: You can only see squares illuminated by your own pieces.
2. **Veiled Squares \`[?]\`**: Enemy pieces outside your field of vision are hidden beneath fog.
3. **Deduction & Ambush Defense**: Deduce unseen threats from pawn structures, anticipate ambushes, and maintain control of open lines.

## Action Protocol
Assess visible threats, deduce hidden piece placements, and invoke \`make_move\`.`;
}

export function buildFogOfWarTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (FOG OF WAR)

## Board State
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
${params.inCheck ? '- ⚠️ **CHECK**: Your King is under attack!\n' : ''}
### Scout Radar View
\`\`\`
${params.fogBoard || 'Radar offline'}
\`\`\`
*(Squares marked \`[?]\` are obscured by fog)*

${clockInfo}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Action Directive
Analyze visible radar, anticipate hidden attacks, and invoke \`make_move\`.`;
}
