'use client';

import { Lead } from '@/lib/api';
import { Card } from '../ui/Card';
import { Building2, Calendar, Mail, Phone } from 'lucide-react';

/**
 * Phase 19 — slimmed business-overview card. Just the four facts the
 * action bar doesn't already cover: phone (+ alts), primary email,
 * year established, years in business. Heavier prose (description,
 * business history, neighborhoods, ratings) was demoted — those live
 * elsewhere or aren't worth the visual weight on the lead detail page.
 */
export function LeadOverviewCard({ lead }: { lead: Lead }) {
  return (
    <Card>
      <SectionHeader icon={<Building2 size={14} />} title="Business overview" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-bodysm">
        <PhoneField lead={lead} />
        <Field
          label="Primary email"
          icon={<Mail size={12} />}
          value={lead.email}
          mono
          href={lead.email ? `mailto:${lead.email}` : undefined}
        />
        <Field
          label="Year established"
          icon={<Calendar size={12} />}
          value={lead.yearEstablished?.toString() ?? null}
          mono
        />
        <Field
          label="Years in business"
          icon={<Calendar size={12} />}
          value={lead.yearsInBusiness ? `${lead.yearsInBusiness}+` : null}
          mono
        />
      </div>
    </Card>
  );
}

function PhoneField({ lead }: { lead: Lead }) {
  if (!lead.phone) {
    return <Field label="Phone" icon={<Phone size={12} />} value={null} mono />;
  }
  const altCount = (lead.phones ?? []).filter((p) => p && p !== lead.phone).length;
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Phone
      </div>
      <div className="flex items-center gap-1.5 text-ink">
        <span className="text-neutral">
          <Phone size={12} />
        </span>
        <a
          href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}
          className="font-mono font-tabular hover:text-primary"
          title={lead.phone}
        >
          {lead.phone}
        </a>
        {altCount > 0 && (
          <span
            className="text-caption text-neutral"
            title={(lead.phones ?? []).join('\n')}
          >
            +{altCount}
          </span>
        )}
      </div>
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  right,
}: {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-caption uppercase tracking-wider text-neutral">
        {icon}
        {title}
      </div>
      {right}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  icon,
  href,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  icon?: React.ReactNode;
  href?: string;
}) {
  const inner = value ? (
    <span className={mono ? 'font-mono font-tabular' : ''}>{value}</span>
  ) : (
    <span className="text-neutral">—</span>
  );
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5 text-ink truncate">
        {icon && <span className="text-neutral">{icon}</span>}
        {href && value ? (
          <a href={href} className="text-primary hover:underline truncate">
            {inner}
          </a>
        ) : (
          inner
        )}
      </div>
    </div>
  );
}
