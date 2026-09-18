import { Chess, Square, PieceSymbol } from 'chess.js';
import { GameMode } from '../types';

export interface AtomicExplosionResult {
  explodedSquare: string;
  destroyedPieces: { square: string; piece: string; color: 'w' | 'b' }[];
  kingDestroyed?: 'w' | 'b' | null;
}

export class VariantsEngine {
  /**
   * Safe parser to convert a FEN piece placement string into an 8x8 board grid.
   * Works for custom variants where chess.js rejects the FEN (missing kings in Atomic, etc.)
   */
  public static parseFenToBoard(fen: string): ({ type: string; color: 'w' | 'b' } | null)[][] {
    const [placement] = (fen || '').trim().split(/\s+/);
    if (!placement) return [];
    const rows = placement.split('/');
    const board: ({ type: string; color: 'w' | 'b' } | null)[][] = [];

    for (let r = 0; r < 8; r++) {
      const rowStr = rows[r] || '8';
      const row: ({ type: string; color: 'w' | 'b' } | null)[] = [];
      for (const ch of rowStr) {
        if (ch >= '1' && ch <= '8') {
          const emptyCount = parseInt(ch, 10);
          for (let i = 0; i < emptyCount; i++) row.push(null);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          row.push({ type: ch.toLowerCase(), color });
        }
      }
      board.push(row);
    }
    return board;
  }

  /**
   * Check if a square has a Duck blocking it in Duck Chess
   */
  public static isDuckBlocked(square: string, duckSquare?: string | null): boolean {
    return !!duckSquare && duckSquare.toLowerCase() === square.toLowerCase();
  }

  /**
   * Check if a move is blocked by the Duck (either landing square or line of sight)
   */
  public static isMoveBlockedByDuck(
    from: Square,
    to: Square,
    piece: string,
    duckSquare?: string | null
  ): boolean {
    if (!duckSquare) return false;
    const duck = duckSquare.toLowerCase();
    const dest = to.toLowerCase();
    const src = from.toLowerCase();

    // Cannot land on duck square
    if (dest === duck) return true;

    // Knights jump over all pieces, including the duck
    if (piece.toLowerCase() === 'n') return false;

    // Castling rook passage checks
    if ((src === 'e1' && dest === 'c1' && duck === 'b1') ||
        (src === 'e8' && dest === 'c8' && duck === 'b8')) {
      return true;
    }

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fromFile = files.indexOf(src[0]);
    const fromRank = parseInt(src[1], 10);
    const toFile = files.indexOf(dest[0]);
    const toRank = parseInt(dest[1], 10);
    const duckFile = files.indexOf(duck[0]);
    const duckRank = parseInt(duck[1], 10);

    const df = Math.sign(toFile - fromFile);
    const dr = Math.sign(toRank - fromRank);

    // Step through squares along the ray strictly between from and to
    let currF = fromFile + df;
    let currR = fromRank + dr;

    while (currF !== toFile || currR !== toRank) {
      if (currF === duckFile && currR === duckRank) {
        return true;
      }
      currF += df;
      currR += dr;
    }

    return false;
  }

  /**
   * Find all empty squares on the board for placing/moving the Duck
   */
  public static getValidDuckSquares(chess: Chess, currentDuckSquare?: string | null): string[] {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const valid: string[] = [];
    for (let r = 8; r >= 1; r--) {
      for (const f of files) {
        const sq = `${f}${r}` as Square;
        if (!chess.get(sq) && sq !== currentDuckSquare) {
          valid.push(sq);
        }
      }
    }
    return valid;
  }

  /**
   * Choose an optimal or smart troll duck square to disrupt the opponent
   */
  public static chooseDuckSquare(chess: Chess, opponentTurn: 'w' | 'b', currentDuck?: string | null): string {
    const emptySquares = this.getValidDuckSquares(chess, currentDuck);
    if (emptySquares.length === 0) return 'e4';

    // Try to place duck on central choke-points if empty
    const primeSquares = ['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5'];
    for (const sq of primeSquares) {
      if (emptySquares.includes(sq)) return sq;
    }

    return emptySquares[Math.floor(Math.random() * emptySquares.length)];
  }

