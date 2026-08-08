---
kind: design
status: proposed
updated: 2026-08-03
---

# Node 21 → 26 maximal-adoption program

> The complete blueprint for adopting the Node 22–26 platform surface across orbweaver — every finding
> probe-verified or receipt-swept on this tree (2026-08-03, worktree `node-investigation`), every wave
> implementor-executable without improvisation. POSTURE (owner-ruled): **maximal — the modern spelling is
> THE spelling.** No "adopt when needed", no "opportunistic". The only deferrals in this document are
> EXTERNAL blockers (a browser that has not shipped), each with a named trigger. Enforcement (§8) exists
> so agents cannot regress to the old spellings.
>
> Companion (separate, owner-scheduled, ONE-SITTING law): `tsx-shedding-migration-spec.md`. This program
> is independent of it and can land before it; W1's lib/typing work shrinks nothing there and conflicts
> with nothing here.

## §0 Ground truth — the toolchain matrix (probe receipts)

Every probe run on THIS tree (node 26.5.0 · ts7 oracle = typescript 7.0.2 · tsc lib 6.0.3 · tsx 4.23.1).

**Runtime: everything works today.**

```
RegExp.escape: function | withResolvers: function | Set.union: function | groupBy: function
| getOrInsert: function | Iterator.concat: function | Error.isError: function | Temporal: object
| undici: 8.7.0 | loadEnvFile: function
```

`using` (explicit resource management) executes correctly under BOTH runtimes — tsx (esbuild transform)
and bare node 26 (native, type-stripped): `in scope false → disposed → after scope`.

**Types: the ts7 oracle's lib lags V8 14.6.** Under `lib: ["es2025"]`: `RegExp.escape`,
`Promise.withResolvers`, Set methods, `Object.groupBy` all typed ✓; `Disposable`/`Symbol.dispose`,
`Map.getOrInsert`, `Iterator.concat`, `Error.isError`, `Temporal` all MISSING ✗. Under
`lib: ["esnext"]`: Disposable clears; the other four STILL missing (TS has not shipped them).
Both fixes probe-verified green:

- `lib: ["es2025", "esnext.disposable"]` is a VALID minimal delta (probed) — takes `using` typing.
- A root ambient declaration file covers the rest (probed compiling clean; exact content in §1).

## §1 W1 — toolchain foundation (the enabling wave; everything else depends on it)

1. **`tsconfig.base.json`**: `"lib": ["es2025"]` → `"lib": ["es2025", "esnext.disposable"]`. The two
   browser programs (ui/client) and tests-dom compose their own `lib` arrays — extend each with
   `"esnext.disposable"` alongside their dom entries. Annotate why (this section).
2. **`platform.d.ts` at repo root** (sibling of `reset.d.ts`, same distribution mechanism — every
   program's include already carries `${configDir}/../../reset.d.ts`; add `platform.d.ts` beside it in
   tsconfig.base include, root tsconfig include, tests-dom include). Content (probe-verified):

   ```ts
   // Ambient declarations for V8 14.6 surfaces TypeScript's libs do not ship yet (probe 2026-08-03:
   // absent even under lib:["esnext"] on ts7 7.0.2). DELETE each block when the lib catches up —
   // the duplicate-declaration error at that moment is the reminder.
   interface Map<K, V> {
     getOrInsert(key: K, defaultValue: V): V;
     getOrInsertComputed(key: K, callback: (key: K) => V): V;
   }
   interface WeakMap<K extends WeakKey, V> {
     getOrInsert(key: K, defaultValue: V): V;
     getOrInsertComputed(key: K, callback: (key: K) => V): V;
   }
   interface ErrorConstructor {
     isError(value: unknown): value is Error;
   }
   interface IteratorConstructor {
     concat<T>(...iterables: Iterable<T>[]): IteratorObject<T, undefined, unknown>;
   }
   ```

   Coupled sites (corrected at landing, W1 2026-08-03 — the original list was short by three): the base
   include is OVERRIDDEN by **five** configs, each of which must list the file itself — `tsconfig.json`,
   `tsconfig.tests-dom.json`, AND `packages/{ui,client,db}/tsconfig.json`. Plus
   `scripts/verify/selection.ts` routing: `reset.d.ts` was routed to the GRAPH program ALONE, which is
   wrong for a root ambient file — measured, the graph carries `@types/node`, which independently
   declares Disposable/`getOrInsert`/`isError`, so a graph-only route MASKED 5 of the 6 real per-package
   errors and `types:packages` would have been SKIPPED on an ambient edit. Both root `.d.ts` files now
   route to every program (`ROOT_AMBIENT_DTS`). `tsconfig-routing-parity` cannot catch this class: it
   filters `.d.ts` out of its universe. `tests-type-membership` does not cover root files either (it
   enumerates `tests/**` + `playwright/**` only). Temporal types deliberately NOT here — §6.
