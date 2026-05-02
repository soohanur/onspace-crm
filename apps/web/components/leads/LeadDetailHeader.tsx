'use client';

import { Lead } from '@/lib/api';
import { Chip } from '../ui/Chip';
import { CheckCircle2, ImageIcon, Star, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { LeadPipelineControls } from './LeadPipelineControls';

export function LeadDetailHeader({ lead }: { lead: Lead }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6 shadow-e1">
      <Link
        href="/leads"
        className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft size={12} /> All leads
      </Link>
      <div className="flex items-start gap-4">
        {lead.logoUrl ? (
          <img
            src={lead.logoUrl}
            alt=""
            className="w-16 h-16 rounded-lg object-cover bg-background border border-border shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
            <ImageIcon size={20} className="text-neutral" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-h2 truncate">{lead.businessName}</h1>
            {lead.claimed && (
              <Chip tone="primary" className="!h-6 !text-[12px]">
                <CheckCircle2 size={11} className="mr-1" />
                Claimed
              </Chip>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-2 text-bodysm text-ink-muted">
            {lead.category && <span>{lead.category}</span>}
            {lead.city && lead.state && (
              <>
                <span>·</span>
                <span>
                  {lead.city}, {lead.state}
                </span>
              </>
            )}
            {lead.rating !== null && (
              <>
                <span>·</span>
                <span className="font-mono font-tabular inline-flex items-center gap-1">
                  <Star size={12} className="text-warning fill-warning" />
                  {lead.rating.toFixed(1)}
                  {lead.reviewCount !== null && (
                    <span className="text-neutral">({lead.reviewCount})</span>
                  )}
                </span>
              </>
            )}
            {lead.yearsInBusiness && (
              <>
                <span>·</span>
                <span>{lead.yearsInBusiness}+ yrs in business</span>
              </>
            )}
          </div>
        </div>
      </div>
      <LeadPipelineControls lead={lead} />
    </div>
  );
}
