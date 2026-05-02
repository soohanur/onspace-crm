import type { LeadStage } from './api';

export const LEAD_STAGES: LeadStage[] = [
  'new',
  'approached',
  'no_response',
  'engaged',
  'push',
  'qualified',
  'interested',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
];

const LABELS: Record<LeadStage, string> = {
  new: 'New',
  approached: 'Approached',
  no_response: 'No response',
  engaged: 'Engaged',
  push: 'Push',
  qualified: 'Qualified',
  interested: 'Interested',
  booked: 'Booked',
  proposal_sent: 'Proposal sent',
  converted: 'Converted',
  not_converted: 'Not converted',
  lost: 'Lost',
};

export function stageLabel(s: LeadStage): string {
  return LABELS[s];
}

/**
 * Color classes per stage. Tailwind needs literal class strings, so the
 * mapping is exhaustive instead of computed.
 */
const STAGE_CLASSES: Record<LeadStage, string> = {
  new: 'bg-gray-100 text-gray-700 border-gray-200',
  approached: 'bg-blue-100 text-blue-700 border-blue-200',
  no_response: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  engaged: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  push: 'bg-orange-100 text-orange-700 border-orange-200',
  qualified: 'bg-purple-100 text-purple-700 border-purple-200',
  interested: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  booked: 'bg-violet-100 text-violet-700 border-violet-200',
  proposal_sent: 'bg-amber-100 text-amber-700 border-amber-200',
  converted: 'bg-green-100 text-green-700 border-green-200',
  not_converted: 'bg-red-100 text-red-700 border-red-200',
  lost: 'bg-red-200 text-red-800 border-red-300',
};

export function stageClass(s: LeadStage): string {
  return STAGE_CLASSES[s];
}
