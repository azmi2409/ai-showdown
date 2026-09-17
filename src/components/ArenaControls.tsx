import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Flag,
  Volume2,
  VolumeX,
  FastForward,
  SkipForward,
} from 'lucide-react';
import { ModelConfig, TimeControl } from '../types';
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
  audioEnabled: boolean;
  gameStatus: 'idle' | 'active' | 'paused' | 'stepping' | 'finished';
  onSelectWhite: (model: ModelConfig) => void;
  onSelectBlack: (model: ModelConfig) => void;
  onSelectTimeControl: (tc: TimeControl) => void;
  onSetSpeedMode: (mode: SpeedMode) => void;
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
  audioEnabled,
  gameStatus,
  onSelectWhite,
  onSelectBlack,
  onSelectTimeControl,
  onSetSpeedMode,
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
            <button className="btn btn-secondary" onClick={onStepMove}>
              <SkipForward size={15} />
              <span>Step</span>
            </button>
          </>
        ) : null}

        {/* Reset / Rematch */}
        <button
          className="btn btn-secondary"
          style={{ gridColumn: 'span 2', marginTop: '6px' }}
          onClick={onResetGame}
        >
          <RotateCcw size={14} />
          <span>Reset Board</span>
        </button>
      </div>
    </div>
  );
};
