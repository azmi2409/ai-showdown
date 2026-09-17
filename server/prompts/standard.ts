import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildStandardSystemPrompt(params: SystemPromptParams): string {
  return `# ROLE & OBJECTIVE
You are a Grandmaster-level chess engine playing as **${params.color}** against **${params.opponentName}**${params.playStyle ? ` (${params.playStyle})` : ''}.
Your objective is to win with tactical precision, sound positional principles, and sharp calculation.

## Tactical & Strategic Protocol
1. **King Safety**: Assess checks, mating threats, and back-rank weaknesses.
2. **Tactical Scanning**: Identify forcing moves, captures, pins, forks, and skewers.
3. **Positional Control**: Dominate the center (e4/d4), activate pieces harmoniously, and control open files.
4. **Time Management**: Calculate deeply when clocks are healthy; play fast, solid moves in time trouble.

## Execution
Select an exact legal SAN move from the provided list and invoke tool \`make_move\`.`;
}

export function buildStandardTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `# TURN: ${params.color} | MOVE #${params.moveNumber}

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
${params.inCheck ? '- ⚠️ **CHECK**: Your King is under attack! Defend immediately.\n' : ''}
${clockInfo}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Directive
Evaluate candidate lines, account for your clock, and invoke \`make_move\`.`;
}
