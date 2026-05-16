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

export interface ProductWithFeatures {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  features: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    defaultEnabled: boolean;
    sortOrder: number;
  }>;
}

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended' | 'expired';
  seatLimit: number;
  ownerId: string | null;
  timezone: string;
  currency: string;
  createdAt: string;
  _count: { members: number };
  subscription: {
    id: string;
    planName: string;
    status: 'active' | 'expired' | 'suspended';
    startsAt: string;
    expiresAt: string;
    currency: string;
    amountPaid: string | null;
    notes: string | null;
  } | null;
  products: Array<{ id: string; productId: string; enabled: boolean; product: { key: string; name: string } }>;
}

export interface WorkspaceDetail extends WorkspaceRow {
  owner: { id: string; name: string; email: string } | null;
  members: Array<{
    id: string;
    status: string;
    user: { id: string; name: string; email: string; lastLoginAt: string | null };
    role: { id: string; key: string; name: string };
  }>;
  features: Array<{
    id: string;
    enabled: boolean;
    feature: { id: string; key: string; name: string; product: { key: string } };
  }>;
}

export interface CreateWorkspacePayload {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword?: string;
  seatLimit?: number;
  timezone?: string;
  currency?: string;
  productKeys?: string[];
}

export interface AuditRow {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  meta: unknown;
  createdAt: string;
}

export const adminApi = {
  catalog: () => call<ProductWithFeatures[]>('/admin/catalog/products'),
  listWorkspaces: () => call<WorkspaceRow[]>('/admin/workspaces'),
  getWorkspace: (id: string) => call<WorkspaceDetail>(`/admin/workspaces/${id}`),
  createWorkspace: (payload: CreateWorkspacePayload) =>
    call<{ workspace: WorkspaceRow; ownerTemporaryPassword?: string }>('/admin/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateWorkspace: (id: string, payload: Partial<Pick<WorkspaceRow, 'name' | 'seatLimit' | 'status' | 'timezone' | 'currency'>>) =>
    call<WorkspaceRow>(`/admin/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  toggleProduct: (id: string, productKey: string, enabled: boolean) =>
    call(`/admin/workspaces/${id}/product`, {
      method: 'POST',
      body: JSON.stringify({ productKey, enabled }),
    }),
  toggleFeature: (id: string, featureKey: string, enabled: boolean) =>
    call(`/admin/workspaces/${id}/feature`, {
      method: 'POST',
      body: JSON.stringify({ featureKey, enabled }),
    }),
  upsertSubscription: (
    id: string,
    payload: {
      planName: string;
      startsAt: string;
      expiresAt: string;
      status?: 'active' | 'expired' | 'suspended';
      amountPaid?: number;
      currency?: string;
      notes?: string;
    },
  ) =>
    call(`/admin/workspaces/${id}/subscription`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listAudit: (workspaceId?: string, take = 100) =>
    call<AuditRow[]>(`/admin/audit?${new URLSearchParams({ ...(workspaceId ? { workspaceId } : {}), take: String(take) }).toString()}`),
};
