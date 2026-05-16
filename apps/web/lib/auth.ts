/**
 * Thin client for the /auth endpoints. Cookie is set by the server (HttpOnly),
 * so we never touch the JWT directly from JS.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    isPlatformAdmin: boolean;
  };
  member: {
    id: string;
    roleId: string;
    status: string;
    jobTitle: string | null;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
    permissions: string[];
  };
  products: { key: string; name: string }[];
  features: string[];
  subscription: {
    planName: string;
    status: 'active' | 'expired' | 'suspended';
    startsAt: string;
    expiresAt: string;
    daysRemaining: number;
  } | null;
}

/** Returns true if the workspace has the given product enabled. */
export function hasProduct(ctx: AuthContext | null, key: string): boolean {
  return !!ctx?.products.some((p) => p.key === key);
}

/** Returns true if the workspace has the given feature enabled. */
export function hasFeature(ctx: AuthContext | null, key: string): boolean {
  return !!ctx?.features.includes(key);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/auth${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.message ?? data.error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const auth = {
  login: (email: string, password: string) =>
    call<AuthContext>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => call<void>('/logout', { method: 'POST' }),
  me: () => call<AuthContext>('/me'),
};

/** Permission check helper. Mirrors backend matcher. */
export function hasPermission(ctx: AuthContext | null, required: string): boolean {
  if (!ctx) return false;
  for (const g of ctx.role.permissions) {
    if (g === '*') return true;
    if (g === required) return true;
    if (g.endsWith('.*') && required.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}
