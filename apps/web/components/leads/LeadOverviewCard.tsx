'use client';

import { Lead } from '@/lib/api';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Phone, Mail, MapPin, Building2 } from 'lucide-react';

export function LeadOverviewCard({ lead }: { lead: Lead }) {
  return (
    <Card>
      <SectionHeader icon={<Building2 size={14} />} title="Business Overview" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-bodysm">
        <Field label="Phone" mono value={lead.phone} icon={<Phone size={12} />} />
        <Field
          label="Primary Email"
          mono
          value={lead.email}
          icon={<Mail size={12} />}
          href={lead.email ? `mailto:${lead.email}` : undefined}
        />
        <Field
          label="Address"
          icon={<MapPin size={12} />}
          value={
            lead.address
              ? `${lead.address}${lead.city ? ', ' + lead.city : ''}${lead.state ? ', ' + lead.state : ''}${lead.postalCode ? ' ' + lead.postalCode : ''}`
              : null
          }
        />
        <Field
          label="Coordinates"
          mono
          value={
            lead.latitude !== null && lead.longitude !== null
              ? `${lead.latitude.toFixed(5)}, ${lead.longitude.toFixed(5)}`
              : null
          }
        />
        <Field label="Year Established" mono value={lead.yearEstablished?.toString() ?? null} />
        <Field label="Years on YP" mono value={lead.yearsWithYP?.toString() ?? null} />
      </div>

      {lead.categories.length > 0 && (
        <div className="mt-4">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">All Categories</div>
          <div className="flex flex-wrap gap-1.5">
            {lead.categories.map((c) => (
              <Chip tone="neutral" key={c}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {lead.neighborhoods.length > 0 && (
        <div className="mt-4">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">Neighborhoods</div>
          <div className="flex flex-wrap gap-1.5">
            {lead.neighborhoods.map((n) => (
              <Chip tone="neutral" key={n}>
                {n}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {lead.description && (
        <div className="mt-4">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">Description</div>
          <p className="text-bodysm text-ink leading-relaxed whitespace-pre-line">
            {lead.description}
          </p>
        </div>
      )}

      {lead.businessHistory && (
        <div className="mt-4">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">
            Business History
          </div>
          <p className="text-bodysm text-ink leading-relaxed whitespace-pre-line">
            {lead.businessHistory}
          </p>
        </div>
      )}
    </Card>
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
    <div className="flex items-center justify-between mb-4">
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
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">{label}</div>
      <div className="flex items-center gap-1.5 text-ink">
        {icon && <span className="text-neutral">{icon}</span>}
        {href && value ? (
          <a href={href} className="text-primary hover:underline">
            {inner}
          </a>
        ) : (
          inner
        )}
      </div>
    </div>
  );
}
