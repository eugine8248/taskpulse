import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const data = await p.user.findMany({
  where: { id: 3 },
  select: {
    id: true,
    email: true,
    boards: {
      select: { id: true, name: true, columns: { select: { id: true, name: true, cards: { select: { id: true } } } } },
    },
    labels: { select: { id: true, name: true } },
  },
});
console.log(JSON.stringify(data, null, 2));
await p.$disconnect();
