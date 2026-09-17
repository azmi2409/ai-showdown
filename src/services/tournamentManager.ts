import {
  GameMode,
  GameResult,
  ModelConfig,
  TimeControl,
  TournamentMatch,
  TournamentRound,
  TournamentStanding,
  TournamentState,
  TournamentType,
} from '../types';
import { AlgorithmEngine } from './algorithmEngine';

export class TournamentManager {
  public static isAlgo(m?: ModelConfig | null): boolean {
    if (!m) return false;
    return (
      m.provider === 'algorithm' ||
      AlgorithmEngine.isAlgorithmModel(m.id) ||
      AlgorithmEngine.isAlgorithmModel(m.modelIdentifier)
    );
  }

  private static shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  public static createTournament(
    title: string,
    type: TournamentType,
    models: ModelConfig[],
    timeControl: TimeControl,
    randomizeSeeding: boolean = true,
    gameMode: GameMode = 'standard'
  ): TournamentState {
    const standings: TournamentStanding[] = models.map((m) => ({
      modelId: m.id,
      modelName: m.name,
      avatar: m.avatar,
      points: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      elo: m.simulatedElo || 1500,
    }));

    let rounds: TournamentRound[] = [];

    if (type === 'knockout') {
      rounds = this.generateKnockoutRounds(models, randomizeSeeding);
    } else {
      rounds = this.generateRoundRobinRounds(models, randomizeSeeding);
    }

    return {
      id: `tourney_${Date.now()}`,
      title,
      type,
      gameMode,
      models,
      timeControl,
      rounds,
      currentRoundIndex: 0,
      currentMatchIndex: 0,
      status: 'setup',
      winner: null,
      standings,
    };
  }

  private static generateKnockoutRounds(
    models: ModelConfig[],
    randomizeSeeding: boolean = true
  ): TournamentRound[] {
    const numParticipants = models.length;
    // Next power of 2
    let bracketSize = 4;
    while (bracketSize < numParticipants) {
      bracketSize *= 2;
    }

    // Seeding: randomized draw or ranked Elo seeding
    const seeded = randomizeSeeding
      ? this.shuffle(models)
      : [...models].sort((a, b) => (b.simulatedElo || 1500) - (a.simulatedElo || 1500));

    // Pad with byes if necessary
    const slots: (ModelConfig | null)[] = new Array(bracketSize).fill(null);
    for (let i = 0; i < seeded.length; i++) {
      slots[i] = seeded[i];
    }

    // STRICT CONSTRAINT: NEVER allow Algo vs Algo pairing in initial bracket seeding
    for (let i = 0; i < bracketSize / 2; i++) {
      const oppIdx = bracketSize - 1 - i;
      if (this.isAlgo(slots[i]) && this.isAlgo(slots[oppIdx])) {
        // Swap slots[oppIdx] with another slot that isn't an algo bot and isn't paired with an algo bot
        for (let k = 0; k < bracketSize / 2; k++) {
          if (k === i) continue;
          const kOpp = bracketSize - 1 - k;
          if (!this.isAlgo(slots[k]) && !this.isAlgo(slots[kOpp])) {
            const temp = slots[oppIdx];
            slots[oppIdx] = slots[k];
            slots[k] = temp;
            break;
          }
        }
      }
    }

    const rounds: TournamentRound[] = [];
    const totalRounds = Math.log2(bracketSize);

    // Round 1 matches
    const r1Matches: TournamentMatch[] = [];
    for (let i = 0; i < bracketSize / 2; i++) {
      const white = slots[i];
      const black = slots[bracketSize - 1 - i];

      const isBye = !black || !white;
      const winner = isBye ? white || black : null;

      r1Matches.push({
        id: `r1_m${i}`,
        round: 1,
        matchIndex: i,
        white,
        black,
        winner,
        result: isBye ? null : null,
        status: isBye ? 'bye' : 'pending',
      });
    }

    const roundNames = ['Finals', 'Semifinals', 'Quarterfinals', 'Round of 16'];
    const getRoundName = (rIndex: number, total: number) => {
      const fromFinal = total - rIndex;
      return roundNames[fromFinal - 1] || `Round ${rIndex + 1}`;
    };

    rounds.push({
      roundNumber: 1,
      name: getRoundName(0, totalRounds),
      matches: r1Matches,
    });

    // Subsequent rounds placeholders
    let matchesInRound = bracketSize / 4;
    for (let r = 1; r < totalRounds; r++) {
      const matches: TournamentMatch[] = [];
      for (let m = 0; m < matchesInRound; m++) {
        matches.push({
          id: `r${r + 1}_m${m}`,
          round: r + 1,
          matchIndex: m,
          white: null,
          black: null,
          winner: null,
          result: null,
          status: 'pending',
        });
      }
      rounds.push({
        roundNumber: r + 1,
        name: getRoundName(r, totalRounds),
        matches,
      });
      matchesInRound /= 2;
    }

    // Auto-advance byes from Round 1 to Round 2
    if (totalRounds > 1) {
      for (let i = 0; i < r1Matches.length; i++) {
        const m = r1Matches[i];
        if (m.status === 'bye' && m.winner) {
          const nextMatchIdx = Math.floor(i / 2);
          const isWhiteSlot = i % 2 === 0;
          const nextMatch = rounds[1].matches[nextMatchIdx];
          if (isWhiteSlot) {
            nextMatch.white = m.winner;
          } else {
            nextMatch.black = m.winner;
          }
        }
      }
    }

    return rounds;
  }

