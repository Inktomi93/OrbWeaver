# Task #7 + #12 — gap-list RE-DERIVATION (the originals died in lane transcripts)

> **Why this file exists.** Two board rows (`docs/retro-workboard.md:289-292`) cite gap lists that were
> never written to disk: task #7 ("3 sibling harnesses on the weak hatch + OWNER_GROUP/WIRE_CAPTURE latent
> leak notes") and task #12 (the group-engine + OR-F5 post-verifier non-refuting gaps). Both were
> re-derived HERE from a cold adversarial read of the merged code on `main` — this is a fresh derivation,
> not a transcript recovery, so a row the original lane had is not guaranteed to be a row below, and vice
> versa. Audit lane, **docs-only: nothing in this file was fixed.**
>
> Evidence bar: every row carries a `path:line` receipt. Negative claims carry two methods + a count.
> Rows marked **PROVEN** were executed, not reasoned — the command and its literal output are quoted.

---

## Section 1 — task #7: the test-harness env-inheritance class

### 1.0 The mechanism (source-pinned, verified — do not re-derive)

Three facts define the class. All three were read, not assumed:

1. **The app has exactly one env reader and it MERGES a file into `process.env`.**
   `packages/server/src/foundation/env/index.ts:110-131` — `loadEnvFileWithOverride` writes the repo-root
   `.env` INTO `process.env` (with `override:true` by default), and `:431` parses the frozen `env` object
   out of `process.env`. Two hatches exist and they are NOT equivalent:
   - `ORB_ENV_NO_FILE` (`:114`) — skips the file **entirely**. The strong hatch.
   - `ORB_ENV_NO_OVERRIDE` (`:133`) — keeps the load, flips only PRECEDENCE. **Every key the caller did
     not set is still FILLED from the operator's `.env`.** The weak hatch.
2. **A child stack inherits the runner's ambient env.** Playwright's webServer builds its child env as
   `{...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...options.env}` —
   `node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/lib/runner/index.js:834-837` (read at
   source, not inferred). `scripts/probes/probe-fire.ts:100-102` and
   `scripts/probes/_kit/snap-stage.ts:291-293` spread `...process.env` explicitly.
   `tests/e2e/support/global-setup.ts:120-127` does the same into the multi-user-seed child.
3. **`OWNER_HANDLES` / `OWNER_GROUP` are read at CALL TIME straight off `process.env`, bypassing the
   frozen `env` object** — `packages/server/src/domain/sessions/substrate/role-policy.ts:57` and `:69`
   (a sanctioned `sole-env-reader` exemption, `Tier-2-Foundation.md:13`). So they are governed by whatever
   is in `process.env` at request time, which is exactly what the two hatches differ on.

**The live `.env` on this box** (key names only, values redacted): `AUTH_MODE=oidc`, `AUTH_FALLBACK=owner`,
`OWNER_HANDLES=<operator email>`, `OWNER_GROUP=<idp group>`, `DEBUG_TOKEN=<real>`, `WIRE_CAPTURE=on`,
`RPG_TRACE=on`, `ENGINES_POSTURE=adopt-only`, `OIDC_*`, `SESSION_SECRET`, `CREDENTIALS_KEY`. 18 keys total
(`rg -c "^[A-Z]" .env`). **No `VITE_*` key exists**, so the vite/CT `import.meta.env` injection arm of this
class is empty today (methods: `rg -n "^VITE_" .env` → 0 hits; plus the 18-key enumeration above).

**Who already got the strong hatch:** `vitest.config.ts:100` (`ORB_ENV_NO_FILE: "1"`) and all three e2e
mode projects (`tests/e2e/support/modes.ts:146`, `:196`, `:230`), with a test pinning it
(`tests/e2e/support/target-guard.test.ts:87-92`). **The three siblings below did not.**

### 1.1 The three sibling harnesses still on the WEAK hatch

Method: `rg -n "ORB_ENV_NO_OVERRIDE|ORB_ENV_NO_FILE" --glob '!**/node_modules/**' -g '!docs/**'` over the
whole tree (excluding the vendored `scripts/probes/st-goldens/sillytavern-runtime/` tree). Three
non-test, non-doc call sites set the weak hatch and none of them sets the strong one. This is the board
row's "3 sibling harnesses on the weak hatch", confirmed.

