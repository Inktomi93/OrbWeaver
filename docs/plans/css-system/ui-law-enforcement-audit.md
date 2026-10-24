# UI and client law enforcement audit

Scope: the ten docs under `docs/law/` named below. Each normative rule is matched to the enforcer the doc names, then to the tree. Rules already filed (1316-1321, raw-intrinsic paint, CSS-system lane) are skipped: className/style on raw elements, layout-only feature className, built class strings, `title` tooltips, history comments, container ownership, layout-context props, shell paint, stylelint and Tailwind lint, `!important`, cascade layers.

Search scope: `packages/client/src` and `packages/ui/src`, never the repo root. ast-grep tsx scan: scannedFileCount=816. rg scan: 1588 files (`packages/client/src`) and 1965 files (client + ui). Config files read: `eslint.config.ts`, `tooling/src/eslint/*.ts`, `.dependency-cruiser.ts`, `stylelint.config.js`, `stylelint-rules.js`, `biome.json`.

Abbreviations: LOCK = client-architecture-lockdown, GATES = client-architecture-state-and-gates, LINE = integer-line-boxes, MOTION = motion-and-animation-guide, ARCH = UI-Architecture-and-Layout, STACK = ui-architecture-state-and-stack, DENS = UI-Density-Law, PKG = ui-package-design, PRIM = UI-Primitives-and-Reuse, THEME = UI-Theming-and-Content.

## False claims: the doc names an enforcer that is not in the tree

Each id was searched literally in `eslint.config.ts`, `tooling/src/eslint/`, `.dependency-cruiser.ts`, `biome.json`, `tooling/`, `packages/` and `tests/`. A comment that cites the id does not count as an enforcer.

| Claimed enforcer | Doc and section | What exists instead |
| - | - | - |
| `orb/baseui-state-data-attributes` | MOTION §5.3 | no rule |
| `orb/no-unruled-flip-inversion` and its `homes` entry ("enforced, not prose-only") | MOTION §1.5 | no rule |
| `orb/modal-definition-home`, `orb/modal-definition-literal` | LOCK §6d | no rule |
| `orb/config-group-definition-home` | LOCK §8 | no rule |
| `no-multiplexed-mutation-error` | GATES §11, PKG §6.2 | no rule |
| `no-effect-on-shared-selection` (gate) | STACK §5.1 | id appears only in comments (`state/active-chat-store.ts:4`, `data/use-session-recovery.ts:19`, `use-shell-track-flip.ts:53`) |
| `no-parallel-section-map` | ARCH §4.1 | id appears only in a comment (`features/home/components/section-jump-rail.tsx:3`); `orb/registry-assembly-at-door-only` exists as a neighbour |
| `persistence-boundary` | LOCK/GATES §9, §10a, THEME §12.1 | id appears only in comments (`state/durable-local.ts:44`) |
| `form-factory-for-multifield`, `no-form-reset-in-autosave`, `tanstack-form-only-in-shared` | GATES §14, PRIM §13.3, PKG §6.2 | comments only; `orb/no-direct-useform` exists (`eslint.config.ts:607`) |
| `no-inline-invalidate-outside-seam`, `client-cache-surgery-only-in-data` | PKG §6.2, STACK §6.1, PRIM §13.1 | comments only (`data/invalidation.ts:3`, `data/create-entity-mutation.ts:2`) |
| `queryKey` selector of `no-restricted-syntax` in `eslint.config.ts` | GATES §10, PRIM §13.1 | no such selector |
| ESLint `max-lines` owns the UI source limit | PRIM §13.9 | no `max-lines` in `eslint.config.ts`, `tooling/src/eslint/` or `biome.json` |
| `baseui-anatomy` surface manifest and gate | PKG §14 | no match anywhere |
| dep-cruiser `ui-no-node-builtins` | ARCH §1.1, PKG §1 | rule is named `browser-and-iso-no-node-builtins` (`.dependency-cruiser.ts:691`); behaviour exists, name is wrong |
| `touch-target-floor` design-audit probe | PKG §4 | no match in `tooling/src` |
| dialog, popover, toast, tabs CTs "pin `transitionProperty` reads" | MOTION §1.2 | `transitionProperty` appears in no file under `tests/`; no toast or tabs CT exists under `tests/ui/primitives/` |
| `accessible-name-quality.suite.ct.tsx` and `form-identity.suite.ct.tsx` machine-check N2/N5/N6 | PRIM §13.10 | neither file exists; helper `tests/support/browser/accessible-names.ts:101` (`labelInNameFindings`) is used only by its own self-test `tests/support/browser/deterministic-helpers.ct.tsx` |
| `density-tier.suite.ct.tsx` | DENS §5.3 | doc itself says external legacy source; not in tree |
| `createCollectionSurface` bakes `maxPages` | PRIM §13.1, PKG §6.2 | contradiction: `orb/windowed-infinite-query` (`tooling/src/eslint/ui-feature-policy.ts:91`, `eslint.config.ts:634`) bans `maxPages`; `data/create-collection-surface.ts:22` mentions it only in a comment |
| registry-derived roster CT census over section lists and Corpus modes | LOCK §6a | no such census; `ListSearch` is referenced by one test (`tests/ui/primitives/radio-group/picker-native-parts.ct.tsx`) |
| tests named as restoration-register entries: switch CT, tokens index case, `theme-emit-pairing`, `seed-theme-pairing`, `palette-contrast`, `emit-surface`, `appearance-message-style-section` | LINE §2, THEME §12.1 | no file with these names in `tests/`; `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` and `token-boundary.ct.tsx` exist as neighbours |

