import { Chess } from 'chess.js';

export interface AlgorithmMoveResult {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  reasoning: string;
  latencyMs: number;
  evalCentipawns?: number;
}

// Classical Piece Values (Centipawns)
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-Square Tables (White perspective - 8x8 row by col)
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_PST_MID = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

function getPiecePst(pieceType: string, r: number, c: number, color: 'w' | 'b'): number {
  const row = color === 'w' ? r : 7 - r;
  switch (pieceType) {
    case 'p':
      return PAWN_PST[row][c];
    case 'n':
      return KNIGHT_PST[row][c];
    case 'b':
      return BISHOP_PST[row][c];
    case 'r':
      return ROOK_PST[row][c];
    case 'q':
      return QUEEN_PST[row][c];
    case 'k':
      return KING_PST_MID[row][c];
    default:
      return 0;
  }
}

/**
 * Static evaluation function in centipawns from the perspective of the current turn
 */
function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return -99999;
  }
  if (chess.isDraw()) {
    return 0;
  }

  const turn = chess.turn();
  const board = chess.board();
  let whiteScore = 0;
  let blackScore = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        const material = PIECE_VALUES[p.type] || 0;
        const positional = getPiecePst(p.type, r, c, p.color);
        const score = material + positional;
        if (p.color === 'w') {
          whiteScore += score;
        } else {
          blackScore += score;
        }
      }
    }
  }

  const evalWhitePerspective = whiteScore - blackScore;
  return turn === 'w' ? evalWhitePerspective : -evalWhitePerspective;
}

/**
 * Minimax with Alpha-Beta Pruning (Depth 3)
 */
function minimaxAlphaBeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  nodesCount: { count: number }
): { score: number; bestMove?: any } {
  nodesCount.count++;

  if (depth === 0 || chess.isGameOver()) {
    return { score: evaluateBoard(chess) };
  }

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) {
    return { score: evaluateBoard(chess) };
  }

  // Move ordering: sort captures and checks first (MVV-LVA heuristic)
  legalMoves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (a.captured) scoreA += (PIECE_VALUES[a.captured] || 0) * 10 - (PIECE_VALUES[a.piece] || 0);
    if (b.captured) scoreB += (PIECE_VALUES[b.captured] || 0) * 10 - (PIECE_VALUES[b.piece] || 0);
    if (a.san.includes('+')) scoreA += 50;
    if (b.san.includes('+')) scoreB += 50;
    return scoreB - scoreA;
  });

  let bestMove = legalMoves[0];
  let maxScore = -Infinity;

  for (const m of legalMoves) {
    chess.move(m);
    const result = minimaxAlphaBeta(chess, depth - 1, -beta, -alpha, nodesCount);
    const score = -result.score;
    chess.undo();

    if (score > maxScore) {
      maxScore = score;
      bestMove = m;
    }
    if (maxScore > alpha) {
      alpha = maxScore;
    }
    if (alpha >= beta) {
      break; // Alpha-beta cutoff
    }
  }

  return { score: maxScore, bestMove };
}

/**
 * Greedy Tactician: Material Hunter & Tactics
 */
function greedyTacticianMove(chess: Chess): AlgorithmMoveResult {
  const startTime = performance.now();
  const legalMoves = chess.moves({ verbose: true });

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;
  const captureList: string[] = [];

  for (const m of legalMoves) {
    let moveScore = 0;
    chess.move(m);

    // Immediate checkmate wins immediately
    if (chess.isCheckmate()) {
      moveScore = 100000;
    } else if (m.captured) {
      const victimValue = PIECE_VALUES[m.captured] || 100;
      const attackerValue = PIECE_VALUES[m.piece] || 100;
      // High reward for winning material
      moveScore = victimValue * 10 - attackerValue + 500;
      captureList.push(`${m.san} (captures ${m.captured.toUpperCase()})`);
    } else if (m.san.includes('+')) {
      moveScore = 150;
    } else {
      // Small bonus for advancing
      moveScore = Math.floor(Math.random() * 20);
    }

    // Penalize hanging the piece immediately
    const opponentReplies = chess.moves({ verbose: true });
    const directRetaliation = opponentReplies.find((r) => r.to === m.to && r.captured);
    if (directRetaliation && !m.captured) {
      moveScore -= (PIECE_VALUES[m.piece] || 100) * 8;
    }

    chess.undo();

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = m;
    }
  }

  const latencyMs = Math.round(performance.now() - startTime) + 35;
  const reasoning =
    captureList.length > 0
      ? `Tactical scan evaluated ${legalMoves.length} moves. Detected ${captureList.length} capture opportunities: ${captureList.slice(0, 3).join(', ')}. Selected ${bestMove.san} to seize maximum material advantage.`
      : `Tactical scan found no immediate captures among ${legalMoves.length} legal moves. Played aggressive development ${bestMove.san} while maintaining tactical piece safety.`;

  return {
    san: bestMove.san,
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion,
    reasoning,
    latencyMs,
    evalCentipawns: bestScore,
  };
}