1. **`scripts/dev/multi-user-fixture.sh:61` — `export ORB_ENV_NO_OVERRIDE=1`.**
   *Gap:* the fixture pins ports/DB/assets/`AUTH_MODE=local`/secrets/`VLLM_DISABLED` (`:41-65`) but never
   `OWNER_HANDLES`. Under the weak hatch that key is FILLED from `.env` with the operator's email.
   *Consequence:* boot's `seedOwner` (`packages/server/src/entry/boot/seed-owner.ts:32-37`) provisions the
   operator's email as `role=owner`, and the seed step then looks for handle `owner`
   (`FIXTURE_OWNER_HANDLE=owner`, `:66-70`) and aborts — **byte-for-byte the 2026-08-08 e2e-smoke red that
   `modes.ts:80-93` documents**, just on the fixture instead of the e2e stacks. Worse on a re-run: a
   fixture DB seeded before the operator's `.env` grew `OWNER_HANDLES` already holds an owner row at handle
   `owner`, and D17's `users_single_owner_unique` partial index makes the second owner unrepresentable →
   `UNIQUE constraint failed: users.role` at boot (the exact stale-DB failure `modes.ts:96-102` records for
   `.cache/e2e-*`). Also inherited: `DEBUG_TOKEN` (real), `WIRE_CAPTURE=on`, `RPG_TRACE=on` → the fixture
   serves provider request bodies at `/api/_debug/wire/captures` on :8790 under the operator's real token.
   *Fix:* `export ORB_ENV_NO_FILE=1` **plus** the keys the fixture is currently getting from `.env` by
   luck — `OWNER_HANDLES=owner` (identity is fixture contract, per `modes.ts:90-93`) and
   `ENGINES_POSTURE=adopt-only` (the fixture never sets it; under `NO_FILE` it would default to
   `adopt-or-start`, i.e. the fleet-manager hazard the `.env` comment warns about). Mirror the e2e mode
   shape exactly. *Effort:* **S**.

2. **`scripts/probes/_kit/snap-stage.ts:307` — `ORB_ENV_NO_OVERRIDE: "1"` on the isolated snap stage.**
   *Gap:* the stage pins ports/DB/assets/`ENGINES_POSTURE` only (`:294-304`). `OWNER_HANDLES`,
   `OWNER_GROUP`, `DEBUG_TOKEN`, `WIRE_CAPTURE`, `RPG_TRACE`, `OIDC_*` all fill from `.env`.
   *Consequence:* bounded but real. `AUTH_MODE` is NOT one of them — `scripts/dev/stack.sh:180,215` pins
   `AUTH_MODE=single-user` into the child env, and under `override:false` the pin wins, so the stage does
   NOT boot in the operator's OIDC mode (a plausible-looking claim that is **false**; checked). What does
   leak: (a) the stage's `/api/_debug/*` surface is live on the offset port under the operator's REAL
   `DEBUG_TOKEN` with `WIRE_CAPTURE=on`, while the stage has a **copy of the dev DB**
   (`snap-stage.ts:261-272`) — i.e. real content behind a real token on a second port; (b) the rendered
   verdict of `snap --isolated` (the §L.6-sanctioned lane rendered-proof) is taken on a box-specific
   identity config. `RPG_TRACE=on` was checked and is **inert for pixels** — its only consumer is the
   `/api/_debug/rpg/traces` route registration (`packages/server/src/entry/app.ts:109-110`), so the visual
   surface is unaffected. *Fix:* this one is **NOT a blanket `ORB_ENV_NO_FILE`** — the stage boots on a
   COPY of the dev DB whose owner row sits at the operator's handle, so dropping `OWNER_HANDLES` makes
   `seedOwner("owner")` collide with D17's unique index and kill the stage boot. Correct shape: strong
   hatch + explicitly re-declare the keys the stage's copied DB requires (`OWNER_HANDLES` derived from the
   dev `.env` at stage-build time, `DEBUG_TOKEN` minted per stage like `probe-fire` does, `WIRE_CAPTURE`
   off unless asked). *Effort:* **M** (the DB-copy coupling is the work, not the env line).

