'use client';

import type { AuthTokens, User } from '@traceback/shared';

/**
 * The browser's session is the triple (user, accessToken, refreshToken). It lives in
 * localStorage so a reload keeps you signed in, and every write broadcasts so the
 * `AuthProvider` and the API client observe the same state without prop drilling.
 */
const STORAGE_KEY = 'traceback.session.v1';
const CHANGE_EVENT = 'traceback:session-changed';

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session>;
    if (!value.user || !value.accessToken || !value.refreshToken) return null;
    return value as Session;
  } catch {
    return null;
  }
}

/** Reads the current session. Sold as SSR-safe: returns null on the server. */
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  return parse(window.localStorage.getItem(STORAGE_KEY));
}

/** Writes (or clears) the session and notifies subscribers. */
export function setSession(next: Session | null): void {
  if (typeof window === 'undefined') return;
  if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Stores a freshly issued token pair, keeping the user profile it came with. */
export function saveTokens(tokens: AuthTokens): Session {
  const session: Session = {
    user: tokens.user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  setSession(session);
  return session;
}

/**
 * Subscribe to session changes. Both same-tab writes (custom event) and cross-tab
 * writes (the `storage` event) are surfaced, so signing out in one tab signs out all.
 */
export function subscribeSession(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
