import {Env} from '../types';

/**
 * OAuth Initiation Function for Cloudflare
 * Handles secure server-side OAuth flow initiation for Notion and Asana
 */

interface OAuthConfig {
  authUrl: string;
  clientId: string;
  scope: string;
  redirectUri: string;
}

const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    clientId: '', // Will be set from environment variables
    scope: 'read',
    redirectUri: '' // Will be set from environment variables
  },
  asana: {
    authUrl: 'https://app.asana.com/-/oauth_authorize',
    clientId: '', // Will be set from environment variables  
    scope: 'default',
    redirectUri: '' // Will be set from environment variables
  }
};

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: { service?: string };
}): Promise<Response> {
  const {request, env, params} = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', {status: 405});
  }

  try {
    const service = params.service || url.searchParams.get('service');

    if (!service || !OAUTH_CONFIGS[service]) {
      return new Response(JSON.stringify({
        error: 'Invalid service',
        availableServices: Object.keys(OAUTH_CONFIGS)
      }), {
        status: 400,
        headers: {'Content-Type': 'application/json'}
      });
    }

    const config = OAUTH_CONFIGS[service];

    // Set configuration from environment variables
    config.clientId = env[`${service.toUpperCase()}_CLIENT_ID`];
    config.redirectUri = `${url.origin}/api/oauth/callback?service=${service}`;

    if (!config.clientId) {
      return new Response(JSON.stringify({
        error: `Missing ${service.toUpperCase()}_CLIENT_ID environment variable`
      }), {
        status: 500,
        headers: {'Content-Type': 'application/json'}
      });
    }

    // Generate state parameter for security
    const state = crypto.randomUUID();

    // Store state in KV for verification (expires in 10 minutes)
    await env.OAUTH_STATES.put(state, JSON.stringify({
      service,
      timestamp: Date.now(),
      origin: url.origin
    }), {expirationTtl: 600});

    // Build OAuth authorization URL
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scope);
    authUrl.searchParams.set('state', state);

    // For Notion, add owner parameter
    if (service === 'notion') {
      authUrl.searchParams.set('owner', 'user');
    }

    return new Response(JSON.stringify({
      success: true,
      authUrl: authUrl.toString(),
      service,
      state
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('OAuth initiation error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}