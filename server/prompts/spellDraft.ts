import { AVAILABLE_SPELLS } from '../../src/types';
import type { SystemPromptParams, TurnPromptParams } from './types';
import { formatClockBlock } from './types';

export function buildSpellDraftSystemPrompt(params: SystemPromptParams): string {
  const mySpellNames = (params.mySpells || [])
    .map((s) => AVAILABLE_SPELLS.find((sp) => sp.id === s)?.name || s)
    .join(', ');
  const oppSpellNames = (params.oppSpells || [])
    .map((s) => AVAILABLE_SPELLS.find((sp) => sp.id === s)?.name || s)
    .join(', ');

  return `You are a Grandmaster Battlemage playing as ${params.color} against ${params.opponentName}${params.playStyle ? ` (${params.playStyle})` : ''} in SPELL DRAFT CHESS!

🪄 YOUR SPELL CARDS INVENTORY:
- Your Active Spells: [${mySpellNames || 'None remaining'}]
- Opponent's Spells: [${oppSpellNames || 'None remaining'}]

⚡ DUAL ACTION SYSTEM (CAST SPELL + MAKE MOVE):
You possess mystical spells that bend chess reality. You can cast a spell using the "cast_spell" tool, AND you MUST make a legal chess move using the "make_move" tool!
Available Spell Arsenal:
1. "swap_pawns": Instantly swap the positions of two of your active pawns (arguments: sq1, sq2 or omit to auto-target).
2. "catapult_knight": Launch an active Knight directly across into ranks 4, 5, or 6 to create sudden forks or checkmate attacks! (arguments: sq1, sq2 or omit to auto-target).
3. "frost_freeze": Glacial freeze an enemy piece. That unit is paralyzed and CANNOT MOVE on the opponent's next turn! (arguments: sq1 = enemy square or omit to auto-freeze highest value unit).
4. "resurrection": Revive a captured friendly pawn back onto an open back-rank square!

🎯 STRATEGIC DIRECTIVE:
Spells are decisive weapons! If you have a spell available and it provides tactical advantage or disrupts enemy plans, INVOKE "cast_spell" to cast it!`;
}

export function buildSpellDraftTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const spellsLeft = params.spells || [];
  let spellSection = '';
  if (spellsLeft.length > 0) {
    spellSection = `\n🪄 READY SPELL CARDS (${spellsLeft.length}):\n${spellsLeft.map((s) => `   - ⭐ ${s}: Call "cast_spell" with {"spell_id": "${s}"}`).join('\n')}\n👉 TIP: Cast a spell now if it gives you a tactical strike or defensive save!`;
  } else {
    spellSection = `\n🪄 SPELLS: All spell cards consumed.`;
  }

  const freezeAlert = params.frozenSquare
    ? `\n❄️ GLACIAL FREEZE: Enemy unit on ${params.frozenSquare} is paralyzed and cannot move!`
    : '';

  return `[Turn: ${params.color} | Move #${params.moveNumber}] (SPELL DRAFT CHESS)
${params.lastMove ? `Opponent played: ${params.lastMove.san}.` : 'Match begins.'}${params.inCheck ? '\n⚠️ CHECK! Defend King.' : ''}${freezeAlert}
Position FEN: ${params.fen}
${clockInfo}
${spellSection}

Available Legal Moves (${params.legalMoves.length}):
${params.legalMoves.join(', ')}

Evaluate whether to cast a spell with "cast_spell", then pick your best legal move with "make_move".`;
}
