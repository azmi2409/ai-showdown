import React, { useState } from 'react';
import { Key, Plus, Trash2, CheckCircle2, ShieldCheck, Cpu } from 'lucide-react';
import { ApiKeysConfig, ModelConfig } from '../types';

interface SettingsViewProps {
  apiKeys: ApiKeysConfig;
  customModels: ModelConfig[];
  onSaveApiKeys: (keys: ApiKeysConfig) => void;
  onAddCustomModel: (model: ModelConfig) => void;
  onDeleteCustomModel: (id: string) => void;
  onResetAllData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  customModels,
  onSaveApiKeys,
  onAddCustomModel,
  onDeleteCustomModel,
  onResetAllData,
}) => {
  const [formData, setFormData] = useState<ApiKeysConfig>({ ...apiKeys });
  const [savedSuccess, setSavedSuccess] = useState(false);

  // New Custom Model Form State
  const [newModelName, setNewModelName] = useState('');
  const [newModelProvider, setNewModelProvider] = useState<'openrouter' | 'openai' | 'anthropic' | 'ollama'>('openrouter');
  const [newModelId, setNewModelId] = useState('');
  const [newModelStyle, setNewModelStyle] = useState('Adaptive Grandmaster');

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKeys(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleCreateModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelName || !newModelId) return;

    const newModel: ModelConfig = {
      id: `custom_${Date.now()}`,
      name: newModelName,
      provider: newModelProvider,
      modelIdentifier: newModelId,
      avatar: '🤖',
      badgeColor: '#a855f7',
      playStyle: newModelStyle,
      description: 'Custom added LLM endpoint.',
      simulatedElo: 2200,
    };

    onAddCustomModel(newModel);
    setNewModelName('');
    setNewModelId('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '840px', margin: '0 auto' }}>
      {/* API Keys Configuration */}
      <div className="card-panel">
        <div className="panel-header">
          <div className="panel-title">
            <Key size={18} color="var(--neon-violet)" />
            <span>LLM Provider API Keys</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--neon-emerald)' }}>
            <ShieldCheck size={14} />
            <span>Stored in Local Storage Only</span>
          </div>
        </div>

        <form onSubmit={handleSaveKeys} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">
              OpenRouter API Key (Recommended - Supports GPT-6, Claude Opus 5, DeepSeek V4)
            </label>
            <input
              type="password"
              className="text-input"
              placeholder="sk-or-v1-..."
              value={formData.openrouter || ''}
              onChange={(e) => setFormData({ ...formData, openrouter: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Anthropic API Key (Claude Opus 5, Sonnet 5)</label>
            <input
              type="password"
              className="text-input"
              placeholder="sk-ant-..."
              value={formData.anthropic || ''}
              onChange={(e) => setFormData({ ...formData, anthropic: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">OpenAI API Key (GPT-6, GPT-5.6, o4-mini)</label>
            <input
              type="password"
              className="text-input"
              placeholder="sk-..."
              value={formData.openai || ''}
              onChange={(e) => setFormData({ ...formData, openai: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">DeepSeek API Key (DeepSeek V4 Direct)</label>
            <input
              type="password"
              className="text-input"
              placeholder="sk-..."
              value={formData.deepseek || ''}
              onChange={(e) => setFormData({ ...formData, deepseek: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ollama Host URL (Local Models)</label>
            <input
              type="text"
              className="text-input"
              placeholder="http://localhost:11434/v1"
              value={formData.ollamaUrl || 'http://localhost:11434/v1'}
              onChange={(e) => setFormData({ ...formData, ollamaUrl: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px' }}>
              Save API Configuration
            </button>
            {savedSuccess && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
                <CheckCircle2 size={16} />
                <span>Saved securely!</span>
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Add Custom Model */}
      <div className="card-panel">
        <div className="panel-header">
          <div className="panel-title">
            <Cpu size={18} color="var(--neon-cyan)" />
            <span>Register Custom Model / Fine-tune</span>
          </div>
        </div>

        <form onSubmit={handleCreateModel} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="text-input"
                placeholder="e.g. My Fine-tuned ChessBot"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Provider</label>
              <select
                className="select-input"
                value={newModelProvider}
                onChange={(e) => setNewModelProvider(e.target.value as any)}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Model Identifier / Slug</label>
              <input
                type="text"
                className="text-input"
                placeholder="e.g. openai/gpt-6 or llama4:70b"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Play Style Description</label>
              <input
                type="text"
                className="text-input"
                value={newModelStyle}
                onChange={(e) => setNewModelStyle(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start' }}
            disabled={!newModelName || !newModelId}
          >
            <Plus size={16} />
            <span>Add Custom Model</span>
          </button>
        </form>

        {/* Existing Custom Models List */}
        {customModels.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              CUSTOM REGISTERED MODELS ({customModels.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {customModels.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <strong>{m.name}</strong>{' '}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      ({m.modelIdentifier}) [{m.provider}]
                    </span>
                  </div>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '4px 8px' }}
                    onClick={() => onDeleteCustomModel(m.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card-panel" style={{ borderColor: 'rgba(244, 63, 94, 0.3)' }}>
        <div className="panel-header">
          <div className="panel-title" style={{ color: '#f43f5e' }}>
            <span>Danger Zone</span>
          </div>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Reset all benchmark history, archived games, Elo ratings, and custom models to factory defaults.
        </p>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm('Are you sure you want to reset all benchmark records and models?')) {
              onResetAllData();
              alert('All data reset to factory defaults.');
            }
          }}
        >
          Factory Reset Data
        </button>
      </div>
    </div>
  );
};
