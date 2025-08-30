import type {ToolExecutionResult} from './bedrock-client';
import {bedrockClient} from './bedrock-client';
import type {Tool} from '@aws-sdk/client-bedrock-runtime';
import {mcpClientManager} from './mcp-client';
import type {SearchResult} from '@/types/api';
import {ApiError} from '@/types/api';

// Agent conversation context
export interface AgentConversation {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    toolsUsed?: string[];
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Agent response with optional tool usage details
export interface AgentResponse {
  response: string;
  toolsUsed: string[];
  searchResults?: SearchResult[];
  conversationId: string;
}

/**
 * Agent Service - Combines LLM with MCP Tools
 * Orchestrates conversations between users and Claude with access to Notion/Asana via MCP
 */
export class AgentService {
  private conversations: Map<string, AgentConversation> = new Map();
  private systemPrompt = `You are a knowledgeable AI assistant with access to search tools for Notion and Asana. 
You can help users find information across their connected services.

Available tools:
- searchNotion: Search through Notion pages and databases
- searchAsana: Search through Asana projects and tasks
- searchAll: Search across both Notion and Asana simultaneously

When users ask questions, use the appropriate search tools to find relevant information. 
Always provide helpful, accurate responses based on the search results.
If no relevant information is found, let the user know and suggest alternative approaches.

Be conversational and helpful, and always cite the source of information when presenting search results.`;

  /**
   * Create a new conversation
   */
  createConversation(): string {
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const conversation: AgentConversation = {
      id: conversationId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.conversations.set(conversationId, conversation);
    console.log(`Created new conversation: ${conversationId}`);
    return conversationId;
  }

  /**
   * Send a message to the agent and get a response
   */
  async chat(message: string, conversationId?: string): Promise<AgentResponse> {
    if (!message || message.trim().length === 0) {
      throw new ApiError('Message cannot be empty');
    }

    // Create new conversation if none provided
    if (!conversationId) {
      conversationId = this.createConversation();
    }

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new ApiError('Conversation not found');
    }

    try {
      console.log(`Processing message in conversation ${conversationId}: "${message}"`);

      // Get MCP tools
      const tools = this.getMCPToolSpecs();

      // Send message to LLM with tools
      const llmResponse = await bedrockClient.converse(
        message,
        tools,
        this.systemPrompt
      );

      let finalResponse = llmResponse.response;
      const toolsUsed: string[] = [];
      const searchResults: SearchResult[] = [];

      // Execute tools if needed
      if (llmResponse.needsToolExecution && llmResponse.toolUses.length > 0) {
        console.log(`Executing ${llmResponse.toolUses.length} tools`);

        const toolResults: ToolExecutionResult[] = [];

        for (const toolUse of llmResponse.toolUses) {
          try {
            const result = await this.executeMCPTool(toolUse.name, toolUse.input);
            toolResults.push({
              toolUseId: toolUse.toolUseId,
              result
            });
            toolsUsed.push(toolUse.name);

            // Collect search results if the result is a SearchResult array
            if (Array.isArray(result) && result.length > 0 && 'source' in result[0]) {
              searchResults.push(...(result as SearchResult[]));
            }

          } catch (error) {
            console.error(`Tool execution failed for ${toolUse.name}:`, error);
            toolResults.push({
              toolUseId: toolUse.toolUseId,
              result: null,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Continue conversation with tool results
        finalResponse = await bedrockClient.continueWithToolResults(toolResults);
      }

      // Update conversation history
      conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      conversation.messages.push({
        role: 'assistant',
        content: finalResponse,
        timestamp: new Date(),
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
      });

      conversation.updatedAt = new Date();

      const response: AgentResponse = {
        response: finalResponse,
        toolsUsed,
        conversationId: conversationId,
        searchResults: searchResults.length > 0 ? searchResults : undefined
      };

      console.log(`Agent response generated for conversation ${conversationId}`);
      return response;

    } catch (error) {
      console.error('Agent chat error:', error);
      throw new ApiError(
        `Agent conversation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get conversation history
   */
  getConversation(conversationId: string): AgentConversation | null {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Get all conversations
   */
  getAllConversations(): AgentConversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      // Clear Bedrock conversation history if this was the active conversation
      bedrockClient.clearHistory();
      return this.conversations.delete(conversationId);
    }
    return false;
  }

  /**
   * Clear all conversations
   */
  clearAllConversations(): void {
    this.conversations.clear();
    bedrockClient.clearHistory();
    console.log('All conversations cleared');
  }

  /**
   * Get conversation statistics
   */
  getStats(): {
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
  } {
    const totalConversations = this.conversations.size;
    const totalMessages = Array.from(this.conversations.values())
      .reduce((total, conv) => total + conv.messages.length, 0);

    return {
      totalConversations,
      totalMessages,
      averageMessagesPerConversation: totalConversations > 0
        ? Math.round(totalMessages / totalConversations * 100) / 100
        : 0
    };
  }

  /**
   * Update system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    console.log('System prompt updated');
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Get available MCP tools as Bedrock tool specifications
   */
  private getMCPToolSpecs(): Tool[] {
    return [
      {
        toolSpec: {
          name: "searchNotion",
          description: "Search through Notion pages, databases, and content for specific information",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to find relevant Notion content"
                }
              },
              required: ["query"]
            }
          }
        }
      },
      {
        toolSpec: {
          name: "searchAsana",
          description: "Search through Asana projects, tasks, and content for specific information",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to find relevant Asana content"
                }
              },
              required: ["query"]
            }
          }
        }
      },
      {
        toolSpec: {
          name: "searchAll",
          description: "Search across both Notion and Asana simultaneously for comprehensive results",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to find relevant content across all connected services"
                }
              },
              required: ["query"]
            }
          }
        }
      }
    ];
  }

  /**
   * Execute MCP tool based on tool name and input
   */
  private async executeMCPTool(toolName: string, input: unknown): Promise<unknown> {
    const params = input as { query: string };

    if (!params.query || typeof params.query !== 'string') {
      throw new Error('Query parameter is required and must be a string');
    }

    console.log(`Executing MCP tool: ${toolName} with query: "${params.query}"`);

    switch (toolName) {
      case 'searchNotion':
        return await mcpClientManager.searchService('notion', params.query);

      case 'searchAsana':
        return await mcpClientManager.searchService('asana', params.query);

      case 'searchAll': {
        // Search both services in parallel
        const [notionResults, asanaResults] = await Promise.allSettled([
          mcpClientManager.searchService('notion', params.query),
          mcpClientManager.searchService('asana', params.query)
        ]);

        const allResults: SearchResult[] = [];

        if (notionResults.status === 'fulfilled') {
          allResults.push(...notionResults.value);
        }

        if (asanaResults.status === 'fulfilled') {
          allResults.push(...asanaResults.value);
        }

        return allResults;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();

// Export the class for custom instances
export default AgentService;