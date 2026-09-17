import { ConversationMessage } from '../../types';
import { AgentProvider, AgentTurnResponse, ParsedToolCall, StreamChunk, ToolDefinition } from './types';

export class OpenAIProvider implements AgentProvider {
  private defaultBaseUrl: string;

  constructor(defaultBaseUrl: string = 'http://localhost:20128/v1') {
    this.defaultBaseUrl = defaultBaseUrl;
  }

  public async sendTurn(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    modelIdentifier: string,
    apiKey?: string,
    customBaseUrl?: string,
    onStreamChunk?: (chunk: StreamChunk) => void
  ): Promise<AgentTurnResponse> {
    const startTime = performance.now();
    const baseUrl = customBaseUrl || this.defaultBaseUrl;

    const payload: any = {
      model: modelIdentifier,
      messages: messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: m.tool_call_id,
            content: m.content || '',
          };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role,
          content: m.content || '',
        };
      }),
      tools: tools.map((t) => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      })),
      tool_choice: 'auto',
      stream: true,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://ai-showdown.arena';
      headers['X-Title'] = 'AI Showdown Arena';
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Provider Error (${response.status}): ${errorText}`);
    }

    // Accumulators for streaming response
    let accumulatedContent = '';
    let accumulatedReasoning = '';
    const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          if (trimmed === 'data: [DONE]') continue;

          try {
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            const parsed = JSON.parse(jsonStr);
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;

            if (delta) {
              // 1. Thinking / Reasoning delta
              const reasoningChunk = delta.reasoning_content || '';
              if (reasoningChunk) {
                accumulatedReasoning += reasoningChunk;
                if (onStreamChunk) {
                  onStreamChunk({ thinking: reasoningChunk, text: accumulatedReasoning });
                }
              }

              // 2. Regular Content delta
              const contentChunk = delta.content || '';
              if (contentChunk) {
                accumulatedContent += contentChunk;
                if (!reasoningChunk && onStreamChunk) {
                  onStreamChunk({ text: accumulatedContent });
                }
              }

              // 3. Tool Calls delta
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap[idx]) {
                    toolCallsMap[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: tc.function?.name || '',
                      arguments: '',
                    };
                  }
                  if (tc.function?.name) {
                    toolCallsMap[idx].name = tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    toolCallsMap[idx].arguments += tc.function.arguments;
                    if (onStreamChunk) {
                      onStreamChunk({ toolArgs: toolCallsMap[idx].arguments });
                    }
                  }
                }
              }
            }
          } catch {
            // ignore JSON parse partial line errors
          }
        }
      }
    }

    const toolCalls: ParsedToolCall[] = [];
    const rawToolCalls: any[] = [];

    for (const key of Object.keys(toolCallsMap).sort((a, b) => Number(a) - Number(b))) {
      const tc = toolCallsMap[Number(key)];
      let args: any = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = { raw: tc.arguments };
      }

      // If reasoning was returned in reasoning_content, attach it if missing
      if (!args.reasoning && accumulatedReasoning) {
        args.reasoning = accumulatedReasoning.slice(0, 300).trim();
      }

      toolCalls.push({
        id: tc.id,
        name: (tc.name as any) || 'make_move',
        arguments: args,
      });

      rawToolCalls.push({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      });
    }

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      toolCalls,
      textContent: accumulatedReasoning || accumulatedContent || undefined,
      latencyMs,
      rawAssistantMessage: {
        role: 'assistant',
        content: accumulatedContent || undefined,
        tool_calls: rawToolCalls.length > 0 ? rawToolCalls : undefined,
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