## Enforcers verified in the tree

| Enforcer | Path:line |
| - | - |
| `orb/no-tailwind-dark-variant` | `eslint.config.ts:1058`, rule `tooling/src/eslint/ui-styles.ts` |
| `orb/no-raw-matchmedia` | `eslint.config.ts:628` |
| `orb/registry-context-via-mint` | `eslint.config.ts:636` |
| `orb/no-raw-zustand-persist` | `eslint.config.ts:586` |
| `orb/state-files` | `eslint.config.ts:885` |
| `orb/session-channel-boundary` | `eslint.config.ts:1074` |
| `orb/fetch-fn-in-features` | `eslint.config.ts:630` |
| `orb/no-media-queries-in-features` | `eslint.config.ts:753` |
| `orb/no-pointer-variants-in-features` | `eslint.config.ts:758` |
| `orb/no-fake-disabled-id` | `eslint.config.ts:637` |
| `orb/bus-on-data-no-store-write`, `orb/chat-stream-writes-in-bus-only` | `eslint.config.ts:870`, `:868` |
| `orb/no-static-staletime` | `eslint.config.ts:664` |
| `orb/theme-override-only-via-scope` | `eslint.config.ts:579` |
| `orb/no-direct-useform` | `eslint.config.ts:607` |
| `orb/dialog-via-composite` (raw `Dialog` root only) | `eslint.config.ts:640`, `ui-feature-policy.ts:101` |
| `orb/windowed-infinite-query` | `eslint.config.ts:634` |
| `orb/ui-variants-barrel-private`, `ui-no-inline-svg`, `ui-ct-no-color-literal`, `ui-ct-no-inline-provider`, `ui-overlay-anchored-anatomy`, `ui-overlay-modal-anatomy` | `eslint.config.ts` (ids listed), `tooling/src/eslint/index.ts:60-90` |
| `@tanstack/query/mutation-property-order` | `eslint.config.ts:458` |
| dep-cruiser `client-components-tier` and siblings | `.dependency-cruiser.ts:155,159,160` |
| dep-cruiser `client-data-direction`, `client-forms-direction`, `client-state-below-data`, `client-lib-floor` | `.dependency-cruiser.ts:145,147,144,143` |
| dep-cruiser `client-features-no-cross`, `client-feature-front-door`, `client-features-below-routes` | `.dependency-cruiser.ts:750,729,153` |
| dep-cruiser `client-nothing-imports-main`, `client-composition-tier-door-only`, `client-compose-door-only` | `.dependency-cruiser.ts:819,825,832` |
| dep-cruiser `ui-cake`, `ui-satellite-seals-*` (nine seals), alert-dialog seal | `.dependency-cruiser.ts:129,192,764` |
| Biome `noReactForwardRef`, `noUndeclaredDependencies`, rc-package `noRestrictedImports` | `biome.json:436,68,134` |
| stylelint `orb/motion-token-purity`, `orb/rest-transform-grid`, line-height allowed-list (CSS files only) | `stylelint.config.js:17-22` |
| feature-layout suite (bucket names, surface/hook naming) | `tests/client/feature-layout.suite.test.ts:63` |
| type tests for section, config-group, chrome registries | `tests/client/state/section-registry.dom.test-d.ts` and siblings |
| bus golden suite | `tests/server/domain/chat/bus-golden.suite.int.test.ts` |
| grid checks (DPR matrix) | `tests/tooling/ui-audit/lib/checks-grid.test.ts` |
| `LEADING_FLOOR` derived from `SNAPPED_LENGTH_BASE_PX` | `tooling/src/ui-audit/lib/ramp.ts:33` |
| reduced-motion CSS floor | `packages/ui/src/styles/globals.css:271,288` |
| `[anim]` flagger (dev instrument, not a gate) | `packages/client/src/lib/motion-flaggers.ts` |
| ui-audit rule `promoted-layer-offset` (instrument) | `tooling/src/ui-audit/contract/rules.ts:89` |

