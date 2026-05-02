/**
 * Single source of truth for the campaign merge-tag system. Both the
 * tick processor (when sending) and the templates UI (when previewing)
 * use these helpers.
 */

export interface MergeContext {
  /** Resolved recipient email — required, used for `{{toEmail}}`. */
  toEmail: string;
  /** Lead row fields used by tags. */
  lead: {
    businessName: string | null;
    ownerName: string | null;
    city: string | null;
    state: string | null;
  };
  /** Optional primary contact. If provided its name beats lead.ownerName. */
  contact: {
    name: string | null;
  } | null;
}

/**
 * Tags whose absence on a recipient should cause that recipient to be
 * SKIPPED rather than sent with a placeholder. Currently the only one is
 * `{{ownerFirstName}}` — the rest fall back to safe defaults.
 */
const REQUIRED_TAGS = new Set(['ownerFirstName']);

/** Tag → resolver. Returns `null` to mean "value missing — caller decides". */
const TAGS: Record<
  string,
  (ctx: MergeContext) => string | null
> = {
  businessName: (ctx) => ctx.lead.businessName,
  firstName: (ctx) => {
    const fromContact = firstWord(ctx.contact?.name ?? null);
    if (fromContact) return fromContact;
    const fromOwner = firstWord(ctx.lead.ownerName);
    if (fromOwner) return fromOwner;
    return 'there';
  },
  ownerFirstName: (ctx) => {
    const fromContact = firstWord(ctx.contact?.name ?? null);
    if (fromContact) return fromContact;
    return firstWord(ctx.lead.ownerName);
  },
  city: (ctx) => ctx.lead.city ?? '',
  state: (ctx) => ctx.lead.state ?? '',
  toEmail: (ctx) => ctx.toEmail,
};

/**
 * Render `{{tagName}}` placeholders in `input`.
 *  - Known tags resolved via `TAGS`. If a REQUIRED tag returns null, the
 *    tag is left in the output unchanged AND added to `missingRequired`.
 *  - Unknown tags are left as-is (no escape hatch needed yet).
 */
export function renderTags(
  input: string,
  ctx: MergeContext,
): { output: string; missingRequired: string[] } {
  const missing: string[] = [];
  const output = input.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (match, name) => {
    const resolver = TAGS[name];
    if (!resolver) return match;
    const value = resolver(ctx);
    if (value === null) {
      if (REQUIRED_TAGS.has(name)) missing.push(name);
      return match;
    }
    return value;
  });
  return { output, missingRequired: Array.from(new Set(missing)) };
}

/**
 * Walk a template string and return the set of REQUIRED tags it uses.
 * The campaign-start endpoint pre-scans with this so it can warn about
 * recipients who'd skip BEFORE the worker picks them up.
 */
export function extractRequiredTags(template: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (REQUIRED_TAGS.has(m[1])) out.add(m[1]);
  }
  return Array.from(out);
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().split(/\s+/)[0];
  return m && m.length > 0 ? m : null;
}
