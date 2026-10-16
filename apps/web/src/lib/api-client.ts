'use client';

import type { AuthTokens, ErrorCode, ErrorResponse } from '@traceback/shared';
import { getSession, saveTokens, setSession } from './session';

/**
 * Every network call goes through here so three cross-cutting concerns live in one
 * place: the base URL, the bearer token, and transparent refresh-once-on-401.
 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
);

/** A non-2xx response, carrying the API's `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Send the bearer token (default true). Auth endpoints opt out. */
  auth?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// A single in-flight refresh is shared by all concurrent 401s, so a burst of
// requests does not fire a burst of refreshes (which would rotate the token N times).
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  if (!response.ok) {
    setSession(null);
    return false;
  }

  saveTokens((await response.json()) as AuthTokens);
  return true;
}

/**
 * Perform a request and return the parsed body. Retries exactly once after a
 * successful refresh when the first attempt returns 401.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;

  const perform = async (): Promise<Response> => {
    const session = auth ? getSession() : null;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (session) headers.authorization = `Bearer ${session.accessToken}`;

    return fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    });
  };

  let response = await perform();

  if (response.status === 401 && auth && getSession()) {
    refreshInFlight ??= refreshSession().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) response = await perform();
  }

  if (response.status === 204) return undefined as T;

  const payload = parseJson(await response.text());

  if (!response.ok) {
    const envelope = payload as ErrorResponse | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'INTERNAL_ERROR',
      envelope?.error?.message ?? response.statusText ?? 'Request failed',
      envelope?.error?.details,
    );
  }

  return payload as T;
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
