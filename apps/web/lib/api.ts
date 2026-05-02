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
  /** Upcoming scheduled meetings; only populated by findOne. */
  meetings?: Meeting[];
  /** Recent proposals (latest 10); only populated by findOne. */
  proposals?: Proposal[];
  /** Recent calls (latest 10); only populated by findOne. */
  calls?: Call[];
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
  /** Phase 10: true if scopes include calendar.events — needed for Google Calendar sync. */
  hasCalendarScope?: boolean;
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

// ─── Phase 10: Meetings ──────────────────────────────────────────────────

export type MeetingType = 'phone' | 'zoom' | 'google_meet' | 'in_person' | 'other';
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type MeetingBucket = 'upcoming' | 'today' | 'past' | 'cancelled';

export interface Meeting {
  id: string;
  leadId: string;
  contactId: string | null;
  /** Phase 10: EmailAccount used for GCal sync. Null if no sync. */
  accountId: string | null;
  title: string;
  type: MeetingType;
  meetingLink: string | null;
  scheduledAt: string;
  durationMin: number;
  status: MeetingStatus;
  notes: string | null;
  nextAction: string | null;
  assignedTo: string | null;
  /** Resolved attendees passed through to GCal as event attendees. */
  attendeeEmails: string[];
  /** Google Calendar sync state — read-only on the client. */
  externalProvider: string | null;
  externalEventId: string | null;
  externalLink: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; businessName: string; stage: LeadStage };
  contact?: { id: string; name: string; contactType: ContactType } | null;
  account?: { id: string; email: string; displayName: string | null } | null;
}

export interface CreateMeetingInput {
  leadId: string;
  contactId?: string;
  /** Optional override; server picks most-relevant active account otherwise. */
  accountId?: string;
  title: string;
  type?: MeetingType;
  meetingLink?: string;
  scheduledAt: string;
  durationMin?: number;
  status?: MeetingStatus;
  notes?: string;
  nextAction?: string;
  assignedTo?: string;
  attendeeEmails?: string[];
  /** Send a personalized invite email to attendees from the host's Gmail. */
  sendInvite?: boolean;
  /** Custom invite body — falls back to template (title + notes + link). */
  emailMessage?: string;
  /** Custom invite subject — falls back to "Invitation: {title}". */
  emailSubject?: string;
}

export type UpdateMeetingInput = Partial<Omit<CreateMeetingInput, 'leadId'>>;

export interface MeetingsCounts {
  upcoming: number;
  today: number;
  past: number;
  cancelled: number;
}

export interface MeetingConflictSummary {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  leadId: string;
  leadBusinessName: string;
}

// ─── Phase 11: Proposals ─────────────────────────────────────────────────

export type ProposalStatus = 'draft' | 'sent' | 'failed';

export interface ProposalAttachment {
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
}

export interface Proposal {
  id: string;
  leadId: string;
  contactId: string | null;
  accountId: string | null;
  subject: string;
  message: string;
  toEmail: string;
  attachments: ProposalAttachment[];
  status: ProposalStatus;
  emailLogId: string | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; businessName: string; stage: LeadStage };
  contact?: {
    id: string;
    name: string;
    email: string | null;
    contactType: ContactType;
  } | null;
  account?: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  emailLog?: {
    id: string;
    subject: string;
    status?: string;
    sentAt: string | null;
    openedAt: string | null;
    repliedAt: string | null;
    threadId: string | null;
  } | null;
}

export interface SendProposalInput {
  leadId: string;
  contactId?: string;
  accountId?: string;
  subject: string;
  message: string;
  files: File[];
}

// ─── Phase 12: Calls ─────────────────────────────────────────────────────

export type CallDirection = 'outbound' | 'inbound';
export type CallOutcome =
  | 'answered'
  | 'no_answer'
  | 'voicemail'
  | 'busy'
  | 'wrong_number'
  | 'do_not_call'
  | 'scheduled_callback';
