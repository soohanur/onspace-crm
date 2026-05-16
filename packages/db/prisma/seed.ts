/**
 * Idempotent seed for platform-core.
 *
 * Creates:
 *   - one platform admin user (us)
 *   - one "Internal" workspace (so existing CRM rows have a home in Phase 1B)
 *   - five default roles inside that workspace (owner, admin, manager, sales, viewer)
 *   - one membership linking the admin user → Internal workspace as Owner
 *
 * Safe to run multiple times.
 *
 * Env:
 *   PLATFORM_ADMIN_EMAIL    (default: admin@onspace.local)
 *   PLATFORM_ADMIN_PASSWORD (default: changeme — bcrypt-hashed)
 *   PLATFORM_ADMIN_NAME     (default: Platform Admin)
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load env vars from the nearest .env up the tree (monorepo root holds DATABASE_URL).
// Prisma CLI loads .env from CWD; when invoked via `prisma db seed` CWD is packages/db,
// so we walk up until we find one.
(function loadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const [, key, raw] = m;
        if (process.env[key] != null) continue;
        const val = raw.replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

const prisma = new PrismaClient();

// Lightweight bcrypt-compatible hash via Node's scrypt so seed has zero deps.
// Replace with bcrypt in the Auth module (Phase 1A.2) — login will re-hash on next login.
function scryptHash(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Permission strings. Wildcards expand at check time.
// Format: <product>.<resource>.<action>
const PERMISSIONS = {
  ALL: ['*'],
  ADMIN: [
    'crm.*',
    'workspace.settings',
    'member.*',
    'role.*',
    'audit.read',
  ],
  MANAGER: [
    'crm.lead.*',
    'crm.contact.*',
    'crm.group.*',
    'crm.task.*',
    'crm.note.*',
    'crm.email.*',
    'crm.meeting.*',
    'crm.proposal.*',
    'crm.report.read',
    'member.read',
  ],
  SALES: [
    'crm.lead.read',
    'crm.lead.write',
    'crm.contact.read',
    'crm.contact.write',
    'crm.note.read',
    'crm.note.write',
    'crm.task.read.assigned',
    'crm.task.complete.own',
    'crm.email.send',
    'crm.email.read',
    'crm.meeting.read',
    'crm.meeting.write.own',
    'crm.call.read',
    'crm.call.write.own',
  ],
  VIEWER: [
    'crm.lead.read',
    'crm.contact.read',
    'crm.group.read',
    'crm.note.read',
    'crm.task.read',
    'crm.report.read',
  ],
};

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@onspace.local';
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? 'changeme';
  const name = process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin';

  console.log(`→ seeding platform admin: ${email}`);
  const adminUser = await prisma.user.upsert({
    where: { email },
    update: { isPlatformAdmin: true, name },
    create: {
      email,
      passwordHash: scryptHash(password),
      name,
      isPlatformAdmin: true,
    },
  });

  console.log('→ seeding Internal workspace');
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'internal' },
    update: { ownerId: adminUser.id },
    create: {
      slug: 'internal',
      name: 'Internal',
      ownerId: adminUser.id,
      seatLimit: 50,
    },
  });

  console.log('→ seeding default roles');
  const roleDefs = [
    { key: 'owner',   name: 'Owner',   description: 'Full access. Cannot be deleted.', permissions: PERMISSIONS.ALL,    isSystem: true },
    { key: 'admin',   name: 'Admin',   description: 'Manage workspace + members + data.', permissions: PERMISSIONS.ADMIN, isSystem: true },
    { key: 'manager', name: 'Manager', description: 'Manage CRM data + assign tasks.',    permissions: PERMISSIONS.MANAGER, isSystem: true },
    { key: 'sales',   name: 'Sales',   description: 'Work on assigned leads/tasks.',      permissions: PERMISSIONS.SALES, isSystem: true },
    { key: 'viewer',  name: 'Viewer',  description: 'Read-only across CRM.',              permissions: PERMISSIONS.VIEWER, isSystem: true },
  ];

  const roles = new Map<string, string>();
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: r.key } },
      update: { name: r.name, description: r.description, permissions: r.permissions, isSystem: r.isSystem },
      create: { workspaceId: workspace.id, ...r },
    });
    roles.set(r.key, role.id);
  }

  console.log('→ ensuring admin user is Owner of Internal workspace');
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: adminUser.id } },
    update: { roleId: roles.get('owner')!, status: 'active' },
    create: {
      workspaceId: workspace.id,
      userId: adminUser.id,
      roleId: roles.get('owner')!,
      status: 'active',
      joinedAt: new Date(),
    },
  });

  console.log('\n✓ seed complete');
  console.log(`  login → email: ${email}`);
  console.log(`           pass:  ${password === 'changeme' ? 'changeme (change this!)' : '<from env>'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
