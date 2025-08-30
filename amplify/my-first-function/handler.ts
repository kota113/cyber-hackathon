import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { browserAuth, inMemoryStore } from "oauth-callback/mcp";

export async function handler(event: never) {
  const serverUrl = new URL("https://mcp.notion.com/mcp");

  // Create OAuth provider - no client_id or client_secret needed!
  const authProvider = browserAuth({
    port: 3000,
    scope: "read write",
    store: inMemoryStore(), // Use fileStore() for persistence
    onRequest(req) {
      const url = new URL(req.url);
      console.log(`📨 OAuth: ${req.method} ${url.pathname}`);
    },
  });

  try {
    // Create MCP transport with OAuth provider
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider,
    });

    // Create MCP client
    const client = new Client(
      { name: "notion-example", version: "1.0.0" },
      { capabilities: {} },
    );

    // Connect triggers OAuth flow if needed
    await client.connect(transport);
    console.log("✅ Connected to Notion MCP server!");

    // List available tools
    const tools = await client.listTools();
    console.log("\n📝 Available tools:");
    for (const tool of tools.tools || []) {
      console.log(`   - ${tool.name}: ${tool.description}`);
    }

    // List available resources
    const resources = await client.listResources();
    console.log("\n📂 Available resources:");
    for (const resource of resources.resources || []) {
      console.log(`   - ${resource.uri}: ${resource.name}`);
    }

    await client.close();
  } catch (error) {
    console.error("❌ Connection failed:", error);
  }
}
