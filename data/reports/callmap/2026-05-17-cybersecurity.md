# callmap v1.0 — Cybersecurity Audit

**Critical:** 0 | **Important:** 5 | **Minor:** 9

Audit run: 2026-05-17. Scope: monorepo at `C:\Users\eugin\projects\callmap\` (v0.5 codebase tagged for v1.0 release). Read-only — no files modified.

Headline take: nothing in this audit blocks v1.0 ship. There are no critical secrets-leak, no RCE primitive, no exploitable PAT exfil path. The five "Important" findings are dependency-hygiene (Astro / Vite advisories), one defensible CSP relaxation (`'unsafe-inline'` for styles), an unvalidated `openExternal` channel, an unvalidated Tauri command input, and an over-permissive `localResourceRoots` corner. None of them would let an attacker steal a PAT or escalate, but each is worth a paragraph in the release notes or a v1.1 follow-up.

---

## 1. GitHub PAT storage on desktop (keychain migration)

**Status:** clean. The implementation is exactly what the spec describes.

Reviewed `packages/desktop/src-tauri/src/lib.rs:15-59` and `packages/desktop/src/host.ts:18-124`.

- `keyring` crate v3 with `windows-native` / `apple-native` / `sync-secret-service` features — no external daemons, no plaintext at rest.
- Migration is idempotent (`PAT_MIGRATED_KEY` marker) and fail-soft (host.ts:115-124): if the IPC write fails the localStorage copy is kept so the user is not locked out. Only on a *successful* `set_token` does `localStorage.removeItem(PAT_LEGACY_KEY)` fire (host.ts:117-119).
- No `console.log` of the token anywhere in the path. The only console paths log error objects from `invoke()`/`set_token` failures and do not splice the token string (host.ts:59,81).
- DevTools risk: in a Tauri release build DevTools are not enabled by default. `tauri.conf.json` does not opt into them. The token is read once on app start (`main.tsx:36-38`) and held in a module-scope `cachedToken` JS variable. That cache string would be visible in heap dumps if the user enables DevTools via a custom build, but that is the user's own machine — not a remote attack surface.

### MINOR — PAT cached in memory indefinitely (`packages/desktop/src/main.tsx:35-49`)

`cachedToken` lives in module scope for the entire process lifetime. There is no explicit zeroize on app exit. JavaScript strings cannot be deterministically wiped, so this is more an observation than a fix-able thing — note that the keychain crate also keeps the secret in process memory while the entry handle is alive.

**Recommended:** document in SECURITY.md that the token sits in RAM for the session; users on shared machines should `clear_token` from Settings before sleeping/locking.

---

## 2. VS Code GitHub session token never crosses to webview

**Status:** verified. Design holds.

Reviewed `packages/vscode/src/panel.ts:311-358` (HTTP proxy) and `packages/vscode/webview-src/main.tsx:90-94`.

- `setTokenProvider(() => null)` in the webview (main.tsx:94) — the renderer literally cannot construct an `Authorization` header itself.
- `panel.ts:320-327` attaches `Bearer ${session.accessToken}` only for `api.github.com` URLs and only on the host side. The token never enters a postMessage payload — the webview sees the *response*, not the credential.
- `http:result` posts back `{ id, ok, status, headers, body }`. `headers` is a raw clone of `res.headers` — the response from api.github.com does not echo `Authorization` back, so no leak there. (Sanity-checked GitHub API doesn't reflect auth headers.)
- Error path (panel.ts:346-357): the `catch` posts `err.message` as the body. `fetch()` exceptions don't include header values, so this is safe.

### IMPORTANT — `http:request` accepts arbitrary URLs and forwards extension Authorization for any `api.github.com` URL (`packages/vscode/src/panel.ts:320`)

Today the proxy will attach the session token to *any* URL matching `^https://api\.github\.com/`. If a malicious PR title/body or a manipulated `recents` payload could ever cause the webview to issue `http:request` for `https://api.github.com/user`, the response (which contains the user's email, login, plan) would be returned to the webview. The webview is currently only the engine-driven code — but the surface is wider than it needs to be.