## Full table

Order: user-visible defects first (accessibility, states, focus, layout shift, motion safety), then data and state correctness, then structure, then cosmetic. "Violations" is a static estimate; "not scanned" means no cheap scoped scan exists. "Not mechanically checkable" marks judgment rules.

| Rule | Doc§ | Claimed enforcer | Exists? | Violations |
| - | - | - | - | - |
| Every interactive control has a non-empty accessible name | PRIM §13.10 | accessible-name-quality CT | no (false claim) | not scanned (runtime) |
| Label in Name: visible words appear in `aria-label` (N2) | PRIM §13.10 | accessible-name-quality CT | helper only: `tests/support/browser/accessible-names.ts:101`, no suite uses it on features | not scanned (runtime) |
| Landmarks named; same-role names unique (N5, N6) | PRIM §13.10 | accessible-name-quality CT | no (false claim) | 14 `<form>` without `aria-label` or `aria-labelledby`, e.g. `features/auth/components/login-local-form.tsx:48`, `components/form-dialog.tsx:189`; 0 unnamed `nav`/`aside` (816 tsx scanned) |
| Name source order, stable-first, action-oriented, headings, `name` is a data key (N1, N3, N4, N7, N8) | PRIM §13.10 | none (doc says review) | n/a | not mechanically checkable |
| Identity inputs carry spec `autocomplete` (N9) | PRIM §13.10 | none (doc says review) | n/a | 0 of 7 password inputs lack `autoComplete` |
| Empty, loading, error are designed; no centered spinner; no layout shift on arrival | LOCK §0.7/§11, ARCH §4.3 r7-r8, GATES §16 | `QueryBoundary` "forces the slots" | no gate; `components/query-boundary.tsx` is a helper | `<Spinner` in client: 0; rest not mechanically checkable |
| Every suspending read inside `QueryBoundary` | LOCK §0.7, §11 | none | no | not scanned (needs resolution-based census) |
| Visible focus, 8 interaction states, keyboard operation per interactive primitive | PKG §5, PRIM §13.8 R7, ARCH §4a | per-primitive CT | 9 of 65 primitive dirs have a `.ct.tsx` under `tests/ui/primitives/` | 56 primitive dirs without a `.ct.tsx` there (icons exempt); state coverage not scanned |
| Touch floor 44px at coarse pointer; wrap sub-44px hit areas | ARCH §4b axis 3, PKG §4 | design-audit `touch-target-floor` | no (false claim) | not scanned |
| Hover actions have tap and `:focus-within` equivalents | ARCH §4.3 r4, §4b | `orb/no-pointer-variants-in-features` (class spelling only) | partial: `eslint.config.ts:758` | equivalence not mechanically checkable |
| Pointer and hover variants only at token/shell layer | ARCH §4b | `orb/no-pointer-variants-in-features` | yes `eslint.config.ts:758` | enforced |
| `prefers-reduced-motion` removes motion; `transitionend` cleanup owes a reduced-motion case | MOTION §3.9 | CSS floor | floor exists `globals.css:271,288`; cleanup case none | cleanup case not mechanically checkable |
| No `transition-all`; every transition names properties | MOTION §1.2 | CT `transitionProperty` reads | no (false claim); no ESLint rule | 0 in code (4 comment hits); 0 CSS `transition: all` outside a comment |
| Lifecycle styling only from Base UI data attributes, no parallel React booleans | MOTION §5.3 | `orb/baseui-state-data-attributes` | no (false claim) | not scanned |
| Exit animation targets the part carrying `data-ending-style`, not a child | MOTION §5.2 | none (doc says review) | n/a | not scanned; detectable shape named in doc |
| Lifecycle motion uses transitions, not `@keyframes` on `data-open`/`data-closed` | MOTION §5.1 | none (doc says review) | n/a | 0 `animate-*` utilities or `data-open:animate`; 28 `@keyframes` blocks in 3 CSS files, allowlist review not done |
| JS may not produce animation values; FLIP exception list is closed | MOTION §1.5 | `orb/no-unruled-flip-inversion` | no (false claim) | `.animate(` in `lib/motion-animation-state.ts` and `sortable.tsx` (comments); rAF: `ui/art/web-weave/web-weave.tsx:381`, `ui/stream/use-smooth-text.ts:103`, `features/character/components/character-filter-rail-parts.tsx:116`; no spring or tween dependency present |
| Animate transform and opacity only; hover colour carve-out; bake blur | MOTION §3.7 | `[anim]` flagger | dev instrument only: `lib/motion-flaggers.ts` | runtime only |
| Three interaction duration tokens, one easing curve | MOTION §3.5, §4.3 | stylelint `orb/motion-token-purity` (CSS) | CSS yes `stylelint.config.js:17`; class strings no | 0 non-token `duration-`/`delay-` classes (only `duration-0`) |
| No rest-state transform; promoted layers on the pixel grid | LINE §9-§11, MOTION §4.2 item 2 | stylelint `orb/rest-transform-grid`; ui-audit runtime | CSS yes `stylelint.config.js:19`; runtime rules are instruments; class strings no | 11 unprefixed `translate-*`/`scale-*` in 9 files, mostly state toggles (`features/chat/components/room-flank.tsx:64`, `jump-to-latest-pill.tsx:28`); judgment |
| Line boxes are whole pixels; no Tailwind default `leading-*` | LINE §1-§3 | `leading-*` gate, CSS allowed-list | CSS yes `stylelint.config.js:21`; class strings no | 0 default `leading-*` classes in code (2 comment hits); bare `text-*` without a leading class not scanned |
| Reading surface is the one declared fractional-line-box exception | LINE §2, §11 | none | n/a | not mechanically checkable |
| Stacking scope: shell uses only in-context and app-frame z tiers | ARCH §3, §4.1a | `orb/no-portal-float-token` | rule id present in config set | not scanned |
| Section, modal, config-group definitions co-located and assembled once at the door | LOCK §6a, §6d, §8 | `orb/modal-definition-*`, `orb/config-group-definition-home` | no (false claim); `orb/registry-assembly-at-door-only` exists | not scanned |
| Registries total over their vocabulary tuple; planned sections declare a reason | LOCK §5, §6a | tsc plus type tests | yes `tests/client/state/section-registry.dom.test-d.ts` | enforced by types |
| No effect keyed on shared selection pointer | STACK §5.1, LOCK §9 | `no-effect-on-shared-selection` | no (false claim) | 4 files hold both a selection hook and an effect (2 outside app-shell: `features/character/surfaces/character-editor-surface.tsx`, `features/chat/surfaces/command-palette-surface.tsx`), keying unverified; 149 `useEffect` calls in client |
| Durable-local keys per user; raw storage only inside the store doors | GATES §9, §10a | `persistence-boundary` | no (false claim); `orb/no-raw-zustand-persist` exists | storage calls outside `state/` doors: `data/session-resume.ts`, `lib/probe-mode.ts`, `main.tsx` (2); sanctioned status unverified |
| Stores minted through the three doors; one `create` per file, 10 fields max | GATES §9, STACK §5 | `orb/state-files`, `orb/no-raw-zustand-persist` | yes | enforced |
| Cache surgery and invalidation only in `data/` | PKG §6.2, STACK §6.1 | two named gates | no (false claim) | 0 `invalidateQueries`/`setQueryData`/`setQueriesData`/`removeQueries` calls outside `data/` |
| `useMutation` only in `create-entity-mutation.ts`; `useInfiniteQuery` only in the factory | GATES §14 | none named | no | 0 outside `data/` |
| Query keys are proxy-derived | GATES §10, PRIM §13.1 | `no-restricted-syntax` `queryKey` selector | no (false claim) | 0 hand-built `queryKey: [` in client (1588 files) |
| One error slot per mutation | GATES §11 | `no-multiplexed-mutation-error` | no (false claim) | not scanned |
| Multi-field forms use a form factory; no reset in autosave | GATES §14, STACK §6.1 | three named gates | no (false claim); `orb/no-direct-useform` exists | 6 `.reset(` matches in `forms/` and `features/`, autosave context unverified |
| `ConfirmDialog` is the only feature-tier confirm | GATES §14 | dep-cruiser alert-dialog seal | yes `.dependency-cruiser.ts:764` | 0 `@orb/ui/alert-dialog` imports in features |
| No hand-written `fetch(` in features | GATES §10 | `orb/fetch-fn-in-features` | yes `eslint.config.ts:630` | enforced |
| `staleTime: Infinity`, never `'static'` | GATES §10 | `orb/no-static-staletime` | yes `eslint.config.ts:664` | enforced |
| No `useBlocker`, `document.title =`, `useOptimistic`, `useActionState`, `useFormStatus` | ARCH §4a, STACK §5.1 | `orb/no-legacy-react-api` covers other APIs | not for these | 0 of each |
| No hand-written `useMemo`/`useCallback`/`React.memo` (Compiler is on) | ARCH §4a | none | n/a | 5 matches across client and ui (1965 files), includes comments |
| `@media` only in app-shell | ARCH §4 | `orb/no-media-queries-in-features` | yes `eslint.config.ts:753` | enforced |
| Polarity only via `light-dark()`; no `dark:` variant | LOCK §4.6 | `orb/no-tailwind-dark-variant` | yes `eslint.config.ts:1058` | enforced |
| Session channel never carries server truth | GATES §13.7 | `orb/session-channel-boundary` | yes `eslint.config.ts:1074` | enforced |
| Five-tier direction; features never import each other; routes thin | LOCK §3, §7 | dep-cruiser rules | yes (see verified table) | enforced; rules not re-run for this audit |
| Features pass `voice` only; `size`/`weight`/`tone`/`transform` are ui-internal | DENS §2.3 | none (D333) | no | 217 attributes on `Text`/`Heading` in 93 client files (tone 132, size 69, weight 14, transform 2), e.g. `data/query-error-state.tsx:41`, `features/credentials/components/connection-transport-editor.tsx:192` |
| `Surface` is the only writer of `data-surface-tier` | DENS §4.1 | none (D333) | no | 0; only `packages/ui/src/layout/surface.tsx:44` writes it |
| `Card` has no `padding` prop | DENS §4.3 | type absence | yes `primitives/card/card.tsx:40` | enforced by types |
| Same-tier `Surface` nesting is RED; chrome diet CD1-CD3; radius and spacing step assignment | DENS §2-§3 | none (D333); CT assertions external | no | not mechanically checkable |
| Primitive trio, `{camelName}Variants` export, private variants barrel | PRIM §13.7 | `orb/ui-variants-barrel-private` | barrel yes; trio and naming no rule | 0: 5 dirs without `variants.ts` equal the exempt list; all `variants.ts` export `*Variants` |
| Every styled primitive has a co-located CT | PRIM §13.7 | none | no | 56 primitive dirs without a CT |
| No inline `<svg>` in primitives | PRIM §13.7 | `orb/ui-no-inline-svg` | yes | enforced |
| Satellite libs imported only from their seal | PKG §3 | `ui-satellite-seals-*` | yes `.dependency-cruiser.ts:192` | enforced |
| `@orb/ui` has no dep on contracts/db/server/client | PKG §1 | `ui-cake`, biome `noUndeclaredDependencies` | yes `:129`, `biome.json:68` | enforced |
| No `node:*` in ui | PKG §1 | `ui-no-node-builtins` | exists under another name `:691` | enforced |
| Every Base UI part exposed or ledgered | PKG §14 | `baseui-anatomy` gate | no (false claim) | not scanned |
| Authoring rules R1-R9 (full part surface, right primitive, derive prop types) | PKG §13, PRIM §13.8 | none | n/a | not mechanically checkable |
| `className` narrowed to string on seals | PKG §15 | none | n/a | not scanned |
| Banned deps absent (sonner, vaul, radix, clsx, cva, DOMPurify, react-markdown, nivo, RHF, framer-motion) | PKG §3, ARCH §6 | biome bans only the rc Base UI package | partial `biome.json:134` | 0 present in any `package.json` |
| No root barrel for `@orb/ui` | ARCH §2 | none | n/a | 0 `.` key in `packages/ui/package.json#exports` |
| Streamdown at least 2.5 | ARCH §6.3.1 | none | n/a | satisfied, catalog `^2.7.1` (`pnpm-workspace.yaml:219`) |
| Card HTML only in sandboxed iframe; Tier-A allowlist; untrusted media gated | THEME §12 | CTs under `tests/ui/content/` | sandbox-frame CT yes (`tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx`) | enforced for frame; policy suites by other names missing |
| Over-art plate law; clamp derivation; emit-surface pairing | THEME §12.1 | named suites | no (false claim) | not mechanically checkable here |
| Ten UX rules (one primary per region, no dead ends, character-first, accent at most 10%) | ARCH §4.3 | none (D333) | no | not mechanically checkable |
| Weave glyph at most once per screen | ARCH §4.3 | none | n/a | not mechanically checkable |
| Motion taxonomy, stagger, "when not to animate" | MOTION §2, §3.8, §3.10 | none | n/a | not mechanically checkable |
| Motion inventory items 1-10 are built as described | MOTION §4.2 | cited files | files exist (`use-enter-motion.ts`, `tabs.tsx`, `overlay-motion.ts`, `use-shell-track-flip.ts`); behaviour not verified | n/a |
| Section ids, vocabulary tuples keep one home | LOCK §5 rule 5 | tsc | yes by types | enforced |
| Event/sync spine rules, server emit sites, fan scope | GATES §13 | bus golden suite, `assertNever` | suite exists | out of scope (server) |

## Not covered

- Server-side rules in GATES §13 (emit sites, fan scope, delete ordering) and `packages/server`.
- Dependency-cruiser and ESLint were not run; rule existence and configuration were read, not executed.
- Tests under `tests/` were checked for existence by path and literal name only, not run.
- `tooling/src/ui-audit` and `tooling/src/motion-audit` rules were checked for existence only; they are instruments and their CI wiring was not traced.
- stylelint rule bodies were not read beyond the config entries.
- Files outside `packages/client/src` and `packages/ui/src` were not scanned for violations; `.claude/worktrees/` was excluded.
