import React, { useEffect, useState, useRef } from 'react';
import { Swords, Zap, Play, Pause, Trophy } from 'lucide-react';
import { ModelConfig } from '../types';
import { audioService } from '../services/audioService';

export interface TournamentIntroOverlayProps {
  isOpen: boolean;
  roundName: string;
  matchIndex: number;
  totalMatchesInRound?: number;
  tournamentTitle: string;
  whiteModel: ModelConfig;
  blackModel: ModelConfig;
  onStartMatch: () => void;
  onCancel: () => void;
}

export const TournamentIntroOverlay: React.FC<TournamentIntroOverlayProps> = ({
  isOpen,
  roundName,
  matchIndex,
  totalMatchesInRound,
  tournamentTitle,
  whiteModel,
  blackModel,
  onStartMatch,
  onCancel,
}) => {
  const [countdown, setCountdown] = useState(3);
  const onStartMatchRef = useRef(onStartMatch);
  onStartMatchRef.current = onStartMatch;

  useEffect(() => {
    if (!isOpen) return;

    setCountdown(3);
    // Play dramatic start chime once per open
    try {
      audioService.playCheck();
    } catch {}

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onStartMatchRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const stageLabel = roundName.toUpperCase();
  const matchLabel = totalMatchesInRound
    ? `MATCH ${matchIndex + 1} OF ${totalMatchesInRound}`
    : `MATCH ${matchIndex + 1}`;

  return (
    <div className="modal-overlay intro-overlay-backdrop">
      <div className="intro-container">
        {/* Top Header Badge */}
        <div className="intro-header">
          <div className="intro-badge">
            <Trophy size={14} color="#f59e0b" />
            <span>{tournamentTitle.toUpperCase()}</span>
            <span>•</span>
            <span style={{ color: '#fbbf24', fontWeight: 800 }}>{stageLabel}</span>
            <span>•</span>
            <span style={{ color: 'var(--text-muted)' }}>{matchLabel}</span>
          </div>
          <h1 className="intro-stage-title">{stageLabel} SHOWDOWN</h1>
        </div>

        {/* Versus Battle Arena */}
        <div className="intro-versus-arena">
          {/* White Fighter */}
          <div className="intro-fighter-card white-fighter">
            <div className="fighter-side-tag">WHITE • FIRST MOVE</div>
            <div className="fighter-avatar-box">
              <span className="fighter-avatar">{whiteModel.avatar}</span>
            </div>
            <h2 className="fighter-name">{whiteModel.name}</h2>
            <div className="fighter-meta">
              <span className="elo-badge">{whiteModel.simulatedElo || 2500} ELO</span>
              <span className="provider-badge">{whiteModel.provider.toUpperCase()}</span>
            </div>
            <p className="fighter-style">{whiteModel.playStyle}</p>
          </div>

          {/* Center VS Emblem & Countdown */}
          <div className="intro-center-clash">
            <div className="vs-emblem">
              <Swords size={38} className="vs-icon" />
              <div className="vs-text">VS</div>
            </div>

            <div className="intro-countdown-wrapper">
              <div className="intro-countdown-number">{countdown > 0 ? countdown : 'GO!'}</div>
              <div className="intro-countdown-label">
                {countdown > 0 ? `STARTING IN ${countdown}s` : 'LAUNCHING ARENA...'}
              </div>
            </div>

            <div className="intro-actions">
              <button className="btn btn-primary intro-btn" onClick={onStartMatch}>
                <Play size={15} />
                <span>Fight Now</span>
              </button>
              <button className="btn btn-secondary intro-btn" onClick={onCancel}>
                <Pause size={15} />
                <span>Pause</span>
              </button>
            </div>
          </div>

          {/* Black Fighter */}
          <div className="intro-fighter-card black-fighter">
            <div className="fighter-side-tag black-tag">BLACK • COUNTER-ATTACK</div>
            <div className="fighter-avatar-box black-avatar-box">
              <span className="fighter-avatar">{blackModel.avatar}</span>
            </div>
            <h2 className="fighter-name">{blackModel.name}</h2>
            <div className="fighter-meta">
              <span className="elo-badge">{blackModel.simulatedElo || 2500} ELO</span>
              <span className="provider-badge">{blackModel.provider.toUpperCase()}</span>
            </div>
            <p className="fighter-style">{blackModel.playStyle}</p>
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="intro-footer">
          <Zap size={14} color="var(--neon-cyan)" />
          <span>Winner advances to next bracket tier. Clock rules apply.</span>
        </div>
      </div>
    </div>
  );
};
