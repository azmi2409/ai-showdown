import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { Header, ActiveTab } from './components/Header';
import { ChessBoard } from './components/ChessBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { ArenaControls } from './components/ArenaControls';
import { MoveHistory } from './components/MoveHistory';
import { NeuralFeed } from './components/NeuralFeed';
import { TournamentView } from './components/TournamentView';
import { LeaderboardView } from './components/LeaderboardView';
import { SettingsView } from './components/SettingsView';
import { GameStateStore } from './services/GameStateStore';
import { GameOrchestrator, SpeedMode } from './services/GameOrchestrator';
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
  NeuralLogEntry,
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

  // Initialize GameStateStore & Orchestrator with persistence restoration
  const store = useMemo(() => {
    const saved = storageService.getSavedGameState();
    const gs = new GameStateStore(saved?.timeControl || initialSelections?.timeControl || timeControl);
    if (saved) {
      gs.restore(saved);
    }
    return gs;
  }, []);

  // Telemetry logs
  const [neuralLogs, setNeuralLogs] = useState<NeuralLogEntry[]>(() => store.getNeuralLogs());

  const orchestrator = useMemo(
    () => new GameOrchestrator(store, whiteModel, blackModel, apiKeys),
    []
  );

  // Sync state store with React
  const subscribeStore = (cb: () => void) => store.subscribe(cb);
  const getStoreVersion = () =>
    `${store.getFEN()}_${store.getStatus()}_${store.getMoves().length}_${store.getNeuralLogs().length}_${store.getActiveThinking().side}_${store.getActiveThinking().thoughtText || ''}_${JSON.stringify(
      store.getClocks()
    )}`;
  useSyncExternalStore(subscribeStore, getStoreVersion);

  // Connect orchestrator callbacks
  useEffect(() => {
    orchestrator.setNeuralLogCallback((logs) => setNeuralLogs(logs));
    orchestrator.setSpeedMode(speedMode);
  }, [speedMode]);

  useEffect(() => {
    orchestrator.setModels(whiteModel, blackModel);
  }, [whiteModel, blackModel]);

  useEffect(() => {
    orchestrator.setApiKeys(apiKeys);
  }, [apiKeys]);

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

  // Auto-persist game state on store updates
  useEffect(() => {
    let timer: any;
    const unsubscribe = store.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        storageService.saveGameState(store.serialize());
      }, 250);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [store]);

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

  // Handle Game Finished Callback
  useEffect(() => {
    orchestrator.setGameFinishedCallback((result: GameResult) => {
      const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const tournamentId = tournament?.id || null;
      const tourneyInfo = currentTourneyMatchRef.current;

      const neuralLogs = store.getNeuralLogs();
      const whiteLogs = neuralLogs.filter((l) => l.turn === 'w');
      const blackLogs = neuralLogs.filter((l) => l.turn === 'b');
      const whiteAvgLatency =
        whiteLogs.length > 0
          ? Math.round(whiteLogs.reduce((acc, l) => acc + l.totalLatencyMs, 0) / whiteLogs.length)
          : 0;
      const blackAvgLatency =
        blackLogs.length > 0
          ? Math.round(blackLogs.reduce((acc, l) => acc + l.totalLatencyMs, 0) / blackLogs.length)
          : 0;
      const whiteToolCalls = whiteLogs.reduce((acc, l) => acc + l.toolCalls.length, 0);
      const blackToolCalls = blackLogs.reduce((acc, l) => acc + l.toolCalls.length, 0);

      // Record match to Express backend with advanced ELO calculation
      apiService
        .recordMatch({
          matchId,
          tournamentId,
          roundNumber: tourneyInfo ? tourneyInfo.roundIndex + 1 : undefined,
          matchIndex: tourneyInfo ? tourneyInfo.matchIndex : undefined,
          whiteModelId: whiteModel.id,
          whiteModelName: whiteModel.name,
          blackModelId: blackModel.id,
          blackModelName: blackModel.name,
          winner: result.winner,
          reason: result.reason,
          movesCount: store.getMoves().length,
          durationMs: 0,
          pgn: store.exportPGN(whiteModel.name, blackModel.name),
          finalFen: store.getFEN(),
          timeControl,
          telemetry: {
            whiteIllegalMoves: store.getIllegalAttempts('w'),
            blackIllegalMoves: store.getIllegalAttempts('b'),
            whiteAvgLatencyMs: whiteAvgLatency,
            blackAvgLatencyMs: blackAvgLatency,
            whiteToolCallsCount: whiteToolCalls,
            blackToolCallsCount: blackToolCalls,
            whiteForfeit: result.winner === 'b' && result.reason === 'resignation',
            blackForfeit: result.winner === 'w' && result.reason === 'resignation',
          },
        })
        .then(() => {
          // Refresh benchmark metrics from backend
          apiService.getLeaderboard().then((backendMetrics) => {
            if (backendMetrics && backendMetrics.length > 0) {
              const mapped: Record<string, BenchmarkMetrics> = {};
              backendMetrics.forEach((m) => {
                mapped[m.modelId] = m;
              });
              setMetrics(mapped);
            } else {
              setMetrics(storageService.getBenchmarkMetrics());
            }
          });
        });

      // If playing a tournament match, update tournament bracket
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

        // Auto-run next match after 2.5s delay if auto-running is enabled
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
  }, [tournament, isAutoRunningTournament, whiteModel, blackModel, timeControl]);

  // Actions
  const handleStartGame = () => {
    orchestrator.startGame();
  };

  const handlePauseGame = () => {
    orchestrator.pauseGame();
  };

  const handleResumeGame = () => {
    orchestrator.resumeGame();
  };

  const handleStepMove = () => {
    orchestrator.stepMove();
  };

  const handleForfeit = () => {
    orchestrator.forfeitGame(store.getTurn());
  };

  const handleResetGame = () => {
    orchestrator.stopGame();
    store.reset(timeControl);
    storageService.saveGameState(store.serialize());
    setNeuralLogs([]);
  };

  const handleToggleAudio = () => {
    const nextState = !audioEnabled;
    setAudioEnabled(nextState);
    audioService.setEnabled(nextState);
  };

  const handleExportPGN = () => {
    const pgn = store.exportPGN(whiteModel.name, blackModel.name);
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

  const launchTournamentMatch = (
    match: TournamentMatch,
    roundIndex: number,
    matchIndex: number
  ) => {
    if (!match.white || !match.black) return;

    currentTourneyMatchRef.current = { match, roundIndex, matchIndex };
    setWhiteModel(match.white);
    setBlackModel(match.black);
    setTimeControl(tournament?.timeControl || timeControl);

    // Reset store and start
    orchestrator.stopGame();
    const matchTc = tournament?.timeControl || timeControl;
    store.reset(matchTc);
    storageService.saveGameState(store.serialize());
    setNeuralLogs([]);

    // Switch view to arena so user can see the live match!
    setActiveTab('arena');

    setTimeout(() => {
      orchestrator.setModels(match.white!, match.black!);
      orchestrator.startGame();
    }, 400);
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
    orchestrator.stopGame();
    storageService.resetAllData();
    setMetrics(storageService.getBenchmarkMetrics());
    setCustomModels([]);
    setAllModels(storageService.getAllModels());
    setTournament(null);
    store.reset(timeControl);
    storageService.saveGameState(store.serialize());
    setNeuralLogs([]);
  };

  // Derived state from store
  const clocks = store.getClocks();
  const captures = store.getCaptures();
  const material = store.getMaterialBalance();
  const moves = store.getMoves();
  const lastMove = store.getLastMove();
  const gameStatus = store.getStatus();
  const activeTurn = store.getTurn();
  const inCheck = store.isCheck();
  const gameResult = store.getResult();

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isGameActive={gameStatus === 'active'}
        isTournamentActive={tournament?.status === 'running' || isAutoRunningTournament}
      />

      {/* Main View Router */}
      {activeTab === 'arena' && (
        <main className="arena-layout">
          {/* Left Column: Match Deck Controls & Move History */}
          <section className="arena-sidebar-left">
            <ArenaControls
              models={allModels}
              whiteModel={whiteModel}
              blackModel={blackModel}
              timeControl={timeControl}
              speedMode={speedMode}
              audioEnabled={audioEnabled}
              gameStatus={gameStatus}
              onSelectWhite={(m) => {
                setWhiteModel(m);
                store.reset(timeControl);
                storageService.saveGameState(store.serialize());
              }}
              onSelectBlack={(m) => {
                setBlackModel(m);
                store.reset(timeControl);
                storageService.saveGameState(store.serialize());
              }}
              onSelectTimeControl={(tc) => {
                setTimeControl(tc);
                store.reset(tc);
                storageService.saveGameState(store.serialize());
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

            <MoveHistory moves={moves} onExportPGN={handleExportPGN} />
          </section>

          {/* Center Column: Player Panels & Chess Board */}
          {/* Center Column: Player Panels & Chess Board */}
          {(() => {
            const activeThinking = store.getActiveThinking();
            const allLogs = store.getNeuralLogs();
            const latestWhiteLog = [...allLogs].reverse().find((l) => l.turn === 'w');
            const latestBlackLog = [...allLogs].reverse().find((l) => l.turn === 'b');
            const latestWhiteThought =
              latestWhiteLog?.toolCalls.find((t) => t.name === 'make_move')?.arguments?.reasoning ||
              latestWhiteLog?.textContent;
            const latestBlackThought =
              latestBlackLog?.toolCalls.find((t) => t.name === 'make_move')?.arguments?.reasoning ||
              latestBlackLog?.textContent;

            return (
              <>
                <section className="arena-center-stage">
                  {/* Black Player Panel (Top) */}
                  <PlayerPanel
                    model={blackModel}
                    color="black"
                    isTurn={activeTurn === 'b' && gameStatus === 'active'}
                    timeRemainingMs={clocks.b}
                    capturedPieces={captures.b}
                    materialDelta={-material.delta}
                    isThinking={activeThinking.side === 'b'}
                    thoughtText={latestBlackThought}
                  />

                  {/* Chess Board */}
                  <ChessBoard
                    chess={store.getChess()}
                    lastMove={lastMove}
                    inCheck={inCheck}
                    turn={activeTurn}
                  />

                  {/* White Player Panel (Bottom) */}
                  <PlayerPanel
                    model={whiteModel}
                    color="white"
                    isTurn={activeTurn === 'w' && gameStatus === 'active'}
                    timeRemainingMs={clocks.w}
                    capturedPieces={captures.w}
                    materialDelta={material.delta}
                    isThinking={activeThinking.side === 'w'}
                    thoughtText={latestWhiteThought}
                  />

                  {/* Game Result Banner */}
                  {gameResult && (
                    <div
                      className="card-panel"
                      style={{
                        width: '100%',
                        maxWidth: '540px',
                        textAlign: 'center',
                        padding: '14px',
                        background:
                          gameResult.winner === 'draw'
                            ? 'rgba(100, 116, 139, 0.2)'
                            : 'rgba(124, 58, 237, 0.2)',
                        borderColor:
                          gameResult.winner === 'draw'
                            ? 'var(--text-muted)'
                            : 'var(--neon-violet)',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', color: '#ffffff' }}>
                        {gameResult.description}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Benchmark ratings and PGN records updated.
                      </div>
                    </div>
                  )}
                </section>

                {/* Right Column: Live Neural Feed (Tool Calls & Reasoning) */}
                <aside>
                  <NeuralFeed
                    logs={allLogs}
                    activeThinking={activeThinking}
                    whiteModel={whiteModel}
                    blackModel={blackModel}
                  />
                </aside>
              </>
            );
          })()}
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