export type CallStatus = 'scheduled' | 'completed' | 'cancelled';
export type CallBucket = 'scheduled' | 'today' | 'recent' | 'all';

export interface Call {
  id: string;
  leadId: string;
  contactId: string | null;
  assignedTo: string | null;
  direction: CallDirection;
  toPhone: string | null;
  fromPhone: string | null;
  occurredAt: string;
  durationSec: number | null;
  outcome: CallOutcome | null;
  status: CallStatus;
  notes: string | null;
  voicemailLeft: boolean;
  nextAction: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    businessName: string;
    stage: LeadStage;
    city: string | null;
    state: string | null;
  };
  contact?: {
    id: string;
    name: string;
    contactType: ContactType;
    phone?: string | null;
  } | null;
}

export interface CreateCallInput {
  leadId: string;
  contactId?: string;
  direction: CallDirection;
  toPhone?: string;
  fromPhone?: string;
  occurredAt: string;
  durationSec?: number;
  outcome?: CallOutcome;
  status?: CallStatus;
  notes?: string;
  voicemailLeft?: boolean;
  nextAction?: string;
  assignedTo?: string;
}

export type UpdateCallInput = Partial<Omit<CreateCallInput, 'leadId'>>;

export interface CallsCounts {
  scheduled: number;
  today: number;
  recent: number;
  total: number;
}

// ─── Phase 13: Global Contacts Directory ─────────────────────────────────

export interface ContactWithLead extends Contact {
  lead: {
    id: string;
    businessName: string;
    city: string | null;
    state: string | null;
    stage: LeadStage;
    score: number;
    category: string | null;
  };
}

export interface GlobalContactsFilter {
  q?: string;
  contactType?: ContactType[];
  status?: ContactStatus[];
  confidence?: Confidence[];
  source?: ContactSource[];
  isPrimary?: 'true' | 'false';

  hasEmail?: 'true' | 'false';
  hasPhone?: 'true' | 'false';
  hasLinkedin?: 'true' | 'false';

  leadCategory?: string;
  leadCity?: string;
  leadState?: string;
  leadStage?: LeadStage[];

  cursor?: string;
  take?: number;
}

export interface ContactsFacets {
  leadCategories: string[];
  leadCities: string[];
  leadStates: string[];
}

export interface ContactsStats {
  total: number;
  owners: number;
  verified: number;
  withEmail: number;
  withPhone: number;
}

// ─── Phase 14: Dashboard ─────────────────────────────────────────────────

export interface DashboardSummary {
  today: {
    tasksDueToday: number;
    overdueTasks: number;
    leadsAddedToday: number;
    repliesToday: number;
    opensToday: number;
    meetingsToday: number;
    callsToday: number;
    proposalsSentToday: number;
  };
  stageFunnel: { stage: LeadStage; count: number }[];
  followUpContextCounts: { context: TaskContext; count: number }[];
  activeCampaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    sentCount: number;
    recipientCount: number;
    openedCount: number;
    repliedCount: number;
  }[];
  unreadReplies: number;
  upcomingMeetings: {
    id: string;
    title: string;
    scheduledAt: string;
    leadId: string;
    leadBusinessName: string;
    type: MeetingType;
    meetingLink: string | null;
  }[];
}

