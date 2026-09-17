import React from 'react';
import { X, Terminal, CheckCircle, AlertTriangle } from 'lucide-react';
import { NeuralLogEntry } from '../types';

interface PromptInspectorModalProps {
  log: NeuralLogEntry | null;
  onClose: () => void;
}

export const PromptInspectorModal: React.FC<PromptInspectorModalProps> = ({
  log,
  onClose,
}) => {
  if (!log) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header" style={{ marginBottom: '18px' }}>
          <div className="panel-title">
            <Terminal size={18} color="var(--neon-cyan)" />
            <span>Agent Telemetry: {log.modelName}</span>
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Metadata Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              padding: '10px 14px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Move: </span>
              <strong style={{ color: 'var(--neon-cyan)' }}>#{log.moveNumber} ({log.turn === 'w' ? 'White' : 'Black'})</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Latency: </span>
              <strong>{log.totalLatencyMs}ms</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Illegal Attempts: </span>
              <strong style={{ color: log.illegalAttempts > 0 ? '#f43f5e' : '#10b981' }}>
                {log.illegalAttempts}
              </strong>
            </div>
          </div>

          {/* Tool Calls List */}
          <div>
            <h4
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '8px',
                textTransform: 'uppercase',
              }}
            >
              Invoked Tool Calls ({log.toolCalls.length})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {log.toolCalls.map((tc, idx) => (
                <div
                  key={tc.id || idx}
                  style={{
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ color: '#c084fc', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      tool_call: {tc.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {tc.latencyMs}ms
                    </span>
                  </div>

                  {/* Arguments */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                      Arguments:
                    </div>
                    <pre
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        padding: '8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        overflowX: 'auto',
                        color: '#f8fafc',
                      }}
                    >
                      {JSON.stringify(tc.arguments, null, 2)}
                    </pre>
                  </div>

                  {/* Result */}
                  {tc.result && (
                    <div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: tc.result.success === false ? '#f43f5e' : '#34d399',
                          marginBottom: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {tc.result.success === false ? (
                          <AlertTriangle size={12} />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        <span>Tool Result:</span>
                      </div>
                      <pre
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${
                            tc.result.success === false ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.2)'
                          }`,
                          padding: '8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto',
                          color: '#e2e8f0',
                        }}
                      >
                        {JSON.stringify(tc.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
