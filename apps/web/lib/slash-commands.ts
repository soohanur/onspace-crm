import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Phase 11 — slash command palette inside the chat drawer reply
 * composer. Registry-based so adding `/template`, `/task`, `/note` later
 * is a one-file change. Each command registers a React component that's
 * rendered ALONGSIDE the composer (not inside it) when the user picks it
 * from the menu — typically a modal that opens above everything.
 */

export interface SlashCommandContext {
  leadId: string;
  /** AccountId currently selected in the chat composer (used as default). */
  accountId: string | null;
}

export interface SlashCommandResult {
  /** Optional text to insert into the composer when the command finishes. */
  insertText?: string;
  /** Optional toast to surface above the composer. */
  toast?: { tone: 'success' | 'info' | 'error'; message: string };
}

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Lowercased keywords used by the menu's fuzzy filter. */
  keywords: string[];
  /** Single-letter shortcut hint shown in the menu (e.g. `m`, `p`). */
  shortcut?: string;
  /**
   * The action surface. Rendered when the command is selected; receives
   * the conversation context plus `onClose` (user dismissed without
   * completing) and `onComplete` (action finished — pass a result to
   * drive the composer/toast).
   */
  Component: ComponentType<{
    ctx: SlashCommandContext;
    onClose: () => void;
    onComplete: (result?: SlashCommandResult) => void;
  }>;
}

import { MeetingCommand } from '../components/chat/commands/MeetingCommand';
import { ProposalCommand } from '../components/chat/commands/ProposalCommand';
import { Calendar, FileText } from 'lucide-react';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'meeting',
    label: 'Schedule meeting',
    description: 'Create a calendar event and send the invite',
    icon: Calendar,
    keywords: ['m', 'meet', 'meeting', 'gcal', 'schedule', 'calendar'],
    shortcut: 'm',
    Component: MeetingCommand,
  },
  {
    id: 'proposal',
    label: 'Send proposal',
    description: 'Email a PDF proposal and auto-stage the lead',
    icon: FileText,
    keywords: ['p', 'prop', 'proposal', 'pdf', 'send'],
    shortcut: 'p',
    Component: ProposalCommand,
  },
];

/**
 * Filter commands by the text typed AFTER the leading `/`. Empty query
 * returns the full list. Case-insensitive label substring match OR any
 * keyword that starts with the query — Slack-style.
 */
export function filterSlashCommands(
  query: string,
  commands: SlashCommand[] = SLASH_COMMANDS,
): SlashCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return commands;
  return commands.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.startsWith(q)),
  );
}
