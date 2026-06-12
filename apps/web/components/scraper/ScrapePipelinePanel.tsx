'use client';

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { api, ScrapeJob } from '@/lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

/**
 * Scrape-pipeline workspace. Always visible; grows independently of the
 * single-job runner. Adds bulk-queueing on top + a live table of every
 * pending/done job with per-row edit + delete + retry. Minimizable so the
 * leads table below has room when the user just wants to watch results.
 */
export function ScrapePipelinePanel({
  onSelectJob,
}: {
  onSelectJob: (jobId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<
    null | { id: string; query: string; location: string }
  >(null);

  // Live list of jobs — poll every 2s so newly queued / progressing rows
  // appear without manual refresh while the user adds more.
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['scrape-jobs'],
    queryFn: () => api.listScrapeJobs(),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  const counts = useMemo(() => {
    const c = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const j of jobs) {
      const s = j.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [jobs]);

  const updateJob = useMutation({
    mutationFn: (input: {
      id: string;
      searchQuery: string;
      searchLocation: string;
    }) =>
      api.updateScrapeJob(input.id, {
        searchQuery: input.searchQuery,
        searchLocation: input.searchLocation,
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] });
    },
  });

  const deleteJob = useMutation({
    mutationFn: (id: string) => api.deleteScrapeJob(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] }),
  });

  const cancelJob = useMutation({
    mutationFn: (id: string) => api.cancelScrapeJob(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] }),
  });

  // Re-queue a failed/cancelled/done row by re-using its category+location.
  const requeueJob = useMutation({
    mutationFn: (job: ScrapeJob) =>
      api.createScrapeJob({
        searchQuery: job.searchQuery,
        searchLocation: job.searchLocation,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] }),
  });

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-background transition"
      >
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-primary" />
          <h2 className="text-h3">Scrape pipeline</h2>
          <div className="flex items-center gap-1.5 ml-2">
            <Chip tone="primary" className="!h-5 !text-[11px]">
              queued {counts.queued}
            </Chip>
            <Chip tone="warning" className="!h-5 !text-[11px]">
              running {counts.running}
            </Chip>
            <Chip tone="positive" className="!h-5 !text-[11px]">
              done {counts.done}
            </Chip>
            {(counts.failed > 0 || counts.cancelled > 0) && (
              <Chip tone="negative" className="!h-5 !text-[11px]">
                fail {counts.failed + counts.cancelled}
              </Chip>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-ink-muted" />
        ) : (
          <ChevronDown size={16} className="text-ink-muted" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Bulk-add textarea row removed — pipeline rows are added via
              the top Category + Location form ("Add Pipeline" button). */}

          {/* Table */}
          <div className="border-t border-border overflow-x-auto scroll-thin">
            <table className="w-full text-bodysm">
              <thead className="bg-background text-caption text-neutral uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2 w-24">Status</th>
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-left px-4 py-2">Location</th>
                  <th className="text-right px-4 py-2 w-24">Saved</th>
                  <th className="text-right px-4 py-2 w-24">Page</th>
                  <th className="text-right px-4 py-2 w-44">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                      Loading pipeline…
                    </td>
                  </tr>
                )}
                {!isLoading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                      No jobs yet. Add categories + locations above.
                    </td>
                  </tr>
                )}
                {jobs.map((j) =>
                  editing?.id === j.id ? (
                    <tr key={j.id} className="border-t border-border bg-primary/5">
                      <td className="px-4 py-2">
                        <StatusChip status={j.status} />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editing.query}
                          onChange={(e) =>
                            setEditing({ ...editing, query: e.target.value })
                          }
                          className="w-full h-8 px-2 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editing.location}
                          onChange={(e) =>
                            setEditing({ ...editing, location: e.target.value })
                          }
                          className="w-full h-8 px-2 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-tabular">
                        {j.totalSaved}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-tabular">
                        {j.lastPage}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() =>
                              editing.query.trim() &&
                              editing.location.trim() &&
                              updateJob.mutate({
                                id: j.id,
                                searchQuery: editing.query,
                                searchLocation: editing.location,
                              })
                            }
                            disabled={updateJob.isPending}
                            title="Save"
                            className="p-1 rounded-md hover:bg-success/10 text-success"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            title="Cancel edit"
                            className="p-1 rounded-md hover:bg-background text-ink-muted"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={j.id}
                      className="group border-t border-border hover:bg-background"
                    >
                      <td className="px-4 py-2">
                        <StatusChip status={j.status} />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => onSelectJob(j.id)}
                          className="text-left hover:text-primary"
                        >
                          {j.searchQuery}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {j.searchLocation}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-tabular">
                        {j.totalSaved}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-tabular">
                        {j.lastPage}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {j.status === 'queued' && (
                            <button
                              onClick={() =>
                                setEditing({
                                  id: j.id,
                                  query: j.searchQuery,
                                  location: j.searchLocation,
                                })
                              }
                              title="Edit"
                              className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {j.status === 'running' && (
                            <button
                              onClick={() => cancelJob.mutate(j.id)}
                              title="Cancel running"
                              className="p-1 rounded-md text-neutral hover:text-warning hover:bg-background"
                            >
                              <X size={13} />
                            </button>
                          )}
                          {(j.status === 'failed' ||
                            j.status === 'cancelled' ||
                            j.status === 'done') && (
                            <button
                              onClick={() => requeueJob.mutate(j)}
                              title="Re-queue same query"
                              className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (j.status === 'running') return;
                              if (confirm('Delete this scrape job?'))
                                deleteJob.mutate(j.id);
                            }}
                            disabled={j.status === 'running'}
                            title={
                              j.status === 'running'
                                ? 'Cancel first'
                                : 'Delete'
                            }
                            className="p-1 rounded-md text-neutral hover:text-error hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {(updateJob.error || deleteJob.error || cancelJob.error) && (
            <div className="px-4 py-2 text-caption text-error border-t border-border">
              {((updateJob.error || deleteJob.error || cancelJob.error) as Error).message}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusChip({ status }: { status: ScrapeJob['status'] }) {
  const map: Record<
    ScrapeJob['status'],
    { tone: 'primary' | 'warning' | 'positive' | 'negative' | 'neutral'; label: string }
  > = {
    queued: { tone: 'primary', label: 'Queued' },
    running: { tone: 'warning', label: 'Running' },
    done: { tone: 'positive', label: 'Done' },
    failed: { tone: 'negative', label: 'Failed' },
    cancelled: { tone: 'neutral', label: 'Cancelled' },
  };
  const v = map[status] ?? { tone: 'neutral', label: status };
  return (
    <Chip tone={v.tone} className="!h-5 !text-[11px]">
      {v.label}
    </Chip>
  );
}
