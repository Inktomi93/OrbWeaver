---
kind: review
status: active
updated: 2026-09-06
---

# Sanctioned-home CLIENT family (#1584)

Lane `cb-home-client`, based at `f6078a884`. Fourteen client-side policies whose exceptions were sanctioned
HOMES — a `SANCTIONED_HOMES` table, a `scanRoot` subtraction, a path-keyed file allowlist, or a permanent
inline marker — are now final `defineGate` policies. Every one of those shapes carried the same defect: an
exemption that follows its old path into the void on a rename while the new path is judged by nobody. The
central reviewed-grant table replaces all four with one mechanism whose liveness is structural — a row
consumed zero times after a complete run is STALE, and a row matching more than one finding is OVER-BROAD
and licenses nothing.

## Disposition

| Policy | Authority | Family | Execution | Identity now resolved through | Grant rows | Legacy replay | Final pass |
| - | - | - | - | - | -: | -: | - |
| `bound-field-via-hook` | reviewed-grant | singleton | entire-population | the `useFieldContext` declared by `forms/contexts.ts` | 1 | 0 | 1 raw / 1 granted / 0 effective |
| `chat-stream-writes-in-bus-only` | reviewed-grant | singleton | entire-population | the `chatStream` declared by `state/chat-stream.ts` | 2 | 0 | 2 / 2 / 0 |
| `client-cache-surgery-only-in-data` | reviewed-grant | `tanstack-query-origin` | entire-population | the six cache METHODS declared by `@tanstack/query-core` | 9 | 0 | 9 / 9 / 0 |
| `no-direct-useform` | reviewed-grant | singleton | entire-population | the three mints declared by `@tanstack/react-form` | 2 | 0 | 2 / 2 / 0 |
| `no-effect-on-shared-selection` | reviewed-grant | `react-origin` | entire-population | pointer exports declared under `client/src/state/` + React's effect exports | 0 | 0 | 0 / 0 / 0 |
| `no-inline-invalidate-outside-seam` | reviewed-grant | `tanstack-query-origin` | entire-population | `invalidateQueries` declared by `@tanstack/query-core` | 1 | 0 | 1 / 1 / 0 |
| `no-raw-intl-time` | reviewed-grant | singleton | entire-population | the ambient `Intl` global + `.toLocale*` declared by TypeScript's `lib.*.d.ts` | 1 | 0 | 1 / 1 / 0 |
| `no-raw-matchmedia` | reviewed-grant | singleton | entire-population | the ambient global, judged by the RECEIVER (`globalThis`/`window`/`self`) | 4 | 0 | 4 / 4 / 0 |
| `no-raw-zustand-persist` | reviewed-grant | singleton | entire-population | zustand's `persist` export + store-api methods; the registry's own `RegisteredStore.reset` | 4 | 0 | 4 / 4 / 0 |
| `no-untrusted-html-in-main-dom` | reviewed-grant | singleton | entire-population | the reserved JSX attribute (no binding exists to resolve) | 0 | 0 | 0 / 0 / 0 |
| `registry-context-via-mint` | **ordinary** | `react-origin` | entire-population | React's `createContext` + the canonical `Registry`/`ContributorRegistry` | 0 | 0 | 0 / 0 / 0 |
| `render-error-via-battery` | reviewed-grant | singleton | entire-population | the canonical `QueryBoundary` host + a `QueryErrorState`-rooted arm | 3 | 0 | 3 / 3 / 0 |
| `selection-store-via-factory` | reviewed-grant | singleton | entire-population | the `createGatedStore` declared by `state/create-gated-store.ts` | 3 | 0 | 3 / 3 / 0 |
| `theme-override-only-via-scope` | reviewed-grant | singleton | entire-population | the authored style object's `--color-*` KEYS through the static-value reader | 0 | 0 | 0 / 0 / 0 |

Every reviewed-grant policy is `entire-population` on purpose: grant liveness is a whole-population verdict,
so a narrowed selection DEFERS loudly rather than staling every row it did not happen to carry. That matches
the two reviewed-grant policies already on the branch.

