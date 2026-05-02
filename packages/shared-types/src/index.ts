import { z } from 'zod';

export const CreateScrapeJobSchema = z.object({
  searchQuery: z.string().min(2).max(120),
  searchLocation: z.string().min(2).max(120),
  source: z.literal('yellowpages').default('yellowpages'),
  maxResults: z.number().int().min(1).max(2000).default(200),
});
export type CreateScrapeJobInput = z.infer<typeof CreateScrapeJobSchema>;

export const ScrapeJobStatusEnum = z.enum([
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type ScrapeJobStatus = z.infer<typeof ScrapeJobStatusEnum>;

export const LeadSocialSchema = z
  .object({
    linkedin: z.string().url().optional(),
    facebook: z.string().url().optional(),
    twitter: z.string().url().optional(),
    instagram: z.string().url().optional(),
    youtube: z.string().url().optional(),
  })
  .partial();
export type LeadSocial = z.infer<typeof LeadSocialSchema>;
