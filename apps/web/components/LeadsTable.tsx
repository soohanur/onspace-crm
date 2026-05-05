'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CreateTaskInput, Lead, Task } from '@/lib/api';
import { groupSocials } from '@/lib/social';
import { ColumnKey } from '@/hooks/useColumnPrefs';
import { defaultContextForStage } from '@/lib/tasks';
import { relativeTime } from '@/lib/time';
import { Chip } from './ui/Chip';
import { StageBadge } from './leads/StageBadge';
import { TaskFormModal } from './tasks/TaskFormModal';
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search as SearchIcon,
  Star,
  Trash2,
} from 'lucide-react';

/** Returns a Set of lead IDs added since the last render — used to highlight new rows. */
function useNewIds(items: Lead[]): Set<string> {
  const seen = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh = new Set<string>();
    for (const l of items) {
      if (!seen.current.has(l.id)) {
        fresh.add(l.id);
        seen.current.add(l.id);
      }
    }
    if (fresh.size > 0) {
      setNewIds(fresh);
      const t = setTimeout(() => setNewIds(new Set()), 2200);
      return () => clearTimeout(t);
    }
  }, [items]);
  return newIds;
}

export function LeadsTable({
  leads,
  visibleColumns,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onDelete,
}: {
  leads: Lead[];
  visibleColumns?: Set<ColumnKey>;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  /** Called with the lead's id when the user confirms the row's delete action. */
  onDelete?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const newIds = useNewIds(leads);
  const isVisible = (k: ColumnKey) => !visibleColumns || visibleColumns.has(k);

  const taskColumnVisible = isVisible('tasks');
  const idsKey = useMemo(
    () => leads.map((l) => l.id).sort().join(','),
    [leads],
  );
  const { data: taskCounts } = useQuery({
    queryKey: ['lead-task-counts', idsKey],
    queryFn: () => api.taskOpenCounts(leads.map((l) => l.id)),
    enabled: taskColumnVisible && leads.length > 0,
    refetchInterval: 30_000,
  });

  const [followupLead, setFollowupLead] = useState<Lead | null>(null);
  const createTask = useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: (created: Task) => {
      setFollowupLead(null);
      qc.invalidateQueries({ queryKey: ['leads-global'] });
      qc.invalidateQueries({ queryKey: ['lead-task-counts'] });
      qc.invalidateQueries({ queryKey: ['lead-tasks', created.leadId] });
      qc.invalidateQueries({ queryKey: ['lead', created.leadId] });
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      qc.invalidateQueries({ queryKey: ['tasks-count-full'] });
    },
  });

  if (leads.length === 0) {
    return (
      <div className="py-20 text-center text-ink-muted text-bodysm">
        No leads yet — kick off a scrape from the Lead Scraper page.
      </div>
    );
  }

  return (
    <div className="overflow-auto scroll-thin">
      <table className="min-w-[1500px] w-full text-bodysm">
        <thead className="bg-background sticky top-0 z-10">
          <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
            {selectable && (
              <Th>
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={
                    !!selectedIds &&
                    leads.length > 0 &&
                    leads.every((l) => selectedIds.has(l.id))
                  }
                  onChange={() => onToggleAll?.()}
                  aria-label="Select all"
                />
              </Th>
            )}
            {isVisible('business') && <Th>Business</Th>}
            {isVisible('stage') && <Th>Stage</Th>}
            {isVisible('category') && <Th>Category</Th>}
            {isVisible('email') && <Th>Email</Th>}
            {isVisible('phone') && <Th>Phone</Th>}
            {isVisible('score') && <Th align="right">Score</Th>}
            {isVisible('tasks') && <Th>Tasks</Th>}
            {isVisible('website') && <Th>Website</Th>}
            {isVisible('social') && <Th>Social</Th>}
            {isVisible('address') && <Th>Address</Th>}
            {isVisible('source') && <Th>Source</Th>}
            {isVisible('rating') && <Th>Rating</Th>}
            {isVisible('years') && <Th>Years</Th>}
            {isVisible('owner') && <Th>Owner</Th>}
            {isVisible('yp') && <Th>YP</Th>}
            {isVisible('search') && <Th>Search</Th>}
            {isVisible('actions') && <Th>{''}</Th>}
            {onDelete && <Th>{''}</Th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              className={
                'group border-t border-border hover:bg-background transition-colors h-[44px] ' +
                (newIds.has(l.id) ? 'animate-row-flash' : '')
              }
            >
              {selectable && (
                <Td>
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={!!selectedIds?.has(l.id)}
                    onChange={() => onToggleSelect?.(l.id)}
                    aria-label={`Select ${l.businessName}`}
                  />
                </Td>
              )}
              {isVisible('business') && (
                <Td>
                  <div className="flex items-center gap-2 max-w-[280px]">
                    {l.logoUrl ? (
                      <img
                        src={l.logoUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-6 h-6 rounded object-cover bg-background border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded bg-background border border-border flex items-center justify-center shrink-0">
                        <ImageIcon size={12} className="text-neutral" />
                      </div>
                    )}
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium text-ink hover:text-primary truncate inline-flex items-center gap-1 min-w-0"
                      title={l.businessName}
                    >
                      <span className="truncate">{l.businessName}</span>
                      {l.claimed && (
                        <CheckCircle2
                          size={11}
                          className="text-primary shrink-0"
                          aria-label="Claimed"
                        />
                      )}
                    </Link>
                  </div>
                </Td>
              )}
              {isVisible('stage') && (
                <Td>
                  <StageBadge stage={l.stage} />
                </Td>
              )}
              {isVisible('category') && (
                <Td>
                  {l.category ? (
                    <span
                      className="inline-flex items-center gap-1 max-w-[200px]"
                      title={
                        l.categories.length > 1
                          ? l.categories.join(', ')
                          : l.category
                      }
                    >
                      <Chip tone="neutral" className="!h-5 !text-[11px] truncate">
                        {l.category}
                      </Chip>
                      {l.categories.length > 1 && (
                        <span className="text-caption text-neutral shrink-0">
                          +{l.categories.length - 1}
                        </span>
                      )}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('email') && (
                <Td>
                  {l.email ? (
                    <a
                      href={`mailto:${l.email}`}
                      className="text-primary hover:underline inline-flex items-center gap-1.5 truncate max-w-[220px]"
                      title={
                        l.emails.length > 1
                          ? l.emails.join(', ')
                          : l.email
                      }
                    >
                      <Mail size={11} className="text-neutral shrink-0" />
                      <span className="truncate">{l.email}</span>
                      {l.emails.length > 1 && (
                        <span className="text-caption text-neutral shrink-0">
                          +{l.emails.length - 1}
                        </span>
                      )}
                    </a>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('phone') && (
                <Td>
                  {l.phone ? (
                    <a
                      href={`tel:${l.phone.replace(/[^+\d]/g, '')}`}
                      className="font-mono font-tabular inline-flex items-center gap-1.5 hover:text-primary"
                      title={
                        l.phones.length > 1
                          ? l.phones.join('\n')
                          : l.phone
                      }
                    >
                      <Phone size={11} className="text-neutral shrink-0" />
                      <span className="truncate">{l.phone}</span>
                      {l.phones.length > 1 && (
                        <span className="text-caption text-neutral shrink-0">
                          +{l.phones.length - 1}
                        </span>
                      )}
                    </a>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('score') && (
                <Td>
                  <div className="text-right font-mono font-tabular tabular-nums">
                    {l.score}
                  </div>
                </Td>
              )}
              {isVisible('tasks') && (
                <Td>
                  <TaskCountBadge count={taskCounts?.[l.id] ?? 0} />
                </Td>
              )}
              {isVisible('website') && (
                <Td>
                  {l.website ? (
                    <a
                      href={l.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1.5 truncate max-w-[200px]"
                      title={l.website}
                    >
                      <Globe size={11} className="shrink-0" />
                      <span className="truncate">{prettyHost(l.website)}</span>
                      <ExternalLink size={9} className="text-neutral shrink-0" />
                    </a>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('social') && (
                <Td>
                  <SocialIcons socials={l.socials} />
                </Td>
              )}
              {isVisible('address') && (
                <Td>
                  {l.address ? (
                    <span
                      className="inline-flex items-center gap-1 truncate max-w-[240px] text-ink-muted"
                      title={[
                        l.address,
                        [l.city, l.state, l.postalCode].filter(Boolean).join(', '),
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <MapPin size={11} className="text-neutral shrink-0" />
                      <span className="truncate">
                        {[l.city, l.state].filter(Boolean).join(', ') ||
                          l.address}
                      </span>
                    </span>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('source') && (
                <Td>
                  <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium uppercase tracking-wider border bg-background text-neutral border-border whitespace-nowrap">
                    {l.source}
                  </span>
                </Td>
              )}
              {isVisible('rating') && (
                <Td>
                  {l.rating !== null ? (
                    <span className="inline-flex items-center gap-1 font-mono font-tabular">
                      <Star size={11} className="text-warning fill-warning" />
                      {l.rating.toFixed(1)}
                      {l.reviewCount !== null && (
                        <span className="text-caption text-neutral">
                          ({l.reviewCount})
                        </span>
                      )}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('years') && (
                <Td>
                  {l.yearsInBusiness ? (
                    <Chip tone="primary" className="!h-5 !text-[11px]">
                      {l.yearsInBusiness}+
                    </Chip>
                  ) : l.yearEstablished ? (
                    <span className="font-mono font-tabular text-ink-muted">
                      Est {l.yearEstablished}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('owner') && (
                <Td>
                  {l.ownerName ? (
                    <span className="truncate inline-block max-w-[160px]" title={l.ownerName}>
                      {l.ownerName}
                    </span>
                  ) : l.ownerSearchUrl ? (
                    <a
                      href={l.ownerSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-caption"
                    >
                      <SearchIcon size={10} />
                      Find
                    </a>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('yp') && (
                <Td>
                  {l.sourceUrl ? (
                    <a
                      href={l.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-caption text-primary hover:underline inline-flex items-center gap-1"
                      title={l.sourceUrl}
                    >
                      Open
                      <ExternalLink size={9} />
                    </a>
                  ) : (
                    <Dash />
                  )}
                </Td>
              )}
              {isVisible('search') && (
                <Td>
                  <span
                    className="text-caption text-ink-muted truncate inline-block max-w-[180px]"
                    title={`${l.searchQuery} · ${l.searchLocation}`}
                  >
                    {l.searchQuery} · {l.searchLocation}
                  </span>
                </Td>
              )}
              {isVisible('actions') && (
                <Td>
                  <button
                    onClick={() => setFollowupLead(l)}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border text-caption text-ink-muted hover:border-primary hover:text-primary transition-colors"
                    title="Add follow-up task"
                  >
                    <Plus size={10} /> Follow-up
                  </button>
                </Td>
              )}
              {onDelete && (
                <Td>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${l.businessName}"?`)) onDelete(l.id);
                    }}
                    className="text-neutral hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete lead"
                    title="Delete lead"
                  >
                    <Trash2 size={13} />
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <TaskFormModal
        open={followupLead !== null}
        initial={
          followupLead
            ? {
                leadId: followupLead.id,
                kind: 'followup',
                context: defaultContextForStage(followupLead.stage),
                priority: 'medium',
              }
            : undefined
        }
        lockedLeadId={followupLead?.id}
        pending={createTask.isPending}
        error={createTask.error ? (createTask.error as Error).message : null}
        onClose={() => setFollowupLead(null)}
        onSubmit={(input) => createTask.mutate(input)}
      />
    </div>
  );
}

function SocialIcons({ socials }: { socials: string[] }) {
  if (socials.length === 0) return <Dash />;
  const grouped = groupSocials(socials);
  const max = 5;
  const shown = grouped.slice(0, max);
  const extra = grouped.length - max;
  return (
    <div className="flex items-center gap-1 max-w-[180px] truncate">
      {shown.map(({ key, urls }) => (
        <a
          key={key}
          href={urls[0]}
          target="_blank"
          rel="noreferrer"
          title={`${key}${urls.length > 1 ? ` ×${urls.length}` : ''}`}
          className="inline-flex items-center justify-center h-6 w-6 rounded text-neutral hover:bg-background hover:text-primary transition-colors"
        >
          <SocialIconForKey k={key} />
        </a>
      ))}
      {extra > 0 && (
        <span className="text-caption text-neutral font-mono font-tabular">
          +{extra}
        </span>
      )}
    </div>
  );
}

function SocialIconForKey({ k }: { k: string }) {
  // Lucide doesn't have brand icons across the board, so we use Linkedin
  // where possible and fall back to a generic Globe for the rest. The
  // platform name in the title attribute disambiguates.
  if (k === 'linkedin') return <Linkedin size={12} />;
  return <Globe size={12} />;
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={
        'px-3 py-2 font-medium whitespace-nowrap ' +
        (align === 'right' ? 'text-right' : '')
      }
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 align-middle whitespace-nowrap overflow-hidden">
      {children}
    </td>
  );
}

function Dash() {
  return <span className="text-neutral">—</span>;
}

function TaskCountBadge({ count }: { count: number }) {
  if (count === 0) return <Dash />;
  return (
    <span
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium font-mono font-tabular"
      title={`${count} open task${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  );
}

function prettyHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
