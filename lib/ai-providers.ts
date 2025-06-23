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
      
      // Rough token count estimation
      const inputTokens = Math.ceil(messages.map(m => m.content).join(' ').length / 4);
      const outputTokens = Math.ceil(content.length / 4);

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
}