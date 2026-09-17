import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Flag,
  Volume2,
  VolumeX,
  FastForward,
  Eye,
  EyeOff,
  Sparkles,
  CloudFog,
} from 'lucide-react';
import { ModelConfig, TimeControl, GameMode, SpectatorVision, AVAILABLE_MODIFIERS } from '../types';
import { SpeedMode } from '../services/GameOrchestrator';
import { AlgorithmEngine } from '../services/algorithmEngine';

const isAlgo = (m?: ModelConfig | null) =>
  !!m && (m.provider === 'algorithm' || AlgorithmEngine.isAlgorithmModel(m.id));

interface ArenaControlsProps {
  matchId?: string;
  models: ModelConfig[];
  whiteModel: ModelConfig;
  blackModel: ModelConfig;
  timeControl: TimeControl;
  speedMode: SpeedMode;
  gameMode: GameMode;
  spectatorVision?: SpectatorVision;
  whiteModifiers?: string[];
  blackModifiers?: string[];
  audioEnabled: boolean;
  gameStatus: 'idle' | 'active' | 'paused' | 'stepping' | 'finished';
  onSelectWhite: (model: ModelConfig) => void;
  onSelectBlack: (model: ModelConfig) => void;
  onSelectTimeControl: (tc: TimeControl) => void;
  onSetSpeedMode: (mode: SpeedMode) => void;
  onSetGameMode: (mode: GameMode) => void;
  onSetSpectatorVision?: (vision: SpectatorVision) => void;
  onSetWhiteModifiers?: (mods: string[]) => void;
  onSetBlackModifiers?: (mods: string[]) => void;
  onToggleAudio: () => void;
  onStartGame: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onStepMove: () => void;
  onForfeit: () => void;
  onResetGame: () => void;
}

const TIME_CONTROLS: TimeControl[] = [
  { name: 'Bullet 1+0', baseSeconds: 60, incrementSeconds: 0 },
  { name: 'Bullet 2+1', baseSeconds: 120, incrementSeconds: 1 },
  { name: 'Blitz 3+0', baseSeconds: 180, incrementSeconds: 0 },
  { name: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 },
  { name: 'Blitz 5+3', baseSeconds: 300, incrementSeconds: 3 },
  { name: 'Rapid 10+0', baseSeconds: 600, incrementSeconds: 0 },
];

