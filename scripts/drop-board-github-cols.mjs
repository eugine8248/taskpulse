import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const cols = ['githubRepoUrl', 'githubRepoOwner', 'githubRepoName', 'githubLastSyncAt', 'githubAutoSync', 'githubColumnId'];

// Drop the @@index first (Prisma may have named it Board_githubRepoOwner_githubRepoName_idx).
try {
  await p.$executeRawUnsafe('DROP INDEX IF EXISTS Board_githubRepoOwner_githubRepoName_idx');
  console.log('  dropped index');
} catch (e) {
  console.log('  index drop skipped:', e.message);
}

for (const c of cols) {
  try {
    await p.$executeRawUnsafe(`ALTER TABLE Board DROP COLUMN ${c}`);
    console.log('  dropped Board.' + c);
  } catch (e) {
    console.log('  ' + c + ' failed:', e.message);
  }
}

await p.$disconnect();
