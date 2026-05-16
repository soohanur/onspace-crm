const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.message ?? j.error ?? msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const profileApi = {
  updateName: (name: string) => call('/profile', { method: 'PATCH', body: JSON.stringify({ name }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call('/profile/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
