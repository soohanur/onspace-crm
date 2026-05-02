import type {
  Confidence,
  ContactSource,
  ContactStatus,
  ContactType,
  GlobalContactsFilter,
  LeadStage,
} from './api';

const CONTACT_TYPES = new Set<ContactType>([
  'owner',
  'manager',
  'staff',
  'general',
]);
const CONTACT_STATUSES = new Set<ContactStatus>([
  'unverified',
  'verified',
  'invalid',
]);
const CONFIDENCES = new Set<Confidence>(['low', 'medium', 'high']);
const CONTACT_SOURCES = new Set<ContactSource>([
  'manual',
  'website',
  'directory',
  'enrichment',
]);
const LEAD_STAGES_SET = new Set<LeadStage>([
  'new',
  'approached',
  'no_response',
  'engaged',
  'push',
  'qualified',
  'interested',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
]);

/** Convert filter object → URL search params (omit undefined / empty). */
export function contactFilterToSearchParams(
  f: GlobalContactsFilter,
): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      qs.set(k, v.join(','));
      continue;
    }
    qs.set(k, String(v));
  }
  return qs;
}

/** Convert URL search params → filter object. */
export function searchParamsToContactFilter(
  sp: URLSearchParams,
): GlobalContactsFilter {
  const f: GlobalContactsFilter = {};
  const get = (k: string) => sp.get(k) ?? undefined;
  const tri = (k: string): 'true' | 'false' | undefined => {
    const v = sp.get(k);
    return v === 'true' || v === 'false' ? v : undefined;
  };
  const list = <T extends string>(k: string, allowed: Set<T>): T[] | undefined => {
    const v = sp.get(k);
    if (!v) return undefined;
    const parts = v
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is T => allowed.has(s as T));
    return parts.length ? parts : undefined;
  };

  f.q = get('q');
  f.contactType = list('contactType', CONTACT_TYPES);
  f.status = list('status', CONTACT_STATUSES);
  f.confidence = list('confidence', CONFIDENCES);
  f.source = list('source', CONTACT_SOURCES);
  f.isPrimary = tri('isPrimary');
  f.hasEmail = tri('hasEmail');
  f.hasPhone = tri('hasPhone');
  f.hasLinkedin = tri('hasLinkedin');
  f.leadCategory = get('leadCategory');
  f.leadCity = get('leadCity');
  f.leadState = get('leadState');
  f.leadStage = list('leadStage', LEAD_STAGES_SET);

  return f;
}

/** True if any filter is set (for "Clear all" affordance + count). */
export function activeContactFilterCount(f: GlobalContactsFilter): number {
  return Object.entries(f).filter(([_k, v]) => {
    if (v === undefined || v === '' || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}
