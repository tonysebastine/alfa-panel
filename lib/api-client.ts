'use client';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

let accessToken: string | null = null;

function refreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem('panel_refresh_token');
}

export function setTokenPair(pair: { access_token: string; refresh_token: string }) {
  accessToken = pair.access_token;
  if (typeof window !== 'undefined') window.sessionStorage.setItem('panel_refresh_token', pair.refresh_token);
}

export function clearSession() {
  accessToken = null;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem('panel_refresh_token');
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
  if (response.status === 401 && retry && refreshToken()) {
    const refreshed = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken() }),
    });
    if (refreshed.ok) {
      const pair = await refreshed.json();
      setTokenPair(pair);
      return request<T>(path, init, false);
    }
    clearSession();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed: ${response.status}`);
  return body as T;
}

export async function login(username: string, password: string, totpCode: string) {
  const pair = await request<{access_token:string;refresh_token:string}>('/api/v1/auth/login', {
    method:'POST', body:JSON.stringify({username,password,totp_code:totpCode}),
  }, false);
  setTokenPair(pair);
  return pair;
}

export async function logout() {
  const token = refreshToken();
  try { if (token) await request('/api/v1/auth/logout', {method:'POST',body:JSON.stringify({refresh_token:token})}, false); }
  finally { clearSession(); }
}

export function isAuthenticated() {
  return Boolean(accessToken || refreshToken());
}

export const api = {
  listSites: () => request<{sites:any[];total:number}>('/api/v1/sites'),
  createSite: (payload:any) => request('/api/v1/sites', {method:'POST',body:JSON.stringify(payload)}),
  siteAction: (domain:string, action:string) => request(`/api/v1/sites/${encodeURIComponent(domain)}/${action}`, {method:'POST'}),
};
