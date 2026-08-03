---
kind: design
status: proposed
updated: 2026-08-03
---

# Shedding tsx — native-node TypeScript migration (quiet-tree work order)

> Research receipts from the 2026-08-03 memoban session (all probe-verified in-tree, none assumed).
> Owner intent: move as far off tsx as practical. This spec is written to be executed cold by a lane
> in a worktree, in independently-landable stages. STAGES 1–3 are the migration; STAGE 4 (nodenext)
> is the checker-fidelity capstone and can land in a later window.

## Why (what we gain — measured against THIS repo)

1. **A dependency out of the production hot path.** `start` runs `tsx packages/server/src/entry/index.ts`
   — tsx (esbuild under it) transforms and resolves every server module at runtime, in prod. Native node
   makes the platform the only runtime. Biggest single win; this is a runtime dep, not a dev tool.
2. **Platform-exact semantics.** Today the server's real module resolver is tsx's; any divergence from
   node is an invisible bug class. Native node deletes the class.
3. **First-class tooling, no loader hooks** — `node --watch`, `--inspect`, heap snapshots, diagnostics.
4. **`erasableSyntaxOnly` goes live.** The base tsconfig adopted it PRECISELY so "node can strip + run"
   (its own comment). Today only tsc exercises that promise; after migration a violation fails at boot.
5. Marginally faster cold starts (strip < transform+loader). Real but small — not the reason.

## Preconditions — ALL VERIFIED 2026-08-03

- Every package `type: module`; exports maps point at `./src/*.ts` SOURCE; `#*` imports maps → src.
  Node resolves both natively (imports/exports maps are node's own mechanism).
- **Zero JSON imports** in server/kit/db/contracts (`grep` clean) — no import-attribute work.
- No enums/namespaces/param-properties (`erasableSyntaxOnly` + biome + the `no-decorators` gate).
  Node's type stripping handles 100% of the tree's syntax.
- No tsx-only features in use: no tsconfig `paths`, no server JSX, no REPL dependence.
- The ONE hazard class: **6,359 extensionless relative imports** (+ directory imports) — node's
  stripping does NOT do extensionless or directory resolution. This is the whole migration.

## The tool — already installed, probe-verified

Biome 2.5.1 `correctness/useImportExtensions` with `--write`:
- `import { two } from "./b"` → `"./b.ts"` (fixes to `.ts`, NOT the legacy `.js` mapping every
  ESLint-era plugin produces — those are all wrong for source-run).
- `import { d } from "./dir"` → `"./dir/index.ts"` (directory-import expansion — the second breakage
  class, fixed in the same pass).
- After the one-shot fix the rule STAYS ON as the permanent enforcer — new code can't regress.
  (GritQL is retired; this is a native Biome rule, allowed.)

## Stages (each independently landable, each behind the full battery)

**STAGE 1 — extension the tree (pure mechanical).**
Enable `useImportExtensions` in biome.json; run `biome check --write` SCOPED to `packages/*/src`
`tests` `scripts` (never bare `--write .` — the biome-write-mutates-prebuilt lesson; diff-review the
result). Flip `allowImportingTsExtensions: true` into `tsconfig.base.json` (today it's root+tests-dom
only; the per-package absence was enforcement-by-omission of the OLD convention — that note in
tsconfig.json's header dies here, fix-at-landing). Everything still runs under tsx/vite (both accept
extension-ful). Commit. This is the merge-noise bomb — do it on a QUIET tree, lanes drained.

**STAGE 2 — swap the runtimes.**
`start`: `tsx` → `node`. Sweep `scripts/dev/*.sh` + package.json for tsx invocations (dev server,
probes, codemods, seeds — inventory first; each is a one-word swap since Stage 1). `node --watch`
replaces tsx watch where used. Keep `tsx` as a devDependency ONLY if some script genuinely needs it
(expectation: none). Verify: boot the real stack, `/api/_debug/*` landings (the standing
observability step), `e2e:smoke`.

**STAGE 3 — enforcement + docs fix-at-landing.**
`useImportExtensions` stays on (the enforcer). Docs: `client-tooling-setup.md` (runtime section),
`tsconfig.json` + `tsconfig.base.json` comments (the convention inversion), `Spine-TypeScript` if it
names tsx. Consider a D-entry rider (owner's call).

**STAGE 4 — nodenext on the node-side programs (the capstone; separate window is fine).**
`module`/`moduleResolution: nodenext` in `tsconfig.base.json`; `ui`/`client` (+ any browser-ish
program) OVERRIDE back to `esnext`/`bundler` — vite is their resolver and that's honest, settled
against the ecosystem guidance (vite templates pin bundler; node modes are for node deployment).
`kit`/`contracts` go nodenext = strictest-consumer-wins (node-strict resolution is a subset vite
accepts). WHY: under bundler+extensions the CHECKER still accepts extensionless — a missed extension
typechecks green and crashes at boot with only the biome rule in between; under nodenext it's a
compile error. Expect stragglers the stricter checker names; fix, don't suppress.

## Verification floor (per stage)

All three typecheck programs + per-package · `pnpm lint` + `lint:eslint` · `check:structure` ·
`depcruise` (resolver-input change!) · full `pnpm test` (vitest + CT) · `e2e:smoke` · a real stack
boot with `/api/_debug` landings. Stage 1's diff is huge but mechanical — verify by battery, not by
reading 6,359 hunks.

## Known non-issues (checked, don't re-litigate)

- vite/client side: unaffected (extension-ful is legal under bundler; ui/client keep their programs).
- `import.meta.dirname` (vite.config): node ≥20.11 ✓ (engines ≥26).
- CT harness: playwright-ct bundles its own vite 6 — orthogonal to this migration (separate boarded
  spike for the vite-8 override).
- The one prior `.ts`-extension import (`server/src/index.ts`) was normalized 2026-08-03; Stage 1
  re-extensions it with everything else. No special handling.
- `rewriteRelativeImportExtensions`: NOT needed — noEmit oracle, nothing rewrites.

## Open decisions for the owner (small)

1. Stage 4 in the same window or a later one? (Stages 1–3 are self-sufficient.)
2. Does ANY script keep tsx? (Expectation: no; decide on the Stage-2 inventory.)
3. D-entry rider or just doc updates?