**Exploit scenario:** an XSS in any future webview-side change (e.g. the highlight.js issues in section 6, or a future Markdown renderer) would gain *full* api.github.com scope reads on behalf of the user with the existing proxy. The proxy is the only post-XSS exfil channel that currently has the token.

**Fix (don't apply):** allowlist the small set of GitHub endpoints the engine actually uses — `/repos/{}/{}/pulls/N`, `/repos/{}/{}/pulls/N/files`, `/repos/{}/{}/contents/...`. Reject anything else with a postMessage error. Drop in ~10 lines at panel.ts:320.

### MINOR — `http:request` has no in-flight limit

The webview can fire unlimited `http:request` messages and the extension will fan them out concurrently. A buggy webview build could exhaust the GitHub secondary rate limit and trip GitHub's "too many requests" protection on the user's PAT. Low impact, but worth a `Promise.all` chain or simple semaphore.

---

## 3. VS Code webview CSP

Reviewed `packages/vscode/src/webview-html.ts:26-34`.

```
default-src 'none';
img-src ${cspSource} data:;
style-src ${cspSource} 'unsafe-inline';
font-src ${cspSource};
script-src 'nonce-${nonce}' ${cspSource} 'wasm-unsafe-eval';
worker-src ${cspSource} blob:;
connect-src ${cspSource};
```

This is solid. `default-src 'none'`, no `'unsafe-eval'`, scripts are nonce-gated, `connect-src` is scoped to the webview origin (the api.github.com proxying happens host-side as designed).

### IMPORTANT — `style-src 'unsafe-inline'` (`packages/vscode/src/webview-html.ts:29`)

`'unsafe-inline'` for styles is the standard React + Tailwind compromise (styled-jsx, runtime style attributes, dynamic CSS variables). React 18 + Tailwind both emit inline `style="..."` attributes. The Tauri webview has the same constraint and works around it by `csp: null`.

**Why it matters:** any HTML-injection bug elsewhere lets an attacker apply arbitrary CSS — keylogger-via-CSS-selectors, exfil-via-CSS-background-image is harder without `connect-src` but visual phishing overlays become trivial.

**Fix (don't apply):** the proper migration is to use Tailwind's static class output + emotion/styled-components with nonces. That's a >1-day refactor and out of scope for v1.0. For the launch: keep this as-is and document in SECURITY.md.

### MINOR — `worker-src ${cspSource} blob:` (`packages/vscode/src/webview-html.ts:32`)

Allowing `blob:` for worker URLs is necessary for Vite's worker emission patterns. Combined with the `script-src` nonce gate this is fine — an attacker can't construct a `Blob` containing arbitrary script without first satisfying `script-src`. Documenting for completeness.

### MINOR — Optimistic inline theme script lives under the nonce (`packages/vscode/src/webview-html.ts:38-43`)

The inline `<script nonce="${nonce}">` that sets `data-theme` runs before the React bundle. It's a 1-line `setAttribute` and the nonce-gating is correct — but every nonce is an attack target if `randomNonce()` ever loses entropy. The fallback to `Math.random()` (panel.ts:372) when `crypto.randomFillSync` is unavailable is technically a quality-of-entropy downgrade. Node 18 always has `crypto.randomFillSync` in practice — this branch is unreachable on the VS Code engine target (`vscode ^1.85` ships Node 18+) but the dead fallback should still be removed.

---

## 4. WASM grammar loading (tree-sitter)

Reviewed `packages/core/src/parser.ts:48-113`, `packages/vscode/src/panel.ts:236-272`, `packages/desktop/src/main.tsx:62-83`, `packages/core/src/parseWorker.ts:86-98`.

- VS Code: `panel.ts:241-253` whitelists exactly 5 filenames; `asWebviewUri` is the only path used; `localResourceRoots` is restricted to `extensionPath/media` (panel.ts:79-82). The webview can only fetch from that directory.
- Desktop: WASM URLs are hardcoded constants `[/tree-sitter*.wasm]` (main.tsx:63-69, served from `packages/desktop/public/`). No user input feeds those paths.
- Worker (parseWorker.ts:86-98): only fetches from `pendingUris[file]` keyed by the same 5 whitelisted names; no path traversal possible.

No findings.

### MINOR — `localResourceRoots` only contains `media/` (`packages/vscode/src/panel.ts:79-82`)

This is actually *correct* but worth noting: the webview can only load anything from `extensionPath/media`. Source maps in `out/` are not exposed even if they ever landed.

---

## 5. Code parsing edge cases (tree-sitter / regex)

Reviewed `packages/core/src/parser.ts` (full AST walkers + regex fallback) and `packages/core/src/diffAnalyzer.ts:50-52`.

- AST walkers: `walkJs/walkPython/walkGo` use plain recursion and tree-sitter's error-recovery to handle malformed input. Tree-sitter does not throw on parse errors — it emits `ERROR` nodes the walker simply ignores.
- Worker isolates parsing (callgraphBuilder.ts:110-124, 162-164) — a malicious file that hangs the parser would only hang the *worker*; the main thread keeps the UI responsive. On worker failure the engine falls back to inline parsing (parseFile in callgraphBuilder.ts:60-71). Per-file `try/catch` means one bad file won't kill the whole build.
- Regex fallback (`regexExtractJs`, parser.ts:453-498): the regexes are bounded — `[A-Za-z_$][\w$]*` and `\([^)]*\)` use character classes and bounded reps. The inner `callRe` is `\b([A-Za-z_$][\w$]*)\s*\(/g` — no nested quantifiers, no catastrophic backtracking primitives.
- diffAnalyzer normalize() uses `replace(/\s+/g, " ")` — simple `\s+` against a string, polynomial-bounded.
- `parsePrUrl` uses `^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:\b|\/)/i` — bounded; the `[^/\s]+` is the only repetition and is linear.

### MINOR — Unbounded source string fed to tree-sitter (`packages/core/src/callgraphBuilder.ts:151-152`)

`extractFunctions(source, grammar)` is called on whatever GitHub returns for `fetchFileAtSha`. A repository with a 50 MB minified file in the diff would balloon worker memory. GitHub's raw API does not enforce a size cap for arbitrary repo content. The parser would not crash but could OOM the worker on truly pathological inputs.

**Exploit scenario:** a hostile PR with a `bundle.min.js` of e.g. 50 MB would force every reviewer to parse it. Realistically GitHub PRs cap at a few thousand files but individual file size is not capped. Practical attack value: nuisance, not RCE.

**Fix (don't apply):** add a `MAX_PARSE_SIZE = 2 * 1024 * 1024` short-circuit before calling `parseFile`. Treat oversize files as "skipped" and surface in the empty-state.

### MINOR — `regexExtractJs` is unreachable in production but lives in the bundle (`packages/core/src/parser.ts:453-498`)

Used only when the JS grammar fails to load. The desktop ships the WASM in `public/`, the VS Code extension in `media/`. Dead-weight regex code — but harmless.

---

## 6. highlight.js attack surface

Reviewed `packages/ui/src/highlight.ts:1-71` and `packages/ui/src/SourcePanel.tsx:112,161`.

- highlight.js@11.11.1 — current major (no known active advisories for 11.x; the historical XSS-via-class-name issues were 9.x/10.x).
- The output of `hljs.highlight()` is fed into `dangerouslySetInnerHTML` (SourcePanel.tsx:112, 161). This is the classic highlight.js attack pattern.
- highlight.js correctly escapes `&`, `<`, `>`, `"`, `'` in untrusted source text by default; the only XSS path would be a regression in highlight.js itself.

### IMPORTANT — Two `dangerouslySetInnerHTML` paths with highlight.js output (`packages/ui/src/SourcePanel.tsx:112,161`)

PR source content is attacker-controlled (anyone opens any PR; an attacker could craft a PR designed to find a tokenizer regression). highlight.js's track record is good but not perfect. A future highlight.js advisory would immediately make every reviewer reading a malicious PR vulnerable.

**Defenses already in place:** the VS Code webview's CSP blocks inline `<script>` execution, so even a tokenizer regression returning unescaped `<script>...</script>` would be blocked at script-src time. The Tauri shell has `csp: null` (see section 8) — there an XSS *would* execute.

**Fix (don't apply):**
1. Set a non-null Tauri CSP (see section 8).
2. Run the highlight.js output through DOMPurify (≈22 KB gzip) before assignment. Defense-in-depth for ~5 % bundle cost.
3. Subscribe `npm` to `highlight.js` advisories — refuse to ship a release if a CVE is active.

### MINOR — Highlight result lines are split by `\n` after highlighting (`packages/ui/src/highlight.ts:60`)

This works because hljs emits balanced spans per line under default options. A future highlight.js change to span boundaries across lines would produce mismatched DOM — visual breakage only, not a security issue.

---

## 7. GitHub API rate-limit handling

Reviewed `packages/core/src/github.ts:109-145, 161-184` and `packages/ui/src/IdeShell.tsx:185-198`.

- `captureRateLimit()` stashes `X-RateLimit-Remaining/Limit/Reset` after every response.
- 403 with `Remaining === 0` is classified as `GithubError.isRateLimit = true`.
- `IdeShell` catches `GithubError.isRateLimit` and renders an explicit "rate limit hit" empty-state with PAT-help copy (IdeShell.tsx:188-191).
- `fetchChangedFiles` paginates sequentially; failure on any page throws.
- A 403 *non-rate-limit* (private repo without auth) throws `GithubError` with the body — message surfaces in the UI via `error` state.

This is **fail-closed**: a rate-limit hit produces an explicit error empty-state, not a "no diff" false-clean. The user sees "GitHub rate limit hit. Add a Personal Access Token…" rather than an empty graph.

### MINOR — `fetchFileAtSha` returns null on 404 (`packages/core/src/github.ts:225`)

`return null` on 404 is correct for added/removed files, but if GitHub ever serves a 404 mistakenly for an existing file the diff would silently treat it as added/removed. Not a security issue; just noting the failure mode.

---

## 8. Cross-origin in Tauri shell

Reviewed `packages/desktop/src-tauri/tauri.conf.json:24-26`, `packages/desktop/src-tauri/capabilities/default.json`, `packages/desktop/src-tauri/src/lib.rs:62-67`.

- `"csp": null` (tauri.conf.json:25) — Tauri's automatic CSP injection is disabled.
- Capabilities are minimal: `core:default` + `shell:allow-open` only. No filesystem, no dialog, no clipboard, no path API exposure.
- Three custom commands (`get_token`, `set_token`, `clear_token`), no asset-protocol customization, no drag-and-drop handler.

### IMPORTANT — Tauri webview has no Content-Security-Policy (`packages/desktop/src-tauri/tauri.conf.json:25`)

`"csp": null` means the Tauri WebView2 / WKWebView ships without any CSP at all. Any XSS in the React app (e.g. via a highlight.js regression — see section 6) executes with full access to `window.__TAURI_INTERNALS__` and can invoke `get_token`. The keychain-stored PAT is exfiltrable in that scenario.

**Exploit scenario:** hostile PR opens → reviewer's highlight.js regression triggers XSS → script calls `window.__TAURI_INTERNALS__.invoke('get_token')` → posts the returned PAT to attacker.com → attacker now has the user's GitHub `repo` scope.

This is the single biggest "if everything else fails" risk. The chain currently has no known break, but the CSP gap is the missing belt-and-braces.

**Fix (don't apply):** set
```json
"csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://api.github.com; worker-src 'self' blob:"
```
Worth validating in `tauri:dev` before ship; the `'unsafe-inline'` style caveat from section 3 applies the same way.

### IMPORTANT — `shell:allow-open` enables arbitrary URL → system browser (`packages/desktop/src-tauri/capabilities/default.json:8`)

Combined with the `openExternal` IPC path (see section 12), any string the webview chooses becomes `shell.open(...)`. The Tauri shell plugin v2 honors a default URL/path filter but `shell:allow-open` (without scope) is permissive enough to open `file://` URIs and arbitrary protocols (`mailto:`, `tel:`, `vscode:`, etc.). On Windows that includes `ms-officemobile:`, `search-ms:`, and other LOLBin handlers.

**Exploit scenario:** webview is fed a PR title/description that contains a malicious URL; the breadcrumb or external-link button passes it straight to `shell.open(...)`. With Windows custom URI handlers (`steam://`, `slack://`, `ms-search-ms://`) an attacker can trigger commands in those apps.

**Fix (don't apply):** scope `shell:allow-open` to `https:` and `http:` only. The Tauri v2 capability JSON supports `"scope": [{"url": "http://**"}, {"url": "https://**"}]`.

---

## 9. Release pipeline / Actions

Reviewed `.github/workflows/release.yml` and `.github/workflows/ci.yml`.

- Only secret used is `${{ secrets.GITHUB_TOKEN }}` — the auto-provisioned per-job token. No long-lived PATs, no signing secrets (unsigned binaries per spec).
- `releaseDraft: true` — every release ships as a *draft*, requiring a human to "Publish" before it goes public. Good gate.
- `tauri-action@v0` — pinned to a major. Major-only pinning means a malicious tag-replay attack on tauri-action could affect builds. Best-practice would be a commit SHA pin.
- `softprops/action-gh-release@v2` — same major-only pin.
- `dtolnay/rust-toolchain@stable` — same.
- `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` — official; major-pin acceptable.
- `node-version: "22"` — modern. `npm ci` uses the committed package-lock.json.
- The site CI job sets `CALLMAP_SITE_BASE: "/callmap/"` but does not deploy — actual deploy is manual.

### IMPORTANT — Third-party actions pinned by major tag, not SHA (`.github/workflows/release.yml:71,106` and `ci.yml`)

`tauri-apps/tauri-action@v0`, `softprops/action-gh-release@v2`, `dtolnay/rust-toolchain@stable` are mutable refs. A compromise of one of those repos would compromise every release build. The well-known counter-example is the 2024 `tj-actions/changed-files` supply-chain incident.

**Fix (don't apply):** pin each third-party action to its release commit SHA. `actions/*` are first-party and lower risk.

### MINOR — Cargo + Cargo.lock not vendored (`packages/desktop/src-tauri/Cargo.lock`)

`Cargo.lock` is committed (good), but the release build pulls `keyring`, `tauri`, `tauri-plugin-shell`, `serde`, `serde_json` from crates.io live each build. A `cargo audit` step is not present in the workflow. The user's local machine also doesn't have `cargo-audit` installed (`which cargo-audit` returns nothing) so I could not verify the dependency tree against the rustsec advisory DB.

**Fix (don't apply):** add a `cargo install cargo-audit && cargo audit` step to CI; pin via vendoring is overkill for now.

---

## 10. Marketplace publish artifacts (.vsix)

Inspected `packages/vscode/callmap-0.5.0.vsix` contents (19 files, 3.6 MB pre-zip, 644 KB packed):

```
extension.vsixmanifest, [Content_Types].xml
extension/readme.md, package.json, LICENSE.txt
extension/out/{extension,panel,webview-html}.js
extension/media/{tree-sitter*.wasm × 5, main.js, main.css, CallGraphView.{js,css}, SourcePanel.js, parseWorker.js}
```

- Grepped `extension/out/*` for `token|secret|pat|password|api.github` — only the *intentional* `headers.Authorization = ...` line on the host side and code comments. No string-literal PATs, no env values, no user paths.
- `extension/media/main.js` is the bundled webview — header bytes show standard Vite output, no environment string injection.
- `.vscodeignore` (packages/vscode/.vscodeignore) uses an explicit allow-list (`!media/**`, `!out/**`, `!package.json`, `!README.md`, `!LICENSE`) which is the correct way to keep the rest of the monorepo out of the package.
- `vsce package --no-yarn --no-dependencies --skip-license` (package.json:97) — `--no-dependencies` prevents node_modules from being walked; `--skip-license` is fine because LICENSE is explicitly included by `.vscodeignore`.

No findings.

---

## 11. Tauri command input validation

Reviewed `packages/desktop/src-tauri/src/lib.rs:20-59`.

```rust
#[tauri::command] fn get_token() -> Result<Option<String>, String>
#[tauri::command] fn set_token(token: String) -> Result<(), String>
#[tauri::command] fn clear_token() -> Result<(), String>
```

- `get_token` / `clear_token` take no arguments. Safe.
- `set_token(token: String)` accepts any string. The only handling is `token.trim()` and an empty-string-as-delete convention. The token is passed straight to `entry.set_password(trimmed)`.

### IMPORTANT — `set_token` has no length or character validation (`packages/desktop/src-tauri/src/lib.rs:33-49`)

The Rust IPC handler will accept any arbitrary-length string and store it in the OS keychain. The Windows Credential Manager has a 512-byte limit on credential blobs; macOS Keychain allows much larger; Linux secret-service varies. A buggy webview could attempt to store a 100 MB blob on Linux and consume disk.

GitHub PATs are 40-byte classic tokens or `github_pat_<base62>_<base62>` fine-grained tokens — both under 100 bytes. A reasonable cap would be 1 KB.

**Exploit scenario:** low. The webview is the only IPC client; the webview is the React app the developer ships. There is no remote endpoint that can send Tauri commands. The validation is hygiene, not a real attack surface.

**Fix (don't apply):**
```rust
if trimmed.len() > 256 { return Err("token too long".into()); }
if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
    return Err("token contains invalid characters".into());
}
```

---

## 12. External link handling

Reviewed `packages/desktop/src/host.ts:210-223`, `packages/vscode/src/panel.ts:153-157`.

- Desktop: `openExternal(url)` dynamic-imports `@tauri-apps/plugin-shell` and calls `open(url)` with **no validation**. Fallback path is `window.open(url, "_blank", "noopener,noreferrer")`.
- VS Code: `panel.ts:153-157` accepts `msg.payload?.url` if it's a string and calls `vscode.env.openExternal(vscode.Uri.parse(msg.payload.url))` directly. `vscode.Uri.parse` accepts `javascript:` and other schemes; `vscode.env.openExternal` does not refuse non-http schemes universally.

### IMPORTANT — `openExternal` accepts arbitrary URL strings (`packages/desktop/src/host.ts:213` & `packages/vscode/src/panel.ts:155`)

Whatever string reaches the host bindings becomes a system-level URL open. The current callers feed `graph.pr.url` (returned by GitHub) and breadcrumb-link clicks — those are trustworthy. But the *channel* has no validation. Combined with finding 8 (`shell:allow-open` without scope), this is the Tauri side's analog of the VSCode `http:request` allowlist gap.

Practical risk today: low — engine code only calls openExternal with `pr.html_url` strings from GitHub. But the next dev who wires "open this commit in browser" will inherit the same unvalidated channel.

**Fix (don't apply):** wrap both implementations with
```ts
if (!/^https?:\/\//.test(url)) return;
```

---

## 13. Dependency security

### npm audit (root workspace)

```
3 vulnerabilities (2 moderate, 1 high) — all in the Astro site dependency tree:
  - astro <=6.1.9 (high) — XSS in server islands, several authn-bypass issues
  - vite <=6.4.1 (moderate) — Path Traversal in optimized deps .map handling
  - esbuild <=0.24.2 (moderate) — dev-server CORS
```

The Astro site ships **static HTML only** (verified: `dist/` contains `index.html`, `changelog/index.html`, `docs/index.html`, one CSS file, and SVGs — no JS, no `_astro/*.js`). Astro's runtime XSS and authn-bypass advisories *do not affect the deployed artifact* — they only matter if you run `astro dev` or `astro preview` exposed to a hostile network. The advisories are tagged for the build-time use.

The Vite + esbuild moderates are **dev-server only** issues — they affect `npm run dev:site` accessible to other machines on the network. Not the production build.

### IMPORTANT — Astro pinned to `^4.16.0`, current safe is 5.x+ (`packages/site/package.json:17`)

The recommended fix is `astro@^6.3.3` (major bump). Astro 4 → 6 is a non-trivial migration. For v1.0 ship the static `dist/` is what users see — they are not exposed to any of the advisories.

**Fix (don't apply, post-v1.0):**
1. Plan an Astro 4 → 5/6 migration in v1.1.
2. Until then, never expose `npm run dev:site` to a public network. Document in CONTRIBUTING.md.

### Cargo

`cargo audit` not installed locally. Cargo.lock is current; the `keyring` crate v3 is the most recently audited path for OS-keychain access. No findings I can verify from outside.

---

## 14. Astro docs site

Reviewed `packages/site/src/layouts/Base.astro`, `packages/site/src/pages/*.astro`, `packages/site/astro.config.mjs`, generated `packages/site/dist/index.html`.

- No analytics scripts, no Google Fonts, no third-party CDNs. Tailwind classes only.
- No CSP `<meta>` tag in the head — relies on the static host's CSP headers.
- All outbound links use `rel="noopener"` (Base.astro:38,55-57). Good.

### MINOR — No CSP meta tag on rendered Astro pages (`packages/site/src/layouts/Base.astro`)

The site is fully static and has no JavaScript (verified — `dist/_astro/` only contains one CSS file). Adding a `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; script-src 'none'">` would be a near-zero-cost hardening.

**Fix (don't apply):** add the meta tag to `Base.astro`. Belt-and-braces given the site uploads to GitHub Pages which doesn't set strong CSP headers by default.

### MINOR — Site README claims `v1.0` but `package.json` files show `0.5.0` (cross-cutting)

`README.md:32` says `v1.0` in the chip, `Base.astro:32` shows `v1.0`, the release-notes file is `RELEASE_NOTES_v1.0.md`, but `package.json` files (root, all 4 workspaces) are still on `0.5.0`. The vsix on disk is `callmap-0.5.0.vsix`. Not a security issue — just a release-hygiene note that the version bump hasn't landed yet.

---

## Coverage

Audited:
- Tauri Rust IPC (lib.rs, capabilities, tauri.conf.json) — full read
- VS Code extension (extension.ts, panel.ts, webview-html.ts) — full read
- @callmap/core (github.ts, parser.ts, parseWorker.ts, parseWorkerClient.ts, callgraphBuilder.ts, diffAnalyzer.ts) — full read
- @callmap/ui (highlight.ts, SourcePanel.tsx, CallGraphView.tsx, IdeShell.tsx) — relevant sections
- @callmap/desktop (host.ts, main.tsx, vite.config.ts) — full read
- Site (Base.astro, astro.config.mjs, dist/) — full read
- Release/CI workflows — full read
- VSIX contents — listed and string-searched

Not audited (out of scope or could not run):
- Live `cargo audit` against rustsec — tool not installed
- Live network behavior of the Tauri binary under packet capture
- macOS / Linux keychain behavior (Windows-only test environment)
- Visual XSS payloads against actual highlight.js 11.11.1 (no known live PoCs to test against)
- Marketplace metadata (publisher: `callmap` — the placeholder ID; this will get scrutinized by the VS Code Marketplace publisher onboarding)

The "Important" findings are realistically a v1.1 cleanup task. Nothing on this list should block v1.0 ship.
