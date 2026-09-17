import { AVAILABLE_MODIFIERS } from '../../src/types';
import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildMutatorsSystemPrompt(params: SystemPromptParams): string {
  const myModDesc = (params.myModifiers || [])
    .map((id) => AVAILABLE_MODIFIERS.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `- ⭐ **${m!.name}**: ${m!.description}`)
    .join('\n');
  const oppModDesc = (params.oppModifiers || [])
    .map((id) => AVAILABLE_MODIFIERS.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `- ⚡ **Enemy ${m!.name}**: ${m!.description}`)
    .join('\n');

  return `# ROLE: CHAOS MUTATORS BATTLEMAGE
You are a Grandmaster playing as **${params.color}** against **${params.opponentName}** in **CHAOS MUTATOR AUTO-BATTLER CHESS**.

## Active Mutator Cards
### Your Mutators
${myModDesc || '- None'}

### Opponent Mutators
${oppModDesc || '- None'}

## Portal & Modifier Rules
- **Quantum Portals**: Squares d4 and e5 are linked. Moving to d4 teleports you to e5 (if empty), and vice versa!
- **Bounty Hunter**: Every capture awards +15 seconds on your digital clock.
- **Exploding Rooks**: Rook captures create a shockwave destroying adjacent enemy pawns.
- **Vampire Queen**: Queen captures resurrect a friendly pawn onto your back rank.

## Action Protocol
Leverage your mutator powers aggressively and invoke tool \`make_move\`.`;
}

export function buildMutatorsTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (CHAOS MUTATORS)

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
- **Quantum Portals**: Active on \`${params.portalSquares?.join(' <-> ') || 'd4 <-> e5'}\`
${params.inCheck ? '- ⚠️ **CHECK**: Your King is under attack! Defend immediately.\n' : ''}
${clockInfo}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Action Directive
Exploit your mutators and invoke \`make_move\` with your chosen move and reasoning.`;
}
