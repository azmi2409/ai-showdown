import { ToolDefinition } from './providers/types';

export const CHESS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'make_move',
      description:
        'Execute the best chess move on the board in Standard Algebraic Notation (SAN). The move MUST be chosen from the available legal moves in the position.',
      parameters: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            description:
              'Legal chess move in Standard Algebraic Notation (SAN). Examples: "e4", "Nf3", "O-O", "Bxe5", "e8=Q", or Crazyhouse drop like "P@e4", "N@f3"',
          },
          reasoning: {
            type: 'string',
            description:
              'Tactical calculation and clock strategy: candidate evaluation, time management consideration (e.g. playing rapidly in time trouble or calculating deeply with comfortable clock), and plan.',
          },
        },
        required: ['move'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_board_state',
      description:
        'Inspect the current board state including FEN position, active turn, move history, material balance, and remaining clock times.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_legal_moves',
      description: 'Get the exact list of all legal moves available in the current position in SAN notation.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cast_spell',
      description:
        'Cast an active tactical spell card (swap_pawns, catapult_knight, frost_freeze, resurrection) before making a move. Available in Spell Draft mode.',
      parameters: {
        type: 'object',
        properties: {
          spell_id: {
            type: 'string',
            description:
              'The ID of the spell to cast: "swap_pawns", "catapult_knight", "frost_freeze", or "resurrection".',
          },
          sq1: {
            type: 'string',
            description: 'Optional primary square argument (e.g. piece square or target square).',
          },
          sq2: {
            type: 'string',
            description: 'Optional secondary square argument (e.g. swap destination square).',
          },
        },
        required: ['spell_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resign',
      description: 'Resign the game if your position is completely lost.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'The tactical or strategic reason for resignation.',
          },
        },
      },
    },
  },
];
