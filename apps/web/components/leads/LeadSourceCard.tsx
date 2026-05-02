'use client';

import { Lead } from '@/lib/api';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { FileText, ExternalLink } from 'lucide-react';

export function LeadSourceCard({ lead }: { lead: Lead }) {
  return (
    <Card>
      <SectionHeader icon={<FileText size={14} />} title="Source" />
      <dl className="text-bodysm space-y-2">
        <Row label="Source">{lead.source}</Row>
        <Row label="External ID">
          <span className="font-mono">{lead.externalId ?? '—'}</span>
        </Row>
        <Row label="Search query">
          {lead.searchQuery} · {lead.searchLocation}
        </Row>
        <Row label="Scraped">
          <span className="font-mono font-tabular">
            {new Date(lead.createdAt).toLocaleString()}
          </span>
        </Row>
        <Row label="YP Listing">
          {lead.sourceUrl ? (
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Open on YellowPages
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-neutral">—</span>
          )}
        </Row>
      </dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-caption uppercase tracking-wider text-neutral">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
