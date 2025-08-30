import type {HealthStatus, OAuthStatus, SearchResult} from '@/types/api';
import {ApiError} from '@/types/api';
import {searchService} from './search-service';

// Additional types for AI-powered features
export interface ConversationalSearchResult {
  response: string;
  searchResults: SearchResult[];
  conversationId: string;
  toolsUsed: string[];
}

export interface HybridSearchResult {
  directResults: SearchResult[];
  aiResponse: string;
  combinedResults: SearchResult[];
  conversationId: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
}

/**
 * API Client for Knowledge Search App
 * Now uses direct MCP operations instead of backend HTTP calls
 * Maintains the same interface for compatibility with existing code
 */
export class ApiClient {
  constructor() {
    // No longer needs baseUrl since we're using direct MCP operations
  }

  /**
   * Search across connected services (Notion and Asana)
   */
  async search(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new ApiError('Search query cannot be empty');
    }

    try {
      return await searchService.search(query);
    } catch (error) {
      // Re-throw ApiError as-is, wrap others
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check health status of the API
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      return await searchService.healthCheck();
    } catch (error) {
      // Return error state if health check fails
      return {
        success: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get OAuth connection status for all services
   */
  async getOAuthStatus(): Promise<OAuthStatus> {
    try {
      return await searchService.getOAuthStatus();
    } catch (error) {
      // Return default disconnected state on error
      console.error('OAuth status check failed:', error);
      return {
        notion: {connected: false, needsAuth: true},
        asana: {connected: false, needsAuth: true}
      };
    }
  }

  /**
   * AI-powered conversational search
   * Uses Claude with MCP tools for intelligent search
   */
  async conversationalSearch(
    message: string,
    conversationId?: string
  ): Promise<ConversationalSearchResult> {
    if (!message || message.trim().length === 0) {
      throw new ApiError('Message cannot be empty');
    }

    try {
      return await searchService.conversationalSearch(message, conversationId);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        `AI search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Hybrid search combining direct search with AI interpretation
   */
  async hybridSearch(query: string): Promise<HybridSearchResult> {
    if (!query || query.trim().length === 0) {
      throw new ApiError('Search query cannot be empty');
    }

    try {
      return await searchService.hybridSearch(query);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        `Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a new conversation for AI-assisted search
   */
  createConversation(): string {
    return searchService.createConversation();
  }

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId: string) {
    return searchService.getConversationHistory(conversationId);
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): boolean {
    return searchService.clearConversation(conversationId);
  }

  /**
   * Get agent statistics
   */
  async getAgentStats() {
    return searchService.getAgentStats();
  }

  /**
   * Get search statistics for results
   */
  getSearchStats(results: SearchResult[]) {
    return searchService.getSearchStats(results);
  }
}

// Export a default instance
export const apiClient = new ApiClient();

// Export the class for custom instances if needed
export default ApiClient;