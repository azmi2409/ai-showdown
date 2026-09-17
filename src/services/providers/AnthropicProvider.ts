import { ConversationMessage } from '../../types';
import { AgentProvider, AgentTurnResponse, ParsedToolCall, ToolDefinition } from './types';

export class AnthropicProvider implements AgentProvider {
  private defaultBaseUrl: string;

  constructor(defaultBaseUrl: string = 'https://api.anthropic.com/v1') {
    this.defaultBaseUrl = defaultBaseUrl;
  }

  public async sendTurn(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    modelIdentifier: string,
    apiKey?: string,
    customBaseUrl?: string,
    onStreamChunk?: (chunk: any) => void,
    signal?: AbortSignal
  ): Promise<AgentTurnResponse> {
    const startTime = performance.now();
    const baseUrl = customBaseUrl || this.defaultBaseUrl;

    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    // Separate system message from conversation messages
    let systemPrompt =
      'You are an elite chess-playing AI. You must use the provided chess tools to inspect the board and make legal chess moves in Standard Algebraic Notation (SAN).';
    const anthropicMessages: any[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        if (m.content) systemPrompt = m.content;
      } else if (m.role === 'user') {
        anthropicMessages.push({
          role: 'user',
          content: m.content || '',
        });
      } else if (m.role === 'assistant') {
        const contentBlocks: any[] = [];
        if (m.content) {
          contentBlocks.push({ type: 'text', text: m.content });
        }
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            let input = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
              input = { raw: tc.function.arguments };
            }
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
        }
        anthropicMessages.push({
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : m.content || '',
        });
      } else if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content || '{}',
            },
          ],
        });
      }
    }

    const payload = {
      model: modelIdentifier || 'claude-3-7-sonnet-20250219',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      temperature: 0.2,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'dangerously-allow-browser': 'true', // Required for browser requests
    };

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic Provider Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const toolCalls: ParsedToolCall[] = [];
    let textContent = '';

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      toolCalls,
      textContent: textContent || undefined,
      latencyMs,
      rawAssistantMessage: {
        role: 'assistant',
        content: textContent || undefined,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
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
