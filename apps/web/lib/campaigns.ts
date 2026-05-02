import type { CampaignStatus, CampaignRecipientStatus } from './api';

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
export function campaignStatusLabel(s: CampaignStatus) {
  return STATUS_LABELS[s];
}

const STATUS_CLASSES: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  queued: 'bg-blue-100 text-blue-700 border-blue-200',
  running: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};
export function campaignStatusClass(s: CampaignStatus) {
  return STATUS_CLASSES[s];
}

const RECIPIENT_STATUS_LABELS: Record<CampaignRecipientStatus, string> = {
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
  bounced: 'Bounced',
};
export function recipientStatusLabel(s: CampaignRecipientStatus) {
  return RECIPIENT_STATUS_LABELS[s];
}

const RECIPIENT_STATUS_CLASSES: Record<CampaignRecipientStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-200 text-red-800',
};
export function recipientStatusClass(s: CampaignRecipientStatus) {
  return RECIPIENT_STATUS_CLASSES[s];
}

export const SUPPORTED_TAGS: { tag: string; description: string; required?: boolean }[] = [
  { tag: 'businessName', description: "Lead's business name" },
  { tag: 'firstName', description: "Recipient's first name (falls back to 'there')" },
  { tag: 'ownerFirstName', description: "Owner first name", required: true },
  { tag: 'city', description: "Lead's city (empty if missing)" },
  { tag: 'state', description: "Lead's state (empty if missing)" },
  { tag: 'toEmail', description: 'Resolved recipient email' },
];

export const SAMPLE_PREVIEW_CONTEXT = {
  toEmail: 'maria@acmeplumbing.com',
  lead: {
    businessName: 'Acme Plumbing',
    ownerName: 'Maria Lopez',
    city: 'Brooklyn',
    state: 'NY',
  },
  contact: { name: 'Maria Lopez' },
};

/** Tiny client-side renderer mirroring the server's merge-tags.ts. */
export function previewRender(
  template: string,
  ctx: typeof SAMPLE_PREVIEW_CONTEXT,
): string {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (m, name) => {
    switch (name) {
      case 'businessName':
        return ctx.lead.businessName ?? '';
      case 'firstName':
        return firstWord(ctx.contact?.name) || firstWord(ctx.lead.ownerName) || 'there';
      case 'ownerFirstName':
        return firstWord(ctx.contact?.name) || firstWord(ctx.lead.ownerName) || m;
      case 'city':
        return ctx.lead.city ?? '';
      case 'state':
        return ctx.lead.state ?? '';
      case 'toEmail':
        return ctx.toEmail;
      default:
        return m;
    }
  });
}

function firstWord(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().split(/\s+/)[0] ?? '';
}
