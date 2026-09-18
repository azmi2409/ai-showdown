import React from 'react';
import { X, Sparkles, BookOpen, Swords, ShieldAlert } from 'lucide-react';
import { GameMode } from '../types';

interface GameModeInfo {
  id: GameMode;
  name: string;
  icon: string;
  tagline: string;
  summary: string;
  rules: string[];
  tips: string;
}

export const GAME_MODE_DETAILS: Record<GameMode, GameModeInfo> = {
  standard: {
    id: 'standard',
    name: 'Standard Classical Chess',
    icon: '♟️',
    tagline: 'Pure positional calculation and tactical mastery',
    summary: 'The classic game of chess played under standard FIDE rules with standard piece movement, checks, and checkmate.',
    rules: [
      'Win by checkmating the opponent King or on time.',
      'En passant, castling, and standard pawn promotion rules apply.',
      'Draws occur via stalemate, threefold repetition, 50-move rule, or insufficient material.',
    ],
    tips: 'Focus on king safety, central pawn control, and harmonious piece development.',
  },
  duck_chess: {
    id: 'duck_chess',
    name: 'Duck Chess',
    icon: '🦆',
    tagline: 'No check, no checkmate — King capture wins instantly',
    summary: 'A neutral rubber duck sits on the board. Neither player can land on or move through the duck (only Knights can leap over it). After making a chess move, the player relocates the duck to any empty square.',
    rules: [
      'No check or checkmate exists — Kings can and must be captured directly to win!',
      'Moving the duck is mandatory after every move to block enemy lines.',
      'The duck acts as a solid obstruction for all sliding pieces (Queen, Rook, Bishop, Pawns).',
    ],
    tips: 'Use the duck to seal off enemy attackers or trap the enemy King for a direct decapitation capture.',
  },
  crazyhouse: {
    id: 'crazyhouse',
    name: 'Crazyhouse',
    icon: '📦',
    tagline: 'Captured enemy pieces enter your reserve to be dropped anywhere',
    summary: 'Every piece captured changes to your color and joins your reserve inventory. Instead of moving an active piece, you can drop any reserve piece onto any vacant square.',
    rules: [
      'Capturing an enemy piece adds that piece in your color to your hand.',
      'A drop move (e.g. N@f6, P@e4) counts as your complete turn.',
      'Pawns may be dropped on ranks 2 through 7 (cannot be dropped on rank 1 or 8).',
      'Dropped pieces can deliver checks, block checks, or create immediate mating nets.',
    ],
    tips: 'Prioritize tactical checks by dropping reserve units directly next to the opposing King.',
  },
  atomic_chess: {
    id: 'atomic_chess',
    name: 'Atomic Chess',
    icon: '💥',
    tagline: 'Nuclear 3x3 shockwave on every capture',
    summary: 'Every capture triggers a cataclysmic 3x3 blast wave around the capture square. The capturing piece, captured piece, and all adjacent non-pawn pieces are vaporized.',
    rules: [
      'Every capture detonates an explosion on the target square.',
      'Capturing piece, captured piece, and all adjacent non-pawns are instantly destroyed.',
      'Pawns in the blast radius survive the shockwave.',
      'Detonating an explosion touching the enemy King wins immediately!',
      'King suicide is illegal: you cannot make a capture if your own King is inside the blast radius.',
      'Kings can touch each other because neither King can capture without dying in the blast.',
    ],
    tips: 'Sacrifice major pieces into any defended square adjacent to the enemy King to trigger a lethal blast.',
  },
  spell_draft: {
    id: 'spell_draft',
    name: 'Spell Draft',
    icon: '✨',
    tagline: 'Draft tactical spell cards to warp reality alongside chess moves',
    summary: 'Both commanders hold mystical spell cards. Players can cast a spell before or alongside their chess move to manipulate the board state.',
    rules: [
      'Frost Freeze: Paralyzes a target enemy piece, preventing it from moving on the next turn.',
      'Catapult Knight: Launches an active Knight into enemy territory (ranks 4–6) for sudden forks.',
      'Swap Pawns: Instantly exchanges positions of any two friendly pawns.',
      'Resurrection: Revives a lost pawn back onto an open back-rank square.',
      'Spells can be cast using the cast_spell tool or embedded directly in make_move.',
    ],
    tips: 'Do not hoard spells — early freezes on enemy pieces or catapult attacks can win the match in the opening.',
  },
  mutators: {
    id: 'mutators',
    name: 'Chaos Draft (Mutators)',
    icon: '🎲',
    tagline: 'Auto-battler modifiers with linked quantum portals and special powers',
    summary: 'Custom board modifiers and drafted hero perks alter standard physics, including connected teleport portals and capture bonuses.',
    rules: [
      'Quantum Portals: Squares d4 and e5 are permanently linked. Moving to d4 teleports the piece to e5 (if empty), and vice versa.',
      'Bounty Hunter: Every piece capture awards +15 seconds on your digital clock.',
      'Exploding Rooks: Rook captures trigger a shockwave vaporizing adjacent enemy pawns.',
      'Vampire Queen: Queen captures resurrect a fallen friendly pawn onto the back rank.',
    ],
    tips: 'Path your Knights and Bishops through the d4/e5 portal for surprise flanking attacks on the enemy camp.',
  },
  fog_of_war: {
    id: 'fog_of_war',
    name: 'Fog of War (Kriegspiel)',
    icon: '🌫️',
    tagline: 'Imperfect information — scout radar illuminates the board',
    summary: 'Players only see squares illuminated by their own pieces. Hidden enemy positions are shrouded in fog and marked as [?].',
    rules: [
      'Vision cones are determined strictly by piece movement lines.',
      'Enemy pieces in the fog cannot be seen until illuminated or captured.',
      'Players must deduce unseen threats and scout ahead before advancing.',
    ],
    tips: 'Advance pawns and develop knights to widen your radar vision and avoid surprise ambushes.',
  },
};

