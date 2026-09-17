import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { VariantsEngine } from '../src/services/variantsEngine';

describe('VariantsEngine Test Suite', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  describe('1. Duck Chess Rules', () => {
    it('correctly reports duck blocked squares', () => {
      expect(VariantsEngine.isDuckBlocked('e4', 'e4')).toBe(true);
      expect(VariantsEngine.isDuckBlocked('E4', 'e4')).toBe(true);
      expect(VariantsEngine.isDuckBlocked('d4', 'e4')).toBe(false);
      expect(VariantsEngine.isDuckBlocked('d4', null)).toBe(false);
    });

    it('finds valid empty squares for duck placement', () => {
      // If e4 is current duck, 31 other empty squares are available
      const validSquares = VariantsEngine.getValidDuckSquares(chess, 'e4');
      expect(validSquares.length).toBe(31);
      expect(validSquares).not.toContain('e4'); // current duck is excluded
      expect(validSquares).toContain('d4');
      expect(validSquares).not.toContain('e2'); // e2 occupied by white pawn
      expect(validSquares).not.toContain('e7'); // e7 occupied by black pawn

      // If no current duck, all 32 empty squares available
      const allEmpty = VariantsEngine.getValidDuckSquares(chess, null);
      expect(allEmpty.length).toBe(32);
      expect(allEmpty).toContain('e4');
    });

    it('chooses a valid choke-point duck square', () => {
      const chosen = VariantsEngine.chooseDuckSquare(chess, 'b', null);
      expect(['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5']).toContain(chosen);
    });

    it('accurately tests if moves are blocked by duck landing or ray', () => {
      // Direct landing blocked
      expect(VariantsEngine.isMoveBlockedByDuck('e2', 'e4', 'p', 'e4')).toBe(true);

      // Ray blocked for 2-step pawn advance
      expect(VariantsEngine.isMoveBlockedByDuck('e2', 'e4', 'p', 'e3')).toBe(true);
      expect(VariantsEngine.isMoveBlockedByDuck('e2', 'e4', 'p', 'd3')).toBe(false);

      // Slider ray blocked
      expect(VariantsEngine.isMoveBlockedByDuck('a1', 'a8', 'r', 'a4')).toBe(true);
      expect(VariantsEngine.isMoveBlockedByDuck('a1', 'a8', 'r', 'b4')).toBe(false);

      // Knight jumps over duck
      expect(VariantsEngine.isMoveBlockedByDuck('b1', 'c3', 'n', 'b2')).toBe(false);
      // But knight cannot land on duck
      expect(VariantsEngine.isMoveBlockedByDuck('b1', 'c3', 'n', 'c3')).toBe(true);
    });
  });

  describe('2. Atomic Chess Explosion Rules', () => {
    it('detonates capturing piece, captured piece, and adjacent non-pawns while sparing pawns', () => {
      // Set up position:
      // White Knight on e5 captures Black Pawn on d7
      // Adjacent to d7: c8 (Black Bishop), e8 (Black King), d8 (Black Queen), c7 (Black Pawn), e7 (Black Pawn)
      const customChess = new Chess('rnbqkbnr/ppp1pppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 1');

      // White captures on d7:
      const result = VariantsEngine.resolveAtomicCapture(customChess, 'd7', 'w');

      expect(result.explodedSquare).toBe('d7');
      // The Knight on d7 is vaporized
      expect(customChess.get('d7')).toBeFalsy();

      // Adjacent non-pawns around d7:
      // c8 (Bishop) -> destroyed
      // d8 (Queen) -> destroyed
      // e8 (King) -> destroyed!
      expect(result.kingDestroyed).toBe('b');

      // Surrounding pawns on c7 and e7 MUST survive according to atomic chess rules:
      expect(customChess.get('c7')?.type).toBe('p');
      expect(customChess.get('e7')?.type).toBe('p');
    });

    it('correctly handles non-king atomic explosion', () => {
      // White Rook on a1 captures on a7 (adjacent to b8 Knight and b7 Pawn)
      const customChess = new Chess('1nbqkbnr/1ppppppp/8/8/8/8/1PPPPPPP/R3KBNR w KQkq - 0 1');
      // Place White Rook on a7
      customChess.put({ type: 'r', color: 'w' }, 'a7');

      const result = VariantsEngine.resolveAtomicCapture(customChess, 'a7', 'w');
      expect(result.kingDestroyed).toBeFalsy();
      // Rook on a7 destroyed
      expect(customChess.get('a7')).toBeFalsy();
      // b8 Knight destroyed
      expect(customChess.get('b8')).toBeFalsy();
      // b7 Pawn survives
      expect(customChess.get('b7')?.type).toBe('p');
    });
  });

  describe('3. Crazyhouse (Drop Chess) Rules', () => {
    it('generates legal drops for pieces in reserve on empty squares', () => {
      const reserve = ['P', 'N'];
      const drops = VariantsEngine.getLegalCrazyhouseDrops(chess, 'w', reserve);

      expect(drops).toContain('P@e4');
      expect(drops).toContain('N@e4');
      // Pawns cannot be dropped on rank 1 or 8
      expect(drops).not.toContain('P@e1');
      expect(drops).not.toContain('P@e8');
      // Knights CAN be dropped on rank 1 or 8 if empty
      const emptyRank1Square = chess.get('d1') ? null : 'd1';
      if (!emptyRank1Square) {
        // e4 is empty
        expect(drops).toContain('N@e4');
      }
    });

    it('successfully drops a piece onto the board and consumes from reserve', () => {
      const reserves = { w: ['P', 'N', 'Q'], b: [] };
      const dropRes = VariantsEngine.applyCrazyhouseDrop(chess, 'N@e4', 'w', reserves);

      expect(dropRes.success).toBe(true);
      expect(chess.get('e4')?.type).toBe('n');
      expect(chess.get('e4')?.color).toBe('w');
      expect(reserves.w).toEqual(['P', 'Q']); // Knight consumed
    });

    it('rejects dropping on an occupied square or with missing reserve piece', () => {
      const reserves = { w: ['P'], b: [] };
      // e2 is occupied by white pawn
      const occupiedRes = VariantsEngine.applyCrazyhouseDrop(chess, 'P@e2', 'w', reserves);
      expect(occupiedRes.success).toBe(false);

      // Queen not in reserve
      const missingRes = VariantsEngine.applyCrazyhouseDrop(chess, 'Q@e4', 'w', reserves);
      expect(missingRes.success).toBe(false);
    });
  });

  describe('4. Fog of War (Dark Chess) Vision Rules', () => {
    it('calculates vision cones revealing starting squares and sightlines', () => {
      const vision = VariantsEngine.computeFogVision(chess);

      // White sees own pieces and rank 3 sightlines
      expect(vision.w).toContain('e2'); // Own pawn
      expect(vision.w).toContain('e3'); // Pawn advance square
      expect(vision.w).toContain('f3'); // Knight target

      // White cannot see black back rank squares initially (e.g. e8 King)
      expect(vision.w).not.toContain('e8');
      expect(vision.w).not.toContain('d8');

      // Black sees own pieces and rank 6/5
      expect(vision.b).toContain('e7');
      expect(vision.b).toContain('e6');
      expect(vision.b).not.toContain('e1');
    });

    it('formats fog board replacing veiled sectors with [?]', () => {
      const vision = VariantsEngine.computeFogVision(chess);
      const fogAscii = VariantsEngine.formatFogBoard(chess, 'w', vision.w);

      expect(fogAscii).toContain('[?]'); // Obscured enemy sectors
      expect(fogAscii).toContain('[P]'); // White pawns
      expect(fogAscii).toContain('[K]'); // White King
      // Enemy pieces on rank 8 must NOT be exposed to White
      expect(fogAscii).not.toContain('[k]'); // Black King is veiled
    });
  });

  describe('5. Spell Chess Rules', () => {
    it('executes pawn swap spell', () => {
      // White pawns on a2 and b2
      const res = VariantsEngine.castSpell(chess, 'swap_pawns', 'w', { sq1: 'a2', sq2: 'b2' });
      expect(res.success).toBe(true);
      expect(chess.get('a2')?.type).toBe('p');
      expect(chess.get('b2')?.type).toBe('p');
    });

    it('executes resurrection spell onto an empty back-rank square', () => {
      // Remove piece on d1 to create open square
      chess.remove('d1');
      const res = VariantsEngine.castSpell(chess, 'resurrection', 'w');
      expect(res.success).toBe(true);
      expect(chess.get('d1')?.type).toBe('p');
      expect(chess.get('d1')?.color).toBe('w');
    });

    it('executes catapult knight and glacial freeze spells', () => {
      // Catapult white knight from b1 to d5
      const catapultRes = VariantsEngine.castSpell(chess, 'catapult_knight', 'w', { sq1: 'b1', sq2: 'd5' });
      expect(catapultRes.success).toBe(true);
      expect(chess.get('b1')).toBeFalsy();
      expect(chess.get('d5')?.type).toBe('n');

      // Glacial freeze on black queen (d8)
      const freezeRes = VariantsEngine.castSpell(chess, 'frost_freeze', 'w', { sq1: 'd8' });
      expect(freezeRes.success).toBe(true);
      expect(freezeRes.frozenSquare).toBe('d8');
    });
  });
});
