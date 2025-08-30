// Shared types between frontend and backend
export interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: 'notion' | 'asana';
  url?: string;
  lastModified?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface OAuthStatus {
  notion: {
    connected: boolean;
    needsAuth: boolean;
  };
  asana: {
    connected: boolean;
    needsAuth: boolean;
  };
}

export interface HealthStatus {
  success: boolean;
  message: string;
  timestamp: string;
}

// API Error class
export class ApiError extends Error {
  public statusCode?: number;
  public response?: ApiResponse<unknown>;

  constructor(
    message: string,
    statusCode?: number,
    response?: ApiResponse<unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

// Search request interface
export interface SearchRequest {
  query: string;
}

// Available API endpoints
export interface ApiEndpoints {
  search: '/search';
  health: '/health';
  oauthStatus: '/oauth/status';
}