export type DashboardEvent =
  | { kind: 'lead_created'; at: string; leadId: string; leadName: string }
  | {
      kind: 'email_sent';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      subject: string;
      campaignId: string | null;
      campaignName: string | null;
    }
  | {
      kind: 'email_opened';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      subject: string;
      campaignId: string | null;
      campaignName: string | null;
    }
  | {
      kind: 'email_replied';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      snippet: string | null;
    }
  | {
      kind: 'task_completed';
      at: string;
      leadId: string;
      leadName: string;
      taskId: string;
      taskTitle: string;
    }
  | { kind: 'campaign_started'; at: string; campaignId: string; campaignName: string }
  | {
      kind: 'meeting_scheduled';
      at: string;
      leadId: string;
      leadName: string;
      meetingId: string;
      meetingTitle: string;
      scheduledAt: string;
    }
  | {
      kind: 'meeting_completed';
      at: string;
      leadId: string;
      leadName: string;
      meetingId: string;
      meetingTitle: string;
    }
  | {
      kind: 'call_logged';
      at: string;
      leadId: string;
      leadName: string;
      callId: string;
      direction: CallDirection;
      outcome: CallOutcome | null;
    }
  | {
      kind: 'proposal_sent';
      at: string;
      leadId: string;
      leadName: string;
      proposalId: string;
      subject: string;
    };

// ─── Phase 18: Sequences ─────────────────────────────────────────────────

export type SequenceStatus = 'draft' | 'active' | 'paused' | 'archived';

export type EnrollmentStatus =
  | 'active'
  | 'completed'
  | 'exited_replied'
  | 'exited_stage'
  | 'exited_manual';

export interface SequenceStep {
  id: string;
  sequenceId: string;
  order: number;
  delayDays: number;
  templateId: string;
  stopOnReply: boolean;
  stopOnStageProgression: boolean;
  createdAt: string;
}

export interface SequenceSummary {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  groupId: string | null;
  accountId: string;
  dailySendLimit: number;
  sendIntervalSec: number;
  enrolledCount: number;
  completedCount: number;
  exitedCount: number;
  startedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  group?: { id: string; name: string } | null;
  account?: { id: string; email: string; displayName: string | null };
  steps?: SequenceStep[];
  _count?: { steps: number; enrollments: number };
}

export interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  leadId: string;
  contactId: string | null;
  toEmail: string;
  status: EnrollmentStatus;
  nextStepOrder: number;
  nextSendAt: string;
  enrolledAt: string;
  exitedAt: string | null;
  exitReason: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    businessName: string;
    stage: LeadStage;
    city: string | null;
    state: string | null;
  };
  contact?: { id: string; name: string; contactType: ContactType } | null;
  sends?: SequenceEnrollmentSend[];
  sequence?: {
    id: string;
    name: string;
    status: SequenceStatus;
    _count?: { steps: number };
  };
}

export interface SequenceEnrollmentSend {
  id: string;
  enrollmentId: string;
  stepOrder: number;
  renderedSubject: string;
  renderedBodyText: string;
  renderedBodyHtml: string | null;
  emailLogId: string | null;
  sentAt: string;
  emailLog?: {
    id: string;
    sentAt: string | null;
    openedAt: string | null;
    repliedAt: string | null;
  } | null;
}

export interface CreateSequenceStepInput {
  delayDays: number;
  templateId: string;
  stopOnReply?: boolean;
  stopOnStageProgression?: boolean;
}

export interface CreateSequenceInput {
  name: string;
  description?: string;
  groupId?: string;
  accountId: string;
  dailySendLimit?: number;
  sendIntervalSec?: number;
  steps: CreateSequenceStepInput[];
}

export interface UpdateSequenceInput {
  name?: string;
  description?: string | null;
  dailySendLimit?: number;
  sendIntervalSec?: number;
}

// ─── Phase 16: Notifications ─────────────────────────────────────────────

export type NotificationKind =
  | 'email_replied'
  | 'campaign_completed'
  | 'lead_converted'
  | 'lead_lost'
  | 'lead_not_converted';

export type NotificationStatus = 'unread' | 'read' | 'dismissed';

export interface Notification {
  id: string;
  kind: NotificationKind;
  status: NotificationStatus;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  assignedTo: string | null;
  createdAt: string;
  readAt: string | null;
}

// ─── Phase 15: Reports ───────────────────────────────────────────────────

