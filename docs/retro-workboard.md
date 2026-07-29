# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state + work
> log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`) wins on ANY conflict.
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **CURRENT-STATE ONLY.** When a block goes stale, REWRITE it — never stack a new session layer on top.
> The prior 1,250-line accretion (session logs 2026-07-25 → 29) was collapsed here at owner direction
> ("rewrite in full", 2026-07-29); its load-bearing content lives in git history, commit messages,
> memories (`MEMORY.md`), and the law docs. Full rewrite baseline: `git show HEAD~1:docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** (a dropped SSE `turnCompleted` that locked the composer forever; a
multi-speaker engine that threw the characters away) — is the thing this rebuild exists to kill. So the
posture is **drive it live, then pin it**, not paranoia. Judge every "done" against that frame.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version ([[kiss-yagni-suspended-build-maximal]]).
Package cake: kit ← contracts ← db ← server ← client + sealed ui; one-directional flow (rpg ↔ chat only
via injected ops). Read `docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ ▶▶▶ CURRENT STATE — 2026-07-29 (READ FIRST) ═══

**`HEAD = 02259150` · `origin/main` SYNCED (0 ahead).** The entire two-day live-dogfood run is committed
AND pushed — no outstanding push. Tree clean. Dev stack UP: server `:8788` on `adopt-or-start` +
`WIRE_CAPTURE=on DEBUG_TOKEN=dbg` · gen 8B `:8703` loaded · vite `:5173` standalone. (Stack is NOT
containerized; do not loop `stack.sh restart` from the host — [[dev-stack-fights-host-automation]].
`pnpm stack restart --force` is the sanctioned re-env/teardown; its boot timeouts were bumped to
180s/240s so a cold fleet spawn no longer false-times-out.)

**LANDED + PUSHED (recent, newest first — one line each; git log has the detail):**
- **Live-dogfood verification pass** — #54/#55 send-availability gate proven both directions
  (engine-off → refuse-with-cause-reason / engine-up → enabled); impersonate closed end-to-end on the
  live 8B via wire capture (substituted nudge, held user-voice, `literalMacroLeaks:[]`); #57 HMR no-strand;
  `--force` cold-spawn timeout root-caused + fixed (`f81e56d9`).
- **Impersonate / guided-macro saga** (`23bcfe62` streaming impersonate · `22ec5de7` nudge+scenario
  macro-substitution · `b7ad92df`/`caf8f7e6` steeringNote render + Ruling-B `{{char}}`=cast). See
  [[nudge-macro-substitution-seam]], [[identity-macro-resolution-is-chat-owned]].
- **#54/#55 composer send-availability gate** (`7a5991dc`+`b29f4086`+`14491414`) — engine-AGNOSTIC honest
  refusal; posture-off / no-conn / adopt-only-but-down all refuse with a cause-specific reason.
- **D22 member-card-viewer** (`29f25983`/`bceac4e3` HIGH clamp-bypass fix/`8dada55b`/`82a8a97a`) —
  read-only clamped card; internals never cross the wire below `full`.
- **#56 `pnpm stack --force`** (`ce46540e`) + timeout fix (`f81e56d9`) — the dance-ender.
- **#57 HMR-login strand fix** (`4020790c`) — auth guard no longer redirects on a transient `/me` blip.
- **Crunchy-cluster + comprehensive rpg lane** (pushed @ `adec7490` and before) — RPG overlay model,
  per-field pins, editability, front-door toggle (#40), pool hints (#36), inventory location/list/icon
  (#37), wand v2 two-row (#49), narrated date (#9), extraction-rides-transcript (W-B), fork-clone +
  host-or-sole-human gate (W-F), dangling-pointer heal (W-G), extraction sad-path establish-when-unset.
- **Parity-plus program** (`ecf98497` + follow-ups) — P0–P6 first-class, panel redesign adopted,
  deception `<lie>`/omniscience (P3), immersive HTML cards (P4), CYOA (P5), macro×rpg feed (P6),
  reasoning host-only cut proven E2E, multi-auth-mode E2E harness. D109/D110 minted.

## ═══ ▶▶▶ WHAT'S LEFT — reconciled against git + code 2026-07-29 ═══

**OWNER DECISION (the only one gating build):**
- **persona=character model (#3)** — parked; owner "need to think about this one." Everything else in the
  panel/rpg decision set is resolved. See [[persona-pin-prompt-resolution]].

**DEFERRED BUILD (gated on owner dogfood populating panels):**
- **W-H panel-beauty** — the visual punch list (dead space · tiny Waystone · asymmetric roster cards ·
  duplicate orb numbers · header hierarchy · bar-color grammar). Punch list in
  `reports/design-refs/panel-redesign/DESIGN.md` §4.2. Runs a side-eye pass ([[side-eye-fix-all-findings]]).
- **W-I / D111 ledger** — mint the D-ledger entry for the crunchy-cluster redesign (deception→tracker
  ruling A, extraction-transcript, wand map, fork-clone). D111 is the next free number.
- **#24 MU picks pane** — VERIFIED NOT BUILT (no in-chat user-macro picks UI in client features). Typed
  macro inputs resolve to defaults until it lands. Design = extend the ChoiceBlock variables pane
  ([[mu-store-flat-vs-nested-wall]]).
- **#1 meta-tabs redesign** (settings / injections / preview) — UNCERTAIN: `assembly-preview-panel.tsx`
  + `draft-context-tabs.tsx` exist, but "done vs the mockups" is unconfirmed. Needs a side-eye/fidelity
  pass before it's called done (folded into task #34).

**VERIFICATION OWED (built, not yet live-proven):**
- **D22 sub-`full` member tiers** (name-avatar / sheet / +lore + HiddenTierNote) — code + CT verified,
  NOT live. Needs a multi-user NON-host view; the 1:1 dogfood chat can't expose it. Fold into the next
  multi-user E2E ([[e2e-live-verification-facts]] — needs Playwright's own adopt-only stack).

**OPTIONAL / PARKED:**
- **#16 engine auto-sleep/wake live pass** — infra built + already characterized
  ([[vllm-sleep-fleet-facts]]: `/health` lies asleep, wake ~3s, ~34GiB/card). A formal step-9 live
  observation through a real turn is optional polish, not a gap.
- **`permitsHost` dead-code purge** (`auth/decide.ts`, true orphan) — go/no-go, owner call.
- Flakes/facelift micro-ledgers · grimstone theme ship-or-skip (add anytime as a theme.json, zero code).

**SCOPED OUT (owner):** rpg game-data macro fields (quest titles / pool hints / widget labels) do NOT
render macros — deliberate, not a bug.

## ═══ STANDING FACTS + POSTURE ═══

- **NEVER push to origin** unless owner explicitly authorizes THAT push (per-push, doesn't generalize).
  Default is commit-only. Commit cadence relaxed — batch small changes ([[commit-cadence-relaxed]]).
- **`pnpm check` = STATIC only** (no tests); read `reports/verify.json`. Battery (`pnpm test`) is
  separate. `verify:push` (pre-push) is a superset: check + tests:node(fresh CT) + e2e-smoke — have the
  stack up first ([[verify-push-stricter-than-commit-gate]]). Owner may ask for a plain
  `git push --no-verify` to skip it.
- **SERIALIZE main-tree build lanes** — 2+ concurrent lanes on main cause gate-thrash + index collisions
  ([[concurrent-main-lanes-gate-thrash]], [[work-directly-on-main]]); worktree-isolate genuinely
  concurrent big lanes ([[worktree-isolate-concurrent-lanes]]).
- **NEVER bare `sqlite3` on the live `orbweaver.db`** (deletes WAL, stales readers) — use the app /
  `/api/_debug/*` / an immutable copy ([[sqlite3-wal-danger-on-live-db]]).
- **Wire-capture harness** (the diagnostic lever): `WIRE_CAPTURE=on` + `DEBUG_TOKEN=<t>` →
  `GET /api/_debug/wire/captures?chatId=…` (host-gated, `x-debug-token`), replay `messages` at
  `POST 127.0.0.1:8703/v1/chat/completions` to ablate ([[nudge-macro-substitution-seam]]).
- **Orchestration:** delegate volume (scout/executor/mech-executor/security-executor), keep judgment;
  non-trivial work passes a fresh-context verifier/side-eye before "done" ([[fable-5-orchestration-audit]]).
- **Resume read order:** this block → `git log --oneline -15` → `MEMORY.md` (auto-loads) →
  `docs/architecture/core/AGENTS.md` only if touching architecture. Mocks:
  `reports/design-refs/panel-redesign/DESIGN.md`.