3. **Engine floor becomes a wall** (audit finding: `engines >=26` is declarative-only today — no
   `engineStrict`, and ZERO workspace packages carry engines):
   - **`engineStrict: true` in `pnpm-workspace.yaml`** (top-level key). NOT `.npmrc` — this document
     originally said `.npmrc` `engine-strict=true` and that is a NO-OP on our pnpm. Probe, W1
     2026-08-03, pnpm 11.15.1, four arms against an unsatisfiable `engines: {node: ">=99"}` with a real
     dependency: `.npmrc` alone → **exit 0, installed**; `engineStrict` alone → exit 1
     ("Your Node version is incompatible…"); both → exit 1; control (`>=26`) → exit 0. pnpm 10.6+ moved
     its settings out of `.npmrc`. No root `.npmrc` is created: an inert `engine-strict` there is worse
     than nothing (a reader greps it and believes the wall exists), and this repo is pnpm-only.
   - `"engines": { "node": ">=26" }` into all six workspace package.jsons (root already carries it).
     Verified: this does NOT move `pnpm-lock.yaml`.
   - Keep `.nvmrc` as the version-manager hint it is.
4. **Spine-TypeScript-and-Patterns.md** gains the §8 ADOPT/AVOID table (draft text there) — doctrine
   lands in the SAME wave as the machinery it governs (fix-at-landing).

Floor: full static (`pnpm check`) + `pnpm typecheck` on all programs (the lib/dts changes touch every
program's world).

## §2 W2 — undici on lock (the firewall's substrate)

Findings (all receipts in the sweep):

- `infra/network/egress.ts` is the ONE undici consumer (`Agent`, `buildConnector`,
  `setGlobalDispatcher`) and is KEEP-grade — it is already the lowest-level correct primitive: custom
  connector (DNS-rebind-safe lookup + private-range rejection + allowlist), per-request pinned Agents,
  manual redirect loop with re-validation, streamed byte cap, unref'd deadline composed with the caller
  signal via `AbortSignal.any`. Nothing in Node 26 replaces any of it.
- **The pin violates its own comment.** Catalog `undici` resolves 7.28.0; the comment promises "tracks
  Node 26's bundled undici major"; node 26.5 bundles **8.7.0**; npm latest is **8.10.0**.
- **The cross-copy dispatcher contract HOLDS today** (probe: npm-undici 7.28 `setGlobalDispatcher` +
  canary connector → node's global `fetch` dispatched into it; `connector hits: 1`, rejection
  propagated as cause). The entire SSRF backstop rests on this shared-symbol contract and NOTHING
  currently tests it. Probe note: use a normal port — port 9 is on the fetch bad-port list and
  rejects PRE-dispatch (a probe that never exercises the dispatcher reports a false gap).

Work:

1. Bump catalog `undici` → `^8.10.0` (honoring the tracks-the-bundled-major comment). Verify at bump:
   the egress surface compiles (Agent ctor options, `buildConnector` signature, `setGlobalDispatcher`) —
  undici 8's breaking changes are mostly interceptor/API-surface; egress uses the stable core.
2. **Mint `tests/server/infra/network/dispatcher-contract.int.test.ts`** — the tripwire: install a
   canary `Agent` whose connector records + rejects, call GLOBAL `fetch` against a TEST-NET address on
   a normal port, assert the connector was hit and the rejection cause propagated. This turns "the
   firewall governs node's fetch" from an upstream courtesy into a red-on-break invariant (any future
   node or undici bump that breaks the symbol contract fails loudly). Restore the prior dispatcher in
   teardown (`setGlobalDispatcher(getGlobalDispatcher())` captured before).
3. Egress battery (existing egress unit/int tests) is the wave floor.

## §3 W3 — dotenv dies (semantics preserved)

