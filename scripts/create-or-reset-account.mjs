// Idempotent: creates the account if missing, resets password if it exists.
// Usage: node scripts/create-or-reset-account.mjs <email> <password> [name]
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [, , email, password, name] = process.argv;
if (!email || !password) {
  console.error('usage: node scripts/create-or-reset-account.mjs <email> <password> [name]');
  process.exit(1);
}

const p = new PrismaClient();
const passwordHash = bcrypt.hashSync(password, 10);

const existing = await p.user.findUnique({ where: { email } });
if (existing) {
  await p.user.update({
    where: { id: existing.id },
    data: { passwordHash, name: name || existing.name },
  });
  console.log(JSON.stringify({ action: 'reset_password', userId: existing.id, email }, null, 2));
} else {
  const u = await p.user.create({
    data: { email, passwordHash, name: name || email.split('@')[0] },
  });
  console.log(JSON.stringify({ action: 'created', userId: u.id, email: u.email, name: u.name }, null, 2));
}

await p.$disconnect();
