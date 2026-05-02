import { Card } from './ui/Card';

export function EmptyPage({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <h1 className="text-h1 mb-2">{title}</h1>
      <p className="text-ink-muted text-bodysm mb-8">{hint}</p>
      <Card className="py-16">
        <div className="text-center text-ink-muted">
          <div className="text-h3 text-ink mb-2">Coming in a later phase</div>
          <div className="text-bodysm">
            Phase 1 ships the YellowPages scraper and Global Leads view only.
          </div>
        </div>
      </Card>
    </div>
  );
}
