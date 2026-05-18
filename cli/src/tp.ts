#!/usr/bin/env node
// tp — Taskpulse CLI entry point.
//
// Commander.js wires every subcommand. Each subcommand is a thin handler
// that calls into ./api or ./commands/<name>.ts; the handlers do their own
// error printing and process.exit.
//
// Output flags `--json` and `--quiet` are global; each handler reads them
// from `program.opts()`. NO_COLOR is honored automatically by ./fmt.

import { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'path';
import { call, ApiError, uploadFiles } from './api';
import {
  readAuth, writeAuth, clearAuth, readConfig, writeConfig, resolveApiUrl,
} from './config';
import {
  c, priorityTag, formatDate, formatMs, makeTable, output, parseDate, summarizeError,
} from './fmt';

interface CardSummary {
  id: number;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string | null;
  pinnedAt?: string | null;
  columnId: number;
  columnName?: string;
  boardId?: number;
  boardName?: string;
  labels?: { id: number; name: string }[];
  order?: number;
  githubKind?: 'pr' | 'issue' | 'commit' | null;
  githubNumber?: number | null;
  githubState?: string | null;
}

interface BoardListItem {
  id: number;
  name: string;
  cardCount: number;
  columnCount: number;
  githubRepoUrl?: string | null;
  githubLastSyncAt?: string | null;
}

interface BoardFull {
  board: { id: number; name: string };
  columns: {
    id: number;
    name: string;
    order: number;
    wipLimit: number | null;
    cards: CardSummary[];
  }[];
}

const VERSION = '2.5.0';

const program = new Command();
program
  .name('tp')
  .description('taskpulse CLI — terminal task management with pin, focus, time, search')
  .version(VERSION)
  .option('--json', 'emit JSON output')
  .option('--quiet', 'suppress non-essential output')
  .helpOption('-h, --help', 'show help');

function gopts(): { json?: boolean; quiet?: boolean } {
  return program.opts();
}

// ---------- helpers shared across commands ----------

async function getDefaultBoardId(): Promise<number> {
  const cfg = readConfig();
  if (cfg.defaultBoard) return cfg.defaultBoard;
  const boards = await call<BoardListItem[]>('/api/boards/list');
  if (!boards.length) throw new Error('No boards yet — create one in the web UI first.');
  if (boards.length === 1) {
    writeConfig({ defaultBoard: boards[0].id });
    return boards[0].id;
  }
  throw new Error(
    `Multiple boards exist (${boards.map((b) => b.name).join(', ')}); set one with: tp board <name>`,
  );
}

async function findBoardByName(name: string): Promise<BoardListItem | null> {
  const boards = await call<BoardListItem[]>('/api/boards/list');
  return boards.find((b) => b.name.toLowerCase() === name.toLowerCase()) || null;
}

async function loadBoardFull(boardId: number): Promise<BoardFull> {
  return call<BoardFull>(`/api/boards/${boardId}`);
}

async function findColumn(boardId: number, name?: string): Promise<{ id: number; name: string }> {
  const b = await loadBoardFull(boardId);
  if (!name) return b.columns[0];
  const lower = name.toLowerCase();
  const exact = b.columns.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = b.columns.find((c) => c.name.toLowerCase().includes(lower));
  if (partial) return partial;
  throw new Error(`Column not found: ${name} (available: ${b.columns.map((c) => c.name).join(', ')})`);
}

async function findDoneColumn(boardId: number): Promise<{ id: number; name: string }> {
  const b = await loadBoardFull(boardId);
  const done = b.columns.find((c) => c.name.trim().toLowerCase() === 'done');
  if (done) return done;
  return b.columns[b.columns.length - 1];
}

interface SearchCardResult {
  cards: CardSummary[];
  source: 'board' | 'all';
}

async function listAllCards(opts: {
  board?: number;
  tag?: string;
  col?: string;
  overdue?: boolean;
  pinned?: boolean;
  pri?: string;
}): Promise<CardSummary[]> {
  const allBoards = await call<BoardListItem[]>('/api/boards/list');
  const targetBoards = opts.board
    ? allBoards.filter((b) => b.id === opts.board)
    : allBoards;

  const out: CardSummary[] = [];
  for (const b of targetBoards) {
    const full = await loadBoardFull(b.id);
    for (const col of full.columns) {
      if (opts.col && !col.name.toLowerCase().includes(opts.col.toLowerCase())) continue;
      for (const card of col.cards) {
        if (opts.pinned && !card.pinnedAt) continue;
        if (opts.pri && card.priority !== opts.pri) continue;
        if (opts.overdue && (!card.dueDate || new Date(card.dueDate).getTime() >= Date.now())) continue;
        if (opts.tag) {
          const tags = (card.labels || []).map((l) => l.name.toLowerCase());
          if (!tags.includes(opts.tag.toLowerCase())) continue;
        }
        out.push({ ...card, columnName: col.name, boardId: b.id, boardName: b.name });
      }
    }
  }
  return out;
}

function ghPill(card: CardSummary): string {
  if (!card.githubKind) return '';
  const sym = card.githubKind === 'pr' ? '⎇' : card.githubKind === 'issue' ? '○' : '◆';
  const state = card.githubState || 'open';
  const color =
    state === 'merged' ? c.magenta
    : state === 'closed' ? c.red
    : state === 'draft' ? c.dim
    : c.green;
  return color(`${sym}${card.githubNumber ? '#' + card.githubNumber : state}`);
}

function renderCards(cards: CardSummary[]): string {
  if (!cards.length) return c.dim('(no cards)');
  const table = makeTable(['ID', 'P', '!', 'Title', 'Due', 'Board · Col', 'Tags']);
  for (const card of cards) {
    const titleCol = card.githubKind
      ? `${ghPill(card)} ${truncate(card.title, 44)}`
      : truncate(card.title, 48);
    table.push([
      c.dim(String(card.id)),
      priorityTag(card.priority),
      card.pinnedAt ? c.yellow('★') : ' ',
      titleCol,
      card.dueDate ? formatDate(card.dueDate) : '',
      `${card.boardName || ''} · ${card.columnName || ''}`.replace(/^ · /, ''),
      (card.labels || []).map((l) => l.name).join(', '),
    ]);
  }
  return table.toString();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

// ---------- commands ----------

// Default action: pinned + due-today + in-progress + overdue.
async function defaultAction(): Promise<void> {
  try {
    const allCards = await listAllCards({});
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const pinned = allCards.filter((c) => c.pinnedAt);
    const dueToday = allCards.filter((c) => c.dueDate && new Date(c.dueDate) >= today && new Date(c.dueDate) < tomorrow);
    const inProgress = allCards.filter((c) => /progress|doing|wip/i.test(c.columnName || ''));
    const overdue = allCards.filter((c) => c.dueDate && new Date(c.dueDate) < today);

    if (gopts().json) {
      output({ pinned, dueToday, inProgress, overdue }, gopts());
      return;
    }
    const sections: string[] = [];
    if (pinned.length) sections.push(c.yellow.bold('★ Pinned') + '\n' + renderCards(pinned));
    if (dueToday.length) sections.push(c.cyan.bold('Due today') + '\n' + renderCards(dueToday));
    if (inProgress.length) sections.push(c.green.bold('In progress') + '\n' + renderCards(inProgress));
    if (overdue.length) sections.push(c.red.bold('Overdue') + '\n' + renderCards(overdue));
    if (!sections.length) sections.push(c.dim('All clear — no pinned, due-today, in-progress, or overdue cards.'));
    output(null, gopts(), sections.join('\n\n'));
  } catch (err) {
    fail(err);
  }
}

program.action(defaultAction);

// tp ls
program.command('ls')
  .alias('pending')
  .description('list cards (default: across all boards)')
  .option('--board <name>', 'filter by board name')
  .option('--tag <tag>', 'filter by label name')
  .option('--col <name>', 'filter by column name (substring match)')
  .option('--overdue', 'show overdue cards only')
  .option('--pinned', 'show pinned cards only')
  .option('--pri <level>', 'filter by priority (low|medium|high|urgent)')
  .option('--view <name>', 'apply a saved view')
  .action(async (cmdOpts) => {
    try {
      let boardId: number | undefined;
      if (cmdOpts.board) {
        const b = await findBoardByName(cmdOpts.board);
        if (!b) throw new Error(`Board not found: ${cmdOpts.board}`);
        boardId = b.id;
      }
      const cards = await listAllCards({
        board: boardId,
        tag: cmdOpts.tag,
        col: cmdOpts.col,
        overdue: cmdOpts.overdue,
        pinned: cmdOpts.pinned,
        pri: cmdOpts.pri,
      });
      if (gopts().json) return output(cards, gopts());
      output(null, gopts(), renderCards(cards));
    } catch (err) {
      fail(err);
    }
  });

// tp focus
program.command('focus')
  .description('list pinned cards across all boards')
  .action(async () => {
    try {
      const pinned = await call<CardSummary[]>('/api/cards/pinned');
      if (gopts().json) return output(pinned, gopts());
      output(null, gopts(), renderCards(pinned));
    } catch (err) {
      fail(err);
    }
  });

// tp add <title>
program.command('add <title>')
  .description('create a new card')
  .option('--pri <level>', 'priority (low|medium|high|urgent)', 'medium')
  .option('--tag <tag...>', 'attach label(s) (repeatable)')
  .option('--due <when>', 'due date (ISO, +3d, tomorrow, friday 5pm)')
  .option('--board <name>', 'target board name')
  .option('--col <name>', 'target column name (defaults to first column)')
  .action(async (title, cmdOpts) => {
    try {
      let boardId: number;
      if (cmdOpts.board) {
        const b = await findBoardByName(cmdOpts.board);
        if (!b) throw new Error(`Board not found: ${cmdOpts.board}`);
        boardId = b.id;
      } else {
        boardId = await getDefaultBoardId();
      }
      const col = await findColumn(boardId, cmdOpts.col);
      const dueDate = cmdOpts.due ? parseDate(cmdOpts.due) : null;
      const body: Record<string, unknown> = {
        columnId: col.id,
        title,
        priority: cmdOpts.pri,
      };
      if (dueDate) body.dueDate = dueDate.toISOString();
      const card = await call<CardSummary>('/api/cards', { method: 'POST', body });
      if (cmdOpts.tag && cmdOpts.tag.length) {
        for (const t of cmdOpts.tag) {
          const lbl = await call<{ id: number; name: string }>('/api/labels', { method: 'POST', body: { name: t } });
          await call(`/api/cards/${card.id}/labels`, { method: 'POST', body: { labelId: lbl.id } });
        }
      }
      if (gopts().json) return output(card, gopts());
      output(null, gopts(), `${c.green('✓')} ${c.dim('#' + card.id)} ${card.title}  ${c.dim('→ ' + col.name)}`);
    } catch (err) {
      fail(err);
    }
  });

// tp quick <title>
program.command('quick <title>')
  .description('quick-add to default board\'s Inbox column (create if missing)')
  .action(async (title) => {
    try {
      const boardId = await getDefaultBoardId();
      const full = await loadBoardFull(boardId);
      let inbox = full.columns.find((c) => /inbox/i.test(c.name));
      if (!inbox) {
        // Create one — server columns API doesn't support POST yet (only PATCH),
        // so we fall back to the first column.
        inbox = full.columns[0];
      }
      const card = await call<CardSummary>('/api/cards', {
        method: 'POST',
        body: { columnId: inbox.id, title },
      });
      if (gopts().json) return output(card, gopts());
      output(null, gopts(), `${c.green('✓')} ${c.dim('#' + card.id)} ${card.title} ${c.dim('→ ' + inbox.name)}`);
    } catch (err) {
      fail(err);
    }
  });

// tp done <id>
program.command('done <id>')
  .description('mark a card done (moves to Done column)')
  .action(async (idStr) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      // Find the card's board → find its Done column → move.
      const card = await findCardById(id);
      if (!card) throw new Error(`Card #${id} not found`);
      const done = await findDoneColumn(card.boardId!);
      const updated = await call<CardSummary>(`/api/cards/${id}`, {
        method: 'PATCH',
        body: { columnId: done.id },
      });
      if (gopts().json) return output(updated, gopts());
      output(null, gopts(), `${c.green('✓ done')} ${c.dim('#' + id)} ${updated.title}`);
    } catch (err) {
      fail(err);
    }
  });