3. **`scripts/probes/probe-fire.ts:110` — `ORB_ENV_NO_OVERRIDE: "1"`.**
   *Gap:* the best of the three — it pins `PORT`/`DATABASE_URL`/`DEBUG_TOKEN`(minted)/`AUTH_MODE`/
   `VLLM_DISABLED`/`CORPUS_AUTOINDEX`/`LOG_LEVEL` (`:103-118`), so the keys its header PROMISES are
   genuinely pinned. Residual: `OWNER_HANDLES`/`OWNER_GROUP`/`WIRE_CAPTURE`/`RPG_TRACE` still fill from
   `.env`. *Consequence:* the probe's throwaway DB is seeded with the operator's owner identity, so a probe
   of any identity/role-shaped route answers per-box rather than per-code — the failure mode is a probe
   result that does not reproduce on a clean checkout. `WIRE_CAPTURE=on` additionally arms the ring in a
   one-shot process (harmless). *Fix:* swap to `ORB_ENV_NO_FILE: "1"` (it already pins everything the
   server needs) and add `OWNER_HANDLES: "owner"`. *Effort:* **S**.

### 1.2 e2e-runner-side siblings (same class, different layer)

4. **`tests/e2e/support/trpc.ts:43` — `process.env["DEBUG_TOKEN"] ?? E2E_DEBUG_TOKEN`, unconditionally.**
   *Gap:* the fallback is documented as the `E2E_ALLOW_DEV_TARGET=1` path (`:39-40`), but the read is not
   gated on that flag, and `modes.ts:71` explicitly INSTRUCTS the operator to `export DEBUG_TOKEN=<value>`
   for that drive. *Consequence:* an operator who ran a dev-target drive and left the export in their shell
   sends the DEV token to the harness stacks on the NEXT ordinary `pnpm e2e` — those boot with
   `E2E_DEBUG_TOKEN` (`modes.ts:74`), so every debug witness (`fetchWireCaptures`, `inspectChatDb`,
   `fetchDebugErrors`) 401s and the `@live` specs red for a reason that is not in the diff. *Fix:* gate the
   override on `DEV_TARGET_ALLOWED` (already exported from `modes.ts:155`) instead of on the bare env key.
   *Effort:* **S**.

5. **`tests/e2e/support/trpc.ts:25` — `process.env["E2E_BASE_URL"] ?? SINGLE_USER.baseUrl`, a documented-dead
   var that still steers.** *Gap:* `playwright.config.ts:45-46` states outright that "the actor clients
   target their stack via the spec's per-project Playwright `baseURL` (not an env), so no `E2E_BASE_URL`
   threading is needed here" — and no mode sets it (`rg -n "E2E_BASE_URL" tests/ scripts/` → 3 hits, all
   comments or this read). *Consequence:* a stale `E2E_BASE_URL` export silently points the support tRPC
   client at a DIFFERENT stack than the browser specs drive, producing DOM-vs-DB parity failures that read
   as product defects. *Fix:* delete the env read (the derived default is already correct) or gate it on
   `DEV_TARGET_ALLOWED` like row 4. *Effort:* **S**.

