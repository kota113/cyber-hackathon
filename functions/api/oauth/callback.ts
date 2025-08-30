import {Env, OAuthState, OAuthTokens, StoredToken} from '../types';

/**
 * OAuth Callback Handler for Cloudflare
 * Securely handles authorization code exchange for access tokens
 */

interface TokenEndpointConfig {
  url: string;
  headers: Record<string, string>;
  grantType: string;
}

const TOKEN_ENDPOINTS: Record<string, TokenEndpointConfig> = {
  notion: {
    url: 'https://api.notion.com/v1/oauth/token',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    grantType: 'authorization_code'
  },
  asana: {
    url: 'https://app.asana.com/-/oauth_token',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    grantType: 'authorization_code'
  }
};

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const {request, env} = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', {status: 405});
  }

  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const service = url.searchParams.get('service');
    const error = url.searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      const errorDescription = url.searchParams.get('error_description') || 'OAuth authorization failed';
      return createErrorResponse(`OAuth Error: ${error} - ${errorDescription}`, 400);
    }

    // Validate required parameters
    if (!code || !state || !service) {
      return createErrorResponse('Missing required parameters: code, state, or service', 400);
    }

    if (!TOKEN_ENDPOINTS[service]) {
      return createErrorResponse(`Unsupported service: ${service}`, 400);
    }

    // Verify state parameter
    const storedStateData = await env.OAUTH_STATES.get(state);
    if (!storedStateData) {
      return createErrorResponse('Invalid or expired state parameter', 400);
    }

    const stateData: OAuthState = JSON.parse(storedStateData);
    if (stateData.service !== service) {
      return createErrorResponse('Service mismatch in state parameter', 400);
    }

    // Delete used state
    await env.OAUTH_STATES.delete(state);

    // Exchange authorization code for access token
    const tokens = await exchangeCodeForToken(service, code, url.origin, env);

    // Generate a session token for the frontend
    const sessionToken = crypto.randomUUID();

    // Store tokens securely (expires in 1 hour by default, or based on token expiry)
    const expiresAt = tokens.expires_in
      ? Date.now() + (tokens.expires_in * 1000)
      : Date.now() + (60 * 60 * 1000); // 1 hour default

    const storedToken: StoredToken = {
      tokens,
      service,
      createdAt: Date.now(),
      expiresAt
    };

    await env.OAUTH_TOKENS.put(
      sessionToken,
      JSON.stringify(storedToken),
      {expirationTtl: Math.floor((expiresAt - Date.now()) / 1000)}
    );

    // Create success response with redirect to frontend
    const redirectUrl = new URL('/oauth/success', stateData.origin);
    redirectUrl.searchParams.set('service', service);
    redirectUrl.searchParams.set('session', sessionToken);

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl.toString(),
        'Set-Cookie': `oauth_session_${service}=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=3600; Path=/`
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  service: string,
  code: string,
  origin: string,
  env: Env
): Promise<OAuthTokens> {
  const config = TOKEN_ENDPOINTS[service];
  const clientId = env[`${service.toUpperCase()}_CLIENT_ID`];
  const clientSecret = env[`${service.toUpperCase()}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials for ${service}`);
  }

  const redirectUri = `${origin}/api/oauth/callback?service=${service}`;

  let body: string;
  const headers = {...config.headers};

  if (service === 'notion') {
    // Notion uses JSON body
    body = JSON.stringify({
      grant_type: config.grantType,
      code,
      redirect_uri: redirectUri
    });

    // Notion uses Basic Auth
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;

  } else if (service === 'asana') {
    // Asana uses form-encoded body
    const params = new URLSearchParams({
      grant_type: config.grantType,
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    });
    body = params.toString();
  } else {
    throw new Error(`Token exchange not implemented for service: ${service}`);
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const tokens: OAuthTokens = await response.json();
  return tokens;
}

/**
 * Create error response with proper headers
 */
function createErrorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({
    success: false,
    error: message
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}