## Four rulings this conversion made rather than took silently

**1. An UNEXERCISED permission is not representable, so none was invented.** `no-untrusted-html-in-main-dom`
and `theme-override-only-via-scope` each carried two structural home rows whose own `why` said the permission
stands "whether or not it spells the injection today" — and on this tree neither home spells it (the markdown
seal renders through Streamdown's sanitizer, the sandbox frame through `srcdoc`; the theme clamp hands
`style` a computed `CSSProperties` and the srcdoc host sets no color token). A row consumed zero times is
STALE by contract. The homes are therefore SCANNED and clean, and what preserves the law is the AUTHORITY: an
exception to a D44 rule is a reviewed row, never an inline marker one author can write. The day a seal
injects, it reds and the review mints the row.

**2. A detector artifact is DELETED, not translated** (the wave-3 precedent). Two of the legacy exclusions
licensed nothing once the question was asked by identity: `registry-context-via-mint`'s mint home types its
context over a TYPE PARAMETER (the legacy header said so itself), and `render-error-via-battery`'s mint row
covers a `renderError` that sits on `<QueryErrorCatch>`, not on a `QueryBoundary`. Both are dropped, each with
a `mustPass` row proving the site passes BY IDENTITY. `registry-context-via-mint` therefore has no permission
class at all and is **ordinary**, which is the one authority split in this family and is deliberate: a policy
whose conversion proved there is no recurring exception should keep the inline door for a genuine one-off,
while a policy whose exceptions are structural homes should not.

**3. The path-only file allowlist could not be copied, and re-deriving it moved two rows.** A
`render-error-via-battery` allowlist row suppressed EVERY occurrence in its file. Re-derived per occurrence:
the command-palette row is GONE (its arm now roots in `<QueryErrorState>` with a custom retry button, so it
produces no finding and a row for it would be stale — the legacy mode-A sweep could not see that, because it
only asked whether the file still had a `renderError` at all), and the rpg context pane's TWO custom arms are
ONE `(subject, operation)` row rather than a file-wide licence.

