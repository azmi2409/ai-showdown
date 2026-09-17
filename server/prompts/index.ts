import { SystemPromptParams, TurnPromptParams, formatClockTime, formatClockBlock } from './types';
import { buildStandardSystemPrompt, buildStandardTurnPrompt } from './standard';
import { buildSpellDraftSystemPrompt, buildSpellDraftTurnPrompt } from './spellDraft';
import { buildCrazyhouseSystemPrompt, buildCrazyhouseTurnPrompt } from './crazyhouse';
import { buildDuckChessSystemPrompt, buildDuckChessTurnPrompt } from './duckChess';
import { buildAtomicChessSystemPrompt, buildAtomicChessTurnPrompt } from './atomicChess';
import { buildMutatorsSystemPrompt, buildMutatorsTurnPrompt } from './mutators';
import { buildFogOfWarSystemPrompt, buildFogOfWarTurnPrompt } from './fogOfWar';

export {
  SystemPromptParams,
  TurnPromptParams,
  formatClockTime,
  formatClockBlock,
  buildStandardSystemPrompt,
  buildStandardTurnPrompt,
  buildSpellDraftSystemPrompt,
  buildSpellDraftTurnPrompt,
  buildCrazyhouseSystemPrompt,
  buildCrazyhouseTurnPrompt,
  buildDuckChessSystemPrompt,
  buildDuckChessTurnPrompt,
  buildAtomicChessSystemPrompt,
  buildAtomicChessTurnPrompt,
  buildMutatorsSystemPrompt,
  buildMutatorsTurnPrompt,
  buildFogOfWarSystemPrompt,
  buildFogOfWarTurnPrompt,
};

export function buildSystemPrompt(params: SystemPromptParams): string {
  switch (params.gameMode) {
    case 'spell_draft':
      return buildSpellDraftSystemPrompt(params);
    case 'crazyhouse':
      return buildCrazyhouseSystemPrompt(params);
    case 'duck_chess':
      return buildDuckChessSystemPrompt(params);
    case 'atomic_chess':
      return buildAtomicChessSystemPrompt(params);
    case 'mutators':
      return buildMutatorsSystemPrompt(params);
    case 'fog_of_war':
      return buildFogOfWarSystemPrompt(params);
    default:
      return buildStandardSystemPrompt(params);
  }
}

export function buildTurnPrompt(params: TurnPromptParams): string {
  switch (params.gameMode) {
    case 'spell_draft':
      return buildSpellDraftTurnPrompt(params);
    case 'crazyhouse':
      return buildCrazyhouseTurnPrompt(params);
    case 'duck_chess':
      return buildDuckChessTurnPrompt(params);
    case 'atomic_chess':
      return buildAtomicChessTurnPrompt(params);
    case 'mutators':
      return buildMutatorsTurnPrompt(params);
    case 'fog_of_war':
      return buildFogOfWarTurnPrompt(params);
    default:
      return buildStandardTurnPrompt(params);
  }
}