  private static generateRoundRobinRounds(
    models: ModelConfig[],
    randomizeSeeding: boolean = true
  ): TournamentRound[] {
    const n = models.length;
    const rounds: TournamentRound[] = [];
    const list = randomizeSeeding ? this.shuffle(models) : [...models];

    // If odd number, add a dummy bye
    if (n % 2 !== 0) {
      list.push({
        id: 'bye',
        name: 'BYE',
        provider: 'simulated',
        modelIdentifier: 'bye',
        avatar: '⏸️',
        badgeColor: '#64748b',
        playStyle: 'Bye',
        description: 'Bye round',
      });
    }

    const numTeams = list.length;
    const numRounds = numTeams - 1;
    const half = numTeams / 2;

    for (let r = 0; r < numRounds; r++) {
      const matches: TournamentMatch[] = [];
      for (let i = 0; i < half; i++) {
        const teamA = list[i];
        const teamB = list[numTeams - 1 - i];

        if (teamA.id !== 'bye' && teamB.id !== 'bye') {
          // STRICT CONSTRAINT: Never schedule Algorithm vs Algorithm matchups
          if (this.isAlgo(teamA) && this.isAlgo(teamB)) {
            continue;
          }

          // Alternate white and black
          const white = r % 2 === 0 ? teamA : teamB;
          const black = r % 2 === 0 ? teamB : teamA;

          matches.push({
            id: `rr_r${r + 1}_m${i}`,
            round: r + 1,
            matchIndex: i,
            white,
            black,
            winner: null,
            result: null,
            status: 'pending',
          });
        }
      }

      rounds.push({
        roundNumber: r + 1,
        name: `Round ${r + 1}`,
        matches,
      });

      // Rotate list (keeping element 0 fixed)
      const last = list.pop()!;
      list.splice(1, 0, last);
    }

    return rounds;
  }

  public static recordMatchResult(
    tourney: TournamentState,
    roundIndex: number,
    matchIndex: number,
    result: GameResult
  ): TournamentState {
    const updated = JSON.parse(JSON.stringify(tourney)) as TournamentState;
    const round = updated.rounds[roundIndex];
    if (!round) return updated;

    const match = round.matches[matchIndex];
    if (!match || !match.white || !match.black) return updated;

    match.result = result;
    match.status = 'completed';

    const winnerModel =
      result.winner === 'w'
        ? match.white
        : result.winner === 'b'
        ? match.black
        : null;

    match.winner = winnerModel;

    // Update standings
    const whiteStanding = updated.standings.find((s) => s.modelId === match.white!.id);
    const blackStanding = updated.standings.find((s) => s.modelId === match.black!.id);

    if (whiteStanding && blackStanding) {
      whiteStanding.played++;
      blackStanding.played++;

      if (result.winner === 'w') {
        whiteStanding.won++;
        whiteStanding.points += 3;
        blackStanding.lost++;
      } else if (result.winner === 'b') {
        blackStanding.won++;
        blackStanding.points += 3;
        whiteStanding.lost++;
      } else {
        whiteStanding.drawn++;
        blackStanding.drawn++;
        whiteStanding.points += 1;
        blackStanding.points += 1;
      }
    }

    // Sort standings by points descending
    updated.standings.sort((a, b) => b.points - a.points || b.won - a.won);

    // If knockout, advance winner to next round
    if (updated.type === 'knockout') {
      const nextRoundIndex = roundIndex + 1;
      if (nextRoundIndex < updated.rounds.length && winnerModel) {
        const nextMatchIdx = Math.floor(matchIndex / 2);
        const isWhiteSlot = matchIndex % 2 === 0;
        const nextMatch = updated.rounds[nextRoundIndex].matches[nextMatchIdx];

        if (isWhiteSlot) {
          nextMatch.white = winnerModel;
        } else {
          nextMatch.black = winnerModel;
        }
      } else if (nextRoundIndex >= updated.rounds.length && winnerModel) {
        // Grand champion crowned!
        updated.winner = winnerModel;
        updated.status = 'completed';
      }
    }

    // Check if tournament completed
    const allMatchesCompleted = updated.rounds.every((r) =>
      r.matches.every((m) => m.status === 'completed' || m.status === 'bye')
    );

    if (allMatchesCompleted) {
      updated.status = 'completed';
      if (updated.type === 'round-robin') {
        const topModel = updated.models.find(
          (m) => m.id === updated.standings[0]?.modelId
        );
        updated.winner = topModel || null;
      }
    }

    return updated;
  }

  public static getNextPendingMatch(
    tourney: TournamentState
  ): { roundIndex: number; matchIndex: number; match: TournamentMatch } | null {
    for (let r = 0; r < tourney.rounds.length; r++) {
      const round = tourney.rounds[r];
      for (let m = 0; m < round.matches.length; m++) {
        const match = round.matches[m];
        if (match.status === 'pending' && match.white && match.black) {
          return { roundIndex: r, matchIndex: m, match };
        }
      }
    }
    return null;
  }
}
