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
              'Legal chess move in Standard Algebraic Notation (SAN). Examples: "e4", "Nf3", "O-O", "Bxe5", "e8=Q"',
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