export interface PipelineReport {
  total: number;
  byStage: { stage: LeadStage; count: number; percentOfTotal: number }[];
  conversionRates: {
    fromStage: LeadStage;
    toStage: LeadStage;
    rate: number;
    fromCount: number;
    toCount: number;
  }[];
  outcomes: {
    converted: number;
    notConverted: number;
    lost: number;
  };
}

export interface CampaignReport {
  totals: {
    campaignsStarted: number;
    totalRecipients: number;
    totalSent: number;
    totalOpens: number;
    totalReplies: number;
    totalBounces: number;
    averageOpenRate: number;
    averageReplyRate: number;
  };
  campaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    startedAt: string | null;
    recipientCount: number;
    sentCount: number;
    openedCount: number;
    repliedCount: number;
    bouncedCount: number;
    openRate: number;
    replyRate: number;
  }[];
  perDay: {
    date: string;
    campaignsStarted: number;
    emailsSent: number;
  }[];
}

export interface LeadSourcesReport {
  bySource: {
    source: string;
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    qualifiedRate: number;
    convertedRate: number;
  }[];
  byCategory: {
    category: string;
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    qualifiedRate: number;
    convertedRate: number;
  }[];
}

export interface ActivityVolumeReport {
  perDay: {
    date: string;
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    callsLogged: number;
    meetingsHeld: number;
    proposalsSent: number;
    leadsAdded: number;
  }[];
  totals: {
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    callsLogged: number;
    meetingsHeld: number;
    proposalsSent: number;
    leadsAdded: number;
  };
}

export interface FollowupHealthReport {
  byStatus: { status: TaskStatus; count: number }[];
  byBucket: {
    bucket: 'today' | 'overdue' | 'upcoming' | 'completed';
    count: number;
  }[];
  byContext: { context: TaskContext; count: number }[];
  byPriority: { priority: TaskPriority; count: number }[];
  averageCompletionDays: number | null;
  staleOpenCount: number;
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

