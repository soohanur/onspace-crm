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