// tp move <id> <col>
program.command('move <id> <col>')
  .description('move a card to a different column')
  .action(async (idStr, colName) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const card = await findCardById(id);
      if (!card) throw new Error(`Card #${id} not found`);
      const col = await findColumn(card.boardId!, colName);
      const updated = await call<CardSummary>(`/api/cards/${id}`, {
        method: 'PATCH',
        body: { columnId: col.id },
      });
      if (gopts().json) return output(updated, gopts());
      output(null, gopts(), `${c.green('↪')} ${c.dim('#' + id)} → ${col.name}`);
    } catch (err) {
      fail(err);
    }
  });

// tp pin <id>
program.command('pin <id>')
  .description('pin a card to focus (max 3)')
  .action(async (idStr) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const card = await call<CardSummary>(`/api/cards/${id}/pin`, { method: 'POST' });
      if (gopts().json) return output(card, gopts());
      output(null, gopts(), `${c.yellow('★ pinned')} ${c.dim('#' + id)} ${card.title}`);
    } catch (err) {
      fail(err);
    }
  });

// tp unpin <id>
program.command('unpin <id>')
  .description('remove a card from focus')
  .action(async (idStr) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const card = await call<CardSummary>(`/api/cards/${id}/unpin`, { method: 'POST' });
      if (gopts().json) return output(card, gopts());
      output(null, gopts(), `${c.dim('unpinned')} #${id} ${card.title}`);
    } catch (err) {
      fail(err);
    }
  });

