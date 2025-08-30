/**
 * Type definitions for Cloudflare Functions
 */

export interface Env {
  // OAuth Client IDs
  NOTION_CLIENT_ID: string;
  ASANA_CLIENT_ID: string;

  // OAuth Client Secrets
  NOTION_CLIENT_SECRET: string;
  ASANA_CLIENT_SECRET: string;

  // KV Namespaces
  OAUTH_STATES: KVNamespace;
  OAUTH_TOKENS: KVNamespace;

  // Optional environment variables
  NODE_ENV?: string;
  DEBUG?: string;
}

export interface OAuthState {
  service: string;
  timestamp: number;
  origin: string;
}

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  workspace_name?: string; // Asana specific
  workspace_id?: string;   // Asana specific
  owner?: {                // Notion specific
    user?: {
      id: string;
      name?: string;
      email?: string;
    };
  };
}

export interface StoredToken {
  tokens: OAuthTokens;
  service: string;
  userId?: string;
  createdAt: number;
  expiresAt?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}