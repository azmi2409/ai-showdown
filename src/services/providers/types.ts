import { ConversationMessage, ToolCallEntry } from '../../types';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ParsedToolCall {
  id: string;
  name: 'make_move' | 'get_board_state' | 'get_legal_moves' | 'resign';
  arguments: Record<string, any>;
}

export interface AgentTurnResponse {
  toolCalls: ParsedToolCall[];
  textContent?: string;
  rawAssistantMessage: ConversationMessage;
  latencyMs: number;
}

export interface StreamChunk {
  text?: string;
  thinking?: string;
  toolArgs?: string;
}

export interface AgentProvider {
  sendTurn(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    modelIdentifier: string,
    apiKey?: string,
    customBaseUrl?: string,
    onStreamChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<AgentTurnResponse>;

  formatToolResult(toolCallId: string, result: any): ConversationMessage;
}
