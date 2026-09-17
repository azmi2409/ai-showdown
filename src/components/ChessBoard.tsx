import React from 'react';
import { Chess, Square } from 'chess.js';
import { MoveRecord } from '../types';

interface ChessBoardProps {
  chess: Chess;
  lastMove?: MoveRecord;
  inCheck: boolean;
  turn: 'w' | 'b';
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
  lastMove,
  inCheck,
  turn,
}) => {
  const board = chess.board();

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

  return (
    <div className="chess-board-wrapper">
      <div className="chess-board-grid">
        {RANKS.map((rank, rIdx) =>
          FILES.map((file, fIdx) => {
            const squareName = `${file}${rank}` as Square;
            const piece = board[rIdx][fIdx];
            const isLight = (rIdx + fIdx) % 2 === 0;

            const isLastMoveSquare =
              lastMove && (lastMove.from === squareName || lastMove.to === squareName);

            const isCheckSquare = inCheck && checkKingSquare === squareName;

            return (
              <div
                key={squareName}
                className={`chess-square ${isLight ? 'light' : 'dark'} ${
                  isLastMoveSquare ? 'last-move' : ''
                } ${isCheckSquare ? 'in-check' : ''}`}
                title={squareName}
              >
                {/* File coordinate (only bottom rank) */}
                {rank === 1 && <span className="coord-label coord-file">{file}</span>}

                {/* Rank coordinate (only left file) */}
                {file === 'a' && <span className="coord-label coord-rank">{rank}</span>}

                {/* Piece Rendering */}
                {piece && (
                  <span className={`chess-piece ${piece.color === 'w' ? 'white' : 'black'}`}>
                    {PIECE_UNICODE[`${piece.color}_${piece.type}`]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
