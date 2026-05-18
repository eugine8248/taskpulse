// Output helpers. Respect NO_COLOR + --json/--quiet flags.

import chalk from 'chalk';
import Table from 'cli-table3';
import * as chrono from 'chrono-node';

const NO_COLOR = !!process.env.NO_COLOR;

// Chainable noop chalk substitute so `c.yellow.bold('x')` still works when
// NO_COLOR is set.
type Chainable = ((s: string) => string) & {
  bold: Chainable;
  dim: Chainable;
  red: Chainable;
  green: Chainable;
  yellow: Chainable;
  blue: Chainable;
  cyan: Chainable;
  magenta: Chainable;
  gray: Chainable;
};
function noop(): Chainable {
  const fn = ((s: string) => s) as Chainable;
  const handler: ProxyHandler<Chainable> = {
    get: (_, _prop) => noop(),
    apply: (target, _thisArg, args) => (target as (s: string) => string)(args[0] as string),
  };
  return new Proxy(fn, handler);
}

export const c = NO_COLOR
  ? {
      dim: noop(),
      bold: noop(),
      cyan: noop(),
      yellow: noop(),
      red: noop(),
      green: noop(),
      magenta: noop(),
      blue: noop(),
      gray: noop(),
    }
  : {
      dim: chalk.dim,
      bold: chalk.bold,
      cyan: chalk.cyan,
      yellow: chalk.yellow,
      red: chalk.red,
      green: chalk.green,
      magenta: chalk.magenta,
      blue: chalk.blue,
      gray: chalk.gray,
    };

export function priorityTag(p: string): string {
  switch (p) {
    case 'urgent': return c.red('●');
    case 'high':   return c.yellow('●');
    case 'medium': return c.cyan('●');
    case 'low':    return c.gray('○');
    default:       return c.gray('○');
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m${s}s`;
  return `${s}s`;
}

export function makeTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => c.bold(h)),
    style: { head: [], border: [] },
    chars: NO_COLOR
      ? { 'top': '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+', 'bottom': '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+', 'left': '|', 'left-mid': '+', 'mid': '-', 'mid-mid': '+', 'right': '|', 'right-mid': '+', 'middle': '|' }
      : undefined,
  });
}

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

export function output(data: unknown, opts: OutputOptions, lines?: string): void {
  if (opts.quiet) return;
  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (lines !== undefined) {
    process.stdout.write(lines + '\n');
  } else if (typeof data === 'string') {
    process.stdout.write(data + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

/**
 * Parse a user-supplied date string. Accepts ISO ('2026-05-18'), relative
 * ('+3d', 'tomorrow', 'next monday', 'friday 5pm') via chrono-node. KL
 * timezone is honored when ambiguous.
 */
export function parseDate(input: string): Date | null {
  if (!input) return null;
  // First try ISO direct
  const iso = new Date(input);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(input)) return iso;
  // +Nd shortcuts
  const rel = /^\+(\d+)\s*(d|w|h|m)?$/i.exec(input.trim());
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = (rel[2] || 'd').toLowerCase();
    const now = new Date();
    if (unit === 'd') now.setDate(now.getDate() + n);
    else if (unit === 'w') now.setDate(now.getDate() + n * 7);
    else if (unit === 'h') now.setHours(now.getHours() + n);
    else if (unit === 'm') now.setMinutes(now.getMinutes() + n);
    return now;
  }
  // chrono
  const parsed = chrono.parseDate(input, new Date(), { forwardDate: true });
  return parsed || null;
}

export function summarizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
