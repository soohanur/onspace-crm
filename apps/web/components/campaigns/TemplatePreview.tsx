'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  SAMPLE_PREVIEW_CONTEXT,
  previewRender,
} from '@/lib/campaigns';
import { Monitor, Smartphone } from 'lucide-react';

type ContentTab = 'text' | 'html';
type DeviceTab = 'desktop' | 'phone';

/**
 * Live, responsive template preview. Renders subject + body for a
 * sample lead, with two toggle pairs:
 *   - content: Text vs HTML
 *   - device : Desktop (~640px) vs Phone (~360px)
 *
 * Reused by both the template-edit modal (where the form drives the
 * content tab via `contentTabOverride`) and the campaigns-wizard step
 * 2 (where the user just inspects the picked template).
 */
export function TemplatePreview({
  subject,
  bodyText,
  bodyHtml,
  initialContentTab = 'text',
  contentTabOverride,
  onContentTabChange,
  ctx = SAMPLE_PREVIEW_CONTEXT,
  className,
}: {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  initialContentTab?: ContentTab;
  /** When set, the parent owns the content tab — the toggle drives this. */
  contentTabOverride?: ContentTab;
  onContentTabChange?: (next: ContentTab) => void;
  ctx?: typeof SAMPLE_PREVIEW_CONTEXT;
  className?: string;
}) {
  const [internalContent, setInternalContent] = useState<ContentTab>(initialContentTab);
  const contentTab = contentTabOverride ?? internalContent;
  const setContentTab = (next: ContentTab) => {
    if (onContentTabChange) onContentTabChange(next);
    else setInternalContent(next);
  };

  const hasHtml = (bodyHtml ?? '').trim().length > 0;
  // Auto-flip to HTML when a template that has HTML loads, but only if
  // the parent isn't controlling the tab.
  useEffect(() => {
    if (contentTabOverride !== undefined) return;
    if (hasHtml) setInternalContent('html');
    else setInternalContent('text');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHtml]);

  const [deviceTab, setDeviceTab] = useState<DeviceTab>('desktop');

  const previewSubject = useMemo(() => previewRender(subject, ctx), [subject, ctx]);
  const previewBodyText = useMemo(() => previewRender(bodyText, ctx), [bodyText, ctx]);
  const previewBodyHtml = useMemo(() => previewRender(bodyHtml ?? '', ctx), [bodyHtml, ctx]);

  return (
    <div className={clsx('flex flex-col gap-3 min-h-0', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex border border-border rounded-md overflow-hidden text-caption">
          <Toggle active={contentTab === 'text'} onClick={() => setContentTab('text')}>
            Text
          </Toggle>
          <Toggle active={contentTab === 'html'} onClick={() => setContentTab('html')}>
            HTML
          </Toggle>
        </div>
        <div className="inline-flex border border-border rounded-md overflow-hidden text-caption ml-auto">
          <Toggle
            active={deviceTab === 'desktop'}
            onClick={() => setDeviceTab('desktop')}
            title="Desktop preview"
          >
            <Monitor size={12} />
          </Toggle>
          <Toggle
            active={deviceTab === 'phone'}
            onClick={() => setDeviceTab('phone')}
            title="Phone preview"
          >
            <Smartphone size={12} />
          </Toggle>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto py-3">
        <div
          className={clsx(
            'rounded-lg shadow-e2 bg-surface border border-border transition-all',
            deviceTab === 'desktop'
              ? 'w-full max-w-[640px]'
              : 'w-[360px] rounded-[24px] border-2',
          )}
        >
          <div className="border-b border-border px-4 py-3">
            <div className="text-caption text-neutral">Subject</div>
            <div className="font-medium text-ink truncate">
              {previewSubject || '(empty)'}
            </div>
            <div className="text-caption text-neutral mt-1">
              From <span className="text-ink-muted">Onspace CRM</span> · to{' '}
              <span className="font-mono text-ink-muted">{ctx.toEmail}</span>
            </div>
          </div>
          <div className={clsx('p-4', deviceTab === 'phone' && 'text-bodysm')}>
            {contentTab === 'html' ? (
              hasHtml ? (
                <div
                  className="prose prose-sm max-w-none text-ink"
                  // Internal-tool authoring; HTML is the user's own template body.
                  dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
                />
              ) : (
                <div className="text-ink-muted text-bodysm italic">
                  No HTML body on this template — recipients will see the
                  text body rendered as plain HTML.
                </div>
              )
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-ink leading-relaxed">
                {previewBodyText || '(empty)'}
              </pre>
            )}
          </div>
        </div>
      </div>

      <div className="text-caption text-ink-muted text-center">
        {deviceTab === 'desktop'
          ? 'Approx. desktop reading width (~640 px)'
          : 'Approx. phone width (~360 px)'}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 h-7 transition-colors',
        active
          ? 'bg-primary text-white'
          : 'bg-surface text-ink-muted hover:bg-background',
      )}
    >
      {children}
    </button>
  );
}