**4. The `@orb-gate-ignore` on `media-grid.tsx` became a GRANT, not a deletion.** Its stated reason — a
pointer-capability query with no coarse-pointer one-home on the tree — is a standing state of the repository,
not a per-occurrence slip, and a reviewed-grant policy has no inline door. The row carries that reason and an
`endsWhen` naming the missing home (the #1182 fork). It is the only live marker any of the fourteen had.

## Finding granularity equals grant granularity

`lib/reviewed-grant-findings.ts` is the one place these policies turn occurrences into findings: exactly ONE
per `(subject, operation)`, with every site listed in the message. Without it a home performing the same
licensed act three times would make its own permission unrepresentable — one row matching three findings is
OVER-BROAD and licenses none of them. This is the reviewed-grant twin of the ordinary engine's rule that a
positioned marker suppresses only when exactly one finding lies in its carrier. The recorded cost is a slight
under-report: two illegal occurrences of the same operation in one file report once, with both lines named.

Two live shapes prove it matters: the rpg context pane's two `renderError` arms (one row) and
`use-is-mobile-viewport.ts`'s two `matchMedia` reads (one row). Where the licensed acts genuinely DIFFER, the
rows do too — `create-entity-mutation.ts` holds four, one per cache operation.

## Two shared readers

- **`lib/project-home-origin.ts`** — the file-grain twin of `sealed-origin.ts`. `sealed-origin` matches an
  implementation DIRECTORY by path infix because a canonical declaration is routinely outside the consuming
  policy's population; this family's homes are single FILES inside their own population, so the home is
  LOCATED through `ctx.files` and MEASURED (`members`/`unresolved` feed the receipt verbatim: an absent file
  refuses, and a present file that no longer exports the name refuses too). A reference is judged by the
  canonical declaring FILE plus the canonical export name — never by the consuming file's own exports, which
  is the self-exemption door `no-manual-token-estimate` was repaired for. It also carries the package-export
  and package-member twins (a client seam's receiver is routinely minted by a call) and a directory+vocabulary
  reader for a law whose subject is a family of symbols across sibling modules.
- **`lib/reviewed-grant-findings.ts`** — the dedupe above.

Proof substrate: `gates/_proof/zustand.ts` (the store api and `persist` middleware as real package doors,
plus a lookalike twin) and three names added to `gates/_proof/client-vendors.ts`
(`@tanstack/react-form`, the three remaining QueryClient operations, and the lookalike's copies).

## Population equality, over one 7,204-path candidate manifest

Each legacy `scanRoot` extracted from `f6078a884` and each final `population` expression applied to the SAME
candidate list, diffed both ways:

- **Byte-exact (5):** `client-cache-surgery-only-in-data` (1,311), `no-raw-zustand-persist` (1,311),
  `render-error-via-battery` (1,311), `no-untrusted-html-in-main-dom` (1,671), `theme-override-only-via-scope`
  (1,671).
- **ONLY-LEGACY, 1 path, 3 policies:** `packages/showcase-plugins/src/index.ts` drops out of
  `no-direct-useform`, `no-raw-intl-time` and `chat-stream-writes-in-bus-only` — the standing classified delta
  every wave has recorded (`@authored` names the six cake packages plus tooling/tests/scripts; guest showcase
  code is not one of them).
- **ONLY-FINAL, 22 paths total:** every one is either a sanctioned home that is now SCANNED instead of
  subtracted (`data/bus/**` + `main.tsx`, `data/invalidation.ts`, the three matchMedia homes,
  `use-bound-field.ts`, `create-registry-context.tsx`) or a deliberately added RECEIPT ANCHOR — the two
  policies whose verdict depends on locating a home add exactly that home to their population
  (`forms/contexts.ts`, `state/create-gated-store.ts`, `state/index.ts`). No path is admitted that the legacy
  predicate admitted and the final one rejects, except the showcase-plugins row above.

## Legacy replay and the old/new differential

The fourteen pre-conversion descriptors, extracted from `f6078a884` and run through the PRODUCTION legacy
dispatcher over the real 7,204-file corpus: **0 findings, 0 tool errors, 6.4 s**. The final policies over the
same tree: **30 raw = 30 granted + 0 effective**. Every one of the thirty is a home occurrence the legacy
shape suppressed invisibly (by scope subtraction, by an allowlist row, or by a marker) and that now carries a
reviewed row with a `why` and an `endsWhen` — which is the whole point of the migration.

**One site is genuinely NEW evidence:** `tests/client/features/chat/_ct-stories.tsx` takes the `chatStream`
write handle. The legacy check required the literal `#state` specifier and this file imports through
`@orb/client/state`, so it was never judged even though it was inside the legacy population. It is licensed by
a grant with an honest `endsWhen` (seed turn state from a bus-event fixture) rather than by widening the
population, because a population exclusion would be a silent law change made by this lane.

## Real-tree final pass

`runPolicyPass` over `getWorkspace({root, types: true})`, 92 known final policies (the full roster — a
hand-picked one manufactures unknown-policy waiver alarms), the fourteen selected, `reviewedGrantsFor`:

```
knownPolicies=92 selected=14 loadedSources=7211
workspaceMs=4514 passMs=27005
toolErrors=0 factErrors=0 authorityToolErrors=0 alarms=0 withheld=[]
raw=30 waived=0 granted=30 effective=0
```

`/usr/bin/time -v`: **35.54 s wall, 5,350,632 KB peak RSS**, 0 swaps, 0 major page faults (a quieter earlier
run of the same pass measured 23.47 s / 5,379,644 KB — the wall moves with box load, the RSS does not). Every
grant row was consumed exactly once — zero stale, zero over-broad. Per-policy cost is concentrated in `no-raw-zustand-persist`
(4.9 s over 1,311 files: its `setState`/`reset`/`setOptions` prefilter resolves a type member per candidate),
`client-cache-surgery-only-in-data` (1.2 s) and `no-effect-on-shared-selection` (1.0 s over 1,001 files,
including its identifier index); the other eleven total under 2 s combined.

## Two identity defects the real pass caught

- **The cast dodge (fail-open, closed).** `no-raw-matchmedia` first judged the MEMBER, and both reduced-motion
  homes read the api as `(globalThis as { matchMedia?: … }).matchMedia` — a cast gives the property symbol a
  declaration in the cast's own type literal, which the shared refusal classifier correctly calls "a proven
  different identity". The homes therefore PASSED, and any feature could have left the law the same way. The
  verdict now asks the RECEIVER, whose identity cannot be cast away; that also turns a DOM-less analysis
  program's "unreadable" into the precise finding it should be. Both live homes became findings (and rows), and
  the dodge is a committed `mustFlag` row.
- **A barrel is not the registry.** `no-raw-zustand-persist`'s ARM C receipt first counted two "registry"
  files, because `state/index.ts` re-exports `registerDurableLocalStore`. The file must DECLARE it — the
  registry's `RegisteredStore` is file-private, which is exactly what makes that one file the whole reachable
  surface.

## Verification

| Check | Result |
| - | - |
| family conformance (`tests/tooling/verify/gates/home-client-family.test.ts`) | green — 14 policies, 121 proofs, 12 tests |
| fixture-specifier resolution control (every relative import in every row of the family) | green — 51 relative specifiers checked, 0 unresolved |
| receipt-refusal pins (7 policies, through `runPolicyPass`) | green — each REFUSES and is withheld when its home/vocabulary is gone |
| grant-liveness pins (granted-once, stale, wrong-operation) | green |
| `lib/project-home-origin.ts` spec | green — 10 tests, armed with the identity-swap control |
| `lib/reviewed-grant-findings.ts` spec | green — 5 tests |
| population equality over 7,204 candidates | 5 exact, 3 classified drops, 22 classified home/anchor additions |
| legacy replay + real-tree final pass | 0 legacy findings; 30 raw = 30 granted = 0 effective |
| tooling type program (`ts7.cjs -p tooling/tsconfig.json`) | green |
| scoped biome + eslint over the full base-to-tip changed set | green |
| both line-coupled ledgers | re-derived and fresh (manifest 2,522 specs; caught-failure population 573 sites) |
| remaining `lib/sanctioned-home.ts` consumers | 15 legacy modules, none of them this family's — nine belong to the sibling server family and six to the static-class-blocked set, so the helper stays |

## Known limits, written down

- `no-untrusted-html-in-main-dom`'s subject is a RESERVED JSX ATTRIBUTE, not a binding: there is nothing to
  alias or re-export, and prop injection through a SPREAD carries no attribute node and is not seen (the same
  limit the legacy gate carried, with its own `mustPass` row).
- `theme-override-only-via-scope` sees only STATICALLY AUTHORED style objects (a literal, a const chain, an
  import). A computed `CSSProperties` is out of subject — which is the clamp's own shape, and what the legacy
  text check was equally blind to.
- `no-effect-on-shared-selection` keeps the legacy name-level, file-scoped taint (seeds plus a fixpoint over
  initializer references) and its vocabulary is a closed list. Converting it caught three regex names that name
  nothing on the tree (`useActiveDraftSeed`, `useActiveSessionKey`, `useMobileSheet`); the seven live pointers
  are receipted against the state barrel, so the next rename REFUSES instead of silently matching nothing.
- `bound-field-via-hook`, `chat-stream-writes-in-bus-only` and `selection-store-via-factory` prefilter
  candidates by the sealed NAME (plus a per-file import-alias index), so a re-export under a DIFFERENT name is
  outside the subject — the same written baseline the seal family recorded.
- `render-error-via-battery` judges a block-bodied arm by the return statements lying inside it, including a
  nested function's, which is exactly the set the legacy descendant walk produced.
