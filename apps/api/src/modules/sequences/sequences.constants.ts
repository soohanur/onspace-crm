import { LeadStage } from '@onspace/db';

export const SEQUENCES_QUEUE = 'sequences';
export const SEQUENCE_TICK_JOB = 'sequence-tick';

/**
 * Per-tick cap on the number of enrollments we look at. Tighter than the
 * BullMQ tick cadence (5 min), so back-pressure is naturally handled by
 * leftover enrollments getting picked up next tick.
 */
export const SEQUENCES_TICK_BATCH_SIZE = 200;

/**
 * Stage progression set used by `stopOnStageProgression`. If a lead has
 * advanced to any of these stages (manually or via automation), we stop
 * sending cold drip steps — they're past the cold-outreach phase.
 */
export const SEQUENCE_STOP_STAGES: LeadStage[] = [
  'interested',
  'qualified',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
];