  /**
   * Resolve an Atomic Chess explosion after a capture on targetSquare
   * Rules: Capturing piece, captured piece, and all non-pawn pieces in 3x3 surrounding radius die.
   * Pawns in surrounding radius survive.
   */
  public static resolveAtomicCapture(
    chess: Chess,
    targetSquare: Square,
    capturingColor: 'w' | 'b'
  ): AtomicExplosionResult {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const targetFile = targetSquare[0];
    const targetRank = parseInt(targetSquare[1], 10);
    const targetFIdx = files.indexOf(targetFile);

    const destroyed: { square: string; piece: string; color: 'w' | 'b' }[] = [];
    let kingDestroyed: 'w' | 'b' | null = null;

    // 1. Remove the capturing piece that landed on targetSquare
    const pieceOnTarget = chess.get(targetSquare);
    if (pieceOnTarget) {
      chess.remove(targetSquare);
      destroyed.push({ square: targetSquare, piece: pieceOnTarget.type, color: pieceOnTarget.color });
      if (pieceOnTarget.type === 'k') {
        kingDestroyed = pieceOnTarget.color;
      }
    }

    // 2. Explode surrounding 8 squares (non-pawns only)
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue; // target square already handled
        const nfIdx = targetFIdx + df;
        const nr = targetRank + dr;

        if (nfIdx >= 0 && nfIdx < 8 && nr >= 1 && nr <= 8) {
          const adjSq = `${files[nfIdx]}${nr}` as Square;
          const adjPiece = chess.get(adjSq);

          // Atomic rule: pawns survive blast radius! Only non-pawns explode.
          if (adjPiece && adjPiece.type !== 'p') {
            chess.remove(adjSq);
            destroyed.push({ square: adjSq, piece: adjPiece.type, color: adjPiece.color });
            if (adjPiece.type === 'k') {
              kingDestroyed = adjPiece.color;
            }
          }
        }
      }
    }

    return {
      explodedSquare: targetSquare,
      destroyedPieces: destroyed,
      kingDestroyed,
    };
  }

  /**
   * Crazyhouse: Generate legal drop moves for the active player from reserve
   */
  public static getLegalCrazyhouseDrops(
    chess: Chess,
    color: 'w' | 'b',
    reserve: string[]
  ): string[] {
    if (!reserve || reserve.length === 0) return [];

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const drops: string[] = [];
    const uniquePieces = Array.from(new Set(reserve.map((p) => p.toUpperCase())));

    for (let r = 8; r >= 1; r--) {
      for (const f of files) {
        const sq = `${f}${r}` as Square;
        if (!chess.get(sq)) {
          for (const p of uniquePieces) {
            // Pawns cannot be dropped on rank 1 or rank 8
            if (p === 'P' && (r === 1 || r === 8)) continue;
            drops.push(`${p}@${sq}`);
          }
        }
      }
    }

    return drops;
  }

  /**
   * Crazyhouse: Execute a drop move onto the board
   */
  public static applyCrazyhouseDrop(
    chess: Chess,
    dropInput: string,
    color: 'w' | 'b',
    reserves: { w: string[]; b: string[] }
  ): { success: boolean; piece?: string; square?: Square; error?: string } {
    const match = dropInput.trim().match(/^([PNBRQpnbrq])@([a-h][1-8])$/i);
    if (!match) {
      return { success: false, error: `Invalid drop syntax: "${dropInput}". Expected format: P@e4, N@f3` };
    }

    const pieceType = match[1].toLowerCase() as PieceSymbol;
    const targetSquare = match[2].toLowerCase() as Square;
    const rank = parseInt(targetSquare[1], 10);

    if (pieceType === 'p' && (rank === 1 || rank === 8)) {
      return { success: false, error: 'Pawns cannot be dropped on rank 1 or rank 8.' };
    }

    if (chess.get(targetSquare)) {
      return { success: false, error: `Square ${targetSquare} is already occupied.` };
    }

    const colorReserve = reserves[color];
    const reserveIdx = colorReserve.findIndex((p) => p.toLowerCase() === pieceType);
    if (reserveIdx === -1) {
      return { success: false, error: `No ${pieceType.toUpperCase()} available in ${color === 'w' ? 'White' : 'Black'} reserve.` };
    }

    // Place piece on board
    const putOk = chess.put({ type: pieceType, color }, targetSquare);
    if (!putOk) {
      return { success: false, error: `Failed to put piece on ${targetSquare}.` };
    }

    // Consume from reserve
    colorReserve.splice(reserveIdx, 1);

    return { success: true, piece: pieceType.toUpperCase(), square: targetSquare };
  }

  /**
   * Fog of War: Compute visible squares for White and Black
   */
  public static computeFogVision(chess: Chess): { w: string[]; b: string[] } {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const board = chess.board();
    const vision: { w: Set<string>; b: Set<string> } = { w: new Set(), b: new Set() };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        const color = piece.color;
        const sq = `${files[c]}${8 - r}`;
        vision[color].add(sq);

        if (piece.type === 'p') {
          const forwardRow = color === 'w' ? r - 1 : r + 1;
          if (forwardRow >= 0 && forwardRow < 8) {
            vision[color].add(`${files[c]}${8 - forwardRow}`);
            if (c > 0) vision[color].add(`${files[c - 1]}${8 - forwardRow}`);
            if (c < 7) vision[color].add(`${files[c + 1]}${8 - forwardRow}`);
          }
        } else if (piece.type === 'n') {
          const offsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1],
          ];
          for (const [dr, dc] of offsets) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              vision[color].add(`${files[nc]}${8 - nr}`);
            }
          }
        } else if (piece.type === 'k') {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                vision[color].add(`${files[nc]}${8 - nr}`);
              }
            }
          }
        } else {
          const dirs: [number, number][] = [];
          if (piece.type === 'r' || piece.type === 'q') {
            dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
          }
          if (piece.type === 'b' || piece.type === 'q') {
            dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
          }
          for (const [dr, dc] of dirs) {
            let step = 1;
            while (true) {
              const nr = r + dr * step;
              const nc = c + dc * step;
              if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
              const targetSq = `${files[nc]}${8 - nr}`;
              vision[color].add(targetSq);
              if (board[nr][nc]) break;
              step++;
            }
          }
        }
      }
    }

    return {
      w: Array.from(vision.w),
      b: Array.from(vision.b),
    };
  }

  /**
   * Fog of War: Render ASCII grid with veiled [?] tiles for unseen sectors
   */
  public static formatFogBoard(chess: Chess, color: 'w' | 'b', visibleSquares: string[]): string {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const board = chess.board();
    const visSet = new Set(visibleSquares);
    const rows: string[] = [];

    for (let r = 0; r < 8; r++) {
      const rankNum = 8 - r;
      const cells: string[] = [];
      for (let c = 0; c < 8; c++) {
        const sq = `${files[c]}${rankNum}`;
        if (!visSet.has(sq)) {
          cells.push('[?]');
        } else {
          const p = board[r][c];
          if (!p) {
            cells.push('[ ]');
          } else {
            cells.push(`[${p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase()}]`);
          }
        }
      }
      rows.push(`${rankNum}  ${cells.join(' ')}`);
    }
    rows.push('    a   b   c   d   e   f   g   h');
    return rows.join('\n');
  }

  /**
   * Spell Chess: Cast a spell card
   */
  public static castSpell(
    chess: Chess,
    spellId: string,
    color: 'w' | 'b',
    args?: { sq1?: string; sq2?: string }
  ): { success: boolean; message: string; frozenSquare?: string } {
    if (spellId === 'swap_pawns') {
      let sq1 = args?.sq1 as Square | undefined;
      let sq2 = args?.sq2 as Square | undefined;

      // Auto-target friendly pawns if not supplied
      if (!sq1 || !sq2) {
        const pawns: Square[] = [];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let r = 1; r <= 8; r++) {
          for (const f of files) {
            const s = `${f}${r}` as Square;
            const p = chess.get(s);
            if (p?.type === 'p' && p.color === color) pawns.push(s);
          }
        }
        if (pawns.length >= 2) {
          sq1 = pawns[0];
          sq2 = pawns[1];
        }
      }

      if (!sq1 || !sq2) {
        return { success: false, message: 'Must specify two pawns to swap.' };
      }
      const p1 = chess.get(sq1);
      const p2 = chess.get(sq2);
      if (p1?.type === 'p' && p2?.type === 'p' && p1.color === color && p2.color === color) {
        chess.put(p1, sq2);
        chess.put(p2, sq1);
        return { success: true, message: `Swapped pawns on ${sq1} and ${sq2}.` };
      }
      return { success: false, message: 'Invalid pawns for swap.' };
    }

    if (spellId === 'resurrection') {
      const backRank = color === 'w' ? '1' : '8';
      const emptySq = ['c', 'd', 'e', 'f', 'b', 'g', 'a', 'h']
        .map((f) => `${f}${backRank}` as Square)
        .find((sq) => !chess.get(sq));

      if (emptySq) {
        chess.put({ type: 'p', color }, emptySq);
        return { success: true, message: `Resurrected Pawn on ${emptySq}.` };
      }
      return { success: false, message: 'No open back-rank square to revive pawn.' };
    }

    if (spellId === 'catapult_knight') {
      let knightSq = args?.sq1 as Square | undefined;
      let targetSq = args?.sq2 as Square | undefined;

      // Auto-find friendly knight if not provided
      if (!knightSq) {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let r = 1; r <= 8; r++) {
          for (const f of files) {
            const s = `${f}${r}` as Square;
            const p = chess.get(s);
            if (p?.type === 'n' && p.color === color) {
              knightSq = s;
              break;
            }
          }
          if (knightSq) break;
        }
      }

      // Auto-find open target square on ranks 4, 5, or 6
      if (!targetSq) {
        const ranks = color === 'w' ? [5, 6, 4] : [4, 3, 5];
        const files = ['d', 'e', 'c', 'f', 'b', 'g', 'a', 'h'];
        for (const r of ranks) {
          for (const f of files) {
            const s = `${f}${r}` as Square;
            if (!chess.get(s)) {
              targetSq = s;
              break;
            }
          }
          if (targetSq) break;
        }
      }

      if (!knightSq || !targetSq) {
        return { success: false, message: 'No knight or target square found for Catapult Leap.' };
      }

      const p = chess.get(knightSq);
      if (p?.type === 'n' && p.color === color && !chess.get(targetSq)) {
        chess.remove(knightSq);
        chess.put(p, targetSq);
        return { success: true, message: `Catapulted Knight from ${knightSq} to ${targetSq}!` };
      }
      return { success: false, message: `Cannot catapult knight to ${targetSq}.` };
    }

    if (spellId === 'frost_freeze') {
      let targetSq = args?.sq1 as Square | undefined;
      const oppColor = color === 'w' ? 'b' : 'w';

      // Auto-find high value enemy piece if not provided
      if (!targetSq) {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const targets: { sq: Square; val: number }[] = [];
        for (let r = 1; r <= 8; r++) {
          for (const f of files) {
            const s = `${f}${r}` as Square;
            const p = chess.get(s);
            if (p && p.color === oppColor && p.type !== 'k') {
              const val = p.type === 'q' ? 9 : p.type === 'r' ? 5 : p.type === 'b' || p.type === 'n' ? 3 : 1;
              targets.push({ sq: s, val });
            }
          }
        }
        targets.sort((a, b) => b.val - a.val);
        if (targets.length > 0) targetSq = targets[0].sq;
      }

      if (!targetSq) {
        return { success: false, message: 'No enemy piece found to freeze.' };
      }

      const targetPiece = chess.get(targetSq);
      if (targetPiece && targetPiece.color === oppColor) {
        return {
          success: true,
          message: `Glacial Freeze locked enemy ${targetPiece.type.toUpperCase()} on ${targetSq} for 1 turn!`,
          frozenSquare: targetSq,
        };
      }
      return { success: false, message: `Invalid target piece on ${targetSq}.` };
    }

    return { success: false, message: `Unknown spell ${spellId}` };
  }
}
