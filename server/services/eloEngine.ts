import { MatchEloChange, MatchTelemetry, WinnerOutcome } from '../types';

export interface EloCalculationInput {
  whiteRating: number;
  blackRating: number;
  whiteGamesPlayed: number;
  blackGamesPlayed: number;
  winner: WinnerOutcome;
  telemetry?: MatchTelemetry;
}

export class EloEngine {
  // White tempo advantage in chess (~54% equity) corresponds to approx +35 Elo points
  private static readonly WHITE_TEMPO_BONUS = 35;

  /**
   * Determine dynamic K-factor based on number of games played and rating tier (FIDE standard adapted)
   */
  public static getKFactor(gamesPlayed: number, currentRating: number): number {
    if (gamesPlayed < 10) {
      // Provisional phase: rapid calibration
      return 40;
    }
    if (currentRating >= 2400 || gamesPlayed >= 30) {
      // High experience or master tier: stable ratings
      return 16;
    }
    // Established tier
    return 24;
  }

  /**
   * Calculate expected scores accounting for White's first-move advantage
   */
  public static getExpectedScores(whiteRating: number, blackRating: number): {
    expectedWhite: number;
    expectedBlack: number;
  } {
    // White expectation incorporates tempo bonus
    const effectiveWhiteRating = whiteRating + this.WHITE_TEMPO_BONUS;
    const exponent = (blackRating - effectiveWhiteRating) / 400;
    const expectedWhite = 1 / (1 + Math.pow(10, exponent));
    const expectedBlack = 1 - expectedWhite;

    return { expectedWhite, expectedBlack };
  }

  /**
   * Calculate full ELO change with quality and penalty adjustments
   */
  public static calculateEloChange(input: EloCalculationInput): MatchEloChange {
    const {
      whiteRating,
      blackRating,
      whiteGamesPlayed,
      blackGamesPlayed,
      winner,
      telemetry,
    } = input;

    const kFactorWhite = this.getKFactor(whiteGamesPlayed, whiteRating);
    const kFactorBlack = this.getKFactor(blackGamesPlayed, blackRating);

    const { expectedWhite, expectedBlack } = this.getExpectedScores(
      whiteRating,
      blackRating
    );

    let actualScoreWhite = 0.5;
    let actualScoreBlack = 0.5;

    if (winner === 'w') {
      actualScoreWhite = 1.0;
      actualScoreBlack = 0.0;
    } else if (winner === 'b') {
      actualScoreWhite = 0.0;
      actualScoreBlack = 1.0;
    }

    let whiteDelta = Math.round(kFactorWhite * (actualScoreWhite - expectedWhite));
    let blackDelta = Math.round(kFactorBlack * (actualScoreBlack - expectedBlack));

    // Recovery assists penalty adjustment:
    // If a model needed recovery assists due to invalid attempts, deduct a penalty
    if (telemetry) {
      if (telemetry.whiteForfeit) {
        whiteDelta = Math.min(whiteDelta, -10);
      }
      if (telemetry.blackForfeit) {
        blackDelta = Math.min(blackDelta, -10);
      }
      if (telemetry.recoveryAssistsCount && telemetry.recoveryAssistsCount > 0) {
        if (winner === 'w') {
          // Reduce win reward by 2 points per assist
          whiteDelta = Math.max(1, whiteDelta - telemetry.recoveryAssistsCount * 2);
        } else if (winner === 'b') {
          blackDelta = Math.max(1, blackDelta - telemetry.recoveryAssistsCount * 2);
        }
      }
    }

    return {
      whiteDelta,
      blackDelta,
      whiteBefore: whiteRating,
      blackBefore: blackRating,
      whiteAfter: whiteRating + whiteDelta,
      blackAfter: blackRating + blackDelta,
      kFactorWhite,
      kFactorBlack,
    };
  }
}
