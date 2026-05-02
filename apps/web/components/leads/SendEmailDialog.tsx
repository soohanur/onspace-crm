'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Lead } from '@/lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Mail, Send, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export function SendEmailDialog({
  lead,
  open,
  onClose,
}: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [recipient, setRecipient] = useState<string>('');
  const [customRecipient, setCustomRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
    enabled: open,
  });

  // The list of recipient choices — known emails + a "Custom…" sentinel.
  const knownEmails = lead.emails.length > 0 ? lead.emails : (lead.email ? [lead.email] : []);
  const recipientChoice = recipient === '__custom' ? '__custom' : recipient;

  // Default first known email when dialog opens
  useEffect(() => {
    if (open) {
      setRecipient(knownEmails[0] ?? '__custom');
      setCustomRecipient('');
      setSubject('');
      setBody('');
      setAccountId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = useMutation({
    mutationFn: () => {
      const toEmail =
        recipientChoice === '__custom' ? customRecipient.trim() : recipientChoice;
      return api.sendEmail({
        leadId: lead.id,
        accountId,
        toEmail,
        subject: subject.trim(),
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
      onClose();
    },
  });

  const toEmail =
    recipientChoice === '__custom' ? customRecipient.trim() : recipientChoice;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail);
  const canSend = validEmail && subject.trim() && body.trim() && !send.isPending && accounts.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-lg shadow-e3 w-full max-w-[640px] max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-primary" />
            <h3 className="text-h3">Send email · {lead.businessName}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-warning/40 bg-[#FEF4E5] p-3 text-bodysm flex items-start gap-2">
              <AlertCircle size={16} className="text-warning shrink-0 mt-0.5" />
              <div>
                You haven't connected a Gmail account yet.{' '}
                <Link href="/settings" className="text-primary hover:underline">
                  Connect one in Settings
                </Link>{' '}
                first.
              </div>
            </div>
          ) : (
            <>
              <Field label="From">
                <select
                  value={accountId ?? accounts[0]?.id}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="To">
                <select
                  value={recipientChoice}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  {knownEmails.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                  <option value="__custom">Custom email…</option>
                </select>
                {recipientChoice === '__custom' && (
                  <Input
                    type="email"
                    placeholder="someone@example.com"
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    className="mt-2"
                  />
                )}
              </Field>

              <Field label="Subject">
                <Input
                  placeholder="Quick question about your services"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>

              <Field label="Message">
                <textarea
                  rows={9}
                  placeholder="Hi there, I came across your business on YellowPages…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full text-bodysm rounded-md border border-border bg-surface p-3 placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-y"
                />
              </Field>

              {send.error && (
                <div className="text-error text-bodysm">
                  {(send.error as Error).message}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={!canSend}>
            <Send size={14} /> {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1.5">{label}</div>
      {children}
    </div>
  );
}
