# Security policy

## Reporting a vulnerability

Please email `security@onspace.app` with:

- A description of the issue
- Steps to reproduce
- Impact assessment (data exposure, privilege escalation, DoS, etc.)
- Any proof-of-concept code or screenshots

We will acknowledge within 72 hours and aim to ship a fix within 14 days for
critical issues. Do not file a public GitHub issue for security reports.

## Scope

In scope:

- The OnspaceCRM web app (Next.js)
- The OnspaceCRM API (NestJS)
- Authentication, authorization, multi-tenant isolation
- Data exposure across workspaces
- Stored XSS, CSRF, SSRF, SQLi, RCE

Out of scope:

- Denial-of-service (rate-limit work is ongoing)
- Vulnerabilities in third-party services (Render, Vercel, Neon, Upstash)
  unless they directly expose our customer data
- Findings that require physical access to a user's device

## Supported versions

Only the latest release on `main` is supported with security updates while the
product is in pre-1.0. Once we ship 1.0, the latest two minor versions will
be supported.
