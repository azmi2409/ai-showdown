import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Header } from './components/Header';
import { ChessBoard } from './components/ChessBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { ArenaControls } from './components/ArenaControls';
import { MoveHistory } from './components/MoveHistory';
import { NeuralFeed } from './components/NeuralFeed';
import { TournamentView } from './components/TournamentView';
import { MatchesView } from './components/MatchesView';
import { LeaderboardView } from './components/LeaderboardView';
import { SettingsView } from './components/SettingsView';
import { TournamentIntroOverlay } from './components/TournamentIntroOverlay';
import { gameClient, SpeedMode } from './services/gameClient';
import { storageService } from './services/storageService';
import { audioService } from './services/audioService';
import { apiService } from './services/apiService';
import { TournamentManager } from './services/tournamentManager';
import { AlgorithmEngine } from './services/algorithmEngine';
import { DEFAULT_MODELS } from './services/defaultModels';
import { useGameStore } from './store/useGameStore';
import {
  ApiKeysConfig,
  BenchmarkMetrics,
  GameMode,
  GameResult,
  ModelConfig,
  TimeControl,
  TournamentMatch,
  TournamentType,
} from './types';

export const App: React.FC = () => {
  // Zustand State Store
  const liveGame = useGameStore((s) => s.liveGame);
  const tournament = useGameStore((s) => s.tournament);
  const isAutoRunningTournament = useGameStore((s) => s.isAutoRunningTournament);
  const introMatch = useGameStore((s) => s.introMatch);
  const activeTab = useGameStore((s) => s.activeTab);
  const allModels = useGameStore((s) => s.allModels);
  const apiKeys = useGameStore((s) => s.apiKeys);
  const metrics = useGameStore((s) => s.metrics);
  const customModels = useGameStore((s) => s.customModels);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const gameMode = useGameStore((s) => s.gameMode);
  const spectatorVision = useGameStore((s) => s.spectatorVision);
  const whiteModifiers = useGameStore((s) => s.whiteModifiers);
  const blackModifiers = useGameStore((s) => s.blackModifiers);

  const setTournament = useGameStore((s) => s.setTournament);
  const setIsAutoRunningTournament = useGameStore((s) => s.setIsAutoRunningTournament);
  const setIntroMatch = useGameStore((s) => s.setIntroMatch);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const setAudioEnabled = useGameStore((s) => s.setAudioEnabled);
  const setAllModels = useGameStore((s) => s.setAllModels);
  const setApiKeys = useGameStore((s) => s.setApiKeys);
  const setMetrics = useGameStore((s) => s.setMetrics);
  const setCustomModels = useGameStore((s) => s.setCustomModels);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setSpectatorVision = useGameStore((s) => s.setSpectatorVision);
  const setWhiteModifiers = useGameStore((s) => s.setWhiteModifiers);
  const setBlackModifiers = useGameStore((s) => s.setBlackModifiers);

  // Retrieve persisted selections & saved game state
  const initialSelections = useMemo(() => storageService.getArenaSelections(), []);

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

  const tournamentRef = useRef(tournament);
  tournamentRef.current = tournament;

  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTourneyMatchRef = useRef<{
    match: TournamentMatch;
    roundIndex: number;
    matchIndex: number;
  } | null>(null);

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

  // Tournament execution helper (triggers the match in arena)
  const executeLaunchTournamentMatch = useCallback(
    (match: TournamentMatch, roundIndex: number, matchIndex: number) => {
      if (!match.white || !match.black) return;

      currentTourneyMatchRef.current = { match, roundIndex, matchIndex };
      setWhiteModel(match.white);
      setBlackModel(match.black);
      const matchTc = tournamentRef.current?.timeControl || timeControl;
      setTimeControl(matchTc);

      setActiveTab('arena');

      const tourneyMode = tournamentRef.current?.gameMode || 'standard';
      const tourneyMatchId = `match_${Date.now()}_r${roundIndex + 1}_m${matchIndex + 1}`;
      gameClient.startGame({
        matchId: tourneyMatchId,
        whiteModel: match.white,
        blackModel: match.black,
        timeControl: matchTc,
        speedMode,
        gameMode: tourneyMode,
        whiteModifiers: useGameStore.getState().whiteModifiers,
        blackModifiers: useGameStore.getState().blackModifiers,
        tournamentId: tournamentRef.current?.id || null,
        roundNumber: roundIndex + 1,
        matchIndex,
      });
    },
    [timeControl, speedMode]
  );

  // Tournament queue helper (displays VS intro animation before match start)
  const queueTournamentMatch = useCallback(
    (match: TournamentMatch, roundIndex: number, matchIndex: number) => {
      if (!match.white || !match.black) return;

      const currentTourney = tournamentRef.current;
      const round = currentTourney?.rounds[roundIndex];
      const roundName = round?.name || `Round ${roundIndex + 1}`;
      const totalInRound = round?.matches.length;
      const tourneyTitle = currentTourney?.title || 'Championship Tournament';

      // Always auto-advance in tournament mode
      setIsAutoRunningTournament(true);
      setActiveTab('arena');

      setIntroMatch({
        match,
        roundIndex,
        matchIndex,
        roundName,
        totalMatchesInRound: totalInRound,
        tournamentTitle: tourneyTitle,
        gameMode: currentTourney?.gameMode || 'standard',
        white: match.white,
        black: match.black,
      });
    },
    []
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

      // If playing a tournament match, update bracket and launch next match automatically
      const currentTourney = tournamentRef.current;
      if (currentTourney && currentTourneyMatchRef.current) {
        const { roundIndex, matchIndex } = currentTourneyMatchRef.current;
        const updatedTourney = TournamentManager.recordMatchResult(
          currentTourney,
          roundIndex,
          matchIndex,
          result
        );
        setTournament(updatedTourney);
        storageService.saveTournament(updatedTourney);
        apiService.saveTournament(updatedTourney);
        currentTourneyMatchRef.current = null;

        if (updatedTourney.status === 'completed') {
          setIsAutoRunningTournament(false);
          // Auto switch to tournament view to see the champion podium after 2 seconds
          setTimeout(() => {
            setActiveTab('tournament');
          }, 2000);
        } else if (isAutoRunningTournament) {
          if (autoRunTimerRef.current) {
            clearTimeout(autoRunTimerRef.current);
          }
          // Short 1.5s delay to view win/draw banner, then pop up VS intro for next duel
          autoRunTimerRef.current = setTimeout(() => {
            autoRunTimerRef.current = null;
            const nextMatch = TournamentManager.getNextPendingMatch(updatedTourney);
            if (nextMatch) {
              queueTournamentMatch(nextMatch.match, nextMatch.roundIndex, nextMatch.matchIndex);
            } else {
              setIsAutoRunningTournament(false);
            }
          }, 1500);
        }
      }
    });

    return () => {
      if (autoRunTimerRef.current) {
        clearTimeout(autoRunTimerRef.current);
        autoRunTimerRef.current = null;
      }
      gameClient.setGameOverCallback(() => {});
    };
  }, [isAutoRunningTournament, queueTournamentMatch]);

  // Arena Actions
  const handleStartGame = () => {
    const isWhiteAlgo = whiteModel.provider === 'algorithm' || AlgorithmEngine.isAlgorithmModel(whiteModel.id);
    const isBlackAlgo = blackModel.provider === 'algorithm' || AlgorithmEngine.isAlgorithmModel(blackModel.id);
    if (isWhiteAlgo && isBlackAlgo) {
      alert('Algorithm vs Algorithm duels are not allowed. Please select an AI model for at least one side.');
      return;
    }

    const newMatchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    gameClient.startGame({
      matchId: newMatchId,
      whiteModel,
      blackModel,
      timeControl,
      speedMode,
      gameMode,
      whiteModifiers,
      blackModifiers,
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
    URL.revokeObjectURL(url);
  };

  // Tournament Actions
  const handleInitTournament = (
    title: string,
    type: TournamentType,
    models: ModelConfig[],
    tc: TimeControl,
    randomizeSeeding: boolean = true,
    mode: GameMode = 'standard'
  ) => {
    const newTourney = TournamentManager.createTournament(title, type, models, tc, randomizeSeeding, mode);
    setTournament(newTourney);
    storageService.saveTournament(newTourney);
  };


  const handleAutoRunToggle = () => {
    if (isAutoRunningTournament) {
      if (autoRunTimerRef.current) {
        clearTimeout(autoRunTimerRef.current);
        autoRunTimerRef.current = null;
      }
      setIsAutoRunningTournament(false);
      setIntroMatch(null);
    } else {
      setIsAutoRunningTournament(true);
      if (tournament && !currentTourneyMatchRef.current) {
        const next = TournamentManager.getNextPendingMatch(tournament);
        if (next) {
          queueTournamentMatch(next.match, next.roundIndex, next.matchIndex);
        }
      }
    }
  };

  const handleResetTournament = () => {
    if (autoRunTimerRef.current) {
      clearTimeout(autoRunTimerRef.current);
      autoRunTimerRef.current = null;
    }
    setIntroMatch(null);
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
              gameMode={liveGame.gameMode || gameMode}
              spectatorVision={spectatorVision}
              whiteModifiers={liveGame.whiteModifiers || whiteModifiers}
              blackModifiers={liveGame.blackModifiers || blackModifiers}
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
              onSetGameMode={setGameMode}
              onSetSpectatorVision={setSpectatorVision}
              onSetWhiteModifiers={setWhiteModifiers}
              onSetBlackModifiers={setBlackModifiers}
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
              modifiers={liveGame.gameMode === 'mutators' ? liveGame.blackModifiers || blackModifiers : undefined}
            />

            {/* Chess Board */}
            <ChessBoard
              chess={liveChess}
              lastMove={lastMove}
              inCheck={liveGame.inCheck}
              turn={liveGame.turn}
              gameMode={liveGame.gameMode || gameMode}
              portalSquares={liveGame.portalSquares}
              fogVision={liveGame.fogVision}
              spectatorVision={spectatorVision}
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
              modifiers={liveGame.gameMode === 'mutators' ? liveGame.whiteModifiers || whiteModifiers : undefined}
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
          onLaunchMatch={queueTournamentMatch}
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

      {/* Tournament Match Versus Intro Animation Overlay */}
      {introMatch && (
        <TournamentIntroOverlay
          isOpen={true}
          roundName={introMatch.roundName}
          matchIndex={introMatch.matchIndex}
          totalMatchesInRound={introMatch.totalMatchesInRound}
          tournamentTitle={introMatch.tournamentTitle}
          gameMode={introMatch.gameMode}
          whiteModel={introMatch.white}
          blackModel={introMatch.black}
          onStartMatch={() => {
            const m = introMatch;
            setIntroMatch(null);
            if (m) {
              executeLaunchTournamentMatch(m.match, m.roundIndex, m.matchIndex);
            }
          }}
          onCancel={() => {
            setIntroMatch(null);
            setIsAutoRunningTournament(false);
          }}
        />
      )}
    </div>
  );
};

export default App;
