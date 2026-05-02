'use client';

import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { Activity } from 'lucide-react';

/** Phase 3 will populate this from the activities table. */
export function LeadActivityPanel() {
  return (
    <Card>
      <SectionHeader icon={<Activity size={14} />} title="Activity Timeline" />
      <div className="py-12 text-center text-ink-muted text-bodysm">
        <div className="text-h3 text-ink mb-1">No activity yet</div>
        Calls, emails, and meetings will appear here once the activity log is built (Phase 3).
      </div>
    </Card>
  );
}
