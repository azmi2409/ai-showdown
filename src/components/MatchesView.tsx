import React, { useState, useEffect } from 'react';
import {
  History,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  Trophy,
  Clock,
  Zap,
  Download,
  X,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { MatchRecord } from '../types';
import { apiService } from '../services/apiService';

interface MatchesViewProps {
  onNavigateToArena?: () => void;
}

export const MatchesView: React.FC<MatchesViewProps> = () => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModel, setFilterModel] = useState<string>('all');
  const [filterWinner, setFilterWinner] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<MatchRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const data = await apiService.getMatches({ limit: 100 });
      setMatches(data || []);
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiService.getMatches({ limit: 100 }).then((data) => {
      if (active) {
        setMatches(data || []);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadPGN = (match: MatchRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([match.pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${match.whiteModelName}_vs_${match.blackModelName}_${match.id}.pgn`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Filter logic
  const filteredMatches = matches.filter((m) => {
    if (filterModel !== 'all') {
      if (m.whiteModelId !== filterModel && m.blackModelId !== filterModel) return false;
    }
    if (filterWinner !== 'all') {
      if (filterWinner === 'w' && m.winner !== 'w') return false;
      if (filterWinner === 'b' && m.winner !== 'b') return false;
      if (filterWinner === 'draw' && m.winner !== 'draw') return false;
    }
    return true;
  });

  // Extract unique model list for filters
  const uniqueModels = Array.from(
    new Map(
      matches.flatMap((m) => [
        [m.whiteModelId, m.whiteModelName],
        [m.blackModelId, m.blackModelName],
      ])
    ).entries()
  );

  return (
    <div className="matches-view-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header & Filters */}
      <div className="card-panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div className="panel-title">
            <History size={20} color="var(--neon-cyan)" />
            <span>Match Records & History</span>
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginLeft: '8px',
              }}
            >
              ({filteredMatches.length} recorded)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Filter by Model */}
            <select
              className="select-dropdown"
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <option value="all">All Models</option>
              {uniqueModels.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            {/* Filter by Winner */}
            <select
              className="select-dropdown"
              value={filterWinner}
              onChange={(e) => setFilterWinner(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <option value="all">All Outcomes</option>
              <option value="w">White Wins</option>
              <option value="b">Black Wins</option>
              <option value="draw">Draws</option>
            </select>

            <button
              className="btn btn-secondary"
              onClick={fetchMatches}
              disabled={loading}
              title="Refresh match list"
            >
              <RotateCcw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Match Records List */}
      {loading && matches.length === 0 ? (
        <div className="card-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ color: 'var(--text-muted)' }}>Loading match history from backend database...</div>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="card-panel" style={{ textAlign: 'center', padding: '50px' }}>
          <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>No Matches Recorded Yet</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Start a 1v1 duel or run a tournament to generate match history with ELO changes and telemetry.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredMatches.map((m) => {
            const isWhiteWinner = m.winner === 'w';
            const isBlackWinner = m.winner === 'b';
            const isDraw = m.winner === 'draw';

            return (
              <div
                key={m.id}
                className="card-panel"
                style={{
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  padding: '16px 20px',
                }}
                onClick={() => setSelectedMatch(m)}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  {/* Left: Match ID & Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--neon-cyan)',
                        background: 'rgba(6, 182, 212, 0.1)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(m.id, m.id);
                      }}
                      title="Click to copy Match ID"
                    >
                      {copiedId === m.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      {m.id}
                    </span>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </span>

                    {m.tournamentId && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#fbbf24',
                          background: 'rgba(245, 158, 11, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                        }}
                      >
                        TOURNAMENT
                      </span>
                    )}
                  </div>

                  {/* Right: Quick actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      onClick={(e) => handleDownloadPGN(m, e)}
                      title="Download PGN"
                    >
                      <Download size={12} />
                      <span>PGN</span>
                    </button>
                    <ExternalLink size={14} color="var(--text-muted)" />
                  </div>
                </div>

                {/* Match Contestants & Outcome */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px, 1fr) auto minmax(200px, 1fr)',
                    alignItems: 'center',
                    gap: '16px',
                    margin: '16px 0',
                  }}
                >
                  {/* White Player */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        border: isWhiteWinner ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                      }}
                    >
                      ⚪
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                        {m.whiteModelName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                        <span>White</span>
                        {m.eloChange && (
                          <span
                            style={{
                              color: m.eloChange.whiteDelta >= 0 ? '#10b981' : '#f43f5e',
                              fontWeight: 600,
                            }}
                          >
                            {m.eloChange.whiteDelta >= 0 ? `+${m.eloChange.whiteDelta}` : m.eloChange.whiteDelta} ELO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Center Match Status Badge */}
                  <div style={{ textAlign: 'center', minWidth: '140px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: isDraw
                          ? 'rgba(100, 116, 139, 0.2)'
                          : 'rgba(16, 185, 129, 0.15)',
                        border: `1px solid ${isDraw ? 'var(--text-muted)' : '#10b981'}`,
                        color: isDraw ? '#cbd5e1' : '#10b981',
                      }}
                    >
                      {isDraw ? 'DRAW' : isWhiteWinner ? 'WHITE WON' : 'BLACK WON'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      by {m.reason} • {m.movesCount} moves
                    </div>
                  </div>

                  {/* Black Player */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                        {m.blackModelName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {m.eloChange && (
                          <span
                            style={{
                              color: m.eloChange.blackDelta >= 0 ? '#10b981' : '#f43f5e',
                              fontWeight: 600,
                            }}
                          >
                            {m.eloChange.blackDelta >= 0 ? `+${m.eloChange.blackDelta}` : m.eloChange.blackDelta} ELO
                          </span>
                        )}
                        <span>Black</span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        border: isBlackWinner ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                      }}
                    >
                      ⚫
                    </div>
                  </div>
                </div>

                {/* Telemetry Summary Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    paddingTop: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {m.timeControl?.name || 'Blitz'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={12} />
                    Avg Latency: White {m.telemetry?.whiteAvgLatencyMs || 0}ms / Black {m.telemetry?.blackAvgLatencyMs || 0}ms
                  </span>
                  <span>
                    Tool Calls: White {m.telemetry?.whiteToolCallsCount || 0} / Black {m.telemetry?.blackToolCallsCount || 0}
                  </span>
                  {(m.telemetry?.whiteIllegalMoves > 0 || m.telemetry?.blackIllegalMoves > 0) && (
                    <span style={{ color: '#f43f5e', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={12} />
                      Illegal Attempts: W:{m.telemetry?.whiteIllegalMoves || 0} B:{m.telemetry?.blackIllegalMoves || 0}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Match Details Modal */}
      {selectedMatch && (
        <div className="modal-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={20} color="var(--neon-amber)" />
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>Match Inspection</h2>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px' }}
                onClick={() => setSelectedMatch(null)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Match Header Info */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--neon-cyan)' }}>
                  ID: {selectedMatch.id}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(selectedMatch.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                {selectedMatch.whiteModelName} (White) vs {selectedMatch.blackModelName} (Black)
              </div>
              <div style={{ fontSize: '13px', color: '#10b981', marginTop: '4px' }}>
                Outcome: {selectedMatch.winner === 'draw' ? 'Draw' : `${selectedMatch.winner === 'w' ? 'White' : 'Black'} Wins`} by {selectedMatch.reason} ({selectedMatch.movesCount} moves)
              </div>
            </div>

            {/* ELO Rating Changes Breakdown */}
            {selectedMatch.eloChange && (
              <div
                style={{
                  background: 'rgba(124, 58, 237, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#c4b5fd', marginBottom: '8px' }}>
                  ⚡ Elo Rating Transition
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>White ({selectedMatch.whiteModelName}): </span>
                    <span style={{ fontWeight: 700, color: '#ffffff' }}>{selectedMatch.eloChange.whiteBefore}</span>
                    <span
                      style={{
                        margin: '0 4px',
                        color: selectedMatch.eloChange.whiteDelta >= 0 ? '#10b981' : '#f43f5e',
                        fontWeight: 700,
                      }}
                    >
                      {selectedMatch.eloChange.whiteDelta >= 0 ? `+${selectedMatch.eloChange.whiteDelta}` : selectedMatch.eloChange.whiteDelta}
                    </span>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>➔ {selectedMatch.eloChange.whiteAfter}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Black ({selectedMatch.blackModelName}): </span>
                    <span style={{ fontWeight: 700, color: '#ffffff' }}>{selectedMatch.eloChange.blackBefore}</span>
                    <span
                      style={{
                        margin: '0 4px',
                        color: selectedMatch.eloChange.blackDelta >= 0 ? '#10b981' : '#f43f5e',
                        fontWeight: 700,
                      }}
                    >
                      {selectedMatch.eloChange.blackDelta >= 0 ? `+${selectedMatch.eloChange.blackDelta}` : selectedMatch.eloChange.blackDelta}
                    </span>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>➔ {selectedMatch.eloChange.blackAfter}</span>
                  </div>
                </div>
              </div>
            )}

            {/* PGN Game Notation */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} color="var(--neon-cyan)" />
                  Standard PGN Record
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(selectedMatch.pgn);
                    setCopiedPgn(true);
                    setTimeout(() => setCopiedPgn(false), 2000);
                  }}
                >
                  {copiedPgn ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copiedPgn ? 'Copied' : 'Copy PGN'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={selectedMatch.pgn}
                rows={5}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px',
                  color: '#e2e8f0',
                  resize: 'none',
                }}
              />
            </div>

            {/* Final FEN string */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Final Board FEN:
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  color: '#94a3b8',
                  wordBreak: 'break-all',
                }}
              >
                {selectedMatch.finalFen}
              </div>
            </div>

            {/* Close Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={() => setSelectedMatch(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
