import {Client} from "@modelcontextprotocol/sdk/client";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {oauthService} from './oauth-service';
import type {SearchResult} from '@/types/api';

// Types for service configuration
type MCPService = 'notion' | 'asana';

interface ServiceConfig {
  url: string;
  clientName: string;
  scope: string;
}

// Service configurations
const SERVICE_CONFIGS: Record<MCPService, ServiceConfig> = {
  notion: {
    url: "https://mcp.notion.com/mcp",
    clientName: "knowledge-search-notion",
    scope: "read write"
  },
  asana: {
    url: "https://mcp.asana.com/sse",
    clientName: "knowledge-search-asana",
    scope: "default"
  }
};

/**
 * MCP Client Manager for browser environment
 * Handles MCP protocol communication with Notion and Asana services
 */
export class MCPClientManager {
  private clients: Map<MCPService, Client> = new Map();
  private connectionPromises: Map<MCPService, Promise<Client>> = new Map();

  /**
   * Get or create MCP client for a service
   */
  async getClient(service: MCPService): Promise<Client> {
    // Return existing client if already connected
    const existingClient = this.clients.get(service);
    if (existingClient) {
      return existingClient;
    }

    // Return existing connection promise if connection is in progress
    const existingPromise = this.connectionPromises.get(service);
    if (existingPromise) {
      return existingPromise;
    }

    // Create new connection
    const connectionPromise = this.createClient(service);
    this.connectionPromises.set(service, connectionPromise);

    try {
      const client = await connectionPromise;
      this.clients.set(service, client);
      this.connectionPromises.delete(service);
      return client;
    } catch (error) {
      this.connectionPromises.delete(service);
      throw error;
    }
  }

  /**
   * Search using MCP client for a specific service
   */
  async searchService(service: MCPService, query: string): Promise<SearchResult[]> {
    try {
      const client = await this.getClient(service);

      // Get available tools
      const tools = await client.listTools();
      console.log(`Available ${service} tools:`, tools.tools?.map(t => t.name));

      // Use search tool if available
      const searchTool = tools.tools?.find(tool =>
        tool.name.toLowerCase().includes('search') ||
        tool.name.toLowerCase().includes('find')
      );

      if (searchTool) {
        const searchResult = await client.callTool({
          name: searchTool.name,
          arguments: {query}
        });

        // Process the search results
        const results: SearchResult[] = [];

        if (searchResult.content) {
          const content = Array.isArray(searchResult.content)
            ? searchResult.content
            : [searchResult.content];

          for (const item of content) {
            if (item.type === 'text') {
              results.push({
                id: `${service}-${Date.now()}-${Math.random()}`,
                title: `Search result from ${service}`,
                content: item.text || 'No content available',
                source: service,
                lastModified: new Date().toISOString()
              });
            }
          }
        }

        return results;
      } else {
        // Fallback: list resources as search results
        const resources = await client.listResources();
        return resources.resources?.slice(0, 5).map((resource, index) => ({
          id: `${service}-resource-${index}`,
          title: resource.name || resource.uri,
          content: resource.description || 'No description available',
          source: service,
          url: resource.uri,
          lastModified: new Date().toISOString()
        })) || [];
      }
    } catch (error) {
      console.error(`Error searching ${service}:`, error);
      throw new Error(`Search failed for ${service}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check connection status for a service
   */
  async getConnectionStatus(service: MCPService): Promise<{ connected: boolean; needsAuth: boolean }> {
    try {
      // Check if we have a valid OAuth token first
      const isAuthenticated = await oauthService.isAuthenticated(service);

      if (!isAuthenticated) {
        return {connected: false, needsAuth: true};
      }

      // If we have a token, check if we have an active client connection
      const client = this.clients.get(service);
      if (client) {
        try {
          // Try a simple operation to verify connection is still active
          await client.listTools();
          return {connected: true, needsAuth: false};
        } catch (error) {
          console.warn(`MCP client connection test failed for ${service}:`, error);
          // Remove the failed client so it can be recreated
          this.clients.delete(service);
          // We still have auth, just need to reconnect
          return {connected: false, needsAuth: false};
        }
      } else {
        // We have auth but no active client connection
        return {connected: false, needsAuth: false};
      }
    } catch (error) {
      console.error(`Connection status check failed for ${service}:`, error);
      return {connected: false, needsAuth: true};
    }
  }

  /**
   * Disconnect client for a service
   */
  async disconnect(service: MCPService): Promise<void> {
    const client = this.clients.get(service);
    if (client) {
      await client.close();
      this.clients.delete(service);
      console.log(`Disconnected from ${service} MCP server`);
    }
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    const services = Array.from(this.clients.keys());
    await Promise.all(services.map(service => this.disconnect(service)));
  }

  /**
   * Create a new MCP client for the specified service
   */
  private async createClient(service: MCPService): Promise<Client> {
    const config = SERVICE_CONFIGS[service];

    console.log(`Creating MCP client for ${service}...`);

    try {
      // Get OAuth token from server-side service
      const token = await oauthService.getToken(service);

      if (!token) {
        throw new Error(`No OAuth token available for ${service}. Please authenticate first.`);
      }

      // Create MCP transport with authorization header in requestInit
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: {
          headers: {
            'Authorization': `${token.token_type} ${token.access_token}`
          }
        }
      });

      // Create MCP client
      const client = new Client(
        {name: config.clientName, version: "1.0.0"},
        {capabilities: {}},
      );

      // Connect with server-side auth
      await client.connect(transport);
      console.log(`✅ Connected to ${service} MCP server with server-side auth!`);

      return client;
    } catch (error) {
      console.error(`Failed to create ${service} MCP client:`, error);
      throw new Error(`Failed to connect to ${service}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const mcpClientManager = new MCPClientManager();