import React from 'react';
import { ModelConfig, AVAILABLE_MODIFIERS, AVAILABLE_SPELLS } from '../types';

interface PlayerPanelProps {
  model: ModelConfig;
  color: 'white' | 'black';
  isTurn: boolean;
  timeRemainingMs: number;
  capturedPieces: string[];
  materialDelta: number; // positive = this player leads
  isThinking?: boolean;
  thoughtText?: string;
  modifiers?: string[];
  spells?: string[];
}

const PIECE_SYMBOLS: Record<string, string> = {
  P: '♟',
  N: '♞',
  B: '♝',
  R: '♜',
  Q: '♛',
};

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  model,
  color,
  isTurn,
  timeRemainingMs,
  capturedPieces,
  materialDelta,
  isThinking,
  thoughtText,
  modifiers,
  spells,
}) => {
  // Format clock: MM:SS.s or SS.ss if under 10 seconds
  const totalSeconds = Math.max(0, timeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);

  const formattedTime =
    totalSeconds < 10
      ? `${seconds.toString().padStart(2, '0')}.${Math.floor((totalSeconds % 1) * 100)
          .toString()
          .padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;

  const isLowTime = totalSeconds < 30 && totalSeconds > 0;

  return (
    <div className={`player-panel ${isTurn ? 'active-turn' : ''}`}>
      <div className="player-identity">
        <div
          className="player-avatar"
          style={{ borderColor: model.badgeColor || 'var(--border-subtle)' }}
        >
          {model.avatar || (color === 'white' ? '⚪' : '⚫')}
        </div>
        <div className="player-meta">
          <div className="player-name">
            <span>{model.name}</span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: color === 'white' ? '#f8fafc' : '#94a3b8',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {color.toUpperCase()}
            </span>
          </div>
          <div className="player-style">{model.playStyle}</div>

          {/* Drafted Mutator Badges */}
          {modifiers && modifiers.length > 0 && (
            <div className="modifier-badge-list">
              {modifiers.map((modId) => {
                const mod = AVAILABLE_MODIFIERS.find((m) => m.id === modId);
                if (!mod) return null;
                return (
                  <span key={modId} className="modifier-chip" title={mod.description}>
                    <span>{mod.icon}</span>
                    <span>{mod.name}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Drafted Spells Badges */}
          {spells && spells.length > 0 && (
            <div className="modifier-badge-list">
              {spells.map((spellId, sIdx) => {
                const sp = AVAILABLE_SPELLS.find((s) => s.id === spellId);
                if (!sp) return null;
                return (
                  <span
                    key={`${spellId}_${sIdx}`}
                    className="modifier-chip"
                    style={{ background: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.4)', color: '#f472b6' }}
                    title={sp.description}
                  >
                    <span>{sp.icon}</span>
                    <span>{sp.name}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Live Thinking Status & Thought Bubble */}
          {isThinking && (
            <div className="calculating-badge">
              <span className="calculating-dot" />
              <span>Calculating move...</span>
            </div>
          )}

          {!isThinking && thoughtText && (
            <div
              className="player-thought-bubble"
              title={thoughtText}
            >
              💭 "{thoughtText}"
            </div>
          )}

          {/* Captured Pieces Tray */}
          <div className="captured-tray">
            {capturedPieces.map((p, idx) => (
              <span key={idx} className="captured-piece" title={p}>
                {PIECE_SYMBOLS[p] || p}
              </span>
            ))}
            {materialDelta > 0 && (
              <span className="material-delta">+{materialDelta}</span>
            )}
          </div>
        </div>
      </div>

      {/* Digital Chess Clock */}
      <div
        className={`chess-clock ${isTurn ? 'active' : ''} ${
          isLowTime ? 'low-time' : ''
        }`}
      >
        {formattedTime}
      </div>
    </div>
  );
};
