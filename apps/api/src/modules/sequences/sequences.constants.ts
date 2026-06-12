import { LeadStage } from '@onspace/db';

export const SEQUENCES_QUEUE = 'sequences';
export const SEQUENCE_TICK_JOB = 'sequence-tick';
export const SEQUENCE_AUTO_ENROLL_JOB = 'sequence-auto-enroll';

/**
 * Per-tick cap on the number of enrollments we look at. Tighter than the
 * BullMQ tick cadence (5 min), so back-pressure is naturally handled by
 * leftover enrollments getting picked up next tick.
 */
export const SEQUENCES_TICK_BATCH_SIZE = 200;

/**
 * Outreach window. Sends only fire inside [start, end) hour of
 * `OUTREACH_TZ`. Default = US Eastern office hours (9 AM → 5 PM ET).
 * Override per-deploy via env. Use 24h numbers.
 */
export const OUTREACH_TZ =
  process.env.OUTREACH_TZ?.trim() || 'America/New_York';
export const OUTREACH_HOUR_START = Number(
  process.env.OUTREACH_HOUR_START ?? 9,
);
export const OUTREACH_HOUR_END = Number(
  process.env.OUTREACH_HOUR_END ?? 17,
);

/**
 * Random gap between two consecutive sends from the same email
 * account. Default 8–10 min — keeps each Gmail looking human, dodges
 * "burst" heuristics. Per-account; different accounts can fire in
 * parallel during the same tick.
 */
export const OUTREACH_GAP_MIN_SEC = Number(
  process.env.OUTREACH_GAP_MIN_SEC ?? 480,
);
export const OUTREACH_GAP_MAX_SEC = Number(
  process.env.OUTREACH_GAP_MAX_SEC ?? 600,
);

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