6. **`scripts/dev/multi-user-seed.ts:33` — `SEED_BASE_URL` defaults to `http://127.0.0.1:8788`.**
   *Gap:* a seed script whose UNSET-env default is the operator's LIVE dev stack. Both current callers set
   it (`global-setup.ts:122`, `multi-user-fixture.sh:66`), so this is latent, not live.
   *Consequence:* it is the identical fail-open shape as the incident `modes.ts:13-16` records (globalSetup
   rewrote the operator's real `routing.roleDefaults`), one missing export away. *Fix:* require the var —
   throw with the fixture command in the message rather than defaulting. *Effort:* **S**.

7. **No enforcement covers the harness class.** `tests/e2e/support/target-guard.test.ts:87-92` asserts
   `ORB_ENV_NO_FILE` on every MODE PROJECT — nothing asserts it on the three sibling harnesses in §1.1, and
   `rg -n "ORB_ENV_NO_FILE" scripts/` returns **0 hits** (second method: the full-tree `rg` in §1.1 lists
   every hit; none is under `scripts/`). *Consequence:* the class is fixable but not RATCHETED — the next
   harness added will be born on the weak hatch, exactly as these three were.
   *Fix:* a structural gate over "files that spawn a stack" (`stack.sh` invokers + `...process.env` spreads
   into a child) requiring `ORB_ENV_NO_FILE`, with a named allowlist row for the deliberate
   `E2E_ALLOW_DEV_TARGET` path. `scripts/check/GATE-AUTHORING.md` + `pnpm gate:new`. *Effort:* **M**.

### 1.3 The OWNER_GROUP / WIRE_CAPTURE "latent leak note" — HONEST NEGATIVE for the node lane

The board row pairs the harness list with "OWNER_GROUP/WIRE_CAPTURE latent leak notes". The MECHANISM is
real (§1.0: `ORB_ENV_NO_FILE` blocks the FILE, not an exported shell var; role-policy reads both keys at
call time off `process.env`). **The BITE is empty today in the node lane** — measured, not argued:

- **PROVEN.** `OWNER_HANDLES=inktomi93@gmail.com OWNER_GROUP="Neo Users" WIRE_CAPTURE=on RPG_TRACE=on
  DEBUG_TOKEN=abc123 npx vitest run --project unit tests/server` →
  `Test Files 344 passed (344) / Tests 3871 passed (3871)`, exit 0.
- **PROVEN.** The same exports across the five most-exposed suites (`entry/auth/seam.test.ts`,
  `entry/debug-gate.suite.test.ts`, `entry/boot/seed-owner.int.test.ts`,
  `domain/sessions/substrate/role-policy.test.ts`, `foundation/observability/debug/wire-capture.test.ts`)
  → `5 passed / 127 passed`, exit 0.

Why it holds: `role-policy.test.ts` stubs the negative arms EXPLICITLY (`vi.stubEnv(OWNER_HANDLES,
undefined)` at `:138`, `vi.stubEnv(OWNER_GROUP, undefined)` at `:32`) rather than relying on ambient
absence, and `seam.test.ts:37` names `OWNER_HANDLES` as its own crafted var. **The residual exposure is
therefore a HYGIENE gap in the node lane, not a live defect** — and it is unratcheted: nothing stops the
next test from depending on ambient absence. The e2e lane's exposure is different and NOT probed here: a
shell export reaches those stacks through Playwright's `...process.env` merge (§1.0 fact 2) with
`ORB_ENV_NO_FILE` powerless against it; the forward-header mode notably pins neither `WIRE_CAPTURE` nor
`OWNER_GROUP` (`modes.ts:212-231`), so an exported `OWNER_GROUP` matching a spec's JWT `roles` claim would
elevate that actor to owner (`role-policy.ts:69-72`; the claim shape is the one
`tests/server/entry/http/auth-routes.test.ts:250` describes). *Fix for the class:* pin the full identity
+ debug key set on every mode's `webServerEnv` (they are fixture contract, per `modes.ts:90-93`), rather
than relying on the file hatch. *Effort:* **S**.

---

## Section 2 — task #12: group-engine (`984de4e50`) + OR-F5 (`05b69a9e9`) post-verifier gaps

Commits located by `git log --grep`: `984de4e50` "group-engine batch — narrator short-circuit, real
round-robin, dead-switch delete" (11 files), `05b69a9e9` "cache breakpoints count conversational depth, +
an admin depth knob" (22 files), `f71ff9586` (a 2-line biome follow-up, no gaps). Both were CONFIRMED by
their verifiers; the rows below are non-refuting residue found by a fresh adversarial read.

### 2.1 group-engine

1. **`packages/server/src/domain/chat/verbs/turn.ts:848` — F2's round-robin is a LIE when
   `allowSelfResponses` is on. PROVEN.** The chain passes `lastSpeaker: args.group.allowSelfResponses ?
   null : last`, and `pooledOrder` (`engine/select-speakers.ts:108-111`) returns the pool UNROTATED when
   `lastSpeaker === null`. With the chain's `maxSpeakers: 1` (`turn.ts:850`) the first roster seat wins
   every beat. Probe against the real module:
   `allowSelfResponses=false -> a b c a b c` · `allowSelfResponses=true  -> a a a a a a`.
   *Consequence:* the exact starvation F2 was merged to kill survives on a sibling toggle the UI renders
   directly beneath the policy select
   (`packages/client/src/features/chat/components/group-config-form.tsx:126-128` "Who speaks each round" and
   `:166-168` "Let a character reply to itself"), so a host who turns both on gets one character monologuing
   under a control labelled "Round-robin" (`group-config-form.tsx:29`).
   *Fix:* the ban and the rotation ORIGIN are two different questions — pass `last` always as the rotation
   origin and let `allowSelfResponses` suppress only the ban (a `banLast: boolean` param beside
   `lastSpeaker`, or a distinct `rotationOrigin`). *Effort:* **S** (engine + 1 chain int test).
   *Coverage:* none — `turn.int.test.ts:1008` covers the pooled chain at the DEFAULT
   `allowSelfResponses:false` only (`rg -n "allowSelfResponses" tests/server/domain/chat/verbs/turn.int.test.ts`
   → 0 hits).

2. **`packages/server/src/domain/chat/engine/select-speakers.ts:193-210` — F7's occurrence masking is
   per-CHOSEN-SPAN, not per-NAME, so a repeated long mention spuriously forces the short-named member.
   PROVEN.** `consumed.push(free)` records only the ONE span the longer name claimed; a second occurrence
   of the same long name is left unmasked, and the nested shorter name matches inside it. Probe against the
   real module with cast `["Aria", "Aria Stormborn"]`:
   `"@Aria Stormborn ... and later @Aria Stormborn again" -> ["aria-storm","aria"]`.
   *Consequence:* a human who emphasises one character by mentioning them twice silently forces a SECOND,
   unnamed character into the round (and, in a narrator room, also trips the F7 per-speaker coercion at
   `turn.ts:950` for a round the host never asked to be per-speaker). *Fix:* push EVERY span of a matched
   name into `consumed`, not just the chosen one. *Effort:* **S** (one line + one test case).

3. **`packages/server/src/domain/chat/verbs/turn.ts:951-959` — a forced `@mention` in a narrator room still
   MINTS the synthetic group character.** `groupCharacterId` is computed off `args.group.output`, not off
   the coerced `roundGroup` (`:950`). *Consequence:* a find-or-mint DB write on a round that provably does
   not use the id (`driveRoundVia` gets `group: roundGroup`, which is per-speaker). Deliberate per the
   `:945-949` comment ("the mint … still read the ROOM's own config") and harmless on a room that will
   narrate again — recorded as a **seam note, not a defect**. *Fix (if ever):* move the mint under
   `roundGroup.output === "narrator"`. *Effort:* **S**. *Recommendation:* leave it; the comment is honest.

4. **`packages/client/src/features/chat/components/group-config-form.tsx:126-128` — "Who speaks each round"
   (including "Smart (AI director)") renders unconditionally in a NARRATOR room, where F1 made it nearly
   inert.** Post-`984de4e50`, a narrator round short-circuits the director entirely
   (`turn.ts:742`); the contract (`packages/contracts/src/chat/metadata.ts:118-127`) says the field is kept
   on the arm for round-trip and now governs only the auto-chain's continue/stop probe.
   *Consequence:* the UI sells a per-round arbitration choice that, on this arm, buys one cheap probe — the
   `no separate reduced modes` posture wants an APPLICABILITY cue, not a hidden control.
   *Fix:* an applicability gloss under the select on the narrator arm ("the narrator voices the whole cast;
   this only decides whether an auto-chain keeps going"), matching how `:130-138` already conditions
   `scopedCards` on the arm. *Effort:* **S**. *Route:* `side-eye`.

5. **`packages/server/src/domain/chat/contract/metadata.ts:25-42` — the retired-key strip is READ-seam only;
   the import path was CHECKED and is SAFE (honest negative).** `RETIRED_GROUP_KEYS`/
   `stripRetiredGroupKeys` run inside `chatMetadataSchema`, and the chat-bundle import writes through the
   same seam — `packages/server/src/domain/chat/persistence/import-write.ts:379`
   (`metadata: … parseChatMetadata(ci.metadata)`). So a pre-2026-08-08 portability bundle carrying
   `groupCharacterId` is stripped, not refused. The strict WRITE boundaries
   (`transport/trpc/routers/chat.ts:56,444`; `domain/chat/verbs/roster.ts:166`;
   `verbs/start-chat.ts:96`) all take client-authored input whose sole producer
   (`features/chat/lib/group-config-model.ts`) dropped the key in the same commit. **No gap.** Method:
   `rg -n "groupConfigSchema|parseChatMetadata" packages/server/src` (all 4 write sites + all 9 read sites
   enumerated and classified).

### 2.2 OR-F5 (`promptCacheMinDepth` + conversational-depth placement)

6. **`packages/server/src/infra/providers/backends/openrouter/runners/chat/chat-completions.ts:64-70` — the
   `cacheMinTokens` FLOOR is measured with non-string rows counted as ZERO tokens.** The header at `:61-63`
   justifies the zero for the TARGET row ("it also cannot receive a breakpoint on this dialect"), which is
   true — but the same number feeds `prefixTokens` in
   `backends/kit/cache-control.ts:176-179`, where it is simply wrong. Tool-result rows and any multimodal
   (array-content) row therefore contribute nothing to the prefix measurement.
   *Consequence:* a genuinely long tool-heavy or image-bearing prefix reads BELOW `cacheMinTokens`, so
   `computeCacheBreakpointPlacements` returns `[]` and BOTH breakpoints are dropped — caching silently off
   on exactly the expensive turns, and the error direction is one-way (only false negatives).
   *Fix:* sum the text parts of an array content for the token estimate (placement eligibility stays
   string-only). *Effort:* **S**.

7. **`chat-completions.ts:117-146` — the `provider.cache` receipt reports breakpoints it did not place.**
   `emitCacheReceipt` computes `breakpointsPlaced` / `breakpointOffsets` by RE-RUNNING
   `computeCacheBreakpointPlacements` (`historyCacheOffsets`, `:117-128`), while the actual write at
   `:90-95` skips any placement whose target row is not a plain string
   (`typeof target.content === "string"`). *Consequence:* on precisely the histories of row 6 the
   instrument says "2 breakpoints placed" for a body that carries zero — a lying observability surface over
   a cost regression, and it is the ONLY signal (`instruments lie — verify the verifier`; D41 no-silent-
   degrade). *Fix:* have `placeHistoryCacheBreakpoint` return the placements it ACTUALLY wrote and report
   those, instead of recomputing. *Effort:* **M** (signature + both call sites + the receipt test).

8. **`packages/server/src/entry/compose/chat.ts:518-520` — a knob raised above the available history depth
   silently disables caching, with no warning.** `Math.max(req.cacheBreakpointFromEnd, knob)` can name a
   depth that `indexAtDepth` (`cache-control.ts:138-157`) cannot resolve on a short conversation → `[]`
   placements → no `cache_control` at all. The knob's doc
   (`packages/contracts/src/settings/index.ts:313-331`) argues correctly that the floor can only push the
   breakpoint DEEPER, but never states that "deeper than the history" means OFF.
   *Consequence:* an admin who sets 8 to "cache harder" turns caching off for every room under ~9 role
   groups and gets no signal anywhere. *Fix:* one `providerLog(… "provider.cache_depth_unreachable")` when
   a KNOB-RAISED depth resolves no index (the `anthropicCacheDirective` precedent at
   `cache-control.ts:38`), plus a line in the knob's help copy. *Effort:* **S**.

9. **`compose/chat.ts:509` — the knob is applied at ONE seam only.** `createRunChatTurnBridge` is the sole
   place `historyCacheBreakpointFromEnd` is composed (`rg -n "historyCacheBreakpointFromEnd"` → 4 non-doc
   hits: this line, the runner read at `chat-completions.ts:111`, the provider contract at
   `infra/providers/contract/chat.ts:129`, and a test). *Consequence:* today this is CORRECT and complete —
   there is no second producer — but nothing enforces it, so a future direct-Anthropic backend
   (`docs/architecture/proposed/connections/02-anth-direct.md:56` already declares the same field) would be
   born ignoring the admin knob. *Fix:* move the `Math.max` into the runner-facing seam, or add the floor
   to the provider contract's own doc as a stated obligation. *Effort:* **S**. *Severity:* forward-looking.

10. **`cache-control.ts:171` — the `[depth, depth+2]` pair has no test at the boundary where depth+2 runs
    off the front.** The code handles it (`index === undefined` → `continue`), and the added suite covers
    the depth axis well (`tests/server/infra/providers/backends/kit/cache-control.test.ts`, +169/-… in the
    commit). What is missing is the TRANSITION test: a history that clears the floor at `depth` and NOT at
    `depth+2` must still place exactly one breakpoint (`merge-clear needs transition test`).
    *Consequence:* a future refactor that hoists the floor check out of the loop would silently drop the
    single-breakpoint arm with the suite green. *Fix:* one test case. *Effort:* **S**.

### 2.3 FIX STATUS — §2.1 rows 1–2 + §2.2 rows 6–8, 10 (lane a8993af8, 2026-08-08)

Fixed in one commit; each carries a red-first receipt (the failing assertion is quoted in the lane report).
Two of this audit's own premises died on contact and are corrected here rather than left to rot.

- **Row 1 — FIXED.** `selectSpeakers` gained `banLast` (default true) beside `lastSpeaker`; `turn.ts`'s chain
  passes `lastSpeaker: last` ALWAYS and `banLast: !allowSelfResponses`, and `smartArbitrate` forwards it to
  its `natural` fallback so the `smart` arm's behavior is unchanged. Red: the doc's probe reproduced at the
  CHAIN tier (`turn.int.test.ts`) — `aria bryn cara / aria aria aria`, now `aria bryn cara / aria bryn cara`.
- **Row 2 — FIXED.** `resolveMentions` consumes EVERY free span of a matched name (`consumed.push(...free)`),
  not just the chosen one. The later-standalone-`@Aria` case is unchanged (selection is still per-occurrence).
- **Row 3 — untouched** (recorded as a seam note; the `:945-949` comment is honest). **Row 4 — untouched**
  (routed to `side-eye`). **Row 5 — no gap.** **Row 9 — untouched** (forward-looking, no second producer).
- **Row 6 — FIXED, premise corrected.** Array-content rows now contribute their text parts to the
  `cacheMinTokens` prefix (placement stays string-only). BUT the row's "tool-result rows … contribute
  nothing" is **FALSE on this dialect**: `toolResultMessages` sets `content: part.content`, a STRING
  (`ChatContentPart.tool-result.content` is `z.string`), so tool rows always counted. The zero-token class is
  ARRAY content only, which `buildHistoryMessages` cannot produce today (`chatHistoryText` drops image parts
  until D45 vision is wired) — so row 6 was LATENT, not live, and the fix is a correctness fix on a shared
  primitive plus its pin.
- **Row 7 — FIXED, and it was LIVE (not latent).** `placeHistoryCacheBreakpoint` now returns
  `{ messages, placedDepths }` — the depths a block was ACTUALLY written at — and `buildChatBody` hands the
  runner a `CacheWriteReceipt` the `provider.cache` line reports verbatim. The same re-derivation bug had a
  SECOND, reachable arm the audit did not name: `breakpointsPlaced` added `isAnthropicModel(model) ? 1 : 0`
  for the system block, while `buildSystemMessage` writes that block only when `systemPrompt.static` is
  non-empty. Red receipt: an empty static prompt on an Anthropic model reported **3** breakpoints over a wire
  carrying **2**. The system count is now observed off the built message too.
- **Row 8 — FIXED, at the placer rather than at compose.** `computeCacheBreakpointPlacements` emits
  `provider.cache_depth_unreachable` (warn, with `depth` + `conversationalRows`) when the REQUESTED depth
  resolves no index — the deeper `depth+2` leg stays silent, since it runs off the front on every
  short-but-cacheable room. `compose/chat.ts` cannot host this: it knows the knob but not the wire history's
  conversational depth, and re-deriving that axis there would be a second home for it. The knob's help copy
  now states that deeper-than-the-conversation means OFF (`contracts/settings/index.ts` + the admin hint).
- **Row 10 — PREMISE DEAD, no test added.** Both boundaries the row asks for were ALREADY covered when it
  was written: `cache-control.test.ts:153-156` is exactly the floor transition (clears at `depth`, not at
  `depth+2` → exactly one placement) and `:158-161` is the off-the-front case. A duplicate would be padding.
  The genuinely-uncovered adjacent boundary — the REQUESTED depth itself unreachable — is now covered by the
  row-8 pins (placement `[]` + the loud line + a silent-happy-path control).

---

## What this audit did NOT cover

- Task #7: the CT harness (`playwright-ct.config.ts`) sets no env at all; the class is empty there today
  only because no `VITE_*` key exists in `.env` (§1.0). Not re-checked after any future `.env` change.
- Task #7: no probe was run of the e2e lane under a polluted shell (it costs three stack boots); §1.3's
  e2e paragraph is source-pinned mechanism, not a measured bite.
- Task #12: the OR-5b/OR-7b PROBE scripts and `docs/design/openrouter-provider-findings.md` were read for
  intent only — their live-wire measurements were not re-run (they cost model credits).
- Neither section re-audited the pre-existing code the two commits touched but did not change (assembly
  `shape.ts`'s own depth computation; the `smart-arbitrate` engine).
