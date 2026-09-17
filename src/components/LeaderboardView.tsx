import React, { useState } from 'react';
import { BarChart3, Download, RotateCcw, ArrowUpDown, Calculator } from 'lucide-react';
import { BenchmarkMetrics } from '../types';

interface LeaderboardViewProps {
  metrics: Record<string, BenchmarkMetrics>;
  onResetStats: () => void;
  onRecalculateElo?: () => void;
}

type SortKey = 'elo' | 'wins' | 'gamesPlayed' | 'illegalRate' | 'avgLatency';

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  metrics,
  onResetStats,
  onRecalculateElo,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('elo');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const list = Object.values(metrics);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedList = [...list].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortKey) {
      case 'elo':
        valA = a.elo;
        valB = b.elo;
        break;
      case 'wins':
        valA = a.wins;
        valB = b.wins;
        break;
      case 'gamesPlayed':
        valA = a.gamesPlayed;
        valB = b.gamesPlayed;
        break;
      case 'illegalRate':
        valA = a.totalMovesMade > 0 ? (a.illegalMoveAttempts / a.totalMovesMade) * 100 : 0;
        valB = b.totalMovesMade > 0 ? (b.illegalMoveAttempts / b.totalMovesMade) * 100 : 0;
        break;
      case 'avgLatency':
        valA = a.totalMovesMade > 0 ? a.totalLatencyMs / a.totalMovesMade : 0;
        valB = b.totalMovesMade > 0 ? b.totalLatencyMs / b.totalMovesMade : 0;
        break;
    }

    return sortAsc ? valA - valB : valB - valA;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(metrics, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ai_showdown_benchmark_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="card-panel">
      <div className="panel-header">
        <div className="panel-title">
          <BarChart3 size={18} color="var(--neon-cyan)" />
          <span>LLM Intelligence & Chess Benchmark</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onRecalculateElo && (
            <button className="btn btn-secondary" onClick={onRecalculateElo} title="Recalculate all historical ELO with dynamic K-factor">
              <Calculator size={14} color="var(--neon-cyan)" />
              <span>Recalculate ELO</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleExportJSON}>
            <Download size={14} />
            <span>Export JSON</span>
          </button>
          <button className="btn btn-danger" onClick={onResetStats}>
            <RotateCcw size={14} />
            <span>Reset Stats</span>
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model Name</th>
              <th>Provider</th>
              <th onClick={() => handleSort('elo')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Elo Rating</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('gamesPlayed')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Record (W/D/L)</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('illegalRate')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Illegal Move Rate</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('avgLatency')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Avg Latency</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedList.map((m, idx) => {
              const illegalRate =
                m.totalMovesMade > 0
                  ? ((m.illegalMoveAttempts / m.totalMovesMade) * 100).toFixed(1)
                  : '0.0';
              const avgLatency =
                m.totalMovesMade > 0
                  ? Math.round(m.totalLatencyMs / m.totalMovesMade)
                  : 0;

              return (
                <tr key={m.modelId}>
                  <td style={{ fontFamily: 'var(--font-heading)', color: idx === 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                    #{idx + 1}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {m.modelName}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {m.provider.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="elo-badge">{m.elo}</span>
                      {m.gamesPlayed < 10 && (
                        <span
                          title="Provisional rating (< 10 matches). Dynamic K=40 rapid calibration."
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            cursor: 'help',
                          }}
                        >
                          PROV
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    <span style={{ color: '#34d399' }}>{m.wins}W</span> /{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{m.draws}D</span> /{' '}
                    <span style={{ color: '#f43f5e' }}>{m.losses}L</span>{' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      ({m.gamesPlayed} games)
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: parseFloat(illegalRate) > 0 ? '#f43f5e' : '#34d399',
                        fontWeight: 600,
                      }}
                    >
                      {illegalRate}%
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                      ({m.illegalMoveAttempts} errs)
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {avgLatency > 0 ? `${avgLatency}ms` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
