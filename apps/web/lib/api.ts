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

// ─── Phase 5: Contacts + Lead pipeline state ─────────────────────────────

export type ContactType = 'owner' | 'manager' | 'staff' | 'general';
export type ContactSource = 'manual' | 'website' | 'directory' | 'enrichment';
export type Confidence = 'low' | 'medium' | 'high';
export type ContactStatus = 'unverified' | 'verified' | 'invalid';

export type LeadStage =
  | 'new'
  | 'approached'
  | 'no_response'
  | 'engaged'
  | 'push'
  | 'qualified'
  | 'interested'
  | 'booked'
  | 'proposal_sent'
  | 'converted'
  | 'not_converted'
  | 'lost';

export type LeadValidity = 'valid' | 'invalid';
export type FollowUpStatus = 'none' | 'needed' | 'scheduled' | 'completed' | 'overdue';

export interface Contact {
  id: string;
  leadId: string;
  name: string;
  contactType: ContactType;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  socialProfile: string | null;
  source: ContactSource;
  confidence: Confidence;
  status: ContactStatus;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  name: string;
  contactType?: ContactType;
  email?: string;
  phone?: string;
  linkedin?: string;
  socialProfile?: string;
  source?: ContactSource;
  confidence?: Confidence;
  status?: ContactStatus;
  isPrimary?: boolean;
  notes?: string;
}

export type UpdateContactInput = Partial<CreateContactInput>;

// ─── Phase 6: Tasks ──────────────────────────────────────────────────────

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskKind = 'general' | 'followup';
export type TaskContext =
  | 'none'
  | 'approached_followup'
  | 'engaged_followup'
  | 'qualified_followup'
  | 'meeting_followup'
  | 'proposal_followup'
  | 'no_response_followup'
  | 'push_followup'
  | 'interested_followup';

export type TaskBucket = 'today' | 'overdue' | 'upcoming' | 'completed';

/**
 * Slim lead summary embedded in Task list responses so the UI can render
 * the lead pill + stage badge without a second fetch.
 */
export interface TaskLeadRef {
  id: string;
  businessName: string;
  stage: LeadStage;
  city: string | null;
  state: string | null;
}

export interface TaskContactRef {
  id: string;
  name: string;
  contactType: ContactType;
}

export interface Task {
  id: string;
  leadId: string;
  contactId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  context: TaskContext;
  dueAt: string | null;
  completedAt: string | null;
  stageAtCreation: LeadStage;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present in list/findOne responses; not on create payloads. */
  lead?: TaskLeadRef;
  contact?: TaskContactRef | null;
}

export interface CreateTaskInput {
  leadId: string;
  contactId?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  kind?: TaskKind;
  context?: TaskContext;
  dueAt?: string;
  assignedTo?: string;
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'leadId'>>;

export interface TasksPage {
  items: Task[];
  nextCursor: string | null;
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
  // Phase 5 pipeline state
  stage: LeadStage;
  score: number;
  validity: LeadValidity;
  followUpStatus: FollowUpStatus;
  /** Phase 7: last time `stage` actually changed. */
  stageChangedAt: string | null;
  /** Present in findOne responses (lead detail) — empty in list responses. */
  contacts?: Contact[];
  /** Open + in-progress tasks; only populated by findOne. */
  tasks?: Task[];
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

export interface EmailAccount {
  id: string;
  email: string;
  displayName: string | null;
  provider: 'gmail';
  scopes: string[];
  active: boolean;
  expiresAt: string;
  createdAt: string;
  /** True if scopes include gmail.readonly (or higher) — needed for reply detection. */
  hasReadScope?: boolean;
}

export type EmailStatus = 'queued' | 'sending' | 'sent' | 'failed';

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
}

export interface EmailReply {
  id: string;
  emailLogId: string;
  leadId: string;
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  type: 'log' | 'reply';
  direction: 'outbound' | 'inbound';
  timestamp: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  cc: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet?: string | null;
  attachments: EmailAttachment[];
  status?: EmailStatus;
  openedAt?: string | null;
  error?: string | null;
}

export interface EmailLog {
  id: string;
  leadId: string;
  accountId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  status: EmailStatus;
  provider: string;
  messageId: string | null;
  threadId: string | null;
  error: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: EmailAttachment[];
  replies?: EmailReply[];
  /** Phase 9: present on findOne response if this email was sent by a campaign. */
  campaignId?: string | null;
  campaign?: { id: string; name: string } | null;
  // Thread-aggregate metadata (present in list responses)
  threadMessageCount?: number;
  threadOurReplyCount?: number;
  threadInboundReplyCount?: number;
  threadLatestActivity?: string;
  // Full chronological thread (present in findOne response)
  messages?: ThreadMessage[];
}

// ─── Phase 9: Email templates + campaigns ────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export type CampaignStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CampaignRecipientStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'bounced';

export interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  groupId: string;
  templateId: string;
  accountId: string;
  frozenSubject: string | null;
  frozenBodyText: string | null;
  frozenBodyHtml: string | null;
  dailySendLimit: number;
  sendIntervalSec: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  group?: { id: string; name: string };
  template?: { id: string; name: string };
  account?: { id: string; email: string; displayName: string | null };
  /** Computed in the response — joins email_logs. */
  openedCount: number;
  repliedCount: number;
  bouncedCount: number;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  leadId: string;
  contactId: string | null;
  toEmail: string;
  renderedSubject: string | null;
  renderedBodyText: string | null;
  renderedBodyHtml: string | null;
  status: CampaignRecipientStatus;
  emailLogId: string | null;
  error: string | null;
  attemptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; businessName: string; stage: LeadStage };
  contact?: { id: string; name: string } | null;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  groupId: string;
  templateId: string;
  accountId: string;
  dailySendLimit?: number;
  sendIntervalSec?: number;
}

