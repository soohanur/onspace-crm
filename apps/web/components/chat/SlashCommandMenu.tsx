'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  filterSlashCommands,
  SLASH_COMMANDS,
  SlashCommand,
} from '@/lib/slash-commands';

/**
 * Floating menu attached to the reply composer. Shown when the input is
 * `/` (empty filter) or `/<word>` (typed filter). Up/Down to navigate,
 * Enter to select, Esc to close — keyboard handling lives in the
 * composer so we can intercept BEFORE the textarea sees the key.
 */
export function SlashCommandMenu({
  query,
  selectedIndex,
  onSelectedIndexChange,
  onPick,
}: {
  query: string;
  selectedIndex: number;
  onSelectedIndexChange: (idx: number) => void;
  onPick: (cmd: SlashCommand) => void;
}) {
  const matches = filterSlashCommands(query);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted item in view if the list ever exceeds the
  // visible area (it shouldn't with 2 commands, but the registry will
  // grow in Phase 12).
  useEffect(() => {
    if (!wrapRef.current) return;
    const node = wrapRef.current.querySelector<HTMLElement>(
      `[data-slash-index="${selectedIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, matches.length]);

  if (matches.length === 0) {
    return (
      <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface border border-border rounded-md shadow-e2 px-4 py-3 text-caption text-ink-muted z-30">
        No commands match <span className="font-mono">/{query}</span>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="absolute bottom-full left-3 right-3 mb-2 bg-surface border border-border rounded-md shadow-e2 max-h-[260px] overflow-auto z-30"
      role="listbox"
      aria-label="Slash commands"
    >
      {matches.map((cmd, idx) => {
        const Icon = cmd.icon;
        const active = idx === selectedIndex;
        return (
          <button
            type="button"
            key={cmd.id}
            data-slash-index={idx}
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              // mousedown so the click fires BEFORE the textarea blurs
              e.preventDefault();
              onPick(cmd);
            }}
            onMouseEnter={() => onSelectedIndexChange(idx)}
            className={clsx(
              'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
              active ? 'bg-primary/10' : 'hover:bg-background',
            )}
          >
            <Icon
              size={14}
              className={active ? 'text-primary mt-0.5' : 'text-neutral mt-0.5'}
            />
            <div className="flex-1 min-w-0">
              <div className="text-bodysm font-medium text-ink truncate">
                {cmd.label}
              </div>
              <div className="text-caption text-ink-muted truncate">
                {cmd.description}
              </div>
            </div>
            {cmd.shortcut && (
              <span className="text-caption text-neutral font-mono shrink-0 mt-0.5">
                /{cmd.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function getSlashMatchesCount(query: string): number {
  return filterSlashCommands(query).length;
}

export const SLASH_REGISTRY = SLASH_COMMANDS;