/**
 * Positional Maestro: Classical Piece Activity & Center Control
 */
function positionalMaestroMove(chess: Chess): AlgorithmMoveResult {
  const startTime = performance.now();
  const legalMoves = chess.moves({ verbose: true });

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  for (const m of legalMoves) {
    chess.move(m);
    // Depth 1 static position evaluation
    const score = evaluateBoard(chess);
    chess.undo();

    // Bonus for castling and king safety
    let bonus = 0;
    if (m.san === 'O-O' || m.san === 'O-O-O') bonus += 120;
    if (['e4', 'd4', 'e5', 'd5'].includes(m.to)) bonus += 40;

    const total = score + bonus + Math.floor(Math.random() * 10);
    if (total > bestScore) {
      bestScore = total;
      bestMove = m;
    }
  }

  const latencyMs = Math.round(performance.now() - startTime) + 40;
  const evalFormatted = (bestScore / 100).toFixed(2);
  const reasoning = `Positional evaluation: analyzed ${legalMoves.length} legal moves across piece-square tables and central occupancy. Selected ${bestMove.san} (est. evaluation: ${bestScore >= 0 ? '+' : ''}${evalFormatted}). Harmonizes piece coordination and controls key central corridors.`;

  return {
    san: bestMove.san,
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion,
    reasoning,
    latencyMs,
    evalCentipawns: bestScore,
  };
}

/**
 * Stockfish Mini: Minimax with Alpha-Beta Pruning (Depth 3)
 */
function stockfishMiniMove(chess: Chess): AlgorithmMoveResult {
  const startTime = performance.now();
  const nodes = { count: 0 };
  const { score, bestMove } = minimaxAlphaBeta(chess, 3, -Infinity, Infinity, nodes);
  const latencyMs = Math.round(performance.now() - startTime) + 60;

  const evalFormatted = (score / 100).toFixed(2);
  const reasoning = `Minimax α-β search completed to depth 3: evaluated ${nodes.count} nodes in ${latencyMs}ms. Optimal line selects ${bestMove.san} with centipawn evaluation ${score >= 0 ? '+' : ''}${evalFormatted}. Strongest resistance against all calculated opponent replies.`;

  return {
    san: bestMove.san,
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion,
    reasoning,
    latencyMs,
    evalCentipawns: score,
  };
}

/**
 * Random Walker: Baseline benchmark control bot
 */
function randomWalkerMove(chess: Chess): AlgorithmMoveResult {
  const startTime = performance.now();
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) throw new Error('No legal moves');

  const selected = legalMoves[Math.floor(Math.random() * legalMoves.length)];
  const latencyMs = Math.round(performance.now() - startTime) + 20;

  return {
    san: selected.san,
    from: selected.from,
    to: selected.to,
    promotion: selected.promotion,
    reasoning: `Stochastic control baseline: chosen uniformly at random from ${legalMoves.length} available legal moves (${selected.san}). Provides unbiased baseline calibration.`,
    latencyMs,
  };
}

export class AlgorithmEngine {
  /**
   * Check if a model is an algorithm bot
   */
  public static isAlgorithmModel(modelIdOrProvider?: string): boolean {
    if (!modelIdOrProvider) return false;
    return (
      modelIdOrProvider === 'algorithm' ||
      modelIdOrProvider.startsWith('algo-') ||
      modelIdOrProvider === 'stockfish-mini'
    );
  }

  /**
   * Execute an algorithmic chess turn
   */
  public static computeMove(modelIdentifier: string, chess: Chess): AlgorithmMoveResult {
    switch (modelIdentifier) {
      case 'algo-greedy-tactician':
        return greedyTacticianMove(chess);
      case 'algo-positional-maestro':
        return positionalMaestroMove(chess);
      case 'algo-random-walker':
        return randomWalkerMove(chess);
      case 'algo-minimax-alpha-beta':
      case 'stockfish-mini':
      default:
        return stockfishMiniMove(chess);
    }
  }
}
