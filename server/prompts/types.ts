import { GameMode } from '../../src/types';

export interface SystemPromptParams {
  color: 'WHITE' | 'BLACK';
  opponentName: string;
  playStyle?: string;
  gameMode?: GameMode;
  myModifiers?: string[];
  oppModifiers?: string[];
  mySpells?: string[];
  oppSpells?: string[];
}

export interface TurnPromptParams {
  color: 'WHITE' | 'BLACK';
  moveNumber: number;
  lastMove?: { player: string; san: string };
  fen: string;
  inCheck: boolean;
  myClockMs: number;
  oppClockMs: number;
  incrementSec?: number;
  legalMoves: string[];
  gameMode?: GameMode;
  fogBoard?: string;
  portalSquares?: [string, string];
  duckSquare?: string | null;
  reserves?: { w: string[]; b: string[] };
  spells?: string[];
  frozenSquare?: string | null;
}

export function formatClockTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s (${totalSec}s)`;
}

export function formatClockBlock(myClockMs: number, oppClockMs: number): string {
  const myTotalSec = Math.max(0, Math.floor(myClockMs / 1000));
  const oppTotalSec = Math.max(0, Math.floor(oppClockMs / 1000));
  const myFormatted = formatClockTime(myClockMs);
  const oppFormatted = formatClockTime(oppClockMs);
  const timeDelta = myTotalSec - oppTotalSec;
  const deltaText =
    timeDelta > 5
      ? `+${timeDelta}s ahead of opponent`
      : timeDelta < -5
      ? `${timeDelta}s behind opponent (accelerate tempo)`
      : `Clocks roughly even`;

  let alert = '';
  if (myTotalSec <= 10) {
    alert = '\n🚨 CRITICAL TIME SCRAMBLE (<10s): Move immediately to avoid losing on time!';
  } else if (myTotalSec <= 30) {
    alert = '\n⏱️ TIME PRESSURE WARNING (<30s): Keep it simple and move fast.';
  }

  return `Chess Clocks:
- Your remaining time: ${myFormatted}
- Opponent remaining time: ${oppFormatted} (${deltaText})${alert}`;
}