Findings: single call site — `foundation/env/index.ts:84` `loadDotenv({ override: !skipOverride,
quiet: true })`; `skipOverride` honors `VITEST`/`ORB_ENV_NO_OVERRIDE` (:83). No dotenv-expand, no
interpolation anywhere. The OVERRIDE-by-default semantics are load-bearing ("a checked-in dev .env wins
over a stale shell export"). `process.loadEnvFile()` is NOT a drop-in: it never overrides.

Work — platform-pure replacement that keeps the semantics:

```ts
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
// dotenv died 2026-08 (Node-26 program §3): util.parseEnv is the platform parser; the override
// merge (checked-in .env wins over a stale shell export unless VITEST/ORB_ENV_NO_OVERRIDE) is OURS
// and stays explicit here — process.loadEnvFile() cannot express it.
function loadDotenvFile(override: boolean): void {
  let raw: string;
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    return; // no .env — same silent no-op dotenv had (quiet:true)
  }
  for (const [key, value] of Object.entries(parseEnv(raw))) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
```

Coupled: `tests/server/foundation/env/index.test.ts:10-25` re-stubs — it `vi.doMock("dotenv")` today;
rewrite to point the loader at a fixture path (inject the path or stub `readFileSync` at the seam) —
prefer adding an optional `path` param over mocking builtins. Remove `dotenv` from
`packages/server/package.json` + catalog. The four comment-only references
(`multi-user-fixture.sh:59`, `probe-fire.ts:16`, `snap-stage.ts:305`, `stack.sh:141`) get their prose
updated to name the new loader. Post-kill enforcement: §8's biome `noRestrictedImports` entry.

**LANDED 2026-08-03 (W3) — three corrections to the sketch above, each measured:**

1. **`parseEnv` is NOT byte-parity with dotenv@16.6.1.** A 30-input case-by-case comparison found exactly
   two deltas. (a) A UTF-8 BOM: dotenv stripped it, `parseEnv` keeps it IN THE KEY, so a BOM'd `.env`
   silently renames its FIRST key to `﻿KEY` and the real key quietly keeps its default — the exact
   silent-misconfiguration class this loader must not ship. The landed loader strips the BOM. (b) dotenv
   also honored a non-standard `KEY: value` separator; `parseEnv` ignores such a line. No `.env` in this
   repo or on this box uses it, and re-implementing a vendor dialect would defeat adopting the platform
   parser — ACCEPTED, and pinned by a test so it stays deliberate. Everything else (comments, blank/junk
   lines, `export ` prefixes, single/double/backtick quotes, `\n` escapes in double quotes, literal
   multiline quoted values, inline `#` comments, CRLF, duplicate keys, unterminated quotes, empty file)
   is identical.
2. **No `path` param and no test-only export were needed.** The loader stays cwd-relative exactly as
   dotenv was (`path.resolve(process.cwd(), ".env")`), and the test drives the REAL production path by
   `process.chdir()`-ing into a throwaway dir holding a crafted `.env` (vitest `pool: "forks"` makes
   `chdir` available). That also replaced the `vi.doMock("dotenv")` bleed-guard — an empty temp cwd is
   what now keeps a developer's repo-root `.env` out of the schema tests. Both override arms are asserted
   end-to-end, including the `ORB_ENV_NO_OVERRIDE` hatch, so a future swap to `process.loadEnvFile()`
   turns them RED.
3. **§8's `noRestrictedImports` dotenv entry landed HERE, not in the §8 wave.** The §9 "gates land last"
   ordering exists because a gate needs its violations burned down first; this ban had exactly one
   violation and W3 removed it, so shipping the ban in the same commit is the fix-at-landing rule. The
   `luxon` entry still waits on §6's trigger.

Adjacent PRE-EXISTING defect found while sweeping (fixed in the same commit, orchestrator-ruled):
`probe-fire.ts`'s header promised its `PORT`/`DATABASE_URL`/`DEBUG_TOKEN` pins beat a repo-root `.env`,
but `serverEnv()` never set `ORB_ENV_NO_OVERRIDE` — so a checked-in `PORT`/`DATABASE_URL` would have
pointed `pnpm trace:fire` at the operator's live dev DB. It was 1 of 4 stack-spawning harnesses missing
the hatch (`snap-stage.ts`, `multi-user-fixture.sh`, `tests/e2e/support/modes.ts` ×3 all had it); now
4 of 4. One omission from a consistent house pattern, not a class — no gate minted.

## §4 W4 — platform-primitive burn-down (exhaustive; every site enumerated by the sweeps)

Each item: the sites are the COMPLETE match set from the 2026-08-03 sweeps; the implementor re-runs the
stated pattern first (audit lists are snapshots) and burns the delta too.

1. **Sleeps → `node:timers/promises` `setTimeout`** (zero current imports; 6+ hand-rolls, three of them
   verbatim-duplicated `realSleep`): `vllm/engine/wake-gate.ts:50`, `vllm/engine/supervisor.ts:239`,
   `entry/compose/chat.ts:1045`, `scripts/dev/engines.ts:99` (post-fix line ~119),
   `scripts/dev/engines-ctl.ts:42`, `scripts/probes/probe-fire.ts:92,204`. The three `realSleep`
   duplicates die entirely — the import IS the shared spelling. Injection seams that take a `sleep` fn
   for determinism keep the parameter; the DEFAULT becomes the platform import.
   LANDED W4 2026-08-03, all seven sites; `compose/chat.ts`'s `delay` dep is now the bare import.
   Re-sweep deltas: (a) `client/src/features/auth/lib/route-guards.ts:24` (`wait`) is a BROWSER sleep —
   `node:timers/promises` does not exist there, so it is permanently OUT of this item and the §8 SLEEP arm
   needs a `packages/{client,ui}` carve-out or it lands red on a site with no legal fix; (b) ~30 hand-rolled
   sleeps live under `tests/**` (vitest/playwright, all node-side) and were NOT burned — they are pure
   idiom churn in test scaffolding, but the §8 SLEEP arm WILL flag them, so that gate's landing owes either
   a `tests/**` scope decision or a burn-down pass. Kit purity re-verified for this item: `ast-grep -p
   'setTimeout($$$)' -l ts packages/kit packages/contracts` → scannedFileCount=136, ZERO matches, so no
   sleep seam lives below the isomorphic line and `node:timers/promises` never crosses it.
2. **`[...x].sort(fn)` → `x.toSorted(fn)`** — LANDED 2026-08-07 (the W4 residual burn-down lane).
   **Census CORRECTED at landing — the "49 sites" here was a stale snapshot, low by more than half**
   (the fourth §-list in this document to die that way): the real sweep over `packages/**` + `tests/**`
   found **115** sites, split **94 CONVERT / 21 KEEP** by the TYPE CHECKER (a ts-morph tsconfig-loaded
   project, `type.getApparentType().getProperty("toSorted") !== undefined` — the semantic test, immune to
   `NoInfer<…>` wrappers and unions of array arms; ZERO came back ambiguous). Rubric as written: the swap
   is 1:1 when the spread existed only to avoid mutating an ARRAY; an iterator/Set/Map materialization
   (`[...m.entries()]`, `[...new Set(x)]`) KEEPS its spread. Two brief-level classifications were WRONG on
   the tree and the checker caught both: `contracts/rpg/extraction.ts:477` (`[...offending]`) is a `Set`,
   and `chat/memory/build/digests.ts:284` (`[...env.groups]`) is a `ReadonlyMap` — both KEEP.
   Sweep pattern: ast-grep `[...$X].sort($$$)`, run in BOTH `-l ts` and `-l tsx`.
3. **Set algebra** — 13 sites: literal difference `contracts/rpg/snapshot.ts:129` →
   `A.difference(B)`; spread-unions (`discovery/verbs/catalog.ts:105`,
   `discovery/cooccurrence/generate.ts:111`, `server/kit/custom-parameters/index.ts:39`,
   `plugin-host/membrane.ts:101`, +8) → `.union()` where both operands are Sets (arrays first get
   `new Set(arr)` only when the result is a Set anyway — never churn array math into Set math).
4. **Group-by** — `??=[]).push` at `scripts/probes/rpg-extraction/local-8b-vehicles.ts:569` →
   `Map.groupBy`/`Object.groupBy`. Sweep the shape again post-W1 (`($X[$K] ??= []).push($V)` and the
   Map get-or-set-array idiom) — the earlier sweep classified most Map hits as legit memoization;
   memoization sites are `getOrInsert` targets instead (item 6).
5. **Deferred promises → `Promise.withResolvers`** — LANDED 2026-08-07 (the W4 residual burn-down lane).
   **"The two true resolver-captures" was wrong — there were EIGHT**, and the two this list named were
   never converted at the time. The live set: `client/lib/agent-bridge.ts:22` (app-ready signal),
   `client/features/preset/hooks/use-preset-autosave.ts:110` (the fork-choice ask, captured into a REF —
   the shape the §8 gate arm's own detection had missed), `chat/engine/engine.ts:1484` (lock-lost
   barrier), `chat/verbs/turn.ts:1858+1865` (the DeltaBridge arrival re-arm, hoisted into one `arm()`
   minter), `transport/trpc/stream/frame-queue.ts:188` (drain wake), `local-light/model-cache.ts:148`
   (orphan guard), `entry/compose/chat.ts:558` (drain notify — its `noLoopFunc` biome-ignore dropped with
   the executor, shrinking that file's suppressions-baseline budget 9→8). The QuickJS-bridge deferreds
   (`membrane.ts:638`) are `ctx.newPromise()` — NOT candidates, different mechanism.
6. **Get-or-set memoization → `Map.getOrInsert` / `getOrInsertComputed`** — sweep
   `$M.get($K) ?? ($M.set($K, $V), $V)` variants and the `if (!m.has(k)) m.set(k, …); m.get(k)!`
   shape. The earlier census counted ~129 broad matches; the implementor classifies by the rubric:
   value cheap to construct → `getOrInsert`; construction has cost/effects → `getOrInsertComputed`;
   anything whose set-path differs from its get-path (TTL caches, eviction) stays.
7. **`RegExp.escape` kills `kit/strings.escapeRegExp` AND its independently-minted duplicate** — LANDED
   W4 2026-08-03. **Site list CORRECTED at landing: the original "8 consumers / 3 files" was a stale
   snapshot, short by four files** (the third §-list in this document to die that way — `.npmrc`
   engine-strict was inert, §1.2's coupled-site list was short by three; the §-lists were written from
   one sweep and never re-swept, so re-run every pattern before executing a bullet). The real set:
   `kit/speaker-label/index.ts` (:93 — a bare `.map(escapeRegExp)` reference the call-shaped codemod
   pattern misses — :168, :218, :247), `kit/world-info/index.ts` (:91 **and** :92),
   `db/src/client/index.ts` (:204 — the backup-file regex), `server/src/kit/reasoning/index.ts` (:40, two
   calls), `server/src/domain/chat/engine/select-speakers.ts` (:160),
   `scripts/probes/impersonate/score.ts` (:74, :79), plus each file's import line and
   `tests/kit/strings/index.test.ts` (three tests deleted with the function, NOT re-pointed at the
   platform — asserting V8's escape output is a tautology; the literal-match invariant is exercised by the
   consumers' own suites). SEPARATELY: `infra/providers/backends/kit/openai-compat/body.ts` never imported
   kit at all — it carried its OWN `REGEXP_META_RE` + local `escapeRegExp` at :49-52 (the doc's ":214" was
   a call to that copy), so this item is a kit deletion AND a local re-mint deletion.
   Behavior verified before the delete (probe, node 26, 0x0000-0x2100 × flags `""`/`"u"`/`"g"`, plus every
   real call-site regex shape over 31 adversarial names): ours escaped `$()*+.?[\]^{|}`; `RegExp.escape` is
   a strict SUPERSET (+102 code points: control/whitespace, `/`, the other punctuators, leading alnum as
   `\xHH`); ONLY-OURS = none; zero match/replace differences; `RegExp.escape` introduces no capture group,
   so `leadingLabelRe`'s `\1` backref numbering is unaffected. Kit is isomorphic and `RegExp.escape` is
   browser-baseline — no gate. Post-kill enforcement: §8 gate arm.
8. **`Error.isError` hardens the ONE narrowing seam** — `kit/error-message/index.ts:10` swaps
   `err instanceof Error` → `Error.isError(err)` (~50 consumers inherit cross-realm correctness
   through the seam for free). DO NOT touch the membrane's guest→host path: `sandbox.ts:68-75`
   (`readError`) duck-types via `ctx.dump()` deliberately — QuickJS values are dumps, not Error
   instances of ANY realm; `Error.isError` is wrong there and the sweep confirmed the two
   membrane-side `instanceof` checks (`membrane.ts:687`, `sandbox.ts:389`) sit on HOST-side promise
   rejections (same-realm, correct as written). The remaining ~58 same-realm `instanceof Error`
   catches stay — the seam swap covers the boundary risk; churning 58 correct sites buys nothing.
   LANDED W4 2026-08-03; the non-swap reasoning is now recorded in the seam's own header so a future
   sweep does not "finish the job" into the membrane.
9. **`.at(-1)`** — 6 `arr[arr.length-1]` sites; **`findLast`** — 1 (`probes/impersonate/run.ts:221`).
   Mechanical.
10. **`Array.fromAsync`** — 1 clean adopt (`scripts/probes/trace-render.ts:207`); `storage/zip.ts:347`
    KEEPS its loop (early-throw byte-cap mid-iteration is the point); the corrected sweep pattern for
    the future: `for await (const $X of $Y) { $$$ }` (the `const` is REQUIRED — the bare-`$X` pattern
    silently parses to zero matches; paid-for lesson).
11. **Iterator helpers** — adopt where the chain is iterator-terminal: `rpg/substrate/reveal.ts:70`,
    `discovery/verbs/archetypes.ts:109`, `image-analytics/retrieve.ts:132` (`[...m.values()].map` →
    `m.values().map(...).toArray()`); chains ending in `.sort()` (`chat/substrate/
    prompt-transforms.ts:56`) materialize anyway — convert only the filter/map prefix when it drops an
    intermediate array, else keep.
12. **Abort modernization** — the rubric, applied per-site over the 11 forward-proxy sites and 14
    `Promise.race` sites the sweeps enumerated (lists in the receipts appendix):
    - pure timeout race (`setTimeout`+reject, no cleanup semantics) → `AbortSignal.timeout` on the
      operation, or `scheduler`-free race removal;
    - merging an external signal with an internal one → `AbortSignal.any([...])` (4 sites already do
      this — the house spelling exists);
    - forwards that run CLEANUP on abort (listener does work beyond aborting a controller) → KEEP the
      listener, note why inline;
    - deadlines that must not hold the process open → KEEP manual `setTimeout(...).unref()` composed
      via `AbortSignal.any` (`egress.ts:296-299` is the sanctioned archetype — `AbortSignal.timeout`
      cannot unref; this is a DECLARED platform limitation, not our debt).

    **VERDICT, rubric applied per-site W4 2026-08-03: ZERO actionable swaps. Every site KEEPS**, and the
    house spellings were already at SIX sites, not the four this bullet claims (`egress.ts:299`,
    `vllm/engine/client.ts:38`, `vllm/surfaces/embed.ts:22`, `chat/engine/engine.ts:1367` +
    `AbortSignal.timeout` throughout `fleet-control`/`supervisor`). The keeps fall into four classes:
    (1) **the raced operation is not signal-aware** — `agent-sdk` `query.accountInfo`/`mcpServerStatus`/
    `getContextUsage` take no signal, and `PromptTransform.apply` / `flush-barrier`'s tracked flushes are
    opaque promises, so there is nothing for `AbortSignal.timeout` to abort (a race is the ONLY mechanism);
    (2) **the timeout's rejection payload is load-bearing** — `catalog`/`summarize`/the probe watchdogs
    reject a typed `ProviderError(kind:"server", retryable:true)` that feeds the provider taxonomy;
    `AbortSignal.timeout` yields a bare DOMException; (3) **the forward's target is an AbortController
    INSTANCE, not a signal** — the SDK's `options.abortController`, so `AbortSignal.any` has no consumer
    (`runner.linkAbort` + the three inline copies); (4) **cleanup-on-abort / unref'd deadlines** — the
    sanctioned archetypes. Two keeps are non-obvious enough to now carry an inline note naming the
    mechanism: `backends/kit/idle-timeout.ts` (`.any` would PROPAGATE the caller's abort `reason` into
    `fetch`, and `classifyTransportName` regexes error name+message — a reason containing
    "timeout"/"connection"/"network" would reclassify a CANCELLED turn as a retryable fault and re-run it;
    re-aborting our own controller flattens every cause to a plain AbortError and keeps the provider
    classifier independent of the chat domain's abort vocabulary) and `workloads/engine/runner.ts` (the
    per-ROW link is explicitly `removeEventListener`ed in `finally` against a process-lifetime worker
    signal; a composite signal cannot be un-linked). `host-token.ts:96` and `runner.linkAbort` gained the
    same treatment.

Confirmed already-modern (no work, receipts recorded): structuredClone is the sole clone mechanism
(2 uses, zero hand-rolled deep-clones) · `Object.hasOwn` hand-rolls zero · fs is `rmSync`/`cpSync`/
`globSync`-modern with zero promisify-wrappers and zero rimraf/chokidar deps · EventEmitter+`on()`
async-iteration is the bus idiom (modern; EventTarget migration would be churn) · SSE rides tRPC
subscriptions, no raw event-stream to modernize · crypto seams (scrypt+HMAC+timingSafeEqual password;
AES-256-GCM credentials) are correct primitives with nothing Node-26-improvable; no Ed25519 surface
exists so 26's raw-key/context additions are N-A.

## §5 W5 — `using` / `await using` (the disposal wave)

Toolchain: proven (§0) — native under node, transformed under tsx, typed after W1's lib delta. Biome's
`useDisposables` is enabled but **INERT on this wave's surfaces** (measured at landing): the rule carries
the `types` domain, and biome's type service does not resolve `Disposable`-ness across a package boundary
into `node_modules` — scoped `biome check` on the plugin-host reported zero diagnostics both before and
after adoption. It is a same-file ratchet, not the coverage the original text implied; the real enforcement
here is the per-site reasoning below plus the suites.

Server seams, in adoption order (the resource type gains `[Symbol.dispose]`/`[Symbol.asyncDispose]`,
then call sites become `using` declarations):

1. **QuickJS handles (plugin-host)** — `membrane.ts`/`sandbox.ts`/`port.ts` (+ `realm.ts`/`marshal.ts`,
   which the original list missed and which carry the same shape), dozens of `.dispose()`-in-finally
   sites, the repo's documented UAF territory (`membrane-async-ctx-alive-guard`). The ctx.alive guard
   stays; `using` replaces the try/finally scaffolding, not the liveness law.
   **CORRECTED at landing (W5 2026-08-03) — NO WRAPPER IS NEEDED.** The original text said to "wrap the
   handle acquisition seam once (`using h = scoped(ctx, …)` returning a Disposable wrapper)". That is
   dead: `quickjs-emscripten-core@0.32.0` already ships the protocol. `QuickJSHandle` =
   `StaticJSValue | JSValue | JSValueConst`, all `Lifetime`, which `extends UsingDisposable`, whose
   `[Symbol.dispose]()` calls `.dispose()` (`dist/index.d.ts:650-663`). So `using h = ctx.newObject()`
   works directly, and a `scoped()` indirection would only put one more layer between a reader and the
   liveness law. **The hazard the wrapper framing hid: `Lifetime.dispose()` calls `assertAlive()` and
   THROWS on a second call** — so every handle with CONDITIONAL ownership must stay hand-managed
   (the `handler`/`apply` that transfer to `collectTool`/`collectTransform`, the positional arg handles
   quickjs-emscripten frees itself, and the escaping `deferred` in `attachAsync`). Adopting `using`
   there "for consistency" ships a crash.
2. **Lock handles** — `domain/chat/verbs/turn.ts:1390,1486,1632,2130,2334` (`handle.release()` in
   finally ×5): the type is `ActiveTurnHandle` (`domain/chat/contract/active-turns.ts`), not `LockHandle`;
   it `extends Disposable` with `[Symbol.dispose]` ALIASED to the existing idempotent `release`, which
   stays the named operation for non-scope-shaped callers.
3. **File handles / staging dirs** — `storage/variant-cache.ts:80`, `stage-dir.ts:20`, `cas.ts:164`
   (+ `cas.ts:97` `fsyncDir`). Node's `FileHandle` already carries `[Symbol.asyncDispose]`. **The two
   atomic-write sites need an EXPLICIT BLOCK, not a function-scoped `await using`**: write→(fsync)→CLOSE
   must complete BEFORE the `rename` publishes, and a function-scoped declaration disposes at the END —
   after the rename and after the parent-dir fsync.
4. **PRAGMA toggles** (`db/client/index.ts:294-298,410-426`) — restore-not-dispose but same shape.
   Landed as `fkEnforcementSuspended(db): Promise<AsyncDisposable>` rather than a generic
   `pragmaScope(db, on, off)`: both call sites are the identical FK bracket, and naming the invariant
   puts the OFF/ON literal PAIR in one home (a caller cannot suspend FKs and restore something else).

ui/client: **N-A, proven** — 2 try/finally blocks total, neither resource-shaped; browser cleanup runs
through React effect-cleanup convention. No browser-gating question arises because there are no sites.

**Two standing rules this wave paid for.** (a) DISPOSAL ORDER: `using` frees in REVERSE declaration order
at scope exit, so a hand-written chain that freed in some other order is a behavior change — check it
per site; here every hand chain already ran inner-handle-before-its-container, which IS reverse-
declaration, so no site changed order. (b) A `using` binding is subject to `noUnusedLocals`; when the
scope only wants the disposal (the PRAGMA bracket), the binding must be `_`-prefixed.

## §6 Temporal / luxon — the ONE external-blocker deferral

Measured surface (sweep receipts): luxon lives in exactly TWO kit files — `kit/time/index.ts` (:1,
`DateTime.fromISO(v,{zone:"utc"})` + `.isValid`/`.toMillis()`) and `kit/macro/registry.ts` (:1,
`fromMillis`/`now`/`setZone`/`isValid` for zone-aware {{time}} macros). Zero `Duration`/`Interval`.
Zero luxon imports anywhere else (server/client/ui/contracts/db/scripts all clean); `client/lib/time.ts`
is a pass-through of the luxon-free `createTimeLib`. The kill is a genuine one-wave, single-package job.

BUT: `macro-browser.tsx` VALUE-imports `createDefaultRegistry` → the registry (and luxon) ships in the
browser bundle. Temporal browser status (2026-08): Chrome 144 ✓, Firefox 139 ✓, **Safari partial-in-
preview** ✗. Replacing luxon with hand-rolled `Date.parse` would be adopting the exact legacy
antipattern this program exists to kill — refused. Therefore:

- **TRIGGER: Safari ships stable Temporal.** Then, same-day-shaped wave: swap the two files'
  five call-shapes to Temporal (`Temporal.Instant.from` + validity try/catch; `Temporal.Now`/
  `.toZonedDateTimeISO(tz)`), add `temporal-spec@1.0.1` (types-only, zero runtime) or extend
  `platform.d.ts` if TS has shipped Temporal types by then, delete luxon from catalog + kit, add the
  §8 `noRestrictedImports` luxon ban in the same commit.
- Board line carries the trigger; nothing else in this program waits on it.

## §7 Explicitness debts the audit surfaced (small, this program's scope)

1. **HTTP server tuning is implicit** — `@hono/node-server@^2.0.6` `serve({fetch, port})` at
   `entry/lifecycle.ts:358` with no `keepAliveTimeout`/`requestTimeout`/`headersTimeout` overrides:
   the server runs whatever Node defaults are this major. On-lock posture = pin them explicitly with a
   reasoned comment (self-hosted, SSE-heavy: keepAlive must exceed the SSE heartbeat interval; owner
   picks values at implementation, the point is that they become CHOSEN).
2. **`entry/lifecycle.ts:217,231,241` + `workloads/engine/runner.ts:94,101` setInterval sites** — the
   sweep located but did not verify paired cleanup; implementor verifies each is cleared/unref'd on
   shutdown (the supervisor's `:620` + `.unref()` at `:623` is the house pattern).
3. **D46 doc-truth**: "tier-2 workers are server-side today" is backed by ZERO `worker_threads` usage
   (proven sweep). Correct the doc claim or mark the doorway dormant — a doc that promises machinery
   that does not exist is the lying-doc class.
4. **`scripts/probes/transcript-census.mjs`** was the one `.mjs` outside every sweep AND every type
   program — converted to `.ts` (MJS-PROBES lane, 2026-08-07), joining the type-checked world.

## §8 Enforcement — regression becomes unrepresentable

1. **Spine-TypeScript-and-Patterns.md — "Platform primitives" policy table** (new section, ADOPT/
   CONSIDER/AVOID register, draft):
   - **ADOPT.** `node:timers/promises setTimeout` (never `new Promise`+`setTimeout` sleeps) ·
     `x.toSorted(fn)` (never `[...x].sort(fn)`) · Set `union/intersection/difference/isSubsetOf` ·
     `Object.groupBy`/`Map.groupBy` · `Promise.withResolvers` · `Map.getOrInsert(Computed)` ·
     `RegExp.escape` · `Error.isError` at unknown-boundaries (the `errorMessage` seam) · `.at(-1)` ·
     `findLast` · `Array.fromAsync` (accumulate-then-return only) · Iterator helpers when the chain is
     iterator-terminal · `using`/`await using` for every disposal-shaped resource ·
     `AbortSignal.timeout`/`.any` per the §4.12 rubric · `structuredClone` · `util.parseEnv`.
   - **CONSIDER.** `getOrInsertComputed` vs plain get-or-insert (cost/effects in the factory) ·
     Iterator helpers on sort-terminal chains (prefix-only wins).
   - **AVOID.** `node:sqlite` (sync-only; the libSQL PRAGMA/transaction knowledge in
     `db/client/index.ts:58-82` is driver-specific and hard-won — a swap re-derives it for a worse
     concurrency model) · Web Storage in node · hand-rolled sleeps/escapes/deferreds/set-algebra (the
     gate below) · `Date.parse` hand-rolls where the time seam exists.
2. **`scripts/check/gates/platform-spellings.ts`** (new Layer-3 gate, GATE-AUTHORING-compliant:
   mustFlag/mustPass per arm, node-overload reporting, doc row + count bump + fixture/UNFIXTURABLE):
   - ARM SLEEP: `new Promise(($R) => setTimeout($R, $MS))` (and arrow-body variant) outside
     `node_modules` → "use node:timers/promises setTimeout". mustPass: `setTimeout(res, ms)` where the
     promise ALSO wires reject (a timeout-reject race is not a sleep).
   - ARM DEFERRED (LANDED 2026-08-07): the executor ASSIGNS one of its own params outside itself
     (`$X = $RES`, including a `ref.current = $RES` property target) → withResolvers. mustPass:
     `ctx.newPromise()` (the QuickJS bridge), a normal executor that CALLS resolve/reject, and a target
     declared INSIDE the executor (a local shuffle, not a hand-out).
   - ARM ESCAPE-MINT: a function DECLARATION named `escapeRegExp`/`escapeRegex`, or the escape
     char-class literal `[.*+?^${}()|[\]\\]` in a replace — the exact re-mint neo tripled.
     (LANDED name-only; the char-class half was BUILT AND REMOVED at 27 measured false positives.)
   - ARM SPREAD-SORT (LANDED 2026-08-07): `[...$X].sort($$$)` → toSorted, flagged ONLY where `$X` is
     provably an array from SAME-FILE syntax. **The "the gate cannot type" note was right but its reason
     was under-stated: the `pnpm check` harness builds the PURE-AST workspace, so a checker call there
     fails SILENT cross-package — a checker-backed version is push-tier work, not a commit-bar gate.**
     Measured on the pre-burn-down tree: 14 of 21 real `packages/**` copies flagged, 0 of 13 iterator
     materializations — precision 100%, recall 67%. mustPass rows write the misses down as a baseline
     (an SDK response property, a query `.data`, a `for`-of tuple destructure, a contextually-typed
     callback param) plus the two KEEP shapes and a bare identifier holding a `Set`.
   - Declared limits in the header; six-case probe not required (no marker vocabulary — violations are
     fix-only, no exemption table planned; if one becomes needed it follows §4a).
3. **biome `noRestrictedImports` additions** (same block as tailwind-variants): `dotenv` (post-§3, with
   the parseEnv pointer), `luxon` (post-§6 trigger, same commit as the kill).
4. Already-standing: `useDisposables` (biome, live) enforces §5; `check-harness`/`no-manual-memo`
   precedents govern gate authorship; `engineStrict` in `pnpm-workspace.yaml` (§1.3) enforces the floor.

## §9 Wave order, floors, receipts

Order: **W1 → W2 → (W3 ∥ W4 ∥ W5) → §7 smalls → §8 gate lands LAST** (gates land on a fixed tree —
every arm's live violations are already burned down by W3/W4). Temporal (§6) floats on its trigger.
The tsx one-sitting migration is orthogonal; if it lands first, W4.1's engines.ts sites move with it.

Per-wave floor: `pnpm typecheck` (all programs) · `pnpm lint` + `lint:eslint` · `pnpm check:structure`
· scoped vitest for touched domains · the egress battery for W2 · full `pnpm test` before merge-back.
Verification is by battery, not by reading hunk-lists — the sweeps' site tables are the review index.

Receipts appendix (sweep outputs + probe transcripts, 2026-08-03): the three scout reports (async/net/
streams · crypto/fs/process/env · language residue) and the probe outputs quoted in §0/§2 live in the
session transcript; every site list above is the complete match set of the stated pattern at sweep
time. Re-run patterns before executing a wave — audit lists are snapshots.
