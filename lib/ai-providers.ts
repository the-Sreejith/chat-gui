export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  provider: 'openrouter' | 'gemini';
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error' | 'start';
  content?: string;
  delta?: string;
  error?: string;
  metadata?: any;
  [key: string]: any;
}

export class OpenRouterAPI {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], model = 'anthropic/claude-3.5-sonnet'): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
          'X-Title': 'AI Chat App',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenRouter API error: ${response.statusText} - ${errorData}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      const usage = data.usage || {};
      
      return {
        content,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        provider: 'openrouter',
      };
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }

  async *chatStream(messages: ChatMessage[], model = 'anthropic/claude-3.5-sonnet'): AsyncGenerator<StreamChunk> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
          'X-Title': 'AI Chat App',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                yield { type: 'done' };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  yield {
                    type: 'content',
                    delta,
                  };
                }
              } catch (e) {
                // Skip invalid JSON lines
                console.warn('Failed to parse OpenRouter streaming JSON:', data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield { type: 'done' };
    } catch (error) {
      console.error('OpenRouter streaming error:', error);
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown streaming error'
      };
    }
  }
}

export class GeminiAPI {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], model = 'gemini-1.5-pro'): Promise<ChatResponse> {
    try {
      // Convert messages to Gemini format
      const contents = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Gemini API error: ${response.statusText} - ${errorData}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract token usage from response
      const usageMetadata = data.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      return {
        content,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        provider: 'gemini',
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  async *chatStream(messages: ChatMessage[], model = 'gemini-1.5-pro'): AsyncGenerator<StreamChunk> {
    try {
      // Convert messages to Gemini format
      const contents = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

      const response = await fetch(
        `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let hasReceivedContent = false;
      let accumulatedContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Try to parse complete JSON objects from the buffer
          let startIndex = 0;
          let braceCount = 0;
          let inString = false;
          let escaped = false;
          
          for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];
            
            if (escaped) {
              escaped = false;
              continue;
            }
            
            if (char === '\\' && inString) {
              escaped = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') {
                if (braceCount === 0) {
                  startIndex = i;
                }
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                
                if (braceCount === 0) {
                  // Found a complete JSON object
                  const jsonStr = buffer.slice(startIndex, i + 1);
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    
                    // Handle complete response (non-streaming)
                    if (parsed.candidates?.[0]?.content?.parts?.[0]?.text && 
                        parsed.candidates[0].finishReason === 'STOP') {
                      
                      const fullContent = parsed.candidates[0].content.parts[0].text;
                      
                      // If we haven't received any streaming content, simulate streaming
                      if (!hasReceivedContent) {
                        console.log('🔄 Gemini returned complete response, simulating streaming...');
                        
                        // Split content into words for simulated streaming
                        const words = fullContent.split(' ');
                        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
                          const word = words[wordIndex] + (wordIndex < words.length - 1 ? ' ' : '');
                          accumulatedContent += word;
                          
                          yield {
                            type: 'content',
                            delta: word,
                          };
                          hasReceivedContent = true;
                          
                          // Small delay to simulate streaming
                          await new Promise(resolve => setTimeout(resolve, 20));
                        }
                      }
                      
                      yield { type: 'done' };
                      return;
                    }
                    
                    // Handle actual streaming chunks
                    const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (delta) {
                      hasReceivedContent = true;
                      accumulatedContent += delta;
                      yield {
                        type: 'content',
                        delta,
                      };
                    }
                    
                    // Check for completion in streaming mode
                    const finishReason = parsed.candidates?.[0]?.finishReason;
                    if (finishReason === 'STOP' || finishReason === 'MAX_TOKENS') {
                      yield { type: 'done' };
                      return;
                    }
                    
                  } catch (parseError) {
                    console.warn('Failed to parse Gemini JSON object:', jsonStr.substring(0, 100) + '...');
                  }
                  
                  // Remove the processed JSON from buffer
                  buffer = buffer.slice(i + 1);
                  i = -1; // Reset loop
                  braceCount = 0;
                  startIndex = 0;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // If we received content but no explicit done signal, mark as done
      if (hasReceivedContent) {
        yield { type: 'done' };
      } else {
        throw new Error('No content received from Gemini stream');
      }

    } catch (error) {
      console.error('Gemini streaming error:', error);
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown streaming error'
      };
    }
  }
}

export class AIProviderManager {
  private openRouter?: OpenRouterAPI;
  private gemini?: GeminiAPI;

  constructor() {
    if (process.env.OPENROUTER_API_KEY) {
      this.openRouter = new OpenRouterAPI(process.env.OPENROUTER_API_KEY);
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GeminiAPI(process.env.GEMINI_API_KEY);
    }
  }

  async chat(
    messages: ChatMessage[], 
    provider: 'openrouter' | 'gemini',
    modelIdentifier?: string
  ): Promise<ChatResponse> {
    if (provider === 'openrouter' && this.openRouter) {
      return await this.openRouter.chat(messages, modelIdentifier);
    }
    
    if (provider === 'gemini' && this.gemini) {
      return await this.gemini.chat(messages, modelIdentifier);
    }

    // Fallback to available provider
    if (this.openRouter) {
      return await this.openRouter.chat(messages, modelIdentifier);
    }
    
    if (this.gemini) {
      return await this.gemini.chat(messages, modelIdentifier);
    }

    throw new Error('No AI providers available. Please configure API keys.');
  }

  async *chatStream(
    messages: ChatMessage[], 
    provider: 'openrouter' | 'gemini',
    modelIdentifier?: string
  ): AsyncGenerator<StreamChunk> {
    try {
      if (provider === 'openrouter' && this.openRouter) {
        yield* this.openRouter.chatStream(messages, modelIdentifier);
        return;
      }
      
      if (provider === 'gemini' && this.gemini) {
        yield* this.gemini.chatStream(messages, modelIdentifier);
        return;
      }

      // Fallback to available provider
      if (this.openRouter) {
        yield* this.openRouter.chatStream(messages, modelIdentifier);
        return;
      }
      
      if (this.gemini) {
        yield* this.gemini.chatStream(messages, modelIdentifier);
        return;
      }

      throw new Error('No AI providers available. Please configure API keys.');
    } catch (error) {
      console.error('AI Provider Manager streaming error:', error);
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Provider streaming failed'
      };
    }
  }
}