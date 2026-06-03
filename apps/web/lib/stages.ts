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
// Each stage gets a light + dark variant so chips stay legible against
// both surface stacks. Dark uses tinted bg (15% alpha) + 300-range text +
// 30% alpha border — standard modern-dark chip recipe.
const STAGE_CLASSES: Record<LeadStage, string> = {
  new:
    'bg-gray-100 text-gray-700 border-gray-200 ' +
    'dark:bg-gray-500/15 dark:text-gray-300 dark:border-gray-500/30',
  approached:
    'bg-blue-100 text-blue-700 border-blue-200 ' +
    'dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  no_response:
    'bg-zinc-100 text-zinc-700 border-zinc-200 ' +
    'dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
  engaged:
    'bg-cyan-100 text-cyan-700 border-cyan-200 ' +
    'dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',
  push:
    'bg-orange-100 text-orange-700 border-orange-200 ' +
    'dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  qualified:
    'bg-purple-100 text-purple-700 border-purple-200 ' +
    'dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
  interested:
    'bg-indigo-100 text-indigo-700 border-indigo-200 ' +
    'dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  booked:
    'bg-violet-100 text-violet-700 border-violet-200 ' +
    'dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
  proposal_sent:
    'bg-amber-100 text-amber-700 border-amber-200 ' +
    'dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  converted:
    'bg-green-100 text-green-700 border-green-200 ' +
    'dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  not_converted:
    'bg-red-100 text-red-700 border-red-200 ' +
    'dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  lost:
    'bg-red-200 text-red-800 border-red-300 ' +
    'dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40',
};

export function stageClass(s: LeadStage): string {
  return STAGE_CLASSES[s];
}
