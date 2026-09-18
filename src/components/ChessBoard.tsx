import React, { useMemo } from 'react';
import { Chess, Square } from 'chess.js';
import { GameMode, MoveRecord, SpectatorVision } from '../types';
import { VariantsEngine } from '../services/variantsEngine';

interface ChessBoardProps {
  chess?: Chess;
  fen?: string;
  lastMove?: MoveRecord;
  inCheck: boolean;
  turn: 'w' | 'b';
  gameMode?: GameMode;
  portalSquares?: [string, string];
  fogVision?: { w: string[]; b: string[] };
  spectatorVision?: SpectatorVision;
  duckSquare?: string | null;
  crazyhouseReserves?: { w: string[]; b: string[] };
}

const PIECE_UNICODE: Record<string, string> = {
  // White pieces
  'w_p': '♙',
  'w_n': '♘',
  'w_b': '♗',
  'w_r': '♖',
  'w_q': '♕',
  'w_k': '♔',
  // Black pieces
  'b_p': '♟',
  'b_n': '♞',
  'b_b': '♝',
  'b_r': '♜',
  'b_q': '♛',
  'b_k': '♚',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1]; // Top-to-bottom for White perspective

export const ChessBoard: React.FC<ChessBoardProps> = ({
  chess,
  fen,
  lastMove,
  inCheck,
  turn,
  gameMode = 'standard',
  portalSquares = ['d4', 'e5'],
  fogVision = { w: [], b: [] },
  spectatorVision = 'all',
  duckSquare,
  crazyhouseReserves = { w: [], b: [] },
}) => {
  // Use robust FEN parser that cannot crash or reset when custom variants have non-standard pieces/kings
  const board = useMemo(() => {
    const targetFen = fen || chess?.fen();
    if (targetFen) {
      const parsed = VariantsEngine.parseFenToBoard(targetFen);
      if (parsed.length === 8) return parsed;
    }
    return chess ? chess.board() : new Chess().board();
  }, [fen, chess]);

  // Find King square if currently in check
  let checkKingSquare: string | null = null;
  if (inCheck) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) {
          checkKingSquare = `${FILES[c]}${8 - r}`;
          break;
        }
      }
    }
  }

  const whiteVisionSet = new Set(fogVision.w);
  const blackVisionSet = new Set(fogVision.b);

  // Atomic Chess Explosion squares
  const atomicExplosion = lastMove?.atomicExplosion;
  const explodedCenter = atomicExplosion?.explodedSquare;
  const destroyedSquareSet = new Set(atomicExplosion?.destroyedPieces.map((p) => p.square) || []);

  return (
    <div className="chess-board-wrapper">
      {/* Crazyhouse Reserve - Black */}
      {gameMode === 'crazyhouse' && (
        <div className="crazyhouse-reserve black-reserve" title="Black Reserves (Drops Available)">
          <span className="reserve-label">Black Drops:</span>
          {crazyhouseReserves.b.length === 0 ? (
            <span className="reserve-empty">Empty</span>
          ) : (
            crazyhouseReserves.b.map((p, idx) => (
              <span key={idx} className="reserve-piece black">
                {PIECE_UNICODE[`b_${p.toLowerCase()}`] || p}
              </span>
            ))
          )}
        </div>
      )}

      <div className="chess-board-grid">
        {RANKS.map((rank, rIdx) =>
          FILES.map((file, fIdx) => {
            const squareName = `${file}${rank}` as Square;
            const piece = board[rIdx][fIdx];
            const isLight = (rIdx + fIdx) % 2 === 0;

            const isLastMoveSquare =
              lastMove && (lastMove.from === squareName || lastMove.to === squareName);

            const isCheckSquare = inCheck && checkKingSquare === squareName;
            const isPortal = gameMode === 'mutators' && portalSquares.includes(squareName);
            const isDuck = gameMode === 'duck_chess' && duckSquare === squareName;
            const isExplosionCenter = explodedCenter === squareName;
            const isExplosionVaporized = destroyedSquareSet.has(squareName);

            // Fog of war determination
            const isFogMode = gameMode === 'fog_of_war';
            let isShrouded = false;
            let showPiece = !!piece;

            if (isFogMode) {
              if (spectatorVision === 'w') {
                isShrouded = !whiteVisionSet.has(squareName);
                if (isShrouded && piece && piece.color !== 'w') {
                  showPiece = false;
                }
              } else if (spectatorVision === 'b') {
                isShrouded = !blackVisionSet.has(squareName);
                if (isShrouded && piece && piece.color !== 'b') {
                  showPiece = false;
                }
              } else {
                // Omniscient: subtle fog marker on squares outside active turn radar
                const activeVision = turn === 'w' ? whiteVisionSet : blackVisionSet;
                isShrouded = !activeVision.has(squareName);
                showPiece = true; // Spectator always sees piece in omniscient mode
              }
            }

            return (
              <div
                key={squareName}
                className={`chess-square ${isLight ? 'light' : 'dark'} ${
                  isLastMoveSquare ? 'last-move' : ''
                } ${isCheckSquare ? 'in-check' : ''} ${isPortal ? 'portal-tile' : ''} ${
                  isDuck ? 'duck-tile' : ''
                } ${isFogMode && isShrouded ? 'fog-tile' : ''} ${
                  isExplosionCenter ? 'atomic-epicenter' : ''
                } ${isExplosionVaporized && !isExplosionCenter ? 'atomic-blast-radius' : ''}`}
                title={squareName}
              >
                {/* File coordinate (only bottom rank) */}
                {rank === 1 && <span className="coord-label coord-file">{file}</span>}

                {/* Rank coordinate (only left file) */}
                {file === 'a' && <span className="coord-label coord-rank">{rank}</span>}

                {/* Portal Rune Badge */}
                {isPortal && (
                  <span className="portal-indicator" title="Quantum Portal Teleport">
                    🌀
                  </span>
                )}

                {/* Duck Blocker */}
                {isDuck && (
                  <span className="duck-indicator" title="Neutral Duck Blocker">
                    🦆
                  </span>
                )}

                {/* Fog Mist Overlay */}
                {isFogMode && isShrouded && (
                  <div className="fog-overlay" title="Veiled in Fog of War">
                    {!showPiece && <span className="fog-question">?</span>}
                  </div>
                )}

                {/* Atomic Explosion Blast FX */}
                {isExplosionCenter && (
                  <span className="atomic-blast-icon" title="Nuclear Epicenter">
                    💥
                  </span>
                )}

                {/* Piece Rendering */}
                {showPiece && piece && (
                  <span className={`chess-piece ${piece.color === 'w' ? 'white' : 'black'}`}>
                    {PIECE_UNICODE[`${piece.color}_${piece.type}`]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Crazyhouse Reserve - White */}
      {gameMode === 'crazyhouse' && (
        <div className="crazyhouse-reserve white-reserve" title="White Reserves (Drops Available)">
          <span className="reserve-label">White Drops:</span>
          {crazyhouseReserves.w.length === 0 ? (
            <span className="reserve-empty">Empty</span>
          ) : (
            crazyhouseReserves.w.map((p, idx) => (
              <span key={idx} className="reserve-piece white">
                {PIECE_UNICODE[`w_${p.toLowerCase()}`] || p}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
};