// tp pri <id> <level>
program.command('pri <id> <level>')
  .description('set priority (low|medium|high|urgent)')
  .action(async (idStr, level) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const card = await call<CardSummary>(`/api/cards/${id}`, {
        method: 'PATCH',
        body: { priority: level },
      });
      if (gopts().json) return output(card, gopts());
      output(null, gopts(), `${priorityTag(level)} ${c.dim('#' + id)} ${card.title}`);
    } catch (err) {
      fail(err);
    }
  });

// tp tag <id> +bug -wip
program.command('tag <id> [labels...]')
  .description('add or remove labels (+tag adds, -tag removes)')
  .action(async (idStr, labels: string[]) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const existing = await call<{ id: number; name: string }[]>('/api/labels');
      for (const t of labels) {
        const sign = t[0] === '+' || t[0] === '-' ? t[0] : '+';
        const name = t.replace(/^[+\-]/, '').trim();
        if (!name) continue;
        if (sign === '+') {
          let lbl = existing.find((l) => l.name.toLowerCase() === name.toLowerCase());
          if (!lbl) lbl = await call<{ id: number; name: string }>('/api/labels', { method: 'POST', body: { name } });
          await call(`/api/cards/${id}/labels`, { method: 'POST', body: { labelId: lbl.id } });
        } else {
          const lbl = existing.find((l) => l.name.toLowerCase() === name.toLowerCase());
          if (lbl) await call(`/api/cards/${id}/labels/${lbl.id}`, { method: 'DELETE' });
        }
      }
      output(null, gopts(), `${c.green('✓')} tags updated on #${id}`);
    } catch (err) {
      fail(err);
    }
  });

