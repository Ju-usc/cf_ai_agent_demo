export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
export async function fetchJson(path, init) {
    const response = await fetch(`${API_URL}${path}`, init);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
}
