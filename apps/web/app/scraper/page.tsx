'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ScrapeJob } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Autocomplete } from '@/components/Autocomplete';
import { LeadsTable } from '@/components/LeadsTable';
import { ScrapePipelinePanel } from '@/components/scraper/ScrapePipelinePanel';
import { Loader2, Plus, Square } from 'lucide-react';

// Set NEXT_PUBLIC_SCRAPER_DISABLED=1 on hosts that can't run the Python
// Playwright subprocess (e.g. Render free instances). Page still renders;
// the start action is gated and a banner explains why.
const SCRAPER_DISABLED = process.env.NEXT_PUBLIC_SCRAPER_DISABLED === '1';

export default function LeadScraperPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hasWebsite, setHasWebsite] = useState<'all' | 'true' | 'false'>('all');
  const [hasEmail, setHasEmail] = useState<'all' | 'true' | 'false'>('all');
  const [tableQ, setTableQ] = useState('');

  // Restore last active job id on mount (so refresh keeps showing the running scrape).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('onspace.activeJobId');
    if (saved) setActiveJobId(saved);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeJobId) localStorage.setItem('onspace.activeJobId', activeJobId);
  }, [activeJobId]);

  const startJob = useMutation({
    mutationFn: () =>
      api.createScrapeJob({
        searchQuery: query.trim(),
        searchLocation: location.trim(),
      }),
    onSuccess: (job) => {
      setActiveJobId(job.id);
      // Clear the form so the right-hand button reverts from
      // "Add Pipeline" back to "Stop Scrape".
      setQuery('');
      setLocation('');
      // Drop any cached leads from the previous job so the table starts empty.
      qc.removeQueries({ queryKey: ['leads-by-job'] });
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] });
    },
  });

  const clearActiveJob = () => {
    setActiveJobId(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('onspace.activeJobId');
    }
    qc.removeQueries({ queryKey: ['leads-by-job'] });
  };

  const cancelJob = useMutation({
    mutationFn: (id: string) => api.cancelScrapeJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-job', activeJobId] });
    },
  });

  // Bulk pipeline moved to a dedicated component (ScrapePipelinePanel)
  // — handles add, edit, delete, requeue inline.

  const { data: job } = useQuery<ScrapeJob | undefined>({
    queryKey: ['scrape-job', activeJobId],
    queryFn: () => (activeJobId ? api.getScrapeJob(activeJobId) : Promise.resolve(undefined)),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const status = (q.state.data as ScrapeJob | undefined)?.status;
      return status === 'queued' || status === 'running' ? 1000 : false;
    },
  });

  const isLive =
    job?.status === 'running' || job?.status === 'queued';

  const { data: stats } = useQuery({
    queryKey: ['leads-stats', activeJobId],
    queryFn: () => api.leadStats(activeJobId ? { jobId: activeJobId } : {}),
    enabled: !!activeJobId,
    refetchInterval: isLive ? 1000 : false,
  });

  const { data: leads } = useQuery({
    queryKey: ['leads-by-job', activeJobId, hasWebsite, hasEmail, tableQ],
    queryFn: () =>
      activeJobId
        ? api.listLeads({
            jobId: activeJobId,
            hasWebsite: hasWebsite === 'all' ? undefined : hasWebsite,
            hasEmail: hasEmail === 'all' ? undefined : hasEmail,
            q: tableQ || undefined,
            take: 200,
          })
        : Promise.resolve({ items: [], nextCursor: null }),
    enabled: !!activeJobId,
    refetchInterval: isLive ? 1000 : false,
  });

  const isRunning = job?.status === 'running' || job?.status === 'queued';
  // Right-hand button is a single 3-state control:
  //   1. inputs filled → "Add Pipeline" (queues this category+location)
  //   2. inputs empty + something running → "Stop Scrape" (cancels active job)
  //   3. inputs empty + nothing running → disabled "Stop Scrape" placeholder
  const hasInputs =
    query.trim().length >= 2 && location.trim().length >= 2;
  const canAddPipeline = hasInputs && !startJob.isPending;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">

      {SCRAPER_DISABLED && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <b>Scraper disabled on this host.</b> The Python Playwright runner is
          not available on the current deployment (free Render instance).
          Run locally with <code className="font-mono">pnpm dev</code> or
          deploy the API to a host that ships <code>chromium</code>.
        </div>
      )}

      {/* Form */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-caption uppercase tracking-wider text-neutral mb-1.5">
              Category
            </label>
            <Autocomplete
              value={query}
              onChange={setQuery}
              placeholder="e.g. plumber, dentist, roofing"
              fetchSuggestions={api.suggestQueries}
            />
          </div>
          <div className="md:col-span-5">
            <label className="block text-caption uppercase tracking-wider text-neutral mb-1.5">
              Location
            </label>
            <Autocomplete
              value={location}
              onChange={setLocation}
              placeholder="e.g. New York, NY"
              fetchSuggestions={api.suggestLocations}
            />
          </div>
          <div className="md:col-span-2">
            {hasInputs ? (
              <Button
                onClick={() => startJob.mutate()}
                disabled={!canAddPipeline}
                className="w-full"
              >
                {startJob.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Add Pipeline
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => activeJobId && cancelJob.mutate(activeJobId)}
                disabled={!isRunning || cancelJob.isPending}
                className="w-full !text-error !border-error hover:!bg-errorBg disabled:!text-neutral disabled:!border-border"
              >
                {cancelJob.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Stopping…
                  </>
                ) : (
                  <>
                    <Square size={14} className="fill-error" />
                    Stop Scrape
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        {startJob.error && (
          <div className="mt-3 text-error text-bodysm">
            {(startJob.error as Error).message}
          </div>
        )}
      </Card>

      {/* Pipeline workspace: live table of every job. New rows are added
          from the Category + Location form above (Add Pipeline). */}
      <ScrapePipelinePanel
        onSelectJob={(id) => setActiveJobId(id)}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat
          label="Status"
          value={
            <Chip
              tone={
                job?.status === 'done'
                  ? 'positive'
                  : job?.status === 'failed'
                  ? 'negative'
                  : job?.status === 'running' || job?.status === 'queued'
                  ? 'primary'
                  : 'neutral'
              }
            >
              {job?.status ?? 'idle'}
            </Chip>
          }
        />
        <Stat label="Found" value={job?.totalFound ?? 0} />
        <Stat label="Saved" value={stats?.total ?? 0} />
        <Stat label="With Website" value={stats?.withWebsite ?? 0} />
        <Stat label="With Email" value={stats?.withEmail ?? 0} />
      </div>

      {/* Finished-job banner — lets the user dismiss the previous job */}
      {!isLive && job && (
        <Card className="!py-3">
          <div className="flex items-center gap-3">
            <Chip
              tone={
                job.status === 'done'
                  ? 'positive'
                  : job.status === 'failed'
                  ? 'negative'
                  : 'neutral'
              }
            >
              {job.status}
            </Chip>
            <div className="text-bodysm">
              Showing <span className="font-medium text-ink">{job.searchQuery}</span> in{' '}
              <span className="font-medium text-ink">{job.searchLocation}</span>
              {' '}— {stats?.total ?? 0} leads saved
            </div>
            <button
              onClick={clearActiveJob}
              className="ml-auto text-caption text-ink-muted hover:text-error"
            >
              Clear & start fresh
            </button>
          </div>
          {job.status === 'failed' && job.error && (
            <div className="mt-2 text-bodysm text-error">
              <b>Reason:</b> {job.error}
            </div>
          )}
        </Card>
      )}

      {/* Live activity strip */}
      {isLive && (
        <Card className="!py-3 flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <div className="text-bodysm">
            <span className="font-medium text-ink">Scraping live</span>
            <span className="text-ink-muted">
              {' '}— last saved:{' '}
              <span className="text-ink">
                {leads?.items[0]?.businessName ?? 'waiting for first result…'}
              </span>
            </span>
          </div>
          <div className="ml-auto text-caption text-neutral font-mono font-tabular">
            polling every 1s
          </div>
        </Card>
      )}

      {/* Live results */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Filter results…"
            value={tableQ}
            onChange={(e) => setTableQ(e.target.value)}
            className="max-w-[280px]"
          />
          <Select value={hasWebsite} onChange={(e) => setHasWebsite(e.target.value as any)}>
            <option value="all">Website: All</option>
            <option value="true">Has website</option>
            <option value="false">No website</option>
          </Select>
          <Select value={hasEmail} onChange={(e) => setHasEmail(e.target.value as any)}>
            <option value="all">Email: All</option>
            <option value="true">Has email</option>
            <option value="false">No email</option>
          </Select>
          <div className="ml-auto text-bodysm text-ink-muted font-tabular">
            {leads?.items.length ?? 0} rows
          </div>
        </div>
        <LeadsTable leads={leads?.items ?? []} />
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <div className="text-caption uppercase tracking-wider text-neutral mb-2">
        {label}
      </div>
      <div className="text-h2 font-mono font-tabular">{value}</div>
    </Card>
  );
}