// tp due <id> <date>
program.command('due <id> <date>')
  .description('set or clear the due date ("none" or "" clears)')
  .action(async (idStr, dateStr) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      let payload: string | null = null;
      if (dateStr && dateStr.toLowerCase() !== 'none') {
        const d = parseDate(dateStr);
        if (!d) throw new Error(`Could not parse date: ${dateStr}`);
        payload = d.toISOString();
      }
      const card = await call<CardSummary>(`/api/cards/${id}`, {
        method: 'PATCH',
        body: { dueDate: payload },
      });
      output(null, gopts(), `${c.green('✓')} due ${payload ? formatDate(payload) : 'cleared'} on #${id}`);
      if (gopts().json) output(card, gopts());
    } catch (err) {
      fail(err);
    }
  });

// tp comment <id> <text>
program.command('comment <id> <text>')
  .description('post a comment on a card')
  .action(async (idStr, text) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const comment = await call(`/api/cards/${id}/comments`, { method: 'POST', body: { body: text } });
      if (gopts().json) return output(comment, gopts());
      output(null, gopts(), `${c.green('✓')} comment posted on #${id}`);
    } catch (err) {
      fail(err);
    }
  });

// tp time <id> start|stop
program.command('time <id> [action]')
  .description('start/stop timer on a card (action default: start, "running" shows current)')
  .action(async (idOrAction, action) => {
    try {
      if (idOrAction === 'running') {
        const running = await call<{ id: number; cardId: number; startedAt: string; card?: { title: string } } | null>('/api/time/running');
        if (gopts().json) return output(running, gopts());
        if (!running) return output(null, gopts(), c.dim('(no timer running)'));
        const elapsed = Date.now() - new Date(running.startedAt).getTime();
        output(null, gopts(), `${c.red('●')} running ${formatMs(elapsed)}  ${c.dim('#' + running.cardId)} ${running.card?.title || ''}`);
        return;
      }
      const id = parseInt(idOrAction, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const a = (action || 'start').toLowerCase();
      if (a === 'start') {
        const r = await call(`/api/time/cards/${id}/start`, { method: 'POST', body: {} });
        if (gopts().json) return output(r, gopts());
        output(null, gopts(), `${c.green('▶')} timer started on #${id}`);
      } else if (a === 'stop') {
        const r = await call<{ durationMs: number }>(`/api/time/cards/${id}/stop`, { method: 'POST', body: {} });
        if (gopts().json) return output(r, gopts());
        output(null, gopts(), `${c.red('■')} stopped after ${formatMs(r.durationMs || 0)}`);
      } else {
        throw new Error(`Unknown action: ${a} (try start|stop)`);
      }
    } catch (err) {
      fail(err);
    }
  });

// tp attach <id> <file>
program.command('attach <id> <file>')
  .description('attach a file to a card')
  .action(async (idStr, file) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const abs = path.resolve(file);
      const r = await uploadFiles(id, [abs]);
      if (gopts().json) return output(r, gopts());
      output(null, gopts(), `${c.green('✓')} attached ${path.basename(abs)} to #${id}`);
    } catch (err) {
      fail(err);
    }
  });

