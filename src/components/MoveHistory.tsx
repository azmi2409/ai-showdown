import React, { useEffect, useRef } from 'react';
import { Download, History } from 'lucide-react';
import { MoveRecord } from '../types';

interface MoveHistoryProps {
  moves: MoveRecord[];
  onExportPGN: () => void;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  onExportPGN,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group moves into pairs (White, Black)
  const rows: { moveNumber: number; white?: MoveRecord; black?: MoveRecord }[] = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const rowIdx = Math.floor(i / 2);
    if (!rows[rowIdx]) {
      rows[rowIdx] = { moveNumber: rowIdx + 1 };
    }
    if (move.turn === 'w') {
      rows[rowIdx].white = move;
    } else {
      rows[rowIdx].black = move;
    }
  }

  // Auto-scroll to bottom on new move
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  return (
    <div className="card-panel">
      <div className="panel-header">
        <div className="panel-title">
          <History size={16} />
          <span>Move Notation</span>
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: '11px' }}
          onClick={onExportPGN}
          disabled={moves.length === 0}
          title="Download PGN"
        >
          <Download size={13} />
          <span>PGN</span>
        </button>
      </div>

      <div className="move-history-container" ref={scrollRef}>
        <table className="move-history-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>White</th>
              <th>Black</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                  No moves played yet
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.moveNumber}>
                  <td style={{ color: 'var(--text-muted)' }}>{row.moveNumber}.</td>
                  <td>
                    {row.white && (
                      <span
                        className={`move-cell ${
                          row.white === moves[moves.length - 1] ? 'active-move' : ''
                        }`}
                        title={row.white.reasoning || `${row.white.latencyMs}ms`}
                      >
                        {row.white.san}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.black && (
                      <span
                        className={`move-cell ${
                          row.black === moves[moves.length - 1] ? 'active-move' : ''
                        }`}
                        title={row.black.reasoning || `${row.black.latencyMs}ms`}
                      >
                        {row.black.san}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
