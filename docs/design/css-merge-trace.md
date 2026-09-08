---
kind: design
status: active
updated: 2026-09-08
---

# CSS merge trace

## Decision

`packages/ui/src/lib/class-merge.ts` remains the sole merger and sole `createTV` caller. Tailwind Variants composes candidates with `twMerge:false`; Orb wraps every ordinary result and every invoked slot with one call to its configured merger. The wrapper preserves TV's callable metadata so extension remains representable.

The governed family registry names every custom `@theme` family for which Tailwind 4.3.3 emits a named utility. A stable `tailwindcss.compile()` test derives the positive set from the generated theme and a positive/negative probe matrix, then compares it to the registry in both directions. The same test consumes #961's exact producer/consumer evidence before Oxide tokenization and separately repeats the production `@source` roots through Oxide so compiled output must retain every generated theme target. The merger extension adds only the missing `aspect`, `blur`, and `ease` theme scales; `dimension`, `z`, and the other compiler-negative prefixes remain absent.

The dev/test trace is opt-in. The merge door owns only an optional observer slot; the trace module registers into it when the dev-only agent-handle composition or a focused test enables the receipt. With no production import of the trace implementation, the production build removes its replay/ring code entirely. Dev exposes the same read/reset handle at `window.__orb.css`. One bounded ring records deduplicated conflict calls, while counters retain non-conflicting population so an empty conflict set can be distinguished from a blind instrument.

Each recorded call carries ordered input occurrences and final output. Survivors are matched to input occurrences from right to left, following tailwind-merge's later-wins result. For every discarded occurrence, bounded pair replay through the exact configured merger finds its first later evictor; replay follows later discarded evictors until it reaches the final surviving occurrence. The trace does not import or reproduce tailwind-merge's classifier. Orb-owned token suffixes label known namespaces from the same registry; all unclassified conflicts are honestly labelled `tailwind-core`.

## Rejected alternatives

- Keeping Tailwind Variants' merge and tracing only `cn()` loses candidates before Orb can observe them.
- `tailwind-variants/lite` preserves candidates but weakens the configured TV type and still does not route ordinary and slot outputs through Orb.
- Copying tailwind-merge class groups or depending on Tailwind's unstable design-system export would create a second classifier contract. Stable compilation plus exact merger replay is sufficient.
- Inferring utility support from token prefixes repeats the refuted `dimension`/`z` premise. Compiler output is the family authority.
- Building another import/expression resolver duplicates #961. Static carrier provenance remains owned by `static-class-expression.ts`; runtime receipt inputs come from the exact `cx()` result at the merge door.
- Writing directly to `globalThis.__orb` from `@orb/ui` would invert the UI/client boundary. The existing dev-only `agent-handles` composition injects the reader into the existing bridge.

## Coupled sites

| Site | Change |
| - | - |
| `packages/ui/src/lib/class-merge.ts` | registry, aspect/blur/ease registration, sole TV wrapper, one merge call |
| `packages/ui/src/lib/css-merge-trace.ts` | bounded occurrence replay, deduplicated ring, read/reset/enable contract |
| `packages/ui/src/lib/index.ts` | internal/public UI seam exports used by tests and the dev handle |
| `packages/client/src/agent-handles/index.ts` | dev-only enablement and handle injection |
| `packages/client/src/lib/agent-bridge.ts` | typed `__orb.css` member and install wiring |
| `.dependency-cruiser.cjs` | ban runtime `tailwind-variants` imports outside the sole factory while preserving type-only `VariantProps` imports |
| `package.json`, `pnpm-lock.yaml` | direct root test ownership of the already-installed Oxide compiler scanner |
| `tests/tooling/dependency-cruiser.int.test.ts` | planted second-factory pin for the seal |
| `tests/tooling/css-merge-parity.repo.int.test.ts`, `vitest.config.ts` | repository-resource production-shaped compiler/Oxide parity, #961 exact-evidence consumption, and planted controls |
| `tests/ui/lib/class-merge.test.ts` | merge behavior, TV, trace, and planted controls |

No CSS generator, theme engine, token source, custom-theme carrier, selector gate, or #956 provenance file changes. The token generator and focused UI behavior remain verification obligations.

