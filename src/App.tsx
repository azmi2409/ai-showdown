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
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('arena');

  // Stored state
  const [allModels, setAllModels] = useState<ModelConfig[]>(() => storageService.getAllModels());
  const [apiKeys, setApiKeys] = useState<ApiKeysConfig>(() => storageService.getApiKeys());
  const [metrics, setMetrics] = useState<Record<string, BenchmarkMetrics>>(() =>
    storageService.getBenchmarkMetrics()
  );
  const [customModels, setCustomModels] = useState<ModelConfig[]>(() =>
    storageService.getCustomModels()
  );

  // Match settings
  const [whiteModel, setWhiteModel] = useState<ModelConfig>(
    () => allModels[0] || DEFAULT_MODELS[0]
  );
  const [blackModel, setBlackModel] = useState<ModelConfig>(
    () => allModels[2] || allModels[1] || DEFAULT_MODELS[1]
  );
  const [timeControl, setTimeControl] = useState<TimeControl>({
    name: 'Blitz 3+2',
    baseSeconds: 180,
    incrementSeconds: 2,
  });
  const [speedMode, setSpeedMode] = useState<SpeedMode>('0.5s');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // Tournament state
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [isAutoRunningTournament, setIsAutoRunningTournament] = useState(false);
  const currentTourneyMatchRef = useRef<{
    match: TournamentMatch;
    roundIndex: number;
    matchIndex: number;
  } | null>(null);

  // Telemetry logs
  const [neuralLogs, setNeuralLogs] = useState<NeuralLogEntry[]>([]);

  // Initialize GameStateStore & Orchestrator
  const store = useMemo(() => new GameStateStore(timeControl), []);
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

  // Handle Game Finished Callback
  useEffect(() => {
    orchestrator.setGameFinishedCallback((result: GameResult) => {
      // Refresh benchmark metrics from storage
      setMetrics(storageService.getBenchmarkMetrics());

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
  }, [tournament, isAutoRunningTournament]);

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
    store.reset(tournament?.timeControl || timeControl);
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
    storageService.resetAllData();
    setMetrics(storageService.getBenchmarkMetrics());
    setCustomModels([]);
    setAllModels(storageService.getAllModels());
    setTournament(null);
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
              }}
              onSelectBlack={(m) => {
                setBlackModel(m);
                store.reset(timeControl);
              }}
              onSelectTimeControl={(tc) => {
                setTimeControl(tc);
                store.reset(tc);
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
