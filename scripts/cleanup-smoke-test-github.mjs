import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Wipe the smoke-test GitHub cards + null the framedeck-board binding.
// The "GitHub" column itself is kept (harmless empty column).

const cards = await p.card.deleteMany({ where: { githubKind: { not: null } } });
const boards = await p.board.updateMany({
  where: { githubRepoUrl: { not: null } },
  data: {
    githubRepoUrl: null,
    githubRepoOwner: null,
    githubRepoName: null,
    githubLastSyncAt: null,
    githubColumnId: null,
  },
});

console.log(JSON.stringify({ cardsDeleted: cards.count, boardsUnlinked: boards.count }, null, 2));
await p.$disconnect();