interface GameModeModalProps {
  gameMode: GameMode;
  onClose: () => void;
  onSelectMode?: (mode: GameMode) => void;
}

export const GameModeModal: React.FC<GameModeModalProps> = ({
  gameMode,
  onClose,
  onSelectMode,
}) => {
  const current = GAME_MODE_DETAILS[gameMode] || GAME_MODE_DETAILS.standard;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', padding: '24px' }}
      >
        {/* Header */}
        <div className="panel-header" style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>{current.icon}</span>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                {current.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--neon-cyan)', fontWeight: 500 }}>
                {current.tagline}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '13px',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            {current.summary}
          </div>

          {/* Rules List */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <BookOpen size={14} color="var(--neon-cyan)" />
              <span>Core Rules & Mechanics</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {current.rules.map((rule, idx) => (
                <li key={idx} style={{ fontSize: '13px', color: '#f1f5f9', lineHeight: 1.45 }}>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Tactical Advice */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            <Swords size={18} color="var(--neon-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--neon-cyan)', marginBottom: '2px' }}>
                Tactical Strategy
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4 }}>
                {current.tips}
              </div>
            </div>
          </div>

          {/* All Modes Quick Navigation */}
          {onSelectMode && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>
                Explore Other Variants
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(Object.keys(GAME_MODE_DETAILS) as GameMode[]).map((modeKey) => {
                  const info = GAME_MODE_DETAILS[modeKey];
                  const isActive = modeKey === gameMode;
                  return (
                    <button
                      key={modeKey}
                      type="button"
                      className="btn"
                      onClick={() => onSelectMode(modeKey)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: isActive ? 'var(--neon-cyan)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#050814' : 'var(--text-secondary)',
                        fontWeight: isActive ? 700 : 500,
                        border: '1px solid',
                        borderColor: isActive ? 'var(--neon-cyan)' : 'var(--border-subtle)',
                        borderRadius: '6px',
                      }}
                    >
                      {info.icon} {info.name.split(' (')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
