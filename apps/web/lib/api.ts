const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface ScrapeJob {
  id: string;
  source: string;
  searchQuery: string;
  searchLocation: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  totalFound: number;
  totalSaved: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface Lead {
  id: string;
  jobId: string | null;
  source: string;
  sourceUrl: string | null;
  externalId: string | null;
  searchQuery: string;
  searchLocation: string;
  businessName: string;
  category: string | null;
  categories: string[];
  phone: string | null;
  phones: string[];
  fax: string | null;
  email: string | null;
  emails: string[];
  website: string | null;
  address: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  businessHistory: string | null;
  yearEstablished: number | null;
  neighborhoods: string[];
  rating: number | null;
  reviewCount: number | null;
  bbbGrade: string | null;
  yearsInBusiness: number | null;
  yearsWithYP: number | null;
  claimed: boolean;
  photos: string[];
  logoUrl: string | null;
  bannerUrl: string | null;
  otherLinks: string[];
  socials: string[];
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerLinkedin: string | null;
  ownerSearchUrl: string | null;
  createdAt: string;
}

export interface LeadsPage {
  items: Lead[];
  nextCursor: string | null;
}

export interface LeadStats {
  total: number;
  withWebsite: number;
  withEmail: number;
  withPhone: number;
  withSocials?: number;
}

export interface Note {
  id: string;
  leadId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

export interface LeadGroup {
  id: string;
  name: string;
  description: string | null;
  type: 'manual' | 'smart';
  filterDsl: Record<string, unknown> | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface LeadFacets {
  categories: string[];
  cities: string[];
  states: string[];
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  type: 'manual' | 'smart';
  filterDsl?: Record<string, unknown>;
  color?: string;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  createScrapeJob: (input: { searchQuery: string; searchLocation: string }) =>
    request<ScrapeJob>('/scrape-jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  cancelScrapeJob: (id: string) =>
    request<ScrapeJob>(`/scrape-jobs/${id}/cancel`, { method: 'POST' }),

  getScrapeJob: (id: string) => request<ScrapeJob>(`/scrape-jobs/${id}`),

  listScrapeJobs: () => request<ScrapeJob[]>('/scrape-jobs'),

  listLeads: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    }
    return request<LeadsPage>(`/leads?${qs.toString()}`);
  },

  leadStats: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v);
    }
    return request<LeadStats>(`/leads/stats?${qs.toString()}`);
  },

  suggestQueries: (q: string) =>
    request<string[]>(`/searches/queries?q=${encodeURIComponent(q)}`),

  suggestLocations: (q: string) =>
    request<string[]>(`/searches/locations?q=${encodeURIComponent(q)}`),

  // ─── Phase 2 ───
  getLead: (id: string) => request<Lead>(`/leads/${id}`),
  deleteLead: (id: string) =>
    request<{ ok: true }>(`/leads/${id}`, { method: 'DELETE' }),
  bulkDeleteLeads: (ids: string[]) =>
    request<{ deleted: number }>(`/leads/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  facets: () => request<LeadFacets>('/leads/facets'),

  // notes
  listNotes: (leadId: string) => request<Note[]>(`/leads/${leadId}/notes`),
  createNote: (leadId: string, body: string) =>
    request<Note>(`/leads/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  deleteNote: (leadId: string, noteId: string) =>
    request<{ ok: true }>(`/leads/${leadId}/notes/${noteId}`, {
      method: 'DELETE',
    }),

  // groups
  listGroups: () => request<LeadGroup[]>('/groups'),
  getGroup: (id: string) => request<LeadGroup>(`/groups/${id}`),
  createGroup: (input: CreateGroupInput) =>
    request<LeadGroup>('/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateGroup: (id: string, patch: Partial<CreateGroupInput>) =>
    request<LeadGroup>(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteGroup: (id: string) =>
    request<{ ok: true }>(`/groups/${id}`, { method: 'DELETE' }),

  listGroupLeads: (id: string, params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return request<LeadsPage>(`/groups/${id}/leads?${qs.toString()}`);
  },
  addLeadsToGroup: (id: string, leadIds: string[]) =>
    request<{ added: number }>(`/groups/${id}/leads`, {
      method: 'POST',
      body: JSON.stringify({ leadIds }),
    }),
  removeLeadsFromGroup: (id: string, leadIds: string[]) =>
    request<{ removed: number }>(`/groups/${id}/leads`, {
      method: 'DELETE',
      body: JSON.stringify({ leadIds }),
    }),
};
