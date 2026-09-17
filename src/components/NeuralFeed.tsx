import React, { useState, useEffect, useRef } from 'react';
import { Cpu, AlertCircle, ExternalLink, Code2, Brain, ChevronDown, ChevronRight, Columns, Layers } from 'lucide-react';
import { ModelConfig, NeuralLogEntry } from '../types';
import { PromptInspectorModal } from './PromptInspectorModal';

interface NeuralFeedProps {
  logs: NeuralLogEntry[];
  activeThinking?: { side: 'w' | 'b' | null; modelName: string; thoughtText?: string };
  whiteModel?: ModelConfig;
  blackModel?: ModelConfig;
}

type FeedTab = 'split' | 'all' | 'white' | 'black';

export const NeuralFeed: React.FC<NeuralFeedProps> = ({
  logs,
  activeThinking,
  whiteModel,
  blackModel,
}) => {
  const [selectedLog, setSelectedLog] = useState<NeuralLogEntry | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('split');
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const whiteScrollRef = useRef<HTMLDivElement>(null);
  const blackScrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to top on new moves or streaming tokens so newest updates are immediately visible
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (whiteScrollRef.current) whiteScrollRef.current.scrollTop = 0;
    if (blackScrollRef.current) blackScrollRef.current.scrollTop = 0;
  }, [logs.length, activeThinking?.side]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedThinkingIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Reverse feeds so newest moves/chats appear at the top
  const whiteLogs = [...logs].filter((l) => l.turn === 'w').reverse();
  const blackLogs = [...logs].filter((l) => l.turn === 'b').reverse();
  const allLogsReversed = [...logs].reverse();

  const renderLogCard = (log: NeuralLogEntry) => {
    const hasIllegal = log.illegalAttempts > 0;
    const makeMoveCall = log.toolCalls.find((t) => t.name === 'make_move');
    const reasoning = makeMoveCall?.arguments?.reasoning;
    const fullThinking = log.textContent;
    const isExpanded = !!expandedThinkingIds[log.id];
    const isWhite = log.turn === 'w';

    return (
      <div
        key={log.id}
        className={`neural-log-card ${hasIllegal ? 'illegal-alert' : ''}`}
        style={{
          cursor: 'pointer',
          borderLeft: `3px solid ${isWhite ? 'var(--neon-cyan)' : 'var(--neon-violet)'}`,
          marginBottom: '10px',
        }}
        onClick={() => setSelectedLog(log)}
        title="Click to inspect telemetry details"
      >
        <div className="log-header">
          <div className="log-author">
            <span>{log.avatar}</span>
            <span style={{ color: isWhite ? '#38bdf8' : '#c084fc', fontWeight: 700, fontSize: '12px' }}>
              {log.modelName}
            </span>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor: isWhite ? 'rgba(56, 189, 248, 0.15)' : 'rgba(192, 132, 252, 0.15)',
                color: isWhite ? '#38bdf8' : '#c084fc',
              }}
            >
              #{log.moveNumber} {isWhite ? 'WHITE' : 'BLACK'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {hasIllegal && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  color: '#f43f5e',
                  fontSize: '10px',
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={11} />
                ILLEGAL
              </span>
            )}

            {log.finalMove && <span className="log-move-badge">{log.finalMove}</span>}

            <ExternalLink size={12} color="var(--text-muted)" />
          </div>
        </div>

        {/* Short Move Reason */}
        {reasoning && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-primary)',
              lineHeight: '1.4',
              marginBottom: '6px',
              padding: '6px 8px',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '4px',
              borderLeft: `2px solid ${isWhite ? 'var(--neon-cyan)' : 'var(--neon-violet)'}`,
            }}
          >
            💬 "{reasoning}"
          </div>
        )}

        {/* Expandable Step-by-Step Thinking Chain */}
        {fullThinking && fullThinking.length > 30 && (
          <div style={{ marginBottom: '6px' }}>
            <button
              type="button"
              onClick={(e) => toggleExpand(log.id, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                color: isWhite ? 'var(--neon-cyan)' : '#c084fc',
                fontSize: '11px',
                cursor: 'pointer',
                padding: '2px 0',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Brain size={12} />
              <span>{isExpanded ? 'Hide Neural Thinking' : 'Show Neural Thinking'}</span>
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {isExpanded && (
              <div
                style={{
                  marginTop: '4px',
                  padding: '8px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: '#cbd5e1',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {fullThinking}
              </div>
            )}
          </div>
        )}

        {/* Tool call snippet */}
        {log.toolCalls.map((tc, idx) => (
          <div key={tc.id || idx} className="tool-call-block" style={{ padding: '6px 8px', fontSize: '11px' }}>
            <div className="tool-name-tag">
              🔧 {tc.name}({tc.arguments.move ? `move="${tc.arguments.move}"` : ''})
            </div>
            <div className="tool-latency-tag">Latency: {tc.latencyMs}ms</div>
          </div>
        ))}
      </div>
    );
  };

  const renderStreamingBox = (side: 'w' | 'b') => {
    if (!activeThinking || activeThinking.side !== side) return null;
    const isWhite = side === 'w';

    return (
      <div
        style={{
          padding: '10px 12px',
          marginBottom: '10px',
          background: isWhite
            ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(15, 23, 42, 0.8))'
            : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(15, 23, 42, 0.8))',
          border: `1px solid ${isWhite ? 'var(--neon-cyan)' : 'var(--neon-violet)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: isWhite ? '0 0 14px rgba(6, 182, 212, 0.25)' : '0 0 14px rgba(124, 58, 237, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div className="status-dot active" style={{ backgroundColor: isWhite ? 'var(--neon-cyan)' : 'var(--neon-violet)' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
            {activeThinking.modelName} is Thinking...
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            maxHeight: '140px',
            overflowY: 'auto',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            lineHeight: '1.4',
          }}
        >
          {activeThinking.thoughtText || 'Generating calculations...'}
          <span style={{ display: 'inline-block', width: '6px', height: '12px', background: isWhite ? '#38bdf8' : '#c084fc', marginLeft: '3px', animation: 'pulse-dot 0.8s infinite' }} />
        </div>
      </div>
    );
  };

  return (
    <div className="card-panel neural-feed-panel" style={{ minWidth: feedTab === 'split' ? '500px' : '380px' }}>
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div className="panel-title">
          <Cpu size={18} color="var(--neon-violet)" />
          <span>Neural Thinking Feed</span>
        </div>

        {/* Feed Tab Selector */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.4)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            className={`btn ${feedTab === 'split' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 8px', fontSize: '10px' }}
            onClick={() => setFeedTab('split')}
            title="Side-by-Side Agent Split View"
          >
            <Columns size={12} />
            <span>Split</span>
          </button>
          <button
            type="button"
            className={`btn ${feedTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 8px', fontSize: '10px' }}
            onClick={() => setFeedTab('all')}
            title="Combined Stream"
          >
            <Layers size={12} />
            <span>All ({logs.length})</span>
          </button>
          <button
            type="button"
            className={`btn ${feedTab === 'white' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 8px', fontSize: '10px' }}
            onClick={() => setFeedTab('white')}
            title="White Agent Only"
          >
            <span>⚪ White ({whiteLogs.length})</span>
          </button>
          <button
            type="button"
            className={`btn ${feedTab === 'black' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 8px', fontSize: '10px' }}
            onClick={() => setFeedTab('black')}
            title="Black Agent Only"
          >
            <span>⚫ Black ({blackLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Main Stream Area */}
      {feedTab === 'split' ? (
        /* SIDE-BY-SIDE SPLIT VIEW FOR BOTH AGENTS */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1, overflow: 'hidden' }}>
          {/* White Agent Column */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <div
              style={{
                padding: '6px 10px',
                marginBottom: '8px',
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 700,
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>⚪ WHITE: {whiteModel?.name || 'Agent 1'}</span>
              <span>{whiteLogs.length} moves</span>
            </div>

            <div className="neural-feed-scroll" ref={whiteScrollRef} style={{ flex: 1 }}>
              {renderStreamingBox('w')}
              {whiteLogs.length === 0 && (!activeThinking || activeThinking.side !== 'w') ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                  Awaiting White moves...
                </div>
              ) : (
                whiteLogs.map(renderLogCard)
              )}
            </div>
          </div>

          {/* Black Agent Column */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <div
              style={{
                padding: '6px 10px',
                marginBottom: '8px',
                background: 'rgba(124, 58, 237, 0.15)',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 700,
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>⚫ BLACK: {blackModel?.name || 'Agent 2'}</span>
              <span>{blackLogs.length} moves</span>
            </div>

            <div className="neural-feed-scroll" ref={blackScrollRef} style={{ flex: 1 }}>
              {renderStreamingBox('b')}
              {blackLogs.length === 0 && (!activeThinking || activeThinking.side !== 'b') ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                  Awaiting Black moves...
                </div>
              ) : (
                blackLogs.map(renderLogCard)
              )}
            </div>
          </div>
        </div>
      ) : (
        /* SINGLE OR COMBINED STREAM VIEW */
        <div className="neural-feed-scroll" ref={scrollRef}>
          {renderStreamingBox(feedTab === 'white' ? 'w' : feedTab === 'black' ? 'b' : (activeThinking?.side || 'w'))}

          {((feedTab === 'white' ? whiteLogs : feedTab === 'black' ? blackLogs : allLogsReversed).length === 0) ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '40px 20px',
                gap: '12px',
              }}
            >
              <Code2 size={36} opacity={0.4} />
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Waiting for Agent Invocations</div>
              <div style={{ fontSize: '12px', maxWidth: '280px' }}>
                When a duel begins, real-time structured tool calls and neural reasoning traces will stream here.
              </div>
            </div>
          ) : (
            (feedTab === 'white' ? whiteLogs : feedTab === 'black' ? blackLogs : allLogsReversed).map(renderLogCard)
          )}
        </div>
      )}

      {/* Telemetry Inspector Modal */}
      {selectedLog && (
        <PromptInspectorModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
};
