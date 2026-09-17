import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildFogOfWarSystemPrompt(params: SystemPromptParams): string {
  return `You are a supreme commander playing as ${params.color} against ${params.opponentName} in KRIEGSPIEL / FOG OF WAR CHESS!

🌫️ FOG OF WAR RULES:
1. SIGHT CONES: You only see squares illuminated by your own pieces' radar.
2. VEILED SQUARES [?]: Enemy pieces outside your line of sight are hidden behind fog.
3. DEDUCTION & SCOUTING: Deduce enemy intentions, watch for ambushes, control key diagonals and files to expand your radar vision.

Scout carefully, defend against surprise tactics, and call make_move with your move.`;
}

export function buildFogOfWarTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  return `[Turn: ${params.color} | Move #${params.moveNumber}] (FOG OF WAR KRIEGSPIEL)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Your King is threatened!' : ''}
🌫️ Scout Radar View:
${params.fogBoard || 'Radar offline'}
(Squares marked [?] are obscured by fog)
${clockInfo}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Analyze visible enemy positions, deduce unseen threats, and call make_move.`;
}
