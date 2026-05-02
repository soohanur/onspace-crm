'use client';

import { Lead } from '@/lib/api';
import { groupSocials } from '@/lib/social';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { Globe, ExternalLink, Share2 } from 'lucide-react';

export function LeadSocialCard({ lead }: { lead: Lead }) {
  const groups = groupSocials(lead.socials);
  return (
    <Card>
      <SectionHeader icon={<Share2 size={14} />} title="Website + Social" />

      <div className="space-y-3 mb-5">
        {lead.website ? (
          <a
            href={lead.website}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-2"
          >
            <Globe size={14} />
            {prettyHost(lead.website)}
            <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-ink-muted text-bodysm">No website on record</span>
        )}
        {lead.otherLinks.map((u) => (
          <a
            key={u}
            href={u}
            target="_blank"
            rel="noreferrer"
            className="block text-bodysm text-ink-muted hover:text-primary truncate"
          >
            {prettyHost(u)}
          </a>
        ))}
      </div>

      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map(({ key, urls }) => (
            <div key={key}>
              <div className="text-caption uppercase tracking-wider text-neutral capitalize mb-1">
                {key} {urls.length > 1 && <span className="text-ink-muted">({urls.length})</span>}
              </div>
              <div className="space-y-1">
                {urls.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-bodysm text-primary hover:underline truncate"
                  >
                    {u}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-bodysm text-ink-muted">No social profiles found.</div>
      )}
    </Card>
  );
}

function prettyHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
