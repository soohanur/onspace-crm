import { Card } from '@/components/ui/Card';

export default function DashboardPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <h1 className="text-h1 mb-2">Dashboard</h1>
      <p className="text-ink-muted text-bodysm mb-8">
        Lead scraping MVP. Open <span className="text-primary">Lead Scraper</span> to start a scrape.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">Total Leads</div>
          <div className="text-display font-mono">—</div>
        </Card>
        <Card>
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">Active Scrapes</div>
          <div className="text-display font-mono">—</div>
        </Card>
        <Card>
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">Emails Found</div>
          <div className="text-display font-mono">—</div>
        </Card>
      </div>
    </div>
  );
}
