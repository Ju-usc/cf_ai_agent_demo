// Debug: Check if .env is being read
console.log('[api.ts] import.meta.env.VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('[api.ts] import.meta.env:', import.meta.env);

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
console.log('[api.ts] Final API_URL:', API_URL);

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