// tp search <query>
program.command('search <query>')
  .description('full-text search across cards (FTS5)')
  .option('--board <id>', 'filter by board id')
  .option('--limit <n>', 'max results', '20')
  .action(async (query, cmdOpts) => {
    try {
      interface Hit {
        id: number;
        title: string;
        priority: string;
        boardName: string;
        columnName: string;
        rank: number;
      }
      const hits = await call<Hit[]>('/api/search', {
        query: { q: query, board: cmdOpts.board, limit: cmdOpts.limit },
      });
      if (gopts().json) return output(hits, gopts());
      if (!hits.length) return output(null, gopts(), c.dim('(no matches)'));
      const t = makeTable(['ID', 'P', 'Title', 'Board · Col']);
      for (const h of hits) {
        t.push([
          c.dim(String(h.id)),
          priorityTag(h.priority),
          truncate(h.title, 48),
          `${h.boardName} · ${h.columnName}`,
        ]);
      }
      output(null, gopts(), t.toString());
    } catch (err) {
      fail(err);
    }
  });

// tp board <name>  +  tp board ls
program.command('board [name]')
  .description('switch default board (no args: show current); `tp board ls` lists all')
  .action(async (name) => {
    try {
      if (name === 'ls') {
        const boards = await call<BoardListItem[]>('/api/boards/list');
        if (gopts().json) return output(boards, gopts());
        const cur = readConfig().defaultBoard;
        for (const b of boards) {
          const marker = b.id === cur ? c.green('*') : ' ';
          const gh = b.githubRepoUrl ? `  ${c.dim('↳')} ${c.dim(b.githubRepoUrl.replace('https://github.com/', ''))}` : '';
          process.stdout.write(`${marker} ${c.dim('#' + b.id)} ${b.name} ${c.dim(`(${b.cardCount} cards)`)}${gh}\n`);
        }
        return;
      }
      if (!name) {
        const cfg = readConfig();
        if (!cfg.defaultBoard) {
          output(null, gopts(), c.dim('(no default board set)'));
          return;
        }
        const boards = await call<BoardListItem[]>('/api/boards/list');
        const b = boards.find((x) => x.id === cfg.defaultBoard);
        output(null, gopts(), b ? `default: ${b.name} (#${b.id})` : c.dim('(default board not found)'));
        return;
      }
      const b = await findBoardByName(name);
      if (!b) throw new Error(`Board not found: ${name}`);
      writeConfig({ defaultBoard: b.id });
      output(null, gopts(), `${c.green('✓')} default board set to ${b.name} (#${b.id})`);
    } catch (err) {
      fail(err);
    }
  });

