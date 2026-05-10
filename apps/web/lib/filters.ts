/** Shape of the Global Leads filter — mirrors backend LeadFilter. */
export type LeadOrderBy = 'recent' | 'name' | 'rating' | 'years';

import type { LeadStage, LeadValidity } from './api';

export interface LeadFilter {
  q?: string;
  category?: string;
  city?: string;
  state?: string;
  country?: string;
  hasWebsite?: 'true' | 'false';
  hasEmail?: 'true' | 'false';
  hasPhone?: 'true' | 'false';
  hasSocials?: 'true' | 'false';
  claimed?: 'true' | 'false';
  ratingMin?: number;
  ratingMax?: number;
  yearsMin?: number;
  yearsMax?: number;
  /** Multi-select: a comma-joined list of stage values in the URL. */
  stage?: LeadStage[];
  validity?: LeadValidity;
  scoreMin?: number;
  scoreMax?: number;
  stageChangedSince?: string;
  groupId?: string;
  orderBy?: LeadOrderBy;
}

/** Convert filter object → URL search params (omit undefined / empty). */
export function filterToSearchParams(f: LeadFilter): URLSearchParams {
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
export function searchParamsToFilter(sp: URLSearchParams): LeadFilter {
  const f: LeadFilter = {};
  const get = (k: string) => sp.get(k) ?? undefined;
  const num = (k: string) => {
    const v = sp.get(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const tri = (k: string): 'true' | 'false' | undefined => {
    const v = sp.get(k);
    return v === 'true' || v === 'false' ? v : undefined;
  };
  f.q = get('q');
  f.category = get('category');
  f.city = get('city');
  f.state = get('state');
  f.country = get('country');
  f.hasWebsite = tri('hasWebsite');
  f.hasEmail = tri('hasEmail');
  f.hasPhone = tri('hasPhone');
  f.hasSocials = tri('hasSocials');
  f.claimed = tri('claimed');
  f.ratingMin = num('ratingMin');
  f.ratingMax = num('ratingMax');
  f.yearsMin = num('yearsMin');
  f.yearsMax = num('yearsMax');
  const stageRaw = sp.get('stage');
  if (stageRaw) {
    const parts = stageRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as LeadStage[];
    if (parts.length) f.stage = parts;
  }
  const v = sp.get('validity');
  if (v === 'valid' || v === 'invalid') f.validity = v;
  f.scoreMin = num('scoreMin');
  f.scoreMax = num('scoreMax');
  f.stageChangedSince = get('stageChangedSince');
  f.groupId = get('groupId');
  const ob = get('orderBy');
  if (ob === 'recent' || ob === 'name' || ob === 'rating' || ob === 'years') f.orderBy = ob;
  return f;
}

/** True if any filter is set (for "Clear all" affordance + count). */
export function activeFilterCount(f: LeadFilter): number {
  return Object.entries(f).filter(([k, v]) => {
    if (k === 'orderBy') return false;
    if (v === undefined || v === '' || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}
