'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Lead } from '@/lib/api';
import { groupSocials } from '@/lib/social';
import { ColumnKey } from '@/hooks/useColumnPrefs';
import { Chip } from './ui/Chip';
import { StageBadge } from './leads/StageBadge';
import {
  ExternalLink,
  Globe,
  Mail,
  Phone,
  Linkedin,
  Star,
  MapPin,
  Search as SearchIcon,
  CheckCircle2,
  Image as ImageIcon,
  FileText,
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
  const newIds = useNewIds(leads);
  const isVisible = (k: ColumnKey) => !visibleColumns || visibleColumns.has(k);

  if (leads.length === 0) {
    return (
      <div className="py-20 text-center text-ink-muted text-bodysm">
        No leads yet — kick off a scrape from the Lead Scraper page.
      </div>
    );
  }

  return (
    <div className="overflow-auto scroll-thin max-h-[72vh]">
      <table className="min-w-[1500px] w-full text-bodysm">
        <thead className="bg-background sticky top-0 z-10">
          <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
            {selectable && (
              <Th>
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={!!selectedIds && leads.length > 0 && leads.every((l) => selectedIds.has(l.id))}
                  onChange={() => onToggleAll?.()}
                  aria-label="Select all"
                />
              </Th>
            )}
            {isVisible('business') && <Th>Business</Th>}
            {isVisible('stage') && <Th>Stage</Th>}
            {isVisible('score') && <Th className="text-right">Score</Th>}
            {isVisible('categories') && <Th>Categories</Th>}
            {isVisible('phone') && <Th>Phone</Th>}
            {isVisible('email') && <Th>Email</Th>}
            {isVisible('website') && <Th>Website</Th>}
            {isVisible('address') && <Th>Address</Th>}
            {isVisible('rating') && <Th>Rating</Th>}
            {isVisible('years') && <Th>Years</Th>}
            {isVisible('social') && <Th>Social</Th>}
            {isVisible('owner') && <Th>Owner</Th>}
            {isVisible('yp') && <Th>YP Listing</Th>}
            {isVisible('search') && <Th>Search</Th>}
            {onDelete && <Th>{''}</Th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              className={
                'group border-t border-border hover:bg-background transition-colors ' +
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
              {isVisible('business') && <Td>
                <div className="flex items-start gap-2">
                  {l.logoUrl ? (
                    <img
                      src={l.logoUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover bg-background border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center shrink-0">
                      <ImageIcon size={14} className="text-neutral" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium text-ink hover:text-primary truncate max-w-[260px] flex items-center gap-1"
                    >
                      {l.businessName}
                      {l.claimed && (
                        <CheckCircle2
                          size={12}
                          className="text-primary shrink-0"
                          aria-label="Claimed"
                        />
                      )}
                    </Link>
                    {l.description && (
                      <div className="text-caption text-neutral truncate max-w-[280px]">
                        {l.description}
                      </div>
                    )}
                  </div>
                </div>
              </Td>}
              {isVisible('stage') && <Td>
                <StageBadge stage={l.stage} />
              </Td>}
              {isVisible('score') && <Td>
                <div className="text-right font-mono font-tabular tabular-nums">
                  {l.score}
                </div>
              </Td>}
              {isVisible('categories') && <Td>
                {l.category ? (
                  <div className="space-y-1 max-w-[220px]">
                    <Chip tone="neutral">{l.category}</Chip>
                    {l.categories.length > 1 && (
                      <div className="text-caption text-neutral">
                        +{l.categories.length - 1} more
                      </div>
                    )}
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('phone') && <Td>
                {l.phone ? (
                  <div>
                    <span className="font-mono font-tabular flex items-center gap-1.5">
                      <Phone size={12} className="text-neutral" />
                      {l.phone}
                    </span>
                    {l.phones.length > 1 && (
                      <div className="text-caption text-neutral mt-0.5">
                        +{l.phones.length - 1} alt
                      </div>
                    )}
                    {l.fax && (
                      <div className="text-caption text-neutral mt-0.5 font-mono">
                        Fax: {l.fax}
                      </div>
                    )}
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('email') && <Td>
                {l.emails.length > 0 ? (
                  <div className="space-y-0.5">
                    {l.emails.slice(0, 3).map((em) => (
                      <a
                        key={em}
                        href={`mailto:${em}`}
                        className="text-primary hover:underline flex items-center gap-1.5 truncate max-w-[240px]"
                      >
                        <Mail size={12} />
                        {em}
                      </a>
                    ))}
                    {l.emails.length > 3 && (
                      <div className="text-caption text-neutral">
                        +{l.emails.length - 3} more
                      </div>
                    )}
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('website') && <Td>
                {l.website ? (
                  <div className="space-y-0.5">
                    <a
                      href={l.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1.5 truncate max-w-[220px]"
                    >
                      <Globe size={12} />
                      {prettyHost(l.website)}
                      <ExternalLink size={10} />
                    </a>
                    {l.otherLinks.slice(0, 2).map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-caption text-ink-muted hover:text-primary truncate max-w-[220px]"
                      >
                        {prettyHost(u)}
                      </a>
                    ))}
                  </div>
                ) : (
                  <Chip tone="neutral">No website</Chip>
                )}
              </Td>}
              {isVisible('address') && <Td>
                {l.address ? (
                  <div className="text-bodysm">
                    <div className="flex items-start gap-1">
                      <MapPin size={12} className="mt-0.5 text-neutral shrink-0" />
                      <div className="truncate max-w-[220px]">{l.address}</div>
                    </div>
                    <div className="text-caption text-neutral pl-4">
                      {[l.city, l.state, l.postalCode].filter(Boolean).join(', ')}
                    </div>
                    {l.neighborhoods.length > 0 && (
                      <div className="text-caption text-neutral pl-4 mt-0.5">
                        {l.neighborhoods.slice(0, 2).join(' · ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('rating') && <Td>
                {l.rating !== null ? (
                  <div className="flex items-center gap-1 font-mono font-tabular">
                    <Star size={12} className="text-warning fill-warning" />
                    {l.rating.toFixed(1)}
                    {l.reviewCount !== null && (
                      <span className="text-caption text-neutral">
                        ({l.reviewCount})
                      </span>
                    )}
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('years') && <Td>
                <div className="space-y-0.5">
                  {l.yearEstablished && (
                    <div className="font-mono font-tabular">Est {l.yearEstablished}</div>
                  )}
                  {l.yearsInBusiness && (
                    <Chip tone="primary">{l.yearsInBusiness}+ yrs</Chip>
                  )}
                  {l.yearsWithYP && (
                    <div className="text-caption text-neutral">{l.yearsWithYP}y on YP</div>
                  )}
                  {!l.yearEstablished && !l.yearsInBusiness && !l.yearsWithYP && <Dash />}
                </div>
              </Td>}
              {isVisible('social') && <Td>
                <div className="flex gap-1.5 flex-wrap max-w-[200px]">
                  {groupSocials(l.socials).map(({ key, urls }) => (
                    <span key={key} className="inline-flex items-center gap-0.5">
                      <a
                        href={urls[0]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-caption text-primary hover:underline capitalize"
                      >
                        {key}
                      </a>
                      {urls.length > 1 && (
                        <span className="text-caption text-neutral">×{urls.length}</span>
                      )}
                    </span>
                  ))}
                  {l.socials.length === 0 && <Dash />}
                </div>
              </Td>}
              {isVisible('owner') && <Td>
                {l.ownerSearchUrl ? (
                  <a
                    href={l.ownerSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 text-caption"
                  >
                    <SearchIcon size={10} />
                    Find on LinkedIn
                  </a>
                ) : (
                  <Dash />
                )}
                {l.ownerName && <div>{l.ownerName}</div>}
                {l.ownerEmail && (
                  <div className="text-caption text-primary truncate max-w-[180px]">
                    {l.ownerEmail}
                  </div>
                )}
                {l.ownerLinkedin && (
                  <a
                    href={l.ownerLinkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="text-caption text-primary inline-flex items-center gap-1 mt-0.5"
                  >
                    <Linkedin size={10} />
                    Profile
                  </a>
                )}
              </Td>}
              {isVisible('yp') && <Td>
                {l.sourceUrl ? (
                  <a
                    href={l.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-caption text-primary hover:underline inline-flex items-center gap-1"
                    title={l.sourceUrl}
                  >
                    <FileText size={10} />
                    Open on YP
                    <ExternalLink size={9} />
                  </a>
                ) : (
                  <Dash />
                )}
              </Td>}
              {isVisible('search') && <Td>
                <div className="text-caption text-ink-muted">
                  {l.searchQuery}
                  <div className="text-neutral">{l.searchLocation}</div>
                  <div className="text-neutral mt-0.5">{relativeTime(l.createdAt)}</div>
                </div>
              </Td>}
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
                    <Trash2 size={14} />
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        'px-4 py-3.5 font-medium whitespace-nowrap ' + (className ?? '')
      }
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-4 align-top">{children}</td>;
}

function Dash() {
  return <span className="text-neutral">—</span>;
}

function prettyHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
