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
You possess mystical spells that bend chess reality. You can cast a spell directly by including "spell_id" in your "make_move" call, OR by invoking the "cast_spell" tool!
Available Spell Arsenal:
1. "swap_pawns": Instantly swap the positions of two of your active pawns (arguments: spell_sq1, spell_sq2 or omit to auto-target).
2. "catapult_knight": Launch an active Knight directly across into ranks 4, 5, or 6 to create sudden forks or checkmate attacks! (arguments: spell_sq1, spell_sq2 or omit to auto-target).
3. "frost_freeze": Glacial freeze an enemy piece. That unit is paralyzed and CANNOT MOVE on the opponent's next turn! (arguments: spell_sq1 = enemy square or omit to auto-freeze highest value unit).
4. "resurrection": Revive a captured friendly pawn back onto an open back-rank square!

🎯 STRATEGIC DIRECTIVE:
Spells win matches! While you hold spells, cast them aggressively to seize initiative. Include "spell_id" in your "make_move" call or invoke "cast_spell"!`;
}

export function buildSpellDraftTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const spellsLeft = params.spells || [];
  let spellSection = '';
  if (spellsLeft.length > 0) {
    spellSection = `\n🪄 BATTLEMAGE SPELL ACTION (ACTIVE INVENTORY):
You hold ${spellsLeft.length} magic spell(s) in hand: [${spellsLeft.join(', ')}].
⚡ CAST A SPELL THIS TURN: In your "make_move" call, pass "spell_id": "${spellsLeft[0]}" (and optional "spell_sq1" / "spell_sq2"), or invoke "cast_spell".
- "frost_freeze": freeze enemy piece in place (e.g. spell_sq1: "e7", "d7", "c6")
- "catapult_knight": catapult knight into attack (e.g. spell_sq1: "b1", spell_sq2: "d5")
- "swap_pawns": swap two friendly pawns
- "resurrection": revive captured pawn`;
  } else {
    spellSection = `\n🪄 SPELLS: All spell cards have been consumed. Play pure tactical chess.`;
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

${spellsLeft.length > 0 ? `👉 PRIORITY ACTION: Execute "make_move" with your chosen move AND "spell_id": "${spellsLeft[0]}" (e.g. {"move": "${params.legalMoves[0]}", "spell_id": "${spellsLeft[0]}"}), or invoke "cast_spell".` : `Invoke "make_move" with your chosen move.`}`;
}
