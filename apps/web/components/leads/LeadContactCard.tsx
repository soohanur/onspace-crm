'use client';

import { Lead } from '@/lib/api';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { Mail, Phone, Linkedin, Search as SearchIcon, UserCircle2 } from 'lucide-react';

/**
 * Phase 3 will replace this with a real `contacts` table (multiple per lead).
 * For now we surface what we already harvested into `lead.owner_*` and the
 * collected emails/phones lists, plus the pre-built LinkedIn search URL.
 */
export function LeadContactCard({ lead }: { lead: Lead }) {
  return (
    <Card>
      <SectionHeader icon={<UserCircle2 size={14} />} title="Contact / Owner" />

      {lead.ownerName || lead.ownerEmail || lead.ownerLinkedin ? (
        <div className="space-y-2 text-bodysm mb-4">
          {lead.ownerName && <div className="font-medium">{lead.ownerName}</div>}
          {lead.ownerEmail && (
            <a href={`mailto:${lead.ownerEmail}`} className="text-primary hover:underline inline-flex items-center gap-1.5">
              <Mail size={12} /> {lead.ownerEmail}
            </a>
          )}
          {lead.ownerPhone && (
            <div className="font-mono font-tabular inline-flex items-center gap-1.5">
              <Phone size={12} className="text-neutral" /> {lead.ownerPhone}
            </div>
          )}
          {lead.ownerLinkedin && (
            <a href={lead.ownerLinkedin} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1.5">
              <Linkedin size={12} /> LinkedIn profile
            </a>
          )}
        </div>
      ) : (
        <div className="text-bodysm text-ink-muted mb-4">
          Owner not yet enriched. Phase 2 only stores the search query — Phase 3
          will run state-registry + Hunter.io lookups automatically.
        </div>
      )}

      {lead.ownerSearchUrl && (
        <a
          href={lead.ownerSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="text-bodysm text-primary hover:underline inline-flex items-center gap-1.5"
        >
          <SearchIcon size={12} /> Find owner on LinkedIn (Google search)
        </a>
      )}

      {(lead.emails.length > 1 || lead.phones.length > 1) && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">
            All collected contacts
          </div>
          <div className="space-y-1 text-bodysm">
            {lead.emails.map((em) => (
              <a
                key={em}
                href={`mailto:${em}`}
                className="block text-primary hover:underline truncate"
              >
                <Mail size={11} className="inline mr-1.5" />
                {em}
              </a>
            ))}
            {lead.phones.map((p) => (
              <div key={p} className="font-mono font-tabular">
                <Phone size={11} className="inline mr-1.5 text-neutral" />
                {p}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
