# tp — taskpulse CLI

Terminal-first task management for taskpulse. Pin, focus, time-track, FTS5
search, and shape boards without leaving the shell.

## Install

```bash
cd cli
npm install --ignore-scripts
npm run build
npm link            # makes `tp` available on $PATH
```

`npm link` installs a shim that points at `dist/tp.js`. On Windows it lands
in `%AppData%\npm\tp.cmd`; on POSIX it goes to `~/.npm-global/bin/tp` (or
wherever your npm `prefix` resolves to).

## Configure

```bash
tp config                              # show resolved apiUrl + cached config
tp config set apiUrl https://taskpulse.example.com
tp config set defaultBoard 2           # skip board-picking on every command
```

State lives in `~/.taskpulse/`:

- `auth.json` — `{token}`; chmod 600 on POSIX
- `config.json` — `{apiUrl, defaultBoard?, pinCap?}`

The CLI auto-probes `https://taskpulsedev.alien-lee.com` and
`http://localhost:3000` for `/api/health` on first run if no `apiUrl` is
cached. Set `TASKPULSE_API_URL=...` to override at the env level.

## Sign in

```bash
tp login                                # prompts for email/password
tp login --email me@example.com --password '…'
tp logout                               # clears auth.json
```

## Quick reference

```bash
# Default — pinned + due-today + in-progress + overdue
tp

# Listing
tp ls                                   # all cards, all boards
tp ls --board Project --pinned          # filter
tp ls --overdue --pri urgent
tp pending                              # alias for ls
tp focus                                # pinned cards only

# Create / mutate
tp add "Wire up Stripe webhook" --pri high --due tomorrow --tag billing
tp add "Drop column z" --col Backlog
tp quick "TODO: triage this"            # → default board's Inbox (or first col)
tp done 42                              # → moves to Done column (auto-clears pin)
tp move 42 Review
tp pin 42                               # 409 if you already have 3 pinned
tp unpin 42
tp pri 42 urgent
tp tag 42 +bug -wip                     # add bug, remove wip
tp due 42 friday 5pm
tp due 42 none                          # clear
tp comment 42 "blocked on infra"

# Time tracking
tp time 42 start
tp time 42 stop                         # auto-stops any other running entry
tp time running                         # show current
tp report                               # today / week / by board

# Attachments
tp attach 42 ./diagram.png

# Search (FTS5)
tp search "stripe webhook"
tp search "checkout" --board 2 --limit 50

# Boards
tp board                                # show current default
tp board Project                        # switch default to "Project"
tp board ls                             # list all
tp log --days 7                         # activity feed

# Templates
tp tpl ls
tp tpl save 42 "bug-report-template"
tp tpl apply bug-report-template --board Project --col Inbox

# Saved views
tp view ls
tp view save "urgent-tasks"

# Open in browser
tp open 42

# Output controls
tp ls --json                            # JSON output for piping
tp ls --quiet                           # suppress non-essential prints
NO_COLOR=1 tp ls                        # strip ANSI

tp version
tp help [command]
```

## Date parsing (`--due`, `tp due`)

Powered by [`chrono-node`](https://github.com/wanasit/chrono):

| Input                  | Parses to                          |
| ---------------------- | ---------------------------------- |
| `2026-05-21`           | ISO date                           |
| `tomorrow`             | next day                           |
| `+3d`, `+2w`, `+8h`    | relative offset                    |
| `friday`, `next monday`| upcoming weekday                   |
| `friday 5pm`           | weekday + clock time               |

KL timezone is used when ambiguous.

## Smart defaults

- Single board on the account → auto-selected, no `--board` needed
- `add` with no `--col` → first column (usually Backlog)
- `done` → finds the "Done" column case-insensitively, falls back to last col
- `quick` → first column matching `/inbox/i`, else first column
- `tag +x` creates the label if it doesn't exist

## Pin cap

Server default is 3 (from `AppSetting.maxPins`). `tp pin` returns an
`error: pin_cap_reached, cap: 3` with HTTP 409 when you hit it. The CLI
prints `error: Pin cap reached (max 3). Unpin a card first.` and exits 1.

## Exit codes

- 0 — success
- 1 — any error (network, auth, server-side validation, parsing)

## License

Same as taskpulse.
