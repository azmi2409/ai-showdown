import { Chess } from 'chess.js';
import { ConversationMessage } from '../../types';
import { AgentProvider, AgentTurnResponse, ParsedToolCall, ToolDefinition } from './types';

// Personality heuristic evaluations and simulated reasoning
export class SimulatedProvider implements AgentProvider {
  private personaId: string;

  constructor(personaId: string = 'nexus-7') {
    this.personaId = personaId;
  }

  public async sendTurn(
    messages: ConversationMessage[],
    _tools: ToolDefinition[],
    modelIdentifier: string,
    _apiKey?: string,
    _customBaseUrl?: string,
    onStreamChunk?: (chunk: any) => void,
    signal?: AbortSignal
  ): Promise<AgentTurnResponse> {
    const startTime = performance.now();
    const persona = modelIdentifier || this.personaId;

    // Simulate thinking delay based on model persona
    const delay =
      persona === 'blitz-9'
        ? 150 + Math.random() * 150
        : persona === 'oracle'
        ? 600 + Math.random() * 400
        : 300 + Math.random() * 300;

    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    // Extract current game board state from conversation or re-create
    // Find the latest FEN or board info if available
    let fen: string | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.content && msg.content.includes('board_fen')) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.board_fen) {
            fen = parsed.board_fen;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });

    if (legalMoves.length === 0) {
      // Checkmate or stalemate
      const toolCall: ParsedToolCall = {
        id: `call_${Math.random().toString(36).substring(2, 9)}`,
        name: 'resign',
        arguments: { reason: 'No legal moves available.' },
      };
      return {
        toolCalls: [toolCall],
        latencyMs: Math.round(performance.now() - startTime),
        rawAssistantMessage: {
          role: 'assistant',
          tool_calls: [
            {
              id: toolCall.id,
              type: 'function',
              function: {
                name: 'resign',
                arguments: JSON.stringify(toolCall.arguments),
              },
            },
          ],
        },
      };
    }

    // Determine move based on persona
    let chosenMove = legalMoves[0];
    let reasoning = 'Developing piece to an active square.';

    // Check if Hallucinator deliberately tries an illegal move
    const isHallucinator = persona.toLowerCase().includes('hallucinat');
    const triggerHallucination = isHallucinator && Math.random() < 0.35;

    if (triggerHallucination) {
      const illegalMoveSAN = 'Qe9#';
      const callId = `call_${Math.random().toString(36).substring(2, 9)}`;
      const toolCall: ParsedToolCall = {
        id: callId,
        name: 'make_move',
        arguments: {
          move: illegalMoveSAN,
          reasoning: 'I calculate queen infiltration on square e9 with decisive checkmate!',
        },
      };
      return {
        toolCalls: [toolCall],
        latencyMs: Math.round(performance.now() - startTime),
        rawAssistantMessage: {
          role: 'assistant',
          tool_calls: [
            {
              id: callId,
              type: 'function',
              function: {
                name: 'make_move',
                arguments: JSON.stringify(toolCall.arguments),
              },
            },
          ],
        },
      };
    }

    // Persona logic
    switch (persona) {
      case 'nexus-7': {
        // Aggressive: prefers captures, checks, and queen/rook forward advances
        const attackingMoves = legalMoves.filter(
          (m) => m.captured || m.san.includes('+') || ['q', 'r', 'b'].includes(m.piece)
        );
        chosenMove =
          attackingMoves.length > 0
            ? attackingMoves[Math.floor(Math.random() * attackingMoves.length)]
            : legalMoves[Math.floor(Math.random() * legalMoves.length)];
        reasoning = chosenMove.captured
          ? `Tactical strike! Capturing ${chosenMove.captured.toUpperCase()} on ${chosenMove.to} to weaken enemy defenses.`
          : chosenMove.san.includes('+')
          ? `Check! Forcing the enemy king into tactical discomfort.`
          : `Advancing ${chosenMove.piece.toUpperCase()} towards ${chosenMove.to} to seize kingside initiative.`;
        break;
      }

      case 'aria': {
        // Positional: controls central squares (d4, e4, d5, e5, c4, f4)
        const centralSquares = ['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5'];
        const centerMoves = legalMoves.filter((m) => centralSquares.includes(m.to));
        chosenMove =
          centerMoves.length > 0
            ? centerMoves[Math.floor(Math.random() * centerMoves.length)]
            : legalMoves[0];
        reasoning = `Solid positional structure. Securing central control of square ${chosenMove.to} and maximizing harmonic piece coordination.`;
        break;
      }

      case 'quantum': {
        // Chaotic / sacrifices / unorthodox moves
        chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        reasoning = `Quantum calculation: generating speculative complexity on ${chosenMove.to} to disrupt opponent evaluation.`;
        break;
      }

      case 'sentinel': {
        // Defensive: castling, pawn structure protection, safe king
        const castles = legalMoves.filter((m) => m.san.includes('O-O'));
        if (castles.length > 0) {
          chosenMove = castles[0];
          reasoning = 'King safety is paramount. Castling into defensive shelter.';
        } else {
          const safeMoves = legalMoves.filter((m) => !m.captured || m.piece === 'p');
          chosenMove = safeMoves.length > 0 ? safeMoves[0] : legalMoves[0];
          reasoning = `Reinforcing defensive perimeter on ${chosenMove.to}. Eliminating structural weaknesses.`;
        }
        break;
      }

      case 'blitz-9': {
        // Fast snap moves
        const fastMoves = legalMoves.filter((m) => m.captured || m.piece === 'n');
        chosenMove = fastMoves.length > 0 ? fastMoves[0] : legalMoves[0];
        reasoning = `Instant tempo play: striking square ${chosenMove.to} under clock pressure.`;
        break;
      }

      case 'scholar': {
        // Opening theory moves
        const openingMoves = legalMoves.filter((m) =>
          ['e4', 'e5', 'd4', 'd5', 'Nf3', 'Nc6', 'c4', 'Nf6', 'Bc4', 'Bb5'].includes(m.san)
        );
        chosenMove =
          openingMoves.length > 0
            ? openingMoves[0]
            : legalMoves[Math.floor(Math.random() * legalMoves.length)];
        reasoning = `Theoretical standard: classical development towards ${chosenMove.to}.`;
        break;
      }

      case 'oracle': {
        // Minimax heuristic evaluation (captures > checks > piece development)
        const sorted = [...legalMoves].sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;
          if (a.san.includes('#')) scoreA += 1000;
          if (b.san.includes('#')) scoreB += 1000;
          if (a.captured) scoreA += 50;
          if (b.captured) scoreB += 50;
          if (a.san.includes('+')) scoreA += 25;
          if (b.san.includes('+')) scoreB += 25;
          if (['d4', 'e4', 'd5', 'e5'].includes(a.to)) scoreA += 10;
          if (['d4', 'e4', 'd5', 'e5'].includes(b.to)) scoreB += 10;
          return scoreB - scoreA;
        });
        chosenMove = sorted[0];
        reasoning = `Deep evaluation: optimal engine path calculates +1.4 advantage via ${chosenMove.san}.`;
        break;
      }

      default: {
        chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        reasoning = `Executing tactical decision ${chosenMove.san} based on neural assessment.`;
      }
    }

    const callId = `call_${Math.random().toString(36).substring(2, 9)}`;
    const toolCall: ParsedToolCall = {
      id: callId,
      name: 'make_move',
      arguments: {
        move: chosenMove.san,
        reasoning,
      },
    };

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      toolCalls: [toolCall],
      latencyMs,
      rawAssistantMessage: {
        role: 'assistant',
        tool_calls: [
          {
            id: callId,
            type: 'function',
            function: {
              name: 'make_move',
              arguments: JSON.stringify(toolCall.arguments),
            },
          },
        ],
      },
    };
  }

  public formatToolResult(toolCallId: string, result: any): ConversationMessage {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify(result),
    };
  }
}
