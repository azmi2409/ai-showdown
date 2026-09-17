import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Play,
  RotateCcw,
  Sparkles,
  Award,
  Layers,
  Shuffle,
} from 'lucide-react';
import {
  ModelConfig,
  TimeControl,
  TournamentMatch,
  TournamentState,
  TournamentType,
  GameMode,
} from '../types';
import { TournamentManager } from '../services/tournamentManager';

interface TournamentViewProps {
  allModels: ModelConfig[];
  tournament: TournamentState | null;
  onInitTournament: (
    title: string,
    type: TournamentType,
    selectedModels: ModelConfig[],
    timeControl: TimeControl,
    randomizeSeeding?: boolean,
    gameMode?: GameMode
  ) => void;
  onLaunchMatch: (match: TournamentMatch, roundIndex: number, matchIndex: number) => void;
  onAutoRunToggle: () => void;
  isAutoRunning: boolean;
  onResetTournament: () => void;
}

const DEFAULT_TIME_CONTROL: TimeControl = {
  name: 'Blitz 3+0',
  baseSeconds: 180,
  incrementSeconds: 0,
};

export const TournamentView: React.FC<TournamentViewProps> = ({
  allModels,
  tournament,
  onInitTournament,
  onLaunchMatch,
  onAutoRunToggle,
  isAutoRunning,
  onResetTournament,
}) => {
  // Wizard state if no active tournament
  const [selectedType, setSelectedType] = useState<TournamentType>('knockout');
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('standard');
  const [tournamentTitle, setTournamentTitle] = useState('2026 World AI Championship');
  const [randomizeSeeding, setRandomizeSeeding] = useState(true);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    allModels.slice(0, 4).map((m) => m.id)
  );

  const toggleModelSelection = (id: string) => {
    const target = allModels.find((m) => m.id === id);
    if (!target) return;

    if (selectedModelIds.includes(id)) {
      if (selectedModelIds.length > 2) {
        setSelectedModelIds(selectedModelIds.filter((mId) => mId !== id));
      }
    } else {
      if (TournamentManager.isAlgo(target)) {
        // Enforce max 1 algorithm bot in tournament to prevent algo vs algo pairings
        const withoutOtherAlgos = selectedModelIds.filter((mId) => {
          const m = allModels.find((mod) => mod.id === mId);
          return !TournamentManager.isAlgo(m);
        });
        setSelectedModelIds([...withoutOtherAlgos, id]);
        return;
      }
      setSelectedModelIds([...selectedModelIds, id]);
    }
  };

  const handleCreate = () => {
    const chosenModels = allModels.filter((m) => selectedModelIds.includes(m.id));
    onInitTournament(tournamentTitle, selectedType, chosenModels, DEFAULT_TIME_CONTROL, randomizeSeeding, selectedGameMode);
  };

  // Trigger confetti when champion is crowned
  React.useEffect(() => {
    if (tournament?.status === 'completed' && tournament.winner) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#7c3aed', '#06b6d4', '#f59e0b', '#10b981'],
      });
    }
  }, [tournament?.status, tournament?.winner]);

  // Setup Wizard if tournament not created
  if (!tournament) {
    return (
      <div className="tournament-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Trophy size={20} color="var(--neon-amber)" />
              <span>Create AI Championship Tournament</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="form-group">
              <label className="form-label">Championship Title</label>
              <input
                type="text"
                className="text-input"
                value={tournamentTitle}
                onChange={(e) => setTournamentTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Game Rules & Arena Mode</label>
              <select
                className="select-input"
                value={selectedGameMode}
                onChange={(e) => setSelectedGameMode(e.target.value as GameMode)}
                style={{ borderColor: selectedGameMode !== 'standard' ? 'var(--neon-cyan)' : undefined }}
              >
                <option value="standard">Standard Classical Rules</option>
                <option value="mutators">🎲 Chaos Draft (Mutators Auto-Battler)</option>
                <option value="fog_of_war">🌫️ Fog of War (Kriegspiel Radar)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Tournament Format</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  className={`btn ${selectedType === 'knockout' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedType('knockout')}
                >
                  <Layers size={16} />
                  <span>Knockout Bracket</span>
                </button>
                <button
                  type="button"
                  className={`btn ${selectedType === 'round-robin' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedType('round-robin')}
                >
                  <Award size={16} />
                  <span>Round-Robin League</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Select Contestants ({selectedModelIds.length} Selected)
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '10px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  padding: '4px',
                }}
              >
                {allModels.map((model) => {
                  const isChecked = selectedModelIds.includes(model.id);
                  return (
                    <div
                      key={model.id}
                      onClick={() => toggleModelSelection(model.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: isChecked ? 'rgba(124, 58, 237, 0.2)' : 'rgba(0,0,0,0.3)',
                        border: `1px solid ${isChecked ? 'var(--neon-violet)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>{model.avatar}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {model.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Elo {model.simulatedElo || 1500}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ accentColor: 'var(--neon-violet)' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Randomize Seeding Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: 'var(--radius-sm)',
                marginTop: '4px',
                cursor: 'pointer',
              }}
              onClick={() => setRandomizeSeeding(!randomizeSeeding)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shuffle size={16} color="var(--neon-cyan)" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Randomize Seeding & Matchups
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Shuffle contestants randomly instead of fixed Elo rating seeding
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={randomizeSeeding}
                onChange={(e) => setRandomizeSeeding(e.target.checked)}
                style={{ accentColor: 'var(--neon-cyan)', width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ padding: '14px', fontSize: '15px', marginTop: '10px' }}
              onClick={handleCreate}
              disabled={selectedModelIds.length < 2}
            >
              <Trophy size={18} />
              <span>Initialize Tournament Arena</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active or Completed Tournament View
  const nextMatchInfo = TournamentManager.getNextPendingMatch(tournament);

  return (
    <div className="tournament-container">
      {/* Tournament Top Toolbar */}
      <div className="tournament-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', color: 'var(--text-primary)' }}>
            {tournament.title}
          </h2>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>Format: {tournament.type.toUpperCase()}</span>
            <span>•</span>
            <span style={{ color: '#fbbf24' }}>
              Mode: {tournament.gameMode === 'mutators' ? '🎲 CHAOS DRAFT' : tournament.gameMode === 'fog_of_war' ? '🌫️ FOG OF WAR' : 'CLASSICAL'}
            </span>
            <span>•</span>
            <span>Contestants: {tournament.models.length}</span>
            <span>•</span>
            <span style={{ color: 'var(--neon-cyan)' }}>Status: {tournament.status.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {tournament.status !== 'completed' && nextMatchInfo && (
            <>
              <button
                className="btn btn-primary"
                onClick={() =>
                  onLaunchMatch(
                    nextMatchInfo.match,
                    nextMatchInfo.roundIndex,
                    nextMatchInfo.matchIndex
                  )
                }
              >
                <Play size={16} />
                <span>Play Next Duel</span>
              </button>

              <button
                className={`btn ${isAutoRunning ? 'btn-danger' : 'btn-secondary'}`}
                onClick={onAutoRunToggle}
              >
                <Sparkles size={16} />
                <span>{isAutoRunning ? 'Pause Auto-Run' : 'Auto-Run Tournament'}</span>
              </button>
            </>
          )}

          <button className="btn btn-secondary" onClick={onResetTournament}>
            <RotateCcw size={16} />
            <span>New Tournament</span>
          </button>
        </div>
      </div>

      {/* Champion Crowning Podium if Completed */}
      {tournament.status === 'completed' && tournament.winner && (
        <div
          className="card-panel"
          style={{
            textAlign: 'center',
            padding: '36px',
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.15), rgba(15, 23, 42, 0.9))',
            borderColor: 'var(--neon-amber)',
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.3)',
          }}
        >
          <Trophy size={54} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '32px',
              color: '#fbbf24',
              marginBottom: '6px',
            }}
          >
            TOURNAMENT CHAMPION
          </h1>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '8px 0' }}>
            {tournament.winner.avatar} {tournament.winner.name}
          </div>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto', fontSize: '14px' }}>
            {tournament.winner.description}
          </p>
        </div>
      )}

      {/* Knockout Bracket View */}
      {tournament.type === 'knockout' ? (
        <div className="card-panel" style={{ overflowX: 'auto' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Layers size={18} color="var(--neon-cyan)" />
              <span>Championship Bracket Tree</span>
            </div>
          </div>

          <div className="bracket-tree-wrapper">
            {tournament.rounds.map((round, rIdx) => (
              <div key={round.roundNumber} className="bracket-round-col">
                <div className="bracket-round-title">{round.name}</div>
                {round.matches.map((match, mIdx) => {
                  const isLive =
                    match.status === 'live' ||
                    (nextMatchInfo?.roundIndex === rIdx && nextMatchInfo?.matchIndex === mIdx);

                  return (
                    <div
                      key={match.id}
                      className={`bracket-match-card ${isLive ? 'live-match' : ''}`}
                    >
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Match #{mIdx + 1}</span>
                        {isLive && <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>LIVE</span>}
                      </div>

                      {/* White Slot */}
                      <div className={`match-slot ${match.winner?.id === match.white?.id && match.winner ? 'winner' : ''}`}>
                        <span>
                          {match.white ? `${match.white.avatar} ${match.white.name}` : 'TBD'}
                        </span>
                      </div>

                      {/* Black Slot */}
                      <div className={`match-slot ${match.winner?.id === match.black?.id && match.winner ? 'winner' : ''}`}>
                        <span>
                          {match.black ? `${match.black.avatar} ${match.black.name}` : 'TBD'}
                        </span>
                      </div>

                      {/* Status / Trigger */}
                      {match.status === 'pending' && match.white && match.black && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px', fontSize: '11px', marginTop: '4px' }}
                          onClick={() => onLaunchMatch(match, rIdx, mIdx)}
                        >
                          Play Match
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Round Robin Standings View */
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Award size={18} color="var(--neon-cyan)" />
              <span>League Standings</span>
            </div>
          </div>

          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Played</th>
                <th>Won</th>
                <th>Drawn</th>
                <th>Lost</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {tournament.standings.map((s, idx) => (
                <tr key={s.modelId}>
                  <td style={{ fontFamily: 'var(--font-heading)', color: idx === 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                    #{idx + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                      <span>{s.avatar}</span>
                      <span>{s.modelName}</span>
                    </div>
                  </td>
                  <td>{s.played}</td>
                  <td style={{ color: '#34d399' }}>{s.won}</td>
                  <td>{s.drawn}</td>
                  <td style={{ color: '#f43f5e' }}>{s.lost}</td>
                  <td>
                    <strong style={{ color: 'var(--neon-cyan)', fontSize: '16px' }}>{s.points}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
