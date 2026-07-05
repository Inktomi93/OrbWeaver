# Sandbox build-order scratch (2026-07-04c — CHAT SURFACE largely landed + app RUNS)

> **SCRATCH, not law.** A session-handoff note for dev-container Claude sessions: the agreed
> build order + operational context as of commit `2ebd039`. The constitution
> (`docs/architecture/core/AGENTS.md` — read it IN FULL first), the D-ledger, and
> `Core-BUILD-PLAN.md`/`Core-Audits-and-Debt.md` WIN over anything here. Delete this file when
> it goes stale; update the date line when you land a wave.
>
> **SESSION 2026-07-04c — the CHAT SURFACE (Wave 1.1) is largely BUILT + the app RUNS at `/`
> (7 commits `1e94b90`→`2ebd039`, all green).** Landed: message-list surface (chatStyle bubble|flat|
> document + ghost-isolated streaming), composer (Pattern-B send + `stopping` phase + `chat.abort`),
> streaming (TTFT reasoning-block + `repairStreamingTail` + code-fence goldens), swipes
> (`chat.selectVariant` + keyboard), speaker attribution + `<speaker>` OKLCH coloring, the bus-reducer
> test, `chat.listMessages`. Cleared **PD-118** + **PD-58**; filed **PD-119** (message-list has no
> keep-mounted path). 3 client-factory type-bugs fixed. **34 gates** (test-presence-client +
> surface-in-a-container LIVE). The app mounts `ChatRoomSurface` at `/` (HomePage, draft landing).
> **NEXT LANE = the APP-SHELL** (the 4-region rail frame + welcome pane — the mockup's visual gap +
> the composition home for the character library). Then character library → panels → committed features.
> **Full session record (recipes, gaps, the agent-sdk/consent finding, the mockup-launch recipe,
> the neo-vs-corpus reconciliation): `scratch/chat-surface-lane.md`.** Earlier foundation record:
> `scratch/dev-tooling-support-kit-plan.md`. The TASK BOARD is the durable roadmap (#24–#34).**

## Where the tree is (so you don't re-derive it)

- **Phases 0–5 BUILT.** D48 tool-calling is DONE end-to-end (T1–T4; PD-54 cleared): wire seams,
  all four translator mappings + stream accumulator, `domain/tool-use`, and the chat recurse
  loop. T5 (MCP) ships with buddy, T6 (`runStructuredAgentTurn`) with crew CW2, T7 with client.
- **33 structure gates + 35 grit belts ACTIVE** (was 31/23 at session start — W1-0 added
  surface-purity/state-files/diagnostic-legibility + 3 raw-value grits + the async-safety eslint
  trio + the `--max-warnings 3` ratchet) + the solo-byte-identical property suite. `pnpm check`
  runs them all — they bite. 5 gates are DORMANT (built + self-tested, not in ALL_CHECKS):
  component-size-ui, test-presence-client, surface-in-a-container, monotonic-tests,
  audit-client-tests — see `Core-Enforcement-Active-Gates.md` for activation triggers.
- **CLIENT FOUNDATION WAVE LANDED (2026-07-04b) — the §11.7 prerequisite.** Test substrate
  (composed caller fixtures over the real services graph + factories + freshCountedDb + matchers,
  `tests/support/`); the CT harness (`routeTrpc` + `CtDataProviders` + `_ct-stories` convention +
  the QueryBoundary exemplar); the probe arsenal (`pnpm snap` ARIA-first agent eyes + DEADCSS/SSIM,
  `pnpm check:file` mid-tier verify, `pnpm check:show`, `trace:render/tail/fire`, `sse-tap`, record/
  perf-meter); client dev instrumentation ([trpc]/[perf] channels, TanStack Devtools shell,
  createGatedStore); the **@orb/ui Text/Heading primitive** (the one text seal — level→size
  hierarchy: h1 headline, h2+ title); the compose-only keystone now covers ALL of `client/src`
  (not just features); the stack supervisor `pnpm stack` (+ e2e webServer wired). Your autosave
  draft-mirror clobber fix (obligation-5 seed effect) also landed.
- **Baseline schema riders are IN** (pre-launch window used): crew CW1 tables,
  `card_evolution_proposals`, automation DDL, `global_variables`, `WORKLOAD_KINDS` = 18 with
  stub runners.
- **16 PDs burned 07-03/07-04** (95–100, 103, 106, 110–117 + 54). Remaining `ready` rows are
  all lane-absorbed (PD-101/102/104/107/108/109/112) — burn each WITH the lane that touches
  its surface, not as a separate pass.
- **AP0–AP2 + AP3-seating-half landed; the AP3 voicing chain is OPEN** (PD-17,
  `blocked:AP3-2-remaining`) — a seated agent cannot speak yet. Another session owns that lane
  unless Nate says otherwise.
- **PD-118 registered 2026-07-04b:** the `observability` per-request middleware is BUILT + exported
  + doc-claims "Mounted by entry/app" but is NOT in the `entry/app.ts` `.use` chain — so the
  `/api/_debug` trace ring is empty + no `X-Request-Id`. `FLAG[PD-118]` at the mount site. Mounting
  it (the fix) makes the doc claims true; it's the server-ring dependency PD-58's client sink needs.

## Key references + docs (where the truth lives — READ before building the thing they cover)

- **The law, in order:** `docs/architecture/core/AGENTS.md` (constitution — IN FULL first) →
  the specific docs it points to. For the CHAT LANE that's the UI set:
  `UI-Architecture-and-Layout.md` (§0–6: the cake arm, the 4-region shell, container model, React
  19.2 leverage, the KEEP/DUMP stack) · `UI-Gates-and-Lessons.md` (§7 footguns, §8 gate index, §11
  the neo-client-audit ratifications — surfaces/anchors, the bus reducer, the clamp-overlay) ·
  `UI-Primitives-and-Reuse.md` (§13 the primitive catalog + the surface→primitive map + §13.7/13.8
  the primitive contract) · `UI-Theming-and-Content.md` (§12 the message-content model + trust
  tiers) · the 5 `UI-Lib-*.md` companions (evidence mines). **The D-ledger wins any conflict.**
- **Testing law:** `Spine-Testing.md` (lanes by suffix, the fixture/factory contract, CT via
  Playwright not vitest-browser, determinism). **Enforcement state:** `Core-Enforcement-Active-Gates.md`
  (what's live/dormant — updated 2026-07-04b). **Types/dispatch:** `Spine-TypeScript-and-Patterns.md`.
- **Live debt:** `Core-Audits-and-Debt.md` (PD registry — PD-58 client-observability + PD-118
  tracing-mount are the chat-lane-relevant open ones). **Domain map:** AGENTS.md §6.
- **THIS SESSION's detailed record + the design surveys + the deferred follow-ups + the eslint/gate
  decisions:** `scratch/dev-tooling-support-kit-plan.md` (gitignored, persists on disk). It holds the
  W1 follow-up list (the Text-primitive/compose-widen DONE, the W1-1-folds-into-chat decision, the
  missing-API/primitive protocols verbatim for briefs).
- **Feature-coverage BAR = neo:** `reference/neo-tavern/src/client` — mostly-feature-complete; it is
  WHAT the chat surface must cover (message-list virtualization, ghost-row streaming isolation,
  swipes with n/m, guided-wand actions, persistent-guides-as-injections, chat overrides, preview-
  request, per-message persona attribution, group cast bar + `<speaker>` coloring — sweep it, don't
  reinvent the feature list). **Vibes = the design corpus:** `reference/design/` — Ember-on-charcoal,
  Geist, the Weave, the Manuscript no-bubble reading view; the design-system doc's THEMING is stale
  (real theme system = `proposed/themes-design.md`). Weighting is in the auto-loaded memory
  [[design-references-guidance]]: neo = features, corpus = vibes, UI law wins conflicts.
- **Unbuilt specs (staging, not law):** `docs/architecture/proposed/` — the chat-lane-adjacent ones
  are the panel specs + `themes-design.md`.

## The build order (agreed with Nate, 2026-07-04)

**Wave 1 — now (three parallel lanes, no file collisions):**

1. **Client feature surfaces** (Phase 6 core — the `UI-*.md` core set is the spec). **The client
   FOUNDATION is now DONE (2026-07-04b) — do NOT rebuild it; consume it.** Order inside the lane:
   **1.1 CHAT SURFACE FIRST = the immediate next chunk** (message-list over `@orb/ui/message-list`
   + composer + swipes/variants + streaming — the bus reducer `applyChatBusEvent` is still UNBUILT
   [it's the one client-foundation piece deferred to here], but the chat-stream store, query/trpc
   plumbing, form factories, ChatHandle, and the CT/probe harness all EXIST). The neo client
   (`reference/neo-tavern/src/client`) is the feature-coverage bar; the design corpus is the vibe
   (see the surveys in `scratch/dev-tooling-support-kit-plan.md` if re-derived). Then **character
   library** (`createCollectionSurface`), then panels (`proposed/connection-capability-panel.md`,
   `proposed/character-snapshot-ux.md`, `proposed/preset-form-mapper-elimination.md`). The
   Playwright CT + e2e harness EXISTS now (`tests/support/ct/` — routeTrpc, CtDataProviders, the
   QueryBoundary exemplar); land feature CTs against it. **W1-1 backfill folds into THIS lane
   (Nate-decided):** test the 8 client-foundation primitives as the chat surface consumes them +
   resolve `table.tsx` (§13.9 says it shouldn't be a primitive), then flip component-size-ui +
   test-presence-client into ALL_CHECKS. The D47/D49 client features (welcome, reasoning block +
   effort picker, gallery grids, token counter, inline images, `/imagine`) hang off chat. PD-58
   (client observability — HALF DONE: the [trpc]/[perf] channels + loggerLink landed; the
   error-boundary + `clientError` report-verb → server ring remains, and needs PD-118 wired) +
   PD-2's relocation check ride this lane.
2. **AP3 voicing chain → AP3-3** (`proposed/agent-principal-design/`) — the other session's
   lane; gates rpg.
3. **Automation A1–A3** (`proposed/automation-design/` — kit-only slice: macro-DX, CEL,
   global-var verbs over the landed table). Explicitly buildable now; agent-able.
   Fillers: `proposed/export-deferred-surfaces.md` (PD-109), `proposed/sessions-token-rotation.md`.

**Wave 2 — after AP3:** rpg (`proposed/rpg-design/` R-chunks; D48 is ready for it) + AP4a
closes the seat wave inside it.

**Wave 3:** chat-crew (`proposed/chat-crew-design/` CW1-behavior→CW2, then CW3/5/6 parallel).
**CW4 (director) is gated on Nate hand-playtesting the brief — do not start it without him.**
Also `buddy-observer-reaction-engine.md` (PD-45) whenever buddy gets attention.

**Wave 4 (Phase 7 grafts, independent):** databank → expressions → hub + saved-rosters →
imagery extensions + D47 standalones.

**Wave 5 (Phase 8):** automation A4–A8 (needs the two chat flags below), then plugin-design
Tier 2.

**Cheap-now chat flags (land during ANY Wave-1/2 chat touch, they're heisenbugs later):**
`initiator`/`automationDepth` turn-record fields + `getTurnOrigin` read; `variantSelected`
must fire AFTER the swipe path's variable re-fold (automation-design/05 review flags #1/#4).

## Operational rules for container sessions (hard-won, do not relearn)

- **You cannot `git push` from the container** (no keys, by design). Commit locally; Nate
  pushes from the host. Corollary: worktree agents base off **origin/main** — if origin is
  behind your local commits, tell agents to `git merge --ff-only <sha>` or brief them with
  the delta.
- **NEVER `git stash`/`pop`/`restore`/`checkout --`** — multiple sessions share the object
  store; fix mistakes by editing forward. Never touch another session's dirty files.
- **Read FULL `pnpm check`/`pnpm test` output** — never tail; mid-chain errors hide. Don't
  pipe exit codes you branch on (`cmd | tail` eats the code).
- **Sweeps:** `ast-grep` (`sg`) for structure, `/usr/bin/grep -a` for text (the wrapped grep
  skips some .ts as binary).
- **gitignore green-blindness:** after any feature commit, eyeball `git show --stat` against
  what you built — an unanchored ignore glob once silently ate a whole source dir at commit
  (`data/`; now root-anchored). biome also skips ignored dirs, so "green" ≠ scanned.
- **Verdicts are pre-made:** the judgment PDs were decided by Nate 2026-07-03 (rows carry
  **DECIDED** stamps). Don't re-litigate; don't invent new wire-or-strike decisions without
  him. `minisearch` is an approved @orb/ui dep. Config never binds to chats — the owning
  feature carries the association.
- **Committed means full treatment** — cold-read build bar, tests travel with code, no thin
  slices of committed features.
- **Local-light/vLLM suites self-skip in here** (`VLLM_DISABLED=true`, no `.models/`); that is
  expected, not a failure. The env floor is a strict `z.enum(["true","false"])` — the value
  `1` kills EVERY server suite at module load (fixed in devcontainer.json 2026-07-04; a
  running container built before that needs `export VLLM_DISABLED=true` or a rebuild).
  The firewall blocks everything but npm/GitHub/Anthropic/VS Code.

## Dev/verify tooling that now EXISTS (2026-07-04b — use it, don't reinvent)

- **`pnpm snap <route> [flags]`** — headless-chromium agent eyes against a running `pnpm stack`.
  TEXT-FIRST: `--text`/`--aria` (ARIA snapshot, ~5-8× cheaper than a PNG) before pixels; captures
  console/network/page-errors; **DEADCSS/EMPTYCSS** audit (catches a Tailwind utility that never
  compiled); `--diff` SSIM visual-regression + `--probe` render-determinism. ffmpeg IS in the
  container now. `RESULT` machine-line + CI exit codes.
- **`pnpm check:file <path...>`** — the MID-TIER verify (biome + eslint + owning-tsconfig
  incremental tsc + depcruise + zone-scoped gates; ~9s). Use at file-cluster boundaries. The
  per-edit hook does biome+depcruise only (eslint is NOT in the hook — it's ~5s/TSX edit, measured;
  eslint lives in check:file). `pnpm check:show [--errors-only|--gate|--file]` reads the last
  `check:structure` JSON so you READ results instead of re-running.
- **CT substrate** (`tests/support/ct/`): `routeTrpc(page, routes)` (stubs tRPC at the network
  boundary, both wire shapes, records inputs), `CtDataProviders`, the `_ct-stories.tsx` convention,
  the `query-boundary.ct.tsx` exemplar to copy. Node substrate (`tests/support/`): composed caller
  fixtures (owner/other/admin/anon + NOT_FOUND-vs-FORBIDDEN doctrine), factories
  (user/character/persona/chat/message), `freshCountedDb`, `toThrowTRPCError`/`toThrowProviderError`.
- **Server probes:** `trace:render/tail/fire` (blocked until PD-118 wires tracing), `sse-tap`
  (chat bus events). `record`/`perf-meter`/`stream-meter` for motion/streaming feel.

## The orchestrator-crew model (what worked this session — repeat it, RUN AUTONOMOUSLY)

**You are the MANAGER. Nate delegates — do NOT stop and wait for approval on reversible work.**
neo-tavern (`reference/neo-tavern/src/client`) is a FULLY-BUILT feature-complete target, so the
"what" is rarely ambiguous — make the calls, keep moving. Commit at each MAJOR milestone (bigger
commit chunks are fine — no need to micro-commit or ask before committing green work). Stop for
Nate ONLY on: genuinely destructive/irreversible actions, a real scope change, or a pure-aesthetic
design-direction call he'd want to own (e.g. the Heading size-scale this session — surface a
recommendation, proceed on it if he's away). Everything else: decide, build, verify, commit, report.

Dispatch per §4: the ORCHESTRATOR (main session) writes scoped briefs + reviews checkpoints +
integrates/verifies/commits; SONNET-5 builder agents do the writing, one DISJOINT file-set each,
each with a stop-and-report CHECKPOINT before mass edits (phrase it: "make your checkpoint your
FINAL message; you'll be resumed via SendMessage"). File-disjoint agents run in parallel; anything
sharing a file (esp. `report.ts`, `eslint.config.js`) sequences. The crew MUST carry two protocols:
**missing-API** (sg/grep sweep → full `docs/architecture/` sweep → THEN report missing → orchestrator
adjudicates → real gaps get a `Core-Audits-and-Debt.md` PD row + `FLAG[PD-n]` marker) and
**missing-PRIMITIVE** (sweep the @orb/ui fleet + package.json exports → check Base UI's shipped
`.d.ts` parts → check the §13.9 do-not-carve list → THEN request; a new primitive is its own §13.7
chunk, never inlined in a feature).

**Lessons learned (paid for — don't relearn):**
- **Never trust a truncated / "exit 0" read.** A wrapper's exit code and a `tail`ed output both
  lied this session (4 failing tests hid behind "completed exit 0"). Always capture the real
  `Test Files … | Tests …` counts. The pre-commit hook (full `pnpm check`) is the real backstop —
  it caught 3 things a green read missed (grit anti-drift gap, a CT-story eslint error, a
  test-layout mirror gap).
- **The gates find real bugs the moment they go live** — surface-purity, await-thenable, the
  test-presence sweep all surfaced genuine defects/debt. Trust them; report findings as debt, don't
  accommodate (dormant-gate + a tracked backfill beats a silenced gate).
- **Every custom gate/grit diagnostic MUST carry a full-doc-path/code-home pointer** (the
  `diagnostic-legibility` gate enforces it) — a bare "§7.5" is a dead pointer to an amnesiac agent.
- **A `.ct.tsx` verifies with biome+tsc+test:ct but NOT eslint** — run `pnpm exec eslint` on new
  TSX explicitly (a react-hooks error hid this session). `biome-ignore` ≠ `eslint-disable`.
- The bind-mount shares `.git` with the host — don't run git ops from both sides at once.

## Hard-won wisdom (2026-07-04c chat-app build — future-you: read BEFORE rediscovering)

**REAL Claude generation WORKS in-container — the whole recipe (this unblocks live chat + streaming gifs):**
- The `agent-sdk` provider backend authenticates via the HOST Claude Code login (`apiKeySource:"none"` = the
  Max/Pro sub), NO API key. `api.anthropic.com` is firewall-allowed; OpenRouter is BLOCKED. So orbweaver streams
  real Claude with zero key. Cheap check: `POST /api/trpc/connection.testClaudeAuth` (a mutation → POST) → `{ok:true}`.
- Point chat at it: `POST /api/trpc/settings.updateUserSettingsSection` with a **RAW batched body** `{"0":{...}}`
  (the tRPC transport is NOT superjson — do NOT wrap in `{"json":...}`), section=`routing`,
  patch=`{roleDefaults:{chat:{api:"agent-sdk",source:"max-pro-sub",model:"claude-haiku-4-5-20251001"}}}`. (Set in dev DB.)
- **A chat NEEDS a character to reply** — a character-less chat commits the user msg but generates NO assistant turn
  (no speaker). Start via `chat.startChat({characterIds:[...]})` (the boot seeder seeds default characters). Single-user
  dev auto-owns every request (no login). D17 owner-consent is wired (owner-initiated turns pass; 2026-07-04c).
- Verified live: pick a seeded character → chat → `claude-haiku-4-5` replies in-persona, streams into the ghost row.

**Self-verify the UI yourself (don't guess — snap/record are agent eyes):**
- `pnpm snap <route> [--text]` = static/ARIA/DEADCSS (0 page-errors + deadcss=0 = healthy). `pnpm record` = streaming/
  animation gif. **To DRIVE the composer in a Playwright script: `pressSequentially` + press Enter — NOT `fill`**
  (`fill` sets the DOM value but does NOT drive React's controlled `onChange`, so Send stays disabled; the composer
  sends on Enter). The dev TanStack-devtools float button OVERLAPS the composer Send → use `--jsclick`/Enter, not a click.
  Import `@playwright/test` (not `playwright`); run scripts FROM /workspace so node_modules resolves.
- The design MOCKUP is runnable in-container: esbuild-compile `reference/design/neo-tavern/*.jsx` (unpkg/React CDN is
  firewall-blocked) → serve → snap against it. Recipe in `scratch/chat-surface-lane.md`.

**Orchestrator crew playbook (what worked — repeat it):**
- **Plan-first checkpoint for BIG/architectural/security/@orb/ui-seal lanes** (app-shell, streamdown, consent,
  active-chat). The plans caught real issues + builders reverse-engineered runtime behavior (Streamdown's minified
  defaults, the owner-only-credential invariant). **Build-through for small well-specified lanes.** Every plan this
  session was excellent — trust the crew, but review the plan on the load-bearing ones.
- **Builders flag gaps HONESTLY (missing-API) instead of hacking** — this is THE thing that makes green mean something.
  Not once did a Sonnet-5 builder stub improperly. Trust their green checkmarks BECAUSE of this discipline.
- **Parallel lanes: keep file sets PROVABLY disjoint + ONE merged verify** (`pnpm check` + targeted node/CT, account
  for the message-list CT flake #33), OR `isolation:"worktree"`. **HOLD commits until a co-running wave settles** — the
  pre-commit hook runs the WHOLE-tree `pnpm check`, so ANY in-progress sibling file breaks the commit. Commit the wave
  once all lanes land + a full merged verify passes. (Downside: a big bundled commit; upside: never a red tree.)

**RECURRING PATTERN — domain is AHEAD of the transport router (wire thin-through, don't assume missing):** a feature's
read/write verb almost always EXISTS in `domain/<x>/` but is NOT exposed on the tRPC router. Happened ~9× this session
(listMessages · selectVariant · abort · editMessage · setMessageHidden · deleteMessages · forkChat · listMessageVariants
· character pagination). SWEEP `domain/<x>/contract/service.ts` + the verbs FIRST; if it exists, wire a thin pass-through
procedure (member/owner-gated IN the domain, mirror the sibling proc) + a transport test. Some bus events are also
declared-never-emitted (PD-117) — the server emit may lag. Also: some reads are UNPAGED (character.list, listChats) →
`useSuspenseQuery` not `createCollectionSurface` until a `{items,nextCursor}` cursor is added.

**Foundation-primitive lesson:** the client factories (createEntityMutation/useGatedQuery/createCollectionSurface) were
built against an older TanStack + NEVER typechecked against a real tRPC consumer → 3 latent type-bugs surfaced the moment
the chat surface consumed them. **Build a real consumer early to validate a foundation primitive** (a mock hides the
variance). Small gotchas: `@orb/ui/src/lib/` compiles WITHOUT the DOM lib (use structural DOM types for a browser hook
there); tRPC `infiniteQueryOptions` needs a SINGLE `cursor` object field (not sibling cursor/cursorId); the Streamdown
seal overrides `remarkPlugins` ONLY, never `rehypePlugins` (or the `allowedTags` additive-schema merge silently breaks).

## The `/reference/` corpus (gitignored, read-only)

The docs cite neo/ST evidence one-line (e.g. "`tool-calling.js:565`"). Those targets are
mirrored INSIDE the repo so container sessions can verify them (only this folder is mounted):

- `reference/neo-tavern/` — neo's source (src/docs/tests/tools/scripts + root configs).
- `reference/upstream/` — neo's evidence base: **sillytavern** (the `tool-calling.js`/
  `openai.js` cites), **marinara-engine**, **guided-generations**, stmp, cardshark,
  card-curator, card-refinery.
- `reference/design/` — Nate's design-goal set (DESIGN.md, design-system/, brand/voice HTML).

READ-ONLY provenance — never edit, never import from, never copy wholesale (the
carry-a-neo-pattern reflex is the documented failure mode; port DECISIONS, not code).
It is gitignored, so ignore-respecting tools skip it: search with `/usr/bin/grep -a` or
`sg --no-ignore`; Glob/Read work normally. Refresh by re-running the rsync from the host
(it is a frozen snapshot, 2026-07-04).

## Quick commands

- `pnpm check` (biome+eslint+tsc+types+33 gates+depcruise, ~47s) · `pnpm test` (full, ~5min,
  3511 tests) · `pnpm vitest run <path>` (targeted) · `pnpm check:structure` (gates only) ·
  `pnpm check:file <path>` (scoped mid-tier) · `pnpm check:show` (read last result)
- `pnpm stack start|start-fg|stop|status|logs` (server+vite; env-pinned, container-safe) ·
  `pnpm snap <route> --text` (agent eyes) · `pnpm test:ct <file>` (Playwright CT)
- Registry: `docs/architecture/core/Core-Audits-and-Debt.md` (live PDs) ·
  `docs/architecture/core/Core-Enforcement-Active-Gates.md` (gate/grit state) ·
  `docs/architecture/history/Core-Debt-Cleared-Ledger.md` (done)