// tp log
program.command('log')
  .description('show recent activity (default: 7 days)')
  .option('--days <n>', 'days back', '7')
  .option('--limit <n>', 'max entries', '50')
  .action(async (cmdOpts) => {
    try {
      const events = await call<unknown[]>(`/api/events`, {
        query: { days: cmdOpts.days, limit: cmdOpts.limit },
      });
      if (gopts().json) return output(events, gopts());
      const t = makeTable(['When', 'Kind', 'Card', 'Board']);
      for (const e of events as Array<{
        kind: string;
        createdAt: string;
        card: { title: string; boardName: string };
      }>) {
        t.push([
          c.dim(new Date(e.createdAt).toISOString().slice(0, 16).replace('T', ' ')),
          e.kind,
          truncate(e.card.title, 40),
          e.card.boardName,
        ]);
      }
      output(null, gopts(), t.toString());
    } catch (err) {
      fail(err);
    }
  });

// tp report
program.command('report')
  .description('time-tracking summary (today / week / by board)')
  .action(async () => {
    try {
      const sum = await call<{
        today: number;
        week: number;
        byBoard: { id: number; name: string; durationMs: number }[];
      }>('/api/time/summary');
      if (gopts().json) return output(sum, gopts());
      const lines: string[] = [
        `${c.bold('Time tracked')}`,
        `  Today: ${formatMs(sum.today)}`,
        `  Week:  ${formatMs(sum.week)}`,
        '',
        c.bold('By board:'),
        ...sum.byBoard.map((b) => `  ${b.name}: ${formatMs(b.durationMs)}`),
      ];
      output(null, gopts(), lines.join('\n'));
    } catch (err) {
      fail(err);
    }
  });

// tp tpl ls / apply / save
const tpl = program.command('tpl').description('manage card templates');
tpl.command('ls').description('list templates').action(async () => {
  try {
    const list = await call<{ id: number; name: string; cards: unknown[] }[]>('/api/templates');
    if (gopts().json) return output(list, gopts());
    if (!list.length) return output(null, gopts(), c.dim('(no templates)'));
    const t = makeTable(['ID', 'Name', '# Cards']);
    for (const r of list) t.push([c.dim(String(r.id)), r.name, String((r.cards as unknown[]).length)]);
    output(null, gopts(), t.toString());
  } catch (err) { fail(err); }
});
tpl.command('apply <name>')
  .description('spawn a template into a board/column')
  .option('--board <name>', 'target board')
  .option('--col <name>', 'target column')
  .action(async (name, cmdOpts) => {
    try {
      const list = await call<{ id: number; name: string }[]>('/api/templates');
      const tpl = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!tpl) throw new Error(`Template not found: ${name}`);
      let boardId: number;
      if (cmdOpts.board) {
        const b = await findBoardByName(cmdOpts.board);
        if (!b) throw new Error(`Board not found: ${cmdOpts.board}`);
        boardId = b.id;
      } else {
        boardId = await getDefaultBoardId();
      }
      const col = await findColumn(boardId, cmdOpts.col);
      const r = await call<{ spawned: { id: number; title: string }[] }>(`/api/templates/${tpl.id}/apply`, {
        method: 'POST',
        body: { boardId, columnId: col.id },
      });
      if (gopts().json) return output(r, gopts());
      output(null, gopts(), `${c.green('✓')} spawned ${r.spawned.length} card(s) into ${col.name}`);
    } catch (err) { fail(err); }
  });
tpl.command('save <id> <name>')
  .description('save a card as a template')
  .action(async (idStr, name) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const r = await call(`/api/templates/from-card/${id}`, { method: 'POST', body: { name } });
      if (gopts().json) return output(r, gopts());
      output(null, gopts(), `${c.green('✓')} template "${name}" saved`);
    } catch (err) { fail(err); }
  });

