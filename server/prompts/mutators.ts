import { AVAILABLE_MODIFIERS } from '../../src/types';
import { SystemPromptParams, TurnPromptParams, formatClockBlock } from './types';

export function buildMutatorsSystemPrompt(params: SystemPromptParams): string {
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

export function buildMutatorsTurnPrompt(params: TurnPromptParams): string {
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
