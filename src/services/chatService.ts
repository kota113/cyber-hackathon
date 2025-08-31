export interface StreamMessage {
  type: 'text-delta' | 'tool:start' | 'done';
  delta?: string;
  name?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  isStreaming?: boolean;
}

export class ChatService {
  private static readonly BASE_URL = 'http://127.0.0.1:8000';

  static async* streamChat(query: string): AsyncGenerator<StreamMessage, void, unknown> {
    const response = await fetch(`${this.BASE_URL}/ask/stream`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({query}),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const {done, value} = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, {stream: true});
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              yield data as StreamMessage;
            } catch (error) {
              console.warn('Failed to parse SSE data:', line, error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  static generateMessageId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }
}