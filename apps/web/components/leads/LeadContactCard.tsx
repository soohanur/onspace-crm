'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  Contact,
  CreateContactInput,
  Lead,
} from '@/lib/api';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { Chip } from '../ui/Chip';
import {
  Mail,
  Phone,
  Linkedin,
  Search as SearchIcon,
  UserCircle2,
  Plus,
  Star,
  MoreVertical,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import { ContactFormModal } from './ContactFormModal';

/**
 * Phase 5: real `contacts` table — multiple structured contacts per lead.
 * The legacy `lead.owner_*` columns and the harvested `emails`/`phones`
 * arrays are still surfaced below as "Other harvested data" so users have
 * raw signal to turn into proper contacts.
 */
export function LeadContactCard({ lead }: { lead: Lead }) {
  const qc = useQueryClient();

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['contacts', lead.id],
    queryFn: () => api.listContacts(lead.id),
    initialData: lead.contacts,
  });

  const [openModal, setOpenModal] = useState<null | { mode: 'create' } | { mode: 'edit'; contact: Contact }>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
  };

  const createMut = useMutation({
    mutationFn: (input: CreateContactInput) => api.createContact(lead.id, input),
    onSuccess: () => {
      setOpenModal(null);
      invalidate();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CreateContactInput }) =>
      api.updateContact(id, patch),
    onSuccess: () => {
      setOpenModal(null);
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteContact(id),
    onSuccess: invalidate,
  });

  const setPrimaryMut = useMutation({
    mutationFn: (id: string) => api.setPrimaryContact(id),
    onSuccess: invalidate,
  });

  return (
    <Card>
      <SectionHeader
        icon={<UserCircle2 size={14} />}
        title="Contacts"
        right={
          <button
            onClick={() => setOpenModal({ mode: 'create' })}
            className="text-caption text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={12} /> Add contact
          </button>
        }
      />

      {contacts.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No contacts yet. Add the owner, decision-maker, or anyone else you
          want to reach.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onEdit={() => setOpenModal({ mode: 'edit', contact: c })}
              onDelete={() => {
                if (confirm(`Delete contact "${c.name}"?`)) {
                  deleteMut.mutate(c.id);
                }
              }}
              onSetPrimary={() => setPrimaryMut.mutate(c.id)}
            />
          ))}
        </ul>
      )}

      {/* Legacy / harvested data — kept visible until a later phase removes
          owner_* columns and migrates `emails`/`phones` into proper Contact rows. */}
      {(lead.ownerSearchUrl || lead.emails.length > 0 || lead.phones.length > 0) && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">
            Other harvested data
          </div>
          {lead.ownerSearchUrl && (
            <a
              href={lead.ownerSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="text-bodysm text-primary hover:underline inline-flex items-center gap-1.5 mb-2"
            >
              <SearchIcon size={12} /> Find owner on LinkedIn (Google search)
            </a>
          )}
          {(lead.emails.length > 0 || lead.phones.length > 0) && (
            <div className="space-y-1 text-bodysm">
              {lead.emails.map((em) => (
                <a
                  key={em}
                  href={`mailto:${em}`}
                  className="block text-primary hover:underline truncate"
                  title={em}
                >
                  <Mail size={11} className="inline mr-1.5" />
                  {em}
                </a>
              ))}
              {lead.phones.map((p) => (
                <div key={p} className="font-mono font-tabular">
                  <Phone size={11} className="inline mr-1.5 text-neutral" />
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ContactFormModal
        open={openModal !== null}
        initial={openModal?.mode === 'edit' ? openModal.contact : undefined}
        pending={createMut.isPending || updateMut.isPending}
        error={
          createMut.error
            ? (createMut.error as Error).message
            : updateMut.error
            ? (updateMut.error as Error).message
            : null
        }
        onClose={() => setOpenModal(null)}
        onSubmit={(input) => {
          if (openModal?.mode === 'edit') {
            updateMut.mutate({ id: openModal.contact.id, patch: input });
          } else {
            createMut.mutate(input);
          }
        }}
      />
    </Card>
  );
}

function ContactRow({
  contact,
  onEdit,
  onDelete,
  onSetPrimary,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <li className="flex items-start gap-2 px-1 py-3 group">
      <div className="mt-1">
        {contact.isPrimary ? (
          <Star
            size={14}
            className="text-warning fill-warning"
            aria-label="Primary contact"
          />
        ) : (
          <Star size={14} className="text-neutral/40" aria-hidden />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-ink truncate">{contact.name}</div>
          <Chip tone="neutral" className="!h-5 !text-[11px] capitalize">
            {contact.contactType}
          </Chip>
          <StatusChip status={contact.status} />
        </div>
        <div className="mt-1 space-y-0.5 text-bodysm">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="text-primary hover:underline inline-flex items-center gap-1.5 truncate max-w-full"
              title={contact.email}
            >
              <Mail size={11} /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <div className="font-mono font-tabular inline-flex items-center gap-1.5">
              <Phone size={11} className="text-neutral" /> {contact.phone}
            </div>
          )}
          {contact.linkedin && (
            <a
              href={contact.linkedin}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1.5 truncate"
            >
              <Linkedin size={11} /> LinkedIn
            </a>
          )}
          {contact.socialProfile && (
            <a
              href={contact.socialProfile}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1.5 truncate"
            >
              <Globe size={11} /> Other profile
            </a>
          )}
          {contact.notes && (
            <div className="text-caption text-neutral whitespace-pre-wrap pt-0.5">
              {contact.notes}
            </div>
          )}
        </div>
      </div>
      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setMenuOpen((s) => !s)}
          className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Contact actions"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 z-20 bg-surface border border-border rounded-md shadow-e2 min-w-[160px] py-1">
            <MenuItem
              icon={<Pencil size={12} />}
              label="Edit"
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            />
            {!contact.isPrimary && (
              <MenuItem
                icon={<Star size={12} />}
                label="Set as primary"
                onClick={() => {
                  setMenuOpen(false);
                  onSetPrimary();
                }}
              />
            )}
            <MenuItem
              icon={<Trash2 size={12} />}
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-3 h-8 text-bodysm text-left hover:bg-background ' +
        (destructive ? 'text-error' : 'text-ink')
      }
    >
      <span className={destructive ? 'text-error' : 'text-neutral'}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function StatusChip({ status }: { status: Contact['status'] }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success">
        <CheckCircle2 size={11} /> verified
      </span>
    );
  }
  if (status === 'invalid') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-error">
        <AlertTriangle size={11} /> invalid
      </span>
    );
  }
  return (
    <span className="text-[11px] text-neutral">unverified</span>
  );
}