  // ─── Phase 10: Meetings ───────────────────────────────────────────────
  listMeetings: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    }
    return request<{ items: Meeting[]; nextCursor: string | null }>(
      `/meetings?${qs.toString()}`,
    );
  },
  meetingsCounts: () => request<MeetingsCounts>('/meetings/counts'),
  getMeeting: (id: string) => request<Meeting>(`/meetings/${id}`),
  createMeeting: (input: CreateMeetingInput) =>
    request<Meeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMeeting: (id: string, patch: UpdateMeetingInput) =>
    request<Meeting>(`/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMeeting: (id: string) =>
    request<{ ok: true }>(`/meetings/${id}`, { method: 'DELETE' }),
  syncMeetingNow: (id: string) =>
    request<Meeting>(`/meetings/${id}/sync-now`, { method: 'POST' }),
  listLeadMeetings: (leadId: string) =>
    request<Meeting[]>(`/leads/${leadId}/meetings`),
  checkMeetingConflict: (params: {
    accountId: string;
    scheduledAt: string;
    durationMin: number;
    excludeMeetingId?: string;
  }) => {
    const qs = new URLSearchParams();
    qs.set('accountId', params.accountId);
    qs.set('scheduledAt', params.scheduledAt);
    qs.set('durationMin', String(params.durationMin));
    if (params.excludeMeetingId) qs.set('excludeMeetingId', params.excludeMeetingId);
    return request<{ conflict: MeetingConflictSummary | null }>(
      `/meetings/conflict-check?${qs.toString()}`,
    );
  },

  // ─── Phase 11: Proposals ──────────────────────────────────────────────
  listLeadProposals: (leadId: string) =>
    request<Proposal[]>(`/leads/${leadId}/proposals`),
  getProposal: (id: string) => request<Proposal>(`/proposals/${id}`),
  deleteProposal: (id: string) =>
    request<{ ok: true }>(`/proposals/${id}`, { method: 'DELETE' }),
  /**
   * Multipart `POST /api/proposals/send`. We bypass the JSON `request`
   * helper because FormData needs the browser-set content-type header
   * (boundary) and shouldn't be JSON-encoded.
   */
  sendProposal: async (input: SendProposalInput) => {
    const fd = new FormData();
    fd.append('leadId', input.leadId);
    if (input.contactId) fd.append('contactId', input.contactId);
    if (input.accountId) fd.append('accountId', input.accountId);
    fd.append('subject', input.subject);
    fd.append('message', input.message);
    for (const f of input.files) fd.append('files', f);
    const res = await fetch(`${BASE}/api/proposals/send`, {
      method: 'POST',
      body: fd,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as Proposal;
  },

  // ─── Phase 12: Calls ──────────────────────────────────────────────────
  listCalls: (params: {
    bucket?: CallBucket;
    direction?: CallDirection[];
    outcome?: CallOutcome[];
    status?: CallStatus[];
    leadId?: string;
    assignedTo?: string;
    take?: number;
    cursor?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.bucket) qs.set('bucket', params.bucket);
    if (params.direction?.length) qs.set('direction', params.direction.join(','));
    if (params.outcome?.length) qs.set('outcome', params.outcome.join(','));
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.leadId) qs.set('leadId', params.leadId);
    if (params.assignedTo) qs.set('assignedTo', params.assignedTo);
    if (params.take) qs.set('take', String(params.take));
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<{ items: Call[]; nextCursor: string | null }>(
      `/calls?${qs.toString()}`,
    );
  },
  callsCounts: () => request<CallsCounts>('/calls/counts'),
  getCall: (id: string) => request<Call>(`/calls/${id}`),
  createCall: (input: CreateCallInput) =>
    request<Call>('/calls', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCall: (id: string, patch: UpdateCallInput) =>
    request<Call>(`/calls/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteCall: (id: string) =>
    request<{ ok: true }>(`/calls/${id}`, { method: 'DELETE' }),
  listLeadCalls: (leadId: string) =>
    request<Call[]>(`/leads/${leadId}/calls`),

  // ─── Phase 13: Global Contacts Directory ──────────────────────────────
  listGlobalContacts: (params: GlobalContactsFilter = {}) => {
    const qs = buildContactsQuery(params);
    return request<{ items: ContactWithLead[]; nextCursor: string | null }>(
      `/contacts?${qs.toString()}`,
    );
  },
  getContactsFacets: () => request<ContactsFacets>('/contacts/facets'),
  getContactsStats: (params: GlobalContactsFilter = {}) => {
    const qs = buildContactsQuery(params);
    return request<ContactsStats>(`/contacts/stats?${qs.toString()}`);
  },

  // ─── Phase 14: Dashboard ──────────────────────────────────────────────
  getDashboardSummary: () => request<DashboardSummary>('/dashboard/summary'),
  getDashboardActivity: (params: { limit?: number; days?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.days !== undefined) qs.set('days', String(params.days));
    const suffix = qs.toString();
    return request<DashboardEvent[]>(
      `/dashboard/activity${suffix ? `?${suffix}` : ''}`,
    );
  },

  // ─── Phase 15: Reports ────────────────────────────────────────────────
  getPipelineReport: () => request<PipelineReport>('/reports/pipeline'),
  getCampaignReport: (params: { days?: number } = {}) =>
    request<CampaignReport>(
      `/reports/campaigns${params.days ? `?days=${params.days}` : ''}`,
    ),
  getLeadSourcesReport: (params: { days?: number } = {}) =>
    request<LeadSourcesReport>(
      `/reports/lead-sources${params.days ? `?days=${params.days}` : ''}`,
    ),
  getActivityVolumeReport: (params: { days?: number } = {}) =>
    request<ActivityVolumeReport>(
      `/reports/activity-volume${params.days ? `?days=${params.days}` : ''}`,
    ),
  getFollowupHealthReport: () =>
    request<FollowupHealthReport>('/reports/followup-health'),

  // ─── Phase 16: Notifications ──────────────────────────────────────────
  listNotifications: (
    params: {
      status?: NotificationStatus;
      take?: number;
      entityType?: string;
      entityId?: string;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.take !== undefined) qs.set('take', String(params.take));
    if (params.entityType) qs.set('entityType', params.entityType);
    if (params.entityId) qs.set('entityId', params.entityId);
    const suffix = qs.toString();
    return request<Notification[]>(
      `/notifications${suffix ? `?${suffix}` : ''}`,
    );
  },
  getNotificationUnreadCount: () =>
    request<{ count: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<Notification>(`/notifications/${id}/mark-read`, {
      method: 'POST',
    }),
  markAllNotificationsRead: () =>
    request<{ updated: number }>('/notifications/mark-all-read', {
      method: 'POST',
    }),
  dismissNotification: (id: string) =>
    request<Notification>(`/notifications/${id}/dismiss`, {
      method: 'POST',
    }),
  deleteNotification: (id: string) =>
    request<{ ok: true }>(`/notifications/${id}`, { method: 'DELETE' }),

  // ─── Phase 18: Sequences ──────────────────────────────────────────────
  listSequences: (params: { status?: SequenceStatus[] } = {}) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    const suffix = qs.toString();
    return request<SequenceSummary[]>(
      `/sequences${suffix ? `?${suffix}` : ''}`,
    );
  },
  getSequence: (id: string) => request<SequenceSummary>(`/sequences/${id}`),
  listSequenceEnrollments: (
    id: string,
    params: { status?: EnrollmentStatus[]; take?: number; cursor?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.take !== undefined) qs.set('take', String(params.take));
    if (params.cursor) qs.set('cursor', params.cursor);
    const suffix = qs.toString();
    return request<{ items: SequenceEnrollment[]; nextCursor: string | null }>(
      `/sequences/${id}/enrollments${suffix ? `?${suffix}` : ''}`,
    );
  },
  createSequence: (input: CreateSequenceInput) =>
    request<SequenceSummary>('/sequences', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSequence: (id: string, patch: UpdateSequenceInput) =>
    request<SequenceSummary>(`/sequences/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  startSequence: (id: string) =>
    request<{
      sequence: SequenceSummary;
      enrolledCount: number;
      skippedNoEmail: number;
    }>(`/sequences/${id}/start`, { method: 'POST' }),
  pauseSequence: (id: string) =>
    request<SequenceSummary>(`/sequences/${id}/pause`, { method: 'POST' }),
  resumeSequence: (id: string) =>
    request<SequenceSummary>(`/sequences/${id}/resume`, { method: 'POST' }),
  archiveSequence: (id: string) =>
    request<SequenceSummary>(`/sequences/${id}/archive`, { method: 'POST' }),
  deleteSequence: (id: string) =>
    request<{ ok: true }>(`/sequences/${id}`, { method: 'DELETE' }),
  enrollLeads: (id: string, leadIds: string[]) =>
    request<{
      enrolled: number;
      skippedAlreadyEnrolled: number;
      skippedNoEmail: number;
    }>(`/sequences/${id}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ leadIds }),
    }),
  unenrollFromSequence: (id: string, enrollmentId: string) =>
    request<SequenceEnrollment>(
      `/sequences/${id}/enrollments/${enrollmentId}/unenroll`,
      { method: 'POST' },
    ),
  listLeadSequences: (leadId: string) =>
    request<SequenceEnrollment[]>(`/leads/${leadId}/sequences`),
  runSequenceTick: () =>
    request<{ sent: number; exited: number; skipped: number; scanned: number }>(
      '/sequences/run',
      { method: 'POST' },
    ),
};

function buildContactsQuery(params: GlobalContactsFilter): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      qs.set(k, v.join(','));
      continue;
    }
    qs.set(k, String(v));
  }
  return qs;
}