// tp view ls / save
const view = program.command('view').description('manage saved views');
view.command('ls').description('list saved views').action(async () => {
  try {
    const list = await call<{ id: number; name: string; isDefault: boolean }[]>('/api/views');
    if (gopts().json) return output(list, gopts());
    if (!list.length) return output(null, gopts(), c.dim('(no views)'));
    for (const v of list) process.stdout.write(`${v.isDefault ? c.green('*') : ' '} ${c.dim('#' + v.id)} ${v.name}\n`);
  } catch (err) { fail(err); }
});
view.command('save <name>').description('save the current default ls filter as a view').action(async (name) => {
  try {
    // Naive: store an empty filter; user can edit via web UI.
    const r = await call('/api/views', {
      method: 'POST',
      body: { name, filter: {}, sort: { field: 'order', direction: 'asc' } },
    });
    if (gopts().json) return output(r, gopts());
    output(null, gopts(), `${c.green('✓')} view "${name}" saved`);
  } catch (err) { fail(err); }
});

// tp open <id>
program.command('open <id>')
  .description('open a card in the browser')
  .action(async (idStr) => {
    try {
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      const card = await findCardById(id);
      if (!card) throw new Error(`Card #${id} not found`);
      const apiUrl = await resolveApiUrl();
      const webUrl = apiUrl.replace(/\/api$/, '') + `/boards/${card.boardId}?card=${id}`;
      output(null, gopts(), `open: ${webUrl}`);
      // try platform-specific open
      try {
        const { spawn } = await import('child_process');
        if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', webUrl], { detached: true, stdio: 'ignore' }).unref();
        else if (process.platform === 'darwin') spawn('open', [webUrl], { detached: true, stdio: 'ignore' }).unref();
        else spawn('xdg-open', [webUrl], { detached: true, stdio: 'ignore' }).unref();
      } catch { /* fall through — URL printed */ }
    } catch (err) { fail(err); }
  });

// tp version
program.command('version').description('show CLI version').action(() => {
  output({ version: VERSION }, gopts(), VERSION);
});

// tp login
program.command('login')
  .description('sign in to taskpulse')
  .option('--email <email>')
  .option('--password <password>')
  .action(async (cmdOpts) => {
    try {
      let email = cmdOpts.email;
      let password = cmdOpts.password;
      if (!email) {
        const r = await prompts({ type: 'text', name: 'email', message: 'email' });
        email = r.email;
      }
      if (!password) {
        const r = await prompts({ type: 'password', name: 'password', message: 'password' });
        password = r.password;
      }
      const resp = await call<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        noAuth: true,
      });
      writeAuth({ token: resp.token });
      output(null, gopts(), `${c.green('✓')} signed in`);
    } catch (err) { fail(err); }
  });

// tp logout
program.command('logout').description('clear local credentials').action(() => {
  clearAuth();
  output(null, gopts(), 'logged out');
});

// tp config
program.command('config [action] [key] [value]')
  .description('show or set CLI config (`config set apiUrl https://...`)')
  .action(async (action, key, value) => {
    try {
      if (!action) {
        const cfg = readConfig();
        const apiUrl = await resolveApiUrl();
        if (gopts().json) return output({ ...cfg, apiUrl }, gopts());
        output(null, gopts(), JSON.stringify({ ...cfg, apiUrl }, null, 2));
        return;
      }
      if (action === 'set') {
        if (!key) throw new Error('Usage: tp config set <key> <value>');
        const v: unknown = (key === 'defaultBoard' || key === 'pinCap') ? parseInt(value, 10) : value;
        const next = writeConfig({ [key]: v } as Partial<{ apiUrl: string; defaultBoard: number; pinCap: number }>);
        output(null, gopts(), JSON.stringify(next, null, 2));
        return;
      }
      throw new Error(`Unknown action: ${action}`);
    } catch (err) { fail(err); }
  });

// ---------- tp gh ----------

const gh = program.command('gh').description('GitHub integration (PAT + paste-URL flow)');

interface GhStatusResp {
  connected: boolean;
  login?: string;
  scopes?: string[];
  rateLimit?: { remaining: number | null; limit: number | null; resetAt: string | null } | null;
  rateLimitError?: string | null;
}

