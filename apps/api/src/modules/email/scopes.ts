/**
 * Read access required to fetch threads. `gmail.readonly` is the minimum;
 * `gmail.modify` and full `mail.google.com` also include read.
 *
 * Accounts connected before we added this scope will be missing it and
 * need to disconnect + reconnect from Settings.
 */
export function accountHasReadScope(scopes: string[]): boolean {
  return scopes.some((s) =>
    [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://mail.google.com/',
    ].includes(s),
  );
}

/** Phase 10 — Google Calendar Events (create/update/delete + invites). */
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export function accountHasCalendarScope(scopes: string[]): boolean {
  return scopes.includes(CALENDAR_EVENTS_SCOPE);
}
