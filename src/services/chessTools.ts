import { GameMode } from '../types';
import { ToolDefinition } from './providers/types';

export const BASE_MAKE_MOVE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'make_move',
    description:
      'Execute a chess move on the board in Standard Algebraic Notation (SAN). Must be chosen from the available legal moves in the position.',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'Legal chess move in SAN. Examples: "e4", "Nf3", "O-O", "Bxe5", "e8=Q".',
        },
        duck_square: {
          type: 'string',
          description: 'Optional (Duck Chess): Square to relocate the neutral rubber duck blocker to (e.g. "e5", "d4").',
        },
        reasoning: {
          type: 'string',
          description: 'Tactical reasoning, clock strategy, and candidate line evaluation.',
        },
      },
      required: ['move'],
    },
  },
};

export const BOARD_STATE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_board_state',
    description:
      'Inspect the current board state including FEN position, active turn, reserves, and remaining clock times.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const LEGAL_MOVES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_legal_moves',
    description: 'Get the exact list of all legal moves available in the current position in SAN notation.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const RESIGN_TOOL: ToolDefinition = {
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
};

// --- Variant-Specific Ability Tools ---

export const CAST_SPELL_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'cast_spell',
    description:
      'Cast a drafted tactical magic spell card before or alongside your move in Spell Draft mode. Use this to turn the tide of battle!',
    parameters: {
      type: 'object',
      properties: {
        spell_id: {
          type: 'string',
          enum: ['swap_pawns', 'catapult_knight', 'frost_freeze', 'resurrection'],
          description:
            'ID of the spell to cast: "swap_pawns" (swap 2 pawns), "catapult_knight" (leap knight to ranks 4-6), "frost_freeze" (freeze enemy unit for 1 turn), or "resurrection" (revive fallen pawn).',
        },
        sq1: {
          type: 'string',
          description: 'Optional primary square (e.g. piece square to catapult or freeze, or pawn 1 for swap).',
        },
        sq2: {
          type: 'string',
          description: 'Optional secondary square (e.g. catapult destination square, or pawn 2 for swap).',
        },
        reasoning: {
          type: 'string',
          description: 'Tactical rationale for casting this spell now.',
        },
      },
      required: ['spell_id'],
    },
  },
};

export const DROP_PIECE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'drop_piece',
    description:
      'Crazyhouse Ability: Deploy a captured piece from your reserve hand directly onto any empty square on the board! Drops deliver sudden checks, forks, and mating nets.',
    parameters: {
      type: 'object',
      properties: {
        piece: {
          type: 'string',
          description: 'Type of piece from your reserve to drop: "P", "N", "B", "R", or "Q".',
        },
        square: {
          type: 'string',
          description: 'Target empty square on the board (e.g. "e4", "f3", "g7"). Pawns cannot be dropped on rank 1 or 8.',
        },
        reasoning: {
          type: 'string',
          description: 'Tactical goal of this piece drop (e.g. checkmate threat, fork, blocking an attack).',
        },
      },
      required: ['piece', 'square'],
    },
  },
};

export const MAKE_DUCK_MOVE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'make_move_and_duck',
    description:
      'Duck Chess Action: Play your piece move AND specify the square to place the neutral rubber duck blocker. No checks exist; capture enemy King to win!',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'Legal piece move (e.g. "e4", "Nf3", or capturing enemy king "Qxe8" for instant victory!).',
        },
        duck_square: {
          type: 'string',
          description: 'Empty square to place the neutral Duck blocker on (e.g. "e5", "d4") to obstruct the opponent.',
        },
        reasoning: {
          type: 'string',
          description: 'Tactical calculation and duck blockade strategy.',
        },
      },
      required: ['move', 'duck_square'],
    },
  },
};

export const PLACE_DUCK_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'place_duck',
    description:
      'Duck Chess Relocation: Move the neutral rubber duck to an empty square to block the opponent from moving to or through it.',
    parameters: {
      type: 'object',
      properties: {
        square: {
          type: 'string',
          description: 'Empty square to place the duck on (e.g. "e5", "d4").',
        },
      },
      required: ['square'],
    },
  },
};

export const ATOMIC_CAPTURE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'atomic_capture',
    description:
      'Atomic Capture: Execute a capture that triggers a 3x3 nuclear explosion destroying the capturing piece, captured piece, and all adjacent non-pawns. Detonating near the enemy King wins immediately!',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'Legal capture move in SAN (e.g. "Nxe5", "Bxf7+", "Qxd8").',
        },
        reasoning: {
          type: 'string',
          description: 'Explosion blast radius calculation and sacrificial King assassination line.',
        },
      },
      required: ['move'],
    },
  },
};

export const USE_PORTAL_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'use_portal',
    description:
      'Chaos Mutators Ability: Move a piece onto a Quantum Portal square (d4 <-> e5) to instantly teleport across the board.',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'Legal move that enters the portal (e.g. "Nd4", "Be5").',
        },
        reasoning: {
          type: 'string',
          description: 'Teleportation attack or repositioning plan.',
        },
      },
      required: ['move'],
    },
  },
};

// Default static list for backwards compatibility
export const CHESS_TOOLS: ToolDefinition[] = [
  BASE_MAKE_MOVE_TOOL,
  BOARD_STATE_TOOL,
  LEGAL_MOVES_TOOL,
  CAST_SPELL_TOOL,
  RESIGN_TOOL,
];

/**
 * Returns customized tool definitions specific to the active game mode.
 */
export function getToolsForMode(
  gameMode?: GameMode,
  options?: {
    spells?: string[];
    reserves?: string[];
    duckSquare?: string | null;
  }
): ToolDefinition[] {
  switch (gameMode) {
    case 'spell_draft':
      return [CAST_SPELL_TOOL, BASE_MAKE_MOVE_TOOL, BOARD_STATE_TOOL, RESIGN_TOOL];

    case 'crazyhouse':
      return [DROP_PIECE_TOOL, BASE_MAKE_MOVE_TOOL, BOARD_STATE_TOOL, RESIGN_TOOL];

    case 'duck_chess':
      return [MAKE_DUCK_MOVE_TOOL, BASE_MAKE_MOVE_TOOL, PLACE_DUCK_TOOL, BOARD_STATE_TOOL, RESIGN_TOOL];

    case 'atomic_chess':
      return [ATOMIC_CAPTURE_TOOL, BASE_MAKE_MOVE_TOOL, BOARD_STATE_TOOL, RESIGN_TOOL];

    case 'mutators':
      return [USE_PORTAL_TOOL, BASE_MAKE_MOVE_TOOL, BOARD_STATE_TOOL, RESIGN_TOOL];

    default:
      return [BASE_MAKE_MOVE_TOOL, BOARD_STATE_TOOL, LEGAL_MOVES_TOOL, RESIGN_TOOL];
  }
}
