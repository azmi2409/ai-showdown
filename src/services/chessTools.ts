import { ToolDefinition } from './providers/types';

export const CHESS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'make_move',
      description:
        'Make a move on the chess board. The move MUST be in Standard Algebraic Notation (SAN) and must be a legal move in the current position.',
      parameters: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            description:
              'Chess move in Standard Algebraic Notation (SAN). Examples: "e4", "Nf3", "O-O", "Bxe5", "e8=Q"',
          },
          reasoning: {
            type: 'string',
            description: 'Your strategic calculation or reason for playing this move.',
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
