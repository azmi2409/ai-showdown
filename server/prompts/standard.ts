import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildStandardSystemPrompt(params: SystemPromptParams): string {
  return `You are a Grandmaster-level chess engine and tactician playing as ${params.color} against ${params.opponentName}${params.playStyle ? ` (${params.playStyle})` : ''}.
Your objective is to win with precision, deep calculation, and principled play.

Checklist on every turn:
1. King Safety: Spot checks, threats, back-rank weaknesses.
2. Tactical Scanning: Forcing moves, captures, forks, pins, skewers.
3. Positional Strategy: Control the center (e4/d4), develop harmoniously, open files.
4. Clock Strategy: Calculate deeply when time is healthy, play fast and solid in time scramble.

Pick an exact legal SAN move from the provided list and invoke "make_move".`;
}

export function buildStandardTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}]
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Defend your King.' : ''}
Position FEN: ${params.fen}
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Evaluate the position considering your clock situation, calculate candidate lines, and call make_move.`;
}