## Proof plan

1. Red first: the compiler-derived registry parity reports missing `aspect`, `blur`, and `ease`; current `cn()` keeps both orders for those families; current TV hides the loser before Orb; a second `createTV` import cruises green before the new resolved-edge seal.
2. Plant parity controls by removing one real compiler-positive family from a test registry and adding compiler-negative `z`; each must produce the exact missing/bogus result. Prove #961 exact evidence and the production Oxide scan are populated, and require every generated theme target in the compiled output. A zero compiler, scanner, provenance, or trace population is `INSTRUMENT ERROR`.
3. Prove later-wins in both orders for every governed family, plus duplicate, asymmetric padding, modifiers, important/postfix, arbitrary values, and the three new custom families.
4. Prove one ordinary TV result and one invoked slot each increment Orb's merge population exactly once, preserve ordered pre-merge occurrences, and retain TV metadata/extension behavior.
5. Prove exact loser to final-winner occurrences, deduplication, conflict clearing after reset plus a non-conflicting call, and over-bound fail-loud behavior.
6. Run focused unit/type/lint/dependency checks, the token generation freshness suite, and focused Avatar/Button component tests. Do not run repo-wide check/verify or full CT.

## Semantic limits

- Replay is diagnostic only and bounded to 128 input occurrences per merge; an over-bound call is an instrument error while the production merge result remains unchanged.
- The receipt explains class-list merge winners, not browser cascade winners. Layer, specificity, source
  order, inline style, inheritance, and resolved custom properties remain the separate revision-matched
  official DevTools frontend SDK tier; direct CDP inference is not an equivalent cascade oracle.
- A namespace label is emitted only when the Orb registry can identify a custom token suffix. `tailwind-core` is deliberate for modifier/arbitrary/core conflicts that Orb does not own; winner correctness never depends on the label.

## Verification receipt

The planted pre-fix merge run passed 40 checks and failed exactly the three new aspect/blur/ease controls in both argument orders. A temporary second `createTV` source also cruised green before the resolved-edge seal and red with `ui-tailwind-variants-runtime-seal` after it.

- `pnpm test:scoped tests/tooling/css-merge-parity.repo.int.test.ts --maxWorkers=1 --reporter=verbose` — 7 passed: 1,584 files / 2,326 roots / 2,321 exact #961 values; 1,599 production files / 27,357 Oxide candidates; every generated theme target emitted; compiler/registry equality and omitted/bogus/zero controls passed.
- `pnpm test:scoped tests/ui/lib/class-merge.test.ts tests/ui/tokens/index.test.ts --maxWorkers=4` — 107 passed (70 merge + 37 token): every governed family both ways, TV ordinary/slots/extension/empty semantics, bounded occurrence replay, and byte-exact generated theme/tokens/theme-set artifacts.
- `pnpm test:scoped tests/tooling/dependency-cruiser.int.test.ts --maxWorkers=1` — 65 passed, including the runtime-factory plant and type-only `VariantProps` negative control.
- `pnpm ct:scoped tests/ui/primitives/button/button.ct.tsx tests/ui/primitives/avatar/avatar.ct.tsx --workers=1` — 42 passed across ordinary and slotted TV consumers.
- `pnpm --filter @orb/client build` — 3,409 modules built; the production assets contain no trace/replay/error strings.

One pre-existing full-graph dependency-cruiser violation remains at `packages/client/src/styles/index.ts` → `features/app-shell/surfaces/shell.css`. Both files are byte-unchanged from `HEAD`; the focused factory-seal suite is green.

An exact `__orb.css.read()` conflict receipt is:

```json
{
  "enabled": true,
  "calls": 1,
  "conflictCalls": 1,
  "deduplicatedConflictCalls": 0,
  "receipts": [
    {
      "input": [
        { "index": 0, "className": "aspect-portrait" },
        { "index": 1, "className": "aspect-banner" }
      ],
      "conflicts": [
        {
          "axis": "orb:aspect",
          "loser": { "index": 0, "className": "aspect-portrait" },
          "winner": { "index": 1, "className": "aspect-banner" }
        }
      ],
      "output": "aspect-banner"
    }
  ],
  "status": "ok"
}
```
