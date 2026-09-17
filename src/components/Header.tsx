import React from 'react';
import { Swords, Trophy, BarChart3, Settings, Zap } from 'lucide-react';

export type ActiveTab = 'arena' | 'tournament' | 'leaderboard' | 'settings';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isGameActive: boolean;
  isTournamentActive: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  isGameActive,
  isTournamentActive,
}) => {
  return (
    <header className="app-header">
      <div className="brand-logo">
        <div className="brand-icon-wrapper">
          <Swords size={24} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="brand-title">AI Showdown</span>
            <span className="brand-badge">2026 ARENA</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            LLM BENCHMARK & TOOL-CALL ARENA
          </div>
        </div>
      </div>

      <nav className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'arena' ? 'active' : ''}`}
          onClick={() => onSelectTab('arena')}
        >
          <Swords size={16} />
          <span>1v1 Duel</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'tournament' ? 'active' : ''}`}
          onClick={() => onSelectTab('tournament')}
        >
          <Trophy size={16} />
          <span>Tournament</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => onSelectTab('leaderboard')}
        >
          <BarChart3 size={16} />
          <span>Leaderboard</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectTab('settings')}
        >
          <Settings size={16} />
          <span>API Keys</span>
        </button>
      </nav>

      <div>
        {isTournamentActive ? (
          <div className="header-status-badge" style={{ borderColor: 'var(--neon-amber)', color: 'var(--neon-amber)' }}>
            <div className="status-dot active" style={{ backgroundColor: 'var(--neon-amber)' }} />
            <span>TOURNAMENT LIVE</span>
          </div>
        ) : isGameActive ? (
          <div className="header-status-badge">
            <div className="status-dot active" />
            <span>MATCH LIVE</span>
          </div>
        ) : (
          <div className="header-status-badge" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
            <Zap size={13} />
            <span>STANDBY</span>
          </div>
        )}
      </div>
    </header>
  );
};
