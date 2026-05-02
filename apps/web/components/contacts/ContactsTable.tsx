'use client';

import Link from 'next/link';
import clsx from 'clsx';
import {
  Confidence,
  ContactSource,
  ContactStatus,
  ContactType,
  ContactWithLead,
} from '@/lib/api';
import { ContactColumnKey } from '@/hooks/useContactColumnPrefs';
import { Chip } from '../ui/Chip';
import { StageBadge } from '../leads/StageBadge';
import {
  ExternalLink,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Star,
} from 'lucide-react';

const TYPE_LABEL: Record<ContactType, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  general: 'General',
};
const STATUS_CLASS: Record<ContactStatus, string> = {
  unverified: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  verified: 'bg-green-100 text-green-700 border-green-200',
  invalid: 'bg-red-100 text-red-700 border-red-200',
};
const STATUS_LABEL: Record<ContactStatus, string> = {
  unverified: 'Unverified',
  verified: 'Verified',
  invalid: 'Invalid',
};
const CONFIDENCE_CLASS: Record<Confidence, string> = {
  low: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-green-100 text-green-700 border-green-200',
};
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const SOURCE_LABEL: Record<ContactSource, string> = {
  manual: 'Manual',
  website: 'Website',
  directory: 'Directory',
  enrichment: 'Enrichment',
};

export function ContactsTable({
  contacts,
  visibleColumns,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: {
  contacts: ContactWithLead[];
  visibleColumns?: Set<ContactColumnKey>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
}) {
  const isVisible = (k: ContactColumnKey) =>
    !visibleColumns || visibleColumns.has(k);

  if (contacts.length === 0) {
    return (
      <div className="py-20 text-center text-ink-muted text-bodysm">
        No contacts match the current filters. Adjust filters or scrape
        more leads.
      </div>
    );
  }

  return (
    <div className="overflow-auto scroll-thin max-h-[72vh]">
      <table className="min-w-[1400px] w-full text-bodysm">
        <thead className="bg-background sticky top-0 z-10">
          <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
            {selectedIds !== undefined && (
              <Th>
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={
                    !!selectedIds &&
                    contacts.length > 0 &&
                    contacts.every((c) => selectedIds.has(c.id))
                  }
                  onChange={() => onToggleAll?.()}
                />
              </Th>
            )}
            {isVisible('name') && <Th>Name</Th>}
            {isVisible('type') && <Th>Type</Th>}
            {isVisible('email') && <Th>Email</Th>}
            {isVisible('phone') && <Th>Phone</Th>}
            {isVisible('linkedin') && <Th>LinkedIn</Th>}
            {isVisible('status') && <Th>Status</Th>}
            {isVisible('confidence') && <Th>Confidence</Th>}
            {isVisible('business') && <Th>Business</Th>}
            {isVisible('location') && <Th>Location</Th>}
            {isVisible('category') && <Th>Category</Th>}
            {isVisible('source') && <Th>Source</Th>}
            {isVisible('updated') && <Th>Updated</Th>}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              isVisible={isVisible}
              selected={selectedIds?.has(c.id) ?? false}
              showCheckbox={selectedIds !== undefined}
              onToggle={() => onToggleSelect?.(c.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactRow({
  contact,
  isVisible,
  selected,
  showCheckbox,
  onToggle,
}: {
  contact: ContactWithLead;
  isVisible: (k: ContactColumnKey) => boolean;
  selected: boolean;
  showCheckbox: boolean;
  onToggle: () => void;
}) {
  // Click on the row navigates to the parent lead — but anchors / inputs
  // inside cells stop propagation so they keep their native behavior.
  return (
    <tr
      className={clsx(
        'border-t border-border hover:bg-background/50 cursor-pointer',
        selected && 'bg-primary/5',
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, label')) return;
        window.location.href = `/leads/${contact.lead.id}`;
      }}
    >
      {showCheckbox && (
        <Td>
          <input
            type="checkbox"
            className="accent-primary"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </Td>
      )}

      {isVisible('name') && (
        <Td>
          <div className="flex items-center gap-1.5">
            {contact.isPrimary && (
              <Star size={11} className="text-warning fill-warning shrink-0" />
            )}
            <span className="font-medium text-ink truncate">
              {contact.name}
            </span>
          </div>
        </Td>
      )}

      {isVisible('type') && (
        <Td>
          <Chip tone="neutral" className="!h-5 !text-[11px]">
            {TYPE_LABEL[contact.contactType]}
          </Chip>
        </Td>
      )}

      {isVisible('email') && (
        <Td>
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 text-primary hover:underline truncate max-w-[260px]"
              title={contact.email}
              onClick={(e) => e.stopPropagation()}
            >
              <Mail size={11} className="text-neutral shrink-0" />
              <span className="truncate">{contact.email}</span>
            </a>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Td>
      )}

      {isVisible('phone') && (
        <Td>
          {contact.phone ? (
            <a
              href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
              className="inline-flex items-center gap-1 font-mono text-ink hover:text-primary"
              title={contact.phone}
              onClick={(e) => e.stopPropagation()}
            >
              <Phone size={11} className="text-neutral shrink-0" />
              {contact.phone}
            </a>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Td>
      )}

      {isVisible('linkedin') && (
        <Td>
          {contact.linkedin ? (
            <a
              href={ensureProtocol(contact.linkedin)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={contact.linkedin}
            >
              <Linkedin size={11} />
              <span>Profile</span>
              <ExternalLink size={9} className="text-neutral" />
            </a>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Td>
      )}

      {isVisible('status') && (
        <Td>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
              STATUS_CLASS[contact.status],
            )}
          >
            {STATUS_LABEL[contact.status]}
          </span>
        </Td>
      )}

      {isVisible('confidence') && (
        <Td>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
              CONFIDENCE_CLASS[contact.confidence],
            )}
          >
            {CONFIDENCE_LABEL[contact.confidence]}
          </span>
        </Td>
      )}

      {isVisible('business') && (
        <Td>
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              href={`/leads/${contact.lead.id}`}
              className="text-primary hover:underline truncate max-w-[220px]"
              onClick={(e) => e.stopPropagation()}
              title={contact.lead.businessName}
            >
              {contact.lead.businessName}
            </Link>
            <StageBadge stage={contact.lead.stage} />
          </div>
        </Td>
      )}

      {isVisible('location') && (
        <Td>
          {contact.lead.city || contact.lead.state ? (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <MapPin size={11} className="text-neutral" />
              <span className="truncate max-w-[180px]">
                {[contact.lead.city, contact.lead.state]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </span>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Td>
      )}

      {isVisible('category') && (
        <Td>
          {contact.lead.category ? (
            <Chip tone="neutral" className="!h-5 !text-[11px]">
              {contact.lead.category}
            </Chip>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Td>
      )}

      {isVisible('source') && (
        <Td>
          <span className="text-caption text-ink-muted">
            {SOURCE_LABEL[contact.source]}
          </span>
        </Td>
      )}

      {isVisible('updated') && (
        <Td>
          <span className="text-caption text-ink-muted whitespace-nowrap">
            {relativeTime(new Date(contact.updatedAt))}
          </span>
        </Td>
      )}
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 align-middle whitespace-nowrap">{children}</td>
  );
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function relativeTime(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
