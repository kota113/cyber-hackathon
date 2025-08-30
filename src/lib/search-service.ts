import {mcpClientManager} from './mcp-client';
import {agentService} from './agent-service';
import {oauthService} from './oauth-service';
import type {HealthStatus, OAuthStatus, SearchResult} from '@/types/api';
import {ApiError} from '@/types/api';

/**
 * Search Service - High-level business logic layer
 * Provides unified search interface and coordinates MCP operations
 * Maintains separation of concerns between data access and business logic
 */
export class SearchService {
  /**
   * Search across all connected services (Notion and Asana)
   * Executes searches in parallel and aggregates results
   */
  async search(query: string): Promise<SearchResult[]> {
    // Input validation
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new ApiError('Search query cannot be empty');
    }

    const trimmedQuery = query.trim();
    console.log(`Searching for: "${trimmedQuery}"`);

    try {
      // Search both services in parallel using Promise.allSettled for resilience
      const [notionResults, asanaResults] = await Promise.allSettled([
        mcpClientManager.searchService('notion', trimmedQuery),
        mcpClientManager.searchService('asana', trimmedQuery)
      ]);

      const allResults: SearchResult[] = [];

      // Collect Notion results
      if (notionResults.status === 'fulfilled') {
        allResults.push(...notionResults.value);
        console.log(`Found ${notionResults.value.length} Notion results`);
      } else {
        console.error('Notion search failed:', notionResults.reason);
        // Don't throw - continue with other services
      }

      // Collect Asana results
      if (asanaResults.status === 'fulfilled') {
        allResults.push(...asanaResults.value);
        console.log(`Found ${asanaResults.value.length} Asana results`);
      } else {
        console.error('Asana search failed:', asanaResults.reason);
        // Don't throw - continue with other services
      }

      // Sort results by relevance (newest first, then by source)
      const sortedResults = this.sortSearchResults(allResults);

      console.log(`Total search results: ${sortedResults.length}`);
      return sortedResults;

    } catch (error) {
      console.error('Search service error:', error);
      throw new ApiError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Get OAuth connection status for all services
   */
  async getOAuthStatus(): Promise<OAuthStatus> {
    try {
      // Use the server-side OAuth service for more accurate status
      const oauthStatus = await oauthService.getOAuthStatus();

      // Also check MCP client connection status for complete picture
      const [notionMcp, asanaMcp] = await Promise.allSettled([
        mcpClientManager.getConnectionStatus('notion'),
        mcpClientManager.getConnectionStatus('asana')
      ]);

      return {
        notion: {
          connected: oauthStatus.notion.connected && (
            notionMcp.status === 'fulfilled' ? notionMcp.value.connected : false
          ),
          needsAuth: oauthStatus.notion.needsAuth
        },
        asana: {
          connected: oauthStatus.asana.connected && (
            asanaMcp.status === 'fulfilled' ? asanaMcp.value.connected : false
          ),
          needsAuth: oauthStatus.asana.needsAuth
        }
      };
    } catch (error) {
      console.error('OAuth status check failed:', error);
      // Return default disconnected state on error
      return {
        notion: {connected: false, needsAuth: true},
        asana: {connected: false, needsAuth: true}
      };
    }
  }

  /**
   * Perform health check of the search service
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Check if we can get OAuth status (basic functionality test)
      const oauthStatus = await this.getOAuthStatus();

      const connectedServices = Object.entries(oauthStatus)
        .filter(([, status]) => status.connected)
        .map(([service]) => service);

      return {
        success: true,
        message: `Search service is healthy. Connected services: ${connectedServices.length > 0 ? connectedServices.join(', ') : 'none'}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        success: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Initialize connections to specific services
   * Useful for preemptive connection establishment
   */
  async initializeService(service: 'notion' | 'asana'): Promise<void> {
    try {
      await mcpClientManager.getClient(service);
      console.log(`Successfully initialized ${service} service`);
    } catch (error) {
      console.error(`Failed to initialize ${service} service:`, error);
      throw new ApiError(
        `Failed to initialize ${service}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Initialize all services
   */
  async initializeAllServices(): Promise<{ notion: boolean; asana: boolean }> {
    const [notionResult, asanaResult] = await Promise.allSettled([
      this.initializeService('notion'),
      this.initializeService('asana')
    ]);

    return {
      notion: notionResult.status === 'fulfilled',
      asana: asanaResult.status === 'fulfilled'
    };
  }

  /**
   * Disconnect from specific service
   */
  async disconnectService(service: 'notion' | 'asana'): Promise<void> {
    try {
      await mcpClientManager.disconnect(service);
      console.log(`Disconnected from ${service} service`);
    } catch (error) {
      console.error(`Failed to disconnect from ${service}:`, error);
      throw new ApiError(
        `Failed to disconnect from ${service}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from all services
   */
  async disconnectAll(): Promise<void> {
    try {
      await mcpClientManager.disconnectAll();
      console.log('Disconnected from all services');
    } catch (error) {
      console.error('Failed to disconnect from services:', error);
      throw new ApiError(
        `Failed to disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Filter search results by source
   */
  filterBySource(results: SearchResult[], source: 'notion' | 'asana'): SearchResult[] {
    return results.filter(result => result.source === source);
  }

  /**
   * Get search result statistics
   */
  getSearchStats(results: SearchResult[]): { total: number; notion: number; asana: number } {
    const notion = results.filter(r => r.source === 'notion').length;
    const asana = results.filter(r => r.source === 'asana').length;

    return {
      total: results.length,
      notion,
      asana
    };
  }

  /**
   * AI-assisted conversational search
   * Uses the agent service to provide intelligent search with context
   */
  async conversationalSearch(
    message: string,
    conversationId?: string
  ): Promise<{
    response: string;
    searchResults: SearchResult[];
    conversationId: string;
    toolsUsed: string[];
  }> {
    try {
      console.log(`Starting conversational search: "${message}"`);

      const agentResponse = await agentService.chat(message, conversationId);

      return {
        response: agentResponse.response,
        searchResults: agentResponse.searchResults || [],
        conversationId: agentResponse.conversationId,
        toolsUsed: agentResponse.toolsUsed
      };
    } catch (error) {
      console.error('Conversational search failed:', error);
      throw new ApiError(
        `AI search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Create a new conversation for AI-assisted search
   */
  createConversation(): string {
    return agentService.createConversation();
  }

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId: string) {
    return agentService.getConversation(conversationId);
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): boolean {
    return agentService.clearConversation(conversationId);
  }

  /**
   * Get agent statistics
   */
  getAgentStats() {
    return agentService.getStats();
  }

  /**
   * Hybrid search - combines direct search with AI interpretation
   * Useful for complex queries that benefit from AI understanding
   */
  async hybridSearch(query: string): Promise<{
    directResults: SearchResult[];
    aiResponse: string;
    combinedResults: SearchResult[];
    conversationId: string;
  }> {
    try {
      console.log(`Starting hybrid search for: "${query}"`);

      // Run direct search and AI search in parallel
      const [directResults, aiSearch] = await Promise.allSettled([
        this.search(query),
        this.conversationalSearch(query)
      ]);

      const direct = directResults.status === 'fulfilled' ? directResults.value : [];
      const ai = aiSearch.status === 'fulfilled' ? aiSearch.value : {
        response: 'AI search unavailable',
        searchResults: [],
        conversationId: '',
        toolsUsed: []
      };

      // Combine and deduplicate results
      const combinedResults = this.deduplicateResults([...direct, ...ai.searchResults]);

      return {
        directResults: direct,
        aiResponse: ai.response,
        combinedResults,
        conversationId: ai.conversationId
      };
    } catch (error) {
      console.error('Hybrid search failed:', error);
      throw new ApiError(
        `Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Sort search results by relevance
   * Private helper method for result organization
   */
  private sortSearchResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // Sort by last modified date (newest first)
      if (a.lastModified && b.lastModified) {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      }

      // If no dates, sort by source (notion first, then asana)
      if (a.source !== b.source) {
        return a.source === 'notion' ? -1 : 1;
      }

      // Finally sort by title
      return a.title.localeCompare(b.title);
    });
  }

  /**
   * Remove duplicate search results based on ID and content similarity
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const deduplicated: SearchResult[] = [];

    for (const result of results) {
      // Create a unique key based on source, title, and first 100 chars of content
      const key = `${result.source}-${result.title}-${result.content.substring(0, 100)}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }
}

// Export singleton instance
export const searchService = new SearchService();

// Export the class for custom instances if needed
export default SearchService;