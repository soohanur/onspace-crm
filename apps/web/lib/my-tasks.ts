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

export interface MyTask {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  kind: 'general' | 'followup';
  context: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  lead: { id: string; businessName: string; stage: string; city: string | null; state: string | null } | null;
  contact: { id: string; name: string | null; contactType: string } | null;
  assignee: {
    id: string;
    jobTitle: string | null;
    user: { id: string; name: string; email: string; avatarUrl: string | null };
  } | null;
  createdBy: {
    id: string;
    user: { id: string; name: string; email: string };
  } | null;
}

export interface MyTaskFeed {
  today: MyTask[];
  overdue: MyTask[];
  open: MyTask[];
  done: MyTask[];
  total: number;
}

export const myTasksApi = {
  feed: () => call<MyTaskFeed>('/tasks/mine'),
  complete: (id: string) => call<MyTask>(`/tasks/${id}/complete`, { method: 'PATCH' }),
};
