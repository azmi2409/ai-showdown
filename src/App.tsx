import React, { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { Chess } from 'chess.js';
import { Header, ActiveTab } from './components/Header';
import { ChessBoard } from './components/ChessBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { ArenaControls } from './components/ArenaControls';
import { MoveHistory } from './components/MoveHistory';
import { NeuralFeed } from './components/NeuralFeed';
import { TournamentView } from './components/TournamentView';
import { MatchesView } from './components/MatchesView';
import { LeaderboardView } from './components/LeaderboardView';
import { SettingsView } from './components/SettingsView';
import { gameClient, SpeedMode } from './services/gameClient';
import { storageService } from './services/storageService';
import { audioService } from './services/audioService';
import { apiService } from './services/apiService';
import { TournamentManager } from './services/tournamentManager';
import { DEFAULT_MODELS } from './services/defaultModels';
import {
  ApiKeysConfig,
  BenchmarkMetrics,
  GameResult,
  ModelConfig,
  TimeControl,
  TournamentMatch,
  TournamentState,
  TournamentType,
} from './types';

export const App: React.FC = () => {
  // Stored models & configuration
  const [allModels, setAllModels] = useState<ModelConfig[]>(() => storageService.getAllModels());
  const [apiKeys, setApiKeys] = useState<ApiKeysConfig>(() => storageService.getApiKeys());
  const [metrics, setMetrics] = useState<Record<string, BenchmarkMetrics>>(() =>
    storageService.getBenchmarkMetrics()
  );
  const [customModels, setCustomModels] = useState<ModelConfig[]>(() =>
    storageService.getCustomModels()
  );

  // Retrieve persisted selections & saved game state
  const initialSelections = useMemo(() => storageService.getArenaSelections(), []);

  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => initialSelections?.activeTab || 'arena'
  );

  // Match settings
  const [whiteModel, setWhiteModel] = useState<ModelConfig>(() => {
    if (initialSelections?.whiteModelId) {
      const found = allModels.find((m) => m.id === initialSelections.whiteModelId);
      if (found) return found;
    }
    return allModels[0] || DEFAULT_MODELS[0];
  });

  const [blackModel, setBlackModel] = useState<ModelConfig>(() => {
    if (initialSelections?.blackModelId) {
      const found = allModels.find((m) => m.id === initialSelections.blackModelId);
      if (found) return found;
    }
    return allModels[2] || allModels[1] || DEFAULT_MODELS[1];
  });

  const [timeControl, setTimeControl] = useState<TimeControl>(
    () =>
      initialSelections?.timeControl || {
        name: 'Blitz 3+2',
        baseSeconds: 180,
        incrementSeconds: 2,
      }
  );
  const [speedMode, setSpeedMode] = useState<SpeedMode>(
    () => (initialSelections?.speedMode as SpeedMode) || '0.5s'
  );
  const [audioEnabled, setAudioEnabled] = useState<boolean>(
    () => initialSelections?.audioEnabled ?? true
  );

  // Tournament state
  const [tournament, setTournament] = useState<TournamentState | null>(() =>
    storageService.getSavedTournament()
  );
  const [isAutoRunningTournament, setIsAutoRunningTournament] = useState(false);
  const currentTourneyMatchRef = useRef<{
    match: TournamentMatch;
    roundIndex: number;
    matchIndex: number;
  } | null>(null);

  // Subscribe to backend SSE live game state
  const liveGame = useSyncExternalStore(
    (cb) => gameClient.subscribe(cb),
    () => gameClient.getState()
  );

  // Create lightweight Chess instance from server FEN for board rendering
  const liveChess = useMemo(() => {
    try {
      return new Chess(liveGame.fen);
    } catch {
      return new Chess();
    }
  }, [liveGame.fen]);

  // Material balance calculation from board state
  const material = useMemo(() => {
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let whiteScore = 0;
    let blackScore = 0;
    const board = liveChess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const val = pieceValues[piece.type] || 0;
          if (piece.color === 'w') whiteScore += val;
          else blackScore += val;
        }
      }
    }
    return {
      white: whiteScore,
      black: blackScore,
      delta: whiteScore - blackScore,
    };
  }, [liveChess]);

  // Keep speed mode synced with backend
  useEffect(() => {
    gameClient.setSpeedMode(speedMode);
  }, [speedMode]);

  // Auto-persist arena selections
  useEffect(() => {
    storageService.saveArenaSelections({
      whiteModelId: whiteModel.id,
      blackModelId: blackModel.id,
      timeControl,
      speedMode,
      audioEnabled,
      activeTab,
    });
  }, [whiteModel.id, blackModel.id, timeControl, speedMode, audioEnabled, activeTab]);

  // Auto-persist tournament state
  useEffect(() => {
    storageService.saveTournament(tournament);
  }, [tournament]);

  // Sync audio enabled state
  useEffect(() => {
    audioService.setEnabled(audioEnabled);
  }, [audioEnabled]);

  // Sync leaderboard from backend on mount
  useEffect(() => {
    apiService.getLeaderboard().then((backendMetrics) => {
      if (backendMetrics && backendMetrics.length > 0) {
        const mapped: Record<string, BenchmarkMetrics> = {};
        backendMetrics.forEach((m) => {
          mapped[m.modelId] = m;
        });
        setMetrics(mapped);
      }
    });
  }, []);

  // Tournament launch helper
  const launchTournamentMatch = useCallback(
    (match: TournamentMatch, roundIndex: number, matchIndex: number) => {
      if (!match.white || !match.black) return;

      currentTourneyMatchRef.current = { match, roundIndex, matchIndex };
      setWhiteModel(match.white);
      setBlackModel(match.black);
      const matchTc = tournament?.timeControl || timeControl;
      setTimeControl(matchTc);

      setActiveTab('arena');

      const tourneyMatchId = `match_${Date.now()}_r${roundIndex + 1}_m${matchIndex + 1}`;
      gameClient.startGame({
        matchId: tourneyMatchId,
        whiteModel: match.white,
        blackModel: match.black,
        timeControl: matchTc,
        speedMode,
        tournamentId: tournament?.id || null,
        roundNumber: roundIndex + 1,
        matchIndex,
      });
    },
    [tournament, timeControl, speedMode]
  );

  // Handle Game Over (Update Tournament bracket & Refresh Leaderboard)
  useEffect(() => {
    gameClient.setGameOverCallback((result: GameResult) => {
      // Refresh benchmark metrics from Express backend
      apiService.getLeaderboard().then((backendMetrics) => {
        if (backendMetrics && backendMetrics.length > 0) {
          const mapped: Record<string, BenchmarkMetrics> = {};
          backendMetrics.forEach((m) => {
            mapped[m.modelId] = m;
          });
          setMetrics(mapped);
        }
      });

      // If playing a tournament match, update bracket and launch next match if auto-running
      if (tournament && currentTourneyMatchRef.current) {
        const { roundIndex, matchIndex } = currentTourneyMatchRef.current;
        const updatedTourney = TournamentManager.recordMatchResult(
          tournament,
          roundIndex,
          matchIndex,
          result
        );
        setTournament(updatedTourney);
        storageService.saveTournament(updatedTourney);
        apiService.saveTournament(updatedTourney);
        currentTourneyMatchRef.current = null;

        if (isAutoRunningTournament && updatedTourney.status !== 'completed') {
          setTimeout(() => {
            const nextMatch = TournamentManager.getNextPendingMatch(updatedTourney);
            if (nextMatch) {
              launchTournamentMatch(nextMatch.match, nextMatch.roundIndex, nextMatch.matchIndex);
            } else {
              setIsAutoRunningTournament(false);
            }
          }, 2500);
        }
      }
    });
  }, [tournament, isAutoRunningTournament, timeControl, speedMode, launchTournamentMatch]);

  // Arena Actions
  const handleStartGame = () => {
    const newMatchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    gameClient.startGame({
      matchId: newMatchId,
      whiteModel,
      blackModel,
      timeControl,
      speedMode,
      tournamentId: tournament?.id || null,
    });
  };

  const handlePauseGame = () => {
    gameClient.pauseGame();
  };

  const handleResumeGame = () => {
    gameClient.resumeGame();
  };

  const handleStepMove = () => {
    gameClient.stepMove();
  };

  const handleForfeit = () => {
    gameClient.forfeitGame(liveGame.turn);
  };

  const handleResetGame = () => {
    gameClient.resetGame(timeControl);
  };

  const handleToggleAudio = () => {
    const nextState = !audioEnabled;
    setAudioEnabled(nextState);
    audioService.setEnabled(nextState);
  };

  const handleExportPGN = () => {
    const ch = new Chess();
    for (const m of liveGame.moves) {
      try {
        ch.move(m.san);
      } catch {}
    }
    ch.header(
      'White',
      liveGame.whiteModel?.name || whiteModel.name,
      'Black',
      liveGame.blackModel?.name || blackModel.name,
      'Date',
      new Date().toISOString().split('T')[0]
    );
    const pgn = ch.pgn();
    const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${whiteModel.name}_vs_${blackModel.name}_${Date.now()}.pgn`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Tournament Actions
  const handleInitTournament = (
    title: string,
    type: TournamentType,
    models: ModelConfig[],
    tc: TimeControl
  ) => {
    const newTourney = TournamentManager.createTournament(title, type, models, tc);
    setTournament(newTourney);
    storageService.saveTournament(newTourney);
  };


  const handleAutoRunToggle = () => {
    if (isAutoRunningTournament) {
      setIsAutoRunningTournament(false);
    } else {
      setIsAutoRunningTournament(true);
      if (tournament && !currentTourneyMatchRef.current) {
        const next = TournamentManager.getNextPendingMatch(tournament);
        if (next) {
          launchTournamentMatch(next.match, next.roundIndex, next.matchIndex);
        }
      }
    }
  };

  const handleResetTournament = () => {
    setIsAutoRunningTournament(false);
    currentTourneyMatchRef.current = null;
    setTournament(null);
    storageService.saveTournament(null);
  };

  // Settings Actions
  const handleSaveApiKeys = (keys: ApiKeysConfig) => {
    storageService.saveApiKeys(keys);
    setApiKeys(keys);
  };

  const handleAddCustomModel = (model: ModelConfig) => {
    storageService.saveCustomModel(model);
    setCustomModels(storageService.getCustomModels());
    setAllModels(storageService.getAllModels());
  };

  const handleDeleteCustomModel = (id: string) => {
    storageService.deleteCustomModel(id);
    setCustomModels(storageService.getCustomModels());
    setAllModels(storageService.getAllModels());
  };

  const handleResetAllData = () => {
    gameClient.resetGame(timeControl);
    storageService.resetAllData();
    setMetrics(storageService.getBenchmarkMetrics());
    setCustomModels([]);
    setAllModels(storageService.getAllModels());
    setTournament(null);
  };

  // Derived state
  const lastMove =
    liveGame.moves.length > 0 ? liveGame.moves[liveGame.moves.length - 1] : undefined;
  const activeThinking = liveGame.activeThinking;
  const allLogs = liveGame.neuralLogs;
  const latestWhiteLog = [...allLogs].reverse().find((l) => l.turn === 'w');
  const latestBlackLog = [...allLogs].reverse().find((l) => l.turn === 'b');
  const latestWhiteThought =
    (activeThinking.side === 'w' && activeThinking.thoughtText) ||
    latestWhiteLog?.toolCalls?.find((t) => t.name === 'make_move')?.arguments?.reasoning ||
    latestWhiteLog?.textContent;
  const latestBlackThought =
    (activeThinking.side === 'b' && activeThinking.thoughtText) ||
    latestBlackLog?.toolCalls?.find((t) => t.name === 'make_move')?.arguments?.reasoning ||
    latestBlackLog?.textContent;

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isGameActive={liveGame.status === 'active'}
        isTournamentActive={tournament?.status === 'running' || isAutoRunningTournament}
      />

      {/* Main View Router */}
      {activeTab === 'arena' && (
        <main className="arena-layout">
          {/* Left Column: Match Deck Controls & Move History */}
          <section className="arena-sidebar-left">
            <ArenaControls
              matchId={liveGame.matchId}
              models={allModels}
              whiteModel={liveGame.status === 'idle' ? whiteModel : liveGame.whiteModel || whiteModel}
              blackModel={liveGame.status === 'idle' ? blackModel : liveGame.blackModel || blackModel}
              timeControl={timeControl}
              speedMode={speedMode}
              audioEnabled={audioEnabled}
              gameStatus={liveGame.status}
              onSelectWhite={(m) => {
                setWhiteModel(m);
                gameClient.resetGame(timeControl);
              }}
              onSelectBlack={(m) => {
                setBlackModel(m);
                gameClient.resetGame(timeControl);
              }}
              onSelectTimeControl={(tc) => {
                setTimeControl(tc);
                gameClient.resetGame(tc);
              }}
              onSetSpeedMode={setSpeedMode}
              onToggleAudio={handleToggleAudio}
              onStartGame={handleStartGame}
              onPauseGame={handlePauseGame}
              onResumeGame={handleResumeGame}
              onStepMove={handleStepMove}
              onForfeit={handleForfeit}
              onResetGame={handleResetGame}
            />

            <MoveHistory moves={liveGame.moves} onExportPGN={handleExportPGN} />
          </section>

          {/* Center Column: Player Panels & Chess Board */}
          <section className="arena-center-stage">
            {/* Black Player Panel (Top) */}
            <PlayerPanel
              model={liveGame.blackModel || blackModel}
              color="black"
              isTurn={liveGame.turn === 'b' && liveGame.status === 'active'}
              timeRemainingMs={liveGame.clocks.b}
              capturedPieces={liveGame.captures.b}
              materialDelta={-material.delta}
              isThinking={activeThinking.side === 'b'}
              thoughtText={latestBlackThought}
            />

            {/* Chess Board */}
            <ChessBoard
              chess={liveChess}
              lastMove={lastMove}
              inCheck={liveGame.inCheck}
              turn={liveGame.turn}
            />

            {/* White Player Panel (Bottom) */}
            <PlayerPanel
              model={liveGame.whiteModel || whiteModel}
              color="white"
              isTurn={liveGame.turn === 'w' && liveGame.status === 'active'}
              timeRemainingMs={liveGame.clocks.w}
              capturedPieces={liveGame.captures.w}
              materialDelta={material.delta}
              isThinking={activeThinking.side === 'w'}
              thoughtText={latestWhiteThought}
            />

            {/* Game Result Banner */}
            {liveGame.result && (
              <div
                className="card-panel"
                style={{
                  width: '100%',
                  maxWidth: '540px',
                  textAlign: 'center',
                  padding: '14px',
                  background:
                    liveGame.result.winner === 'draw'
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'rgba(124, 58, 237, 0.2)',
                  borderColor:
                    liveGame.result.winner === 'draw'
                      ? 'var(--text-muted)'
                      : 'var(--neon-violet)',
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', color: '#ffffff' }}>
                  {liveGame.result.description}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Benchmark ratings and PGN records updated.
                </div>
              </div>
            )}
          </section>

          {/* Right Column: Live Neural Feed (Tool Calls & Streaming Reasoning) */}
          <aside>
            <NeuralFeed
              logs={allLogs}
              activeThinking={activeThinking}
              whiteModel={liveGame.whiteModel || whiteModel}
              blackModel={liveGame.blackModel || blackModel}
            />
          </aside>
        </main>
      )}

      {/* Tournament View */}
      {activeTab === 'tournament' && (
        <TournamentView
          allModels={allModels}
          tournament={tournament}
          onInitTournament={handleInitTournament}
          onLaunchMatch={launchTournamentMatch}
          onAutoRunToggle={handleAutoRunToggle}
          isAutoRunning={isAutoRunningTournament}
          onResetTournament={handleResetTournament}
        />
      )}

      {/* Matches History View */}
      {activeTab === 'matches' && (
        <MatchesView />
      )}

      {/* Leaderboard View */}
      {activeTab === 'leaderboard' && (
        <LeaderboardView
          metrics={metrics}
          onResetStats={() => {
            storageService.resetAllData();
            setMetrics(storageService.getBenchmarkMetrics());
          }}
          onRecalculateElo={async () => {
            const res = await apiService.recalculateElo();
            if (res?.models && Array.isArray(res.models)) {
              const mapped: Record<string, BenchmarkMetrics> = {};
              res.models.forEach((m: BenchmarkMetrics) => {
                mapped[m.modelId] = m;
              });
              setMetrics(mapped);
            }
          }}
        />
      )}

      {/* Settings View */}
      {activeTab === 'settings' && (
        <SettingsView
          apiKeys={apiKeys}
          customModels={customModels}
          onSaveApiKeys={handleSaveApiKeys}
          onAddCustomModel={handleAddCustomModel}
          onDeleteCustomModel={handleDeleteCustomModel}
          onResetAllData={handleResetAllData}
        />
      )}
    </div>
  );
};

export default App;