async function resolveBoardSelector(sel: string): Promise<BoardListItem> {
  // Accept numeric id OR name (case-insensitive).
  const n = parseInt(sel, 10);
  const boards = await call<BoardListItem[]>('/api/boards/list');
  if (Number.isFinite(n) && String(n) === sel) {
    const b = boards.find((x) => x.id === n);
    if (b) return b;
  }
  const b = boards.find((x) => x.name.toLowerCase() === sel.toLowerCase());
  if (b) return b;
  throw new Error(`Board not found: ${sel} (available: ${boards.map((x) => `#${x.id} ${x.name}`).join(', ')})`);
}

gh.command('login')
  .description('store a GitHub PAT (server-side encrypted)')
  .option('--token <token>', 'PAT (otherwise prompted)')
  .action(async (cmdOpts) => {
    try {
      let token: string | undefined = cmdOpts.token;
      if (!token) {
        const r = await prompts({ type: 'password', name: 'token', message: 'GitHub PAT' });
        token = r.token;
      }
      if (!token) throw new Error('No token provided');
      const r = await call<{ login: string; scopes: string[] }>('/api/github/pat', {
        method: 'POST',
        body: { token },
      });
      output(null, gopts(), `${c.green('✓')} signed in to GitHub as ${c.bold(r.login)} (scopes: ${r.scopes.join(', ') || '—'})`);
    } catch (err) { fail(err); }
  });

gh.command('logout')
  .description('clear the stored GitHub PAT')
  .action(async () => {
    try {
      await call('/api/github/pat', { method: 'DELETE' });
      output(null, gopts(), 'GitHub PAT cleared');
    } catch (err) { fail(err); }
  });

gh.command('status')
  .description('show GitHub connection state + rate-limit')
  .action(async () => {
    try {
      const r = await call<GhStatusResp>('/api/github/pat/status');
      if (gopts().json) return output(r, gopts());
      if (!r.connected) {
        output(null, gopts(), c.dim('Not connected — run: tp gh login'));
        return;
      }
      const lines = [
        `${c.green('✓')} connected as ${c.bold(r.login || '?')}`,
        `  scopes: ${(r.scopes || []).join(', ') || '—'}`,
      ];
      if (r.rateLimit) {
        lines.push(`  rate: ${r.rateLimit.remaining}/${r.rateLimit.limit}` +
          (r.rateLimit.resetAt ? ` (resets ${new Date(r.rateLimit.resetAt).toLocaleTimeString()})` : ''));
      }
      if (r.rateLimitError) lines.push(`  ${c.red('warn')}: ${r.rateLimitError}`);
      output(null, gopts(), lines.join('\n'));
    } catch (err) { fail(err); }
  });

// v2.6 cleanup — `tp gh link/unlink/sync` removed. The board↔repo binding +
// auto-sync layer was dead weight for solo workflow. Paste-URL flow still
// available via `tp gh add` below.

gh.command('add <url>')
  .description('add a PR / issue / commit card from a paste URL')
  .option('--board <name>', 'target board (defaults to your default board)')
  .action(async (url, cmdOpts) => {
    try {
      let boardId: number;
      if (cmdOpts.board) {
        const b = await findBoardByName(cmdOpts.board);
        if (!b) throw new Error(`Board not found: ${cmdOpts.board}`);
        boardId = b.id;
      } else {
        boardId = await getDefaultBoardId();
      }
      const r = await call<{ cardId: number; kind: string; created: boolean }>(
        `/api/boards/${boardId}/github/import-url`,
        { method: 'POST', body: { url } },
      );
      if (gopts().json) return output(r, gopts());
      output(null, gopts(),
        `${c.green('✓')} ${r.created ? 'created' : 'updated'} ${r.kind} card #${r.cardId} from ${url}`);
    } catch (err) { fail(err); }
  });

// ---------- helpers needed by handlers ----------

async function findCardById(id: number): Promise<CardSummary | null> {
  const boards = await call<BoardListItem[]>('/api/boards/list');
  for (const b of boards) {
    const full = await loadBoardFull(b.id);
    for (const col of full.columns) {
      const card = col.cards.find((c) => c.id === id);
      if (card) return { ...card, columnName: col.name, boardId: b.id, boardName: b.name };
    }
  }
  return null;
}

function fail(err: unknown): never {
  if (err instanceof ApiError) {
    process.stderr.write(`${c.red('error')}: ${err.message}\n`);
  } else {
    process.stderr.write(`${c.red('error')}: ${summarizeError(err)}\n`);
  }
  process.exit(1);
}

program.parseAsync(process.argv).catch((err) => fail(err));
