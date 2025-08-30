import {ApiResponse, Env, StoredToken} from '../types';

/**
 * Token Management Function for Cloudflare
 * Allows frontend to securely access OAuth tokens using session tokens
 */

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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const service = url.searchParams.get('service');

    if (!service) {
      return createErrorResponse('Service parameter is required', 400);
    }

    switch (request.method) {
      case 'GET':
        return await getToken(request, env, service);
      case 'DELETE':
        return await deleteToken(request, env, service);
      case 'POST':
        return await refreshToken(request, env, service);
      default:
        return createErrorResponse('Method not allowed', 405);
    }

  } catch (error) {
    console.error('Token management error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}

/**
 * Get OAuth token for a service
 */
async function getToken(request: Request, env: Env, service: string): Promise<Response> {
  const sessionToken = getSessionToken(request, service);

  if (!sessionToken) {
    return createErrorResponse('No session token found', 401);
  }

  const storedTokenData = await env.OAUTH_TOKENS.get(sessionToken);

  if (!storedTokenData) {
    return createErrorResponse('Session expired or invalid', 401);
  }

  const storedToken: StoredToken = JSON.parse(storedTokenData);

  // Check if token is expired
  if (storedToken.expiresAt && Date.now() > storedToken.expiresAt) {
    await env.OAUTH_TOKENS.delete(sessionToken);
    return createErrorResponse('Token expired', 401);
  }

  const response: ApiResponse = {
    success: true,
    data: {
      access_token: storedToken.tokens.access_token,
      token_type: storedToken.tokens.token_type,
      expires_in: storedToken.expiresAt ? Math.floor((storedToken.expiresAt - Date.now()) / 1000) : undefined,
      scope: storedToken.tokens.scope,
      service: storedToken.service,
      // Include service-specific data without exposing sensitive info
      ...(service === 'notion' && storedToken.tokens.owner ? {
        owner: {
          user: {
            id: storedToken.tokens.owner.user?.id
          }
        }
      } : {}),
      ...(service === 'asana' ? {
        workspace_name: storedToken.tokens.workspace_name,
        workspace_id: storedToken.tokens.workspace_id
      } : {})
    }
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

/**
 * Delete OAuth token (logout)
 */
async function deleteToken(request: Request, env: Env, service: string): Promise<Response> {
  const sessionToken = getSessionToken(request, service);

  if (!sessionToken) {
    return createErrorResponse('No session token found', 401);
  }

  await env.OAUTH_TOKENS.delete(sessionToken);

  const response: ApiResponse = {
    success: true,
    message: 'Token deleted successfully'
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Set-Cookie': `oauth_session_${service}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`
    }
  });
}

/**
 * Refresh OAuth token (if refresh token is available)
 */
async function refreshToken(request: Request, env: Env, service: string): Promise<Response> {
  const sessionToken = getSessionToken(request, service);

  if (!sessionToken) {
    return createErrorResponse('No session token found', 401);
  }

  const storedTokenData = await env.OAUTH_TOKENS.get(sessionToken);

  if (!storedTokenData) {
    return createErrorResponse('Session expired or invalid', 401);
  }

  const storedToken: StoredToken = JSON.parse(storedTokenData);

  if (!storedToken.tokens.refresh_token) {
    return createErrorResponse('No refresh token available', 400);
  }

  // TODO: Implement refresh token logic for services that support it
  // For now, return not implemented
  return createErrorResponse('Token refresh not implemented yet', 501);
}

/**
 * Extract session token from request (cookie or header)
 */
function getSessionToken(request: Request, service: string): string | null {
  // Try to get from Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try to get from cookie
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    return cookies[`oauth_session_${service}`] || null;
  }

  return null;
}

/**
 * Parse cookies from header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
}

/**
 * Create error response with proper headers
 */
function createErrorResponse(message: string, status: number): Response {
  const response: ApiResponse = {
    success: false,
    error: message
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}