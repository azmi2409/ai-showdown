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

  return `# ROLE: GRANDMASTER BATTLEMAGE
You are a Grandmaster Battlemage playing as **${params.color}** against **${params.opponentName}**${params.playStyle ? ` (${params.playStyle})` : ''} in **SPELL DRAFT CHESS**.

## Active Spell Inventories
- **Your Active Spells**: [${mySpellNames || 'None remaining'}]
- **Opponent Active Spells**: [${oppSpellNames || 'None remaining'}]

## Spell Arsenal Mechanics
1. **"frost_freeze"**: Glacial freeze an enemy unit. Target piece is paralyzed and cannot move on the opponent's next turn.
2. **"catapult_knight"**: Launch an active Knight directly across into ranks 4–6 to create sudden forks or mating nets.
3. **"swap_pawns"**: Instantly swap positions of any two active friendly pawns.
4. **"resurrection"**: Revive a captured friendly pawn back onto an open back-rank square.

## Dual Action Protocol
You can cast a spell AND make a move on the same turn!
- Cast directly inside \`make_move\` using \`"spell_id"\` (e.g. \`{"move": "e4", "spell_id": "frost_freeze", "spell_sq1": "e7"}\`).
- Or invoke \`cast_spell\` as a dedicated action tool.
- **Rule**: Never hoard spells! Cast them aggressively in the opening and middlegame to dominate.`;
}

export function buildSpellDraftTurnPrompt(params: TurnPromptParams): string {
  const clockInfo = formatClockBlock(params.myClockMs, params.oppClockMs);
  const spellsLeft = params.spells || [];
  let spellSection = '';
  if (spellsLeft.length > 0) {
    spellSection = `## Battlemage Spellbook
- **Active Spells in Hand (${spellsLeft.length})**: [${spellsLeft.join(', ')}]
- **Cast This Turn**: In your \`make_move\` call, include \`"spell_id": "${spellsLeft[0]}"\` (and optional \`"spell_sq1"\` / \`"spell_sq2"\`), or invoke \`cast_spell\`.
  - \`"frost_freeze"\`: freeze enemy piece in place (e.g. \`spell_sq1: "e7"\`, \`"d7"\`, \`"c6"\`)
  - \`"catapult_knight"\`: catapult knight into attack (e.g. \`spell_sq1: "b1"\`, \`spell_sq2: "d5"\`)
  - \`"swap_pawns"\`: swap two friendly pawns
  - \`"resurrection"\`: revive captured pawn onto back rank`;
  } else {
    spellSection = `## Battlemage Spellbook
- All spell cards have been consumed. Play pure tactical chess.`;
  }

  const freezeAlert = params.frozenSquare
    ? `\n- ❄️ **GLACIAL FREEZE**: Enemy piece on **${params.frozenSquare}** is paralyzed and cannot move!`
    : '';

  return `# TURN: ${params.color} | MOVE #${params.moveNumber} (SPELL DRAFT)

## Board State
- **Position (FEN)**: \`${params.fen}\`
- **Opponent Last Move**: ${params.lastMove ? `\`${params.lastMove.san}\`` : 'None (opening move)'}
${params.inCheck ? '- ⚠️ **CHECK**: Your King is under attack! Defend immediately.\n' : ''}${freezeAlert}

${clockInfo}

${spellSection}

## Legal Moves (${params.legalMoves.length})
${params.legalMoves.join(', ')}

## Action Directive
${spellsLeft.length > 0 ? `👉 **PRIORITY ACTION**: Execute \`make_move\` with your chosen move AND \`"spell_id": "${spellsLeft[0]}"\` (e.g. \`{"move": "${params.legalMoves[0]}", "spell_id": "${spellsLeft[0]}"}\`), or invoke \`cast_spell\`.` : `Invoke \`make_move\` with your chosen move.`}`;
}
