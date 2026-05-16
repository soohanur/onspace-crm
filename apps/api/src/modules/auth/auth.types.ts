/**
 * Shapes shared across guards / controllers / services.
 * Kept in one file so guards don't import from the module barrel and circularize.
 */

export interface JwtPayload {
  /** User id. */
  sub: string;
  /** Active workspace member id (chosen at login). */
  mid: string;
  /** Active workspace id (mirrored from member for cheap reads). */
  wid: string;
  /** Issued at (unix seconds). */
  iat?: number;
  /** Expiry (unix seconds). */
  exp?: number;
}

export interface AuthenticatedRequestContext {
  user: {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
  };
  member: {
    id: string;
    roleId: string;
    status: string;
    jobTitle: string | null;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
    permissions: string[];
  };
}

export const ACCESS_COOKIE = 'onspace_access';