export interface CampaignCreateResponse {
  campaign: CampaignSummary;
  resolution: {
    resolved: number;
    skippedNoEmail: number;
    dedupedDuplicates: number;
  };
}

export interface CampaignStartResponse {
  campaign: CampaignSummary;
  wouldSkip: number;
}

export interface GroupEmailCoverage {
  totalLeads: number;
  withPrimaryContactEmail: number;
  withFallbackEmail: number;
  noEmail: number;
  duplicateEmails: number;
}

export interface SendEmailInput {
  leadId: string;
  accountId?: string;
  toEmail: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  files?: File[];
  /** When set, this send is a reply continuing the parent email's thread. */
  replyToLogId?: string;
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

  // pipeline state
  updateLeadStage: (id: string, stage: LeadStage) =>
    request<Lead>(`/leads/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    }),
  updateLeadScore: (id: string, score: number) =>
    request<Lead>(`/leads/${id}/score`, {
      method: 'PATCH',
      body: JSON.stringify({ score }),
    }),
  updateLeadValidity: (id: string, validity: LeadValidity) =>
    request<Lead>(`/leads/${id}/validity`, {
      method: 'PATCH',
      body: JSON.stringify({ validity }),
    }),

  // tasks
  listTasks: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    }
    return request<TasksPage>(`/tasks?${qs.toString()}`);
  },
  taskOpenCounts: (leadIds: string[]) => {
    if (leadIds.length === 0) return Promise.resolve({} as Record<string, number>);
    return request<Record<string, number>>(
      `/tasks/counts?leadIds=${leadIds.join(',')}`,
    );
  },
  getTask: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (input: CreateTaskInput) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTask: (id: string, patch: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTask: (id: string) =>
    request<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE' }),
  listLeadTasks: (leadId: string) =>
    request<Task[]>(`/leads/${leadId}/tasks`),

  // contacts
  listContacts: (leadId: string) =>
    request<Contact[]>(`/leads/${leadId}/contacts`),
  createContact: (leadId: string, input: CreateContactInput) =>
    request<Contact>(`/leads/${leadId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateContact: (id: string, patch: UpdateContactInput) =>
    request<Contact>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteContact: (id: string) =>
    request<{ ok: true }>(`/contacts/${id}`, { method: 'DELETE' }),
  setPrimaryContact: (id: string) =>
    request<Contact>(`/contacts/${id}/set-primary`, { method: 'POST' }),

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

  // ─── Email ───
  /** Returns the URL to open in a new tab so the user can complete OAuth. */
  emailConnectUrl: () => `${BASE}/api/email/auth/connect`,

  emailConfig: () =>
    request<{
      configured: boolean;
      clientIdMasked: string | null;
      redirectUri: string;
      hasSecret: boolean;
      hasEncKey: boolean;
      publicApiUrl: string;
      trackingPixelUrl: string;
      trackingReachable: boolean;
      tunnel: {
        provider: 'env' | 'ngrok' | 'cloudflared' | 'none';
        status: 'inactive' | 'starting' | 'active' | 'error';
        url: string | null;
        isReachable: boolean;
        startedAt: string | null;
        error: string | null;
        hasAuthtoken: boolean;
      };
      successRedirect: string;
    }>('/email/config'),

  listEmailAccounts: () => request<EmailAccount[]>('/email/accounts'),
  disconnectEmailAccount: (id: string) =>
    request<{ ok: true }>(`/email/accounts/${id}`, { method: 'DELETE' }),

  sendEmail: async (input: SendEmailInput): Promise<EmailLog> => {
    const fd = new FormData();
    fd.append('leadId', input.leadId);
    if (input.accountId) fd.append('accountId', input.accountId);
    fd.append('toEmail', input.toEmail);
    if (input.cc?.length) fd.append('cc', input.cc.join(','));
    if (input.bcc?.length) fd.append('bcc', input.bcc.join(','));
    fd.append('subject', input.subject);
    fd.append('body', input.body);
    if (input.bodyHtml) fd.append('bodyHtml', input.bodyHtml);
    if (input.replyToLogId) fd.append('replyToLogId', input.replyToLogId);
    for (const f of input.files ?? []) fd.append('files', f, f.name);

    const res = await fetch(`${BASE}/api/email/send`, {
      method: 'POST',
      body: fd,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<EmailLog>;
  },

  listEmailHistory: (leadId: string) =>
    request<EmailLog[]>(`/leads/${leadId}/emails`),

  getEmail: (id: string) => request<EmailLog>(`/email/logs/${id}`),

  refreshEmailReplies: (id: string) =>
    request<{ fetched: number; newReplies: number }>(
      `/email/logs/${id}/refresh-replies`,
      { method: 'POST' },
    ),

  attachmentDownloadUrl: (logId: string, filename: string) =>
    `${BASE}/api/email/logs/${logId}/attachments/${encodeURIComponent(filename)}`,

  // ─── Phase 9: Templates ────────────────────────────────────────────────
  listTemplates: () => request<EmailTemplate[]>('/templates'),
  getTemplate: (id: string) => request<EmailTemplate>(`/templates/${id}`),
  createTemplate: (input: CreateTemplateInput) =>
    request<EmailTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTemplate: (id: string, patch: UpdateTemplateInput) =>
    request<EmailTemplate>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTemplate: (id: string) =>
    request<{ ok: true }>(`/templates/${id}`, { method: 'DELETE' }),

  // ─── Phase 9: Campaigns ────────────────────────────────────────────────
  listCampaigns: (params: { status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    return request<CampaignSummary[]>(`/campaigns?${qs.toString()}`);
  },
  getCampaign: (id: string) => request<CampaignSummary>(`/campaigns/${id}`),
  createCampaign: (input: CreateCampaignInput) =>
    request<CampaignCreateResponse>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  startCampaign: (id: string, acceptSkipped = false) =>
    request<CampaignStartResponse>(
      `/campaigns/${id}/start${acceptSkipped ? '?acceptSkipped=1' : ''}`,
      { method: 'POST' },
    ),
  pauseCampaign: (id: string) =>
    request<CampaignSummary>(`/campaigns/${id}/pause`, { method: 'POST' }),
  resumeCampaign: (id: string) =>
    request<CampaignSummary>(`/campaigns/${id}/resume`, { method: 'POST' }),
  cancelCampaign: (id: string) =>
    request<CampaignSummary>(`/campaigns/${id}/cancel`, { method: 'POST' }),
  deleteCampaign: (id: string) =>
    request<{ ok: true }>(`/campaigns/${id}`, { method: 'DELETE' }),
  listCampaignRecipients: (
    id: string,
    params: { status?: string; take?: number; cursor?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.take) qs.set('take', String(params.take));
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<{ items: CampaignRecipient[]; nextCursor: string | null }>(
      `/campaigns/${id}/recipients?${qs.toString()}`,
    );
  },

  getGroupEmailCoverage: (groupId: string) =>
    request<GroupEmailCoverage>(`/groups/${groupId}/email-coverage`),
  getAccountTodayCount: (accountId: string) =>
    request<{ sentToday: number }>(`/email/accounts/${accountId}/today-count`),
};