export const ArenaControls: React.FC<ArenaControlsProps> = ({
  matchId,
  models,
  whiteModel,
  blackModel,
  timeControl,
  speedMode,
  gameMode,
  spectatorVision = 'all',
  whiteModifiers = [],
  blackModifiers = [],
  audioEnabled,
  gameStatus,
  onSelectWhite,
  onSelectBlack,
  onSelectTimeControl,
  onSetSpeedMode,
  onSetGameMode,
  onSetSpectatorVision,
  onSetWhiteModifiers,
  onSetBlackModifiers,
  onToggleAudio,
  onStartGame,
  onPauseGame,
  onResumeGame,
  onStepMove,
  onForfeit,
  onResetGame,
}) => {
  const isPlaying = gameStatus === 'active';
  const isPaused = gameStatus === 'paused';
  const isIdle = gameStatus === 'idle' || gameStatus === 'finished';

  return (
    <div className="card-panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Match Deck</span>
          {matchId && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--neon-cyan)',
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
              title={`Match ID: ${matchId}`}
            >
              #{matchId.replace(/^match_/, '').slice(0, 10)}
            </span>
          )}
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 8px' }}
          onClick={onToggleAudio}
          title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
        >
          {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} color="#f43f5e" />}
        </button>
      </div>

      {/* Game Mode Selector */}
      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} color="var(--neon-cyan)" />
          <span>Game Mode</span>
        </label>
        <select
          className="select-input"
          value={gameMode}
          onChange={(e) => onSetGameMode(e.target.value as GameMode)}
          disabled={!isIdle}
          style={{ borderColor: gameMode !== 'standard' ? 'var(--neon-cyan)' : undefined }}
        >
          <option value="standard">Standard Classical Chess</option>
          <option value="mutators">🎲 Chaos Draft (Mutators Auto-Battler)</option>
          <option value="fog_of_war">🌫️ Fog of War (Kriegspiel Radar)</option>
        </select>
      </div>

      {/* Draftable Mutator Modifiers Deck */}
      {gameMode === 'mutators' && (
        <div className="form-group" style={{ background: 'rgba(245, 158, 11, 0.06)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} />
              <span>Draft Cards (Max 3 / Bot)</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '2px 6px', fontSize: '10px' }}
              onClick={() => {
                const shuffled = [...AVAILABLE_MODIFIERS].sort(() => Math.random() - 0.5);
                const wMods = shuffled.slice(0, 3).map((m) => m.id);
                const bMods = shuffled.slice(3, 6).map((m) => m.id);
                if (onSetWhiteModifiers) onSetWhiteModifiers(wMods);
                if (onSetBlackModifiers) onSetBlackModifiers(bMods);
              }}
              title="Randomize 3 wild draft cards for both bots"
              disabled={!isIdle}
            >
              🎲 Auto Draft
            </button>
          </div>

          {/* White Draft */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, marginBottom: '4px' }}>
              ⚪ WHITE'S CARDS ({whiteModifiers.length}/3):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {AVAILABLE_MODIFIERS.map((mod) => {
                const active = whiteModifiers.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    disabled={!isIdle}
                    onClick={() => {
                      if (!onSetWhiteModifiers) return;
                      if (active) {
                        if (whiteModifiers.length > 1) {
                          onSetWhiteModifiers(whiteModifiers.filter((id) => id !== mod.id));
                        }
                      } else {
                        if (whiteModifiers.length < 3) {
                          onSetWhiteModifiers([...whiteModifiers, mod.id]);
                        } else {
                          onSetWhiteModifiers([...whiteModifiers.slice(1), mod.id]);
                        }
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      borderRadius: '4px',
                      cursor: isIdle ? 'pointer' : 'default',
                      background: active ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0,0,0,0.3)',
                      border: `1px solid ${active ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? '#ffffff' : 'var(--text-muted)',
                    }}
                    title={mod.description}
                  >
                    <span>{mod.icon}</span>
                    <span>{mod.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Black Draft */}
          <div>
            <div style={{ fontSize: '10px', color: '#c084fc', fontWeight: 700, marginBottom: '4px' }}>
              ⚫ BLACK'S CARDS ({blackModifiers.length}/3):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {AVAILABLE_MODIFIERS.map((mod) => {
                const active = blackModifiers.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    disabled={!isIdle}
                    onClick={() => {
                      if (!onSetBlackModifiers) return;
                      if (active) {
                        if (blackModifiers.length > 1) {
                          onSetBlackModifiers(blackModifiers.filter((id) => id !== mod.id));
                        }
                      } else {
                        if (blackModifiers.length < 3) {
                          onSetBlackModifiers([...blackModifiers, mod.id]);
                        } else {
                          onSetBlackModifiers([...blackModifiers.slice(1), mod.id]);
                        }
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      borderRadius: '4px',
                      cursor: isIdle ? 'pointer' : 'default',
                      background: active ? 'rgba(192, 132, 252, 0.25)' : 'rgba(0,0,0,0.3)',
                      border: `1px solid ${active ? '#c084fc' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? '#ffffff' : 'var(--text-muted)',
                    }}
                    title={mod.description}
                  >
                    <span>{mod.icon}</span>
                    <span>{mod.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fog of War Spectator Vision Controls */}
      {gameMode === 'fog_of_war' && onSetSpectatorVision && (
        <div className="form-group" style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
          <label className="form-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--neon-cyan)', margin: 0 }}>
            <CloudFog size={13} />
            <span>Spectator Radar Vision</span>
          </label>
          <div className="vision-toggle-bar">
            <button
              type="button"
              className={`vision-btn ${spectatorVision === 'all' ? 'active' : ''}`}
              onClick={() => onSetSpectatorVision('all')}
              title="God Mode: View entire board with fog overlay"
            >
              <Eye size={12} />
              <span>Omniscient</span>
            </button>
            <button
              type="button"
              className={`vision-btn ${spectatorVision === 'w' ? 'active' : ''}`}
              onClick={() => onSetSpectatorVision('w')}
              title="See strictly what White sees"
            >
              <span>⚪ White Radar</span>
            </button>
            <button
              type="button"
              className={`vision-btn ${spectatorVision === 'b' ? 'active' : ''}`}
              onClick={() => onSetSpectatorVision('b')}
              title="See strictly what Black sees"
            >
              <span>⚫ Black Radar</span>
            </button>
          </div>
        </div>
      )}

      {/* Model Selection */}
      <div className="form-group">
        <label className="form-label">White (Agent 1)</label>
        <select
          className="select-input"
          value={whiteModel.id}
          onChange={(e) => {
            const m = models.find((mod) => mod.id === e.target.value);
            if (m) {
              if (isAlgo(m) && isAlgo(blackModel)) {
                const firstAI = models.find((mod) => !isAlgo(mod));
                if (firstAI) onSelectBlack(firstAI);
              }
              onSelectWhite(m);
            }
          }}
          disabled={!isIdle}
        >
          {models.map((m) => {
            const blocked = isAlgo(m) && isAlgo(blackModel);
            return (
              <option key={m.id} value={m.id} disabled={blocked}>
                {m.name} {blocked ? '(Algo vs Algo not allowed)' : m.isSimulated ? '(Simulated)' : `[${m.provider}]`}
              </option>
            );
          })}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Black (Agent 2)</label>
        <select
          className="select-input"
          value={blackModel.id}
          onChange={(e) => {
            const m = models.find((mod) => mod.id === e.target.value);
            if (m) {
              if (isAlgo(m) && isAlgo(whiteModel)) {
                const firstAI = models.find((mod) => !isAlgo(mod));
                if (firstAI) onSelectWhite(firstAI);
              }
              onSelectBlack(m);
            }
          }}
          disabled={!isIdle}
        >
          {models.map((m) => {
            const blocked = isAlgo(m) && isAlgo(whiteModel);
            return (
              <option key={m.id} value={m.id} disabled={blocked}>
                {m.name} {blocked ? '(Algo vs Algo not allowed)' : m.isSimulated ? '(Simulated)' : `[${m.provider}]`}
              </option>
            );
          })}
        </select>
      </div>

      {/* Time Control */}
      <div className="form-group">
        <label className="form-label">Time Control</label>
        <select
          className="select-input"
          value={timeControl.name}
          onChange={(e) => {
            const tc = TIME_CONTROLS.find((t) => t.name === e.target.value);
            if (tc) onSelectTimeControl(tc);
          }}
          disabled={!isIdle}
        >
          {TIME_CONTROLS.map((tc) => (
            <option key={tc.name} value={tc.name}>
              {tc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Speed Selector */}
      <div className="form-group">
        <label className="form-label">Execution Speed</label>
        <div className="speed-buttons">
          <button
            className={`speed-btn ${speedMode === '1x' ? 'active' : ''}`}
            onClick={() => onSetSpeedMode('1x')}
          >
            1x (Real)
          </button>
          <button
            className={`speed-btn ${speedMode === '0.5s' ? 'active' : ''}`}
            onClick={() => onSetSpeedMode('0.5s')}
          >
            Fast (0.5s)
          </button>
          <button
            className={`speed-btn ${speedMode === 'instant' ? 'active' : ''}`}
            onClick={() => onSetSpeedMode('instant')}
          >
            <FastForward size={11} style={{ display: 'inline', marginRight: '3px' }} />
            Turbo
          </button>
        </div>
      </div>

      {/* Game Action Buttons */}
      <div className="controls-grid" style={{ marginTop: '16px' }}>
        {isIdle ? (
          <button
            className="btn btn-primary"
            style={{ gridColumn: 'span 2' }}
            onClick={onStartGame}
          >
            <Play size={16} />
            <span>Start Duel</span>
          </button>
        ) : isPlaying ? (
          <>
            <button className="btn btn-secondary" onClick={onPauseGame}>
              <Pause size={15} />
              <span>Pause</span>
            </button>
            <button className="btn btn-danger" onClick={onForfeit}>
              <Flag size={15} />
              <span>Forfeit</span>
            </button>
          </>
        ) : isPaused ? (
          <>
            <button className="btn btn-primary" onClick={onResumeGame}>
              <Play size={15} />
              <span>Resume</span>
            </button>
            <button className="btn btn-secondary" onClick={onStepMove} title="Execute single move step">
              <span>Step ➔</span>
            </button>
          </>
        ) : null}

        <button
          className="btn btn-secondary"
          style={{ gridColumn: 'span 2', marginTop: '4px' }}
          onClick={onResetGame}
        >
          <RotateCcw size={15} />
          <span>Reset Match</span>
        </button>
      </div>
    </div>
  );
};
