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

export interface WorkspaceRoleLite {
  id: string;
  key: string;
  name: string;
}

export interface WorkspaceMemberRow {
  id: string;
  status: 'active' | 'invited' | 'suspended';
  jobTitle: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
  };
  role: WorkspaceRoleLite;
}

export interface InvitePayload {
  email: string;
  name: string;
  roleKey: string;
  jobTitle?: string;
  password?: string;
}

export interface UpdateMemberPayload {
  roleKey?: string;
  jobTitle?: string;
  status?: 'active' | 'suspended';
}

export const membersApi = {
  list: () => call<WorkspaceMemberRow[]>('/members'),
  invite: (payload: InvitePayload) =>
    call<{ member: WorkspaceMemberRow; temporaryPassword?: string }>('/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: UpdateMemberPayload) =>
    call<WorkspaceMemberRow>(`/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (id: string) => call<{ id: string }>(`/members/${id}`, { method: 'DELETE' }),
};

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export const rolesApi = {
  list: () => call<RoleRow[]>('/roles'),
  create: (payload: { key: string; name: string; description?: string; permissions: string[] }) =>
    call<RoleRow>('/roles', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { name?: string; description?: string; permissions?: string[] }) =>
    call<RoleRow>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id: string) => call<{ id: string }>(`/roles/${id}`, { method: 'DELETE' }),
};
