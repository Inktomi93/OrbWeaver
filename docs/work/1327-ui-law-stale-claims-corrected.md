---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/dom
plan: css-system
---

# Stale enforcement claims in the UI law are corrected

## What

From the audit: `UI-Primitives-and-Reuse.md` §13.9 names ESLint `max-lines` as the UI source limit (absent); §13.1 and `ui-package-design.md` §6.2 say `createCollectionSurface` bakes `maxPages` while `orb/windowed-infinite-query` bans `maxPages`; `ui-package-design.md` §14 names a `baseui-anatomy` gate (absent); the law calls dependency-cruiser's rule `ui-no-node-builtins` (it is `browser-and-iso-no-node-builtins`); lockdown §6a names a registry-derived roster CT census (absent); the restoration register names tests that do not exist (switch CT, `theme-emit-pairing`, `seed-theme-pairing`, `palette-contrast`, `emit-surface`, `appearance-message-style-section`).

## Why

A doc that names a missing check misleads every reader that trusts it.

## Done when

Each claim is made true (the check added, with a control) or removed from the law, decided per row with a reason in this item's Evidence; the register rows point at real tests or say the case is unbuilt.

## Evidence

Decision per row. Every row removed the false claim; none built a check. Prose-only change, so no test runs.

| Row | Decision | Reason |
| - | - | - |
| ESLint `max-lines` as the UI source limit (`UI-Primitives-and-Reuse.md` §13.9) | claim removed | no limit number is ruled anywhere; the largest `packages/ui/src` file is 444 lines, so a limit set now would be arbitrary. The same claim for test files in `Spine-Testing.md` is removed too |
| `createCollectionSurface` bakes `maxPages` (`UI-Primitives-and-Reuse.md` §13.1, `ui-package-design.md` §6.2, `UI-Architecture-and-Layout.md` table) | claim reversed | `orb/windowed-infinite-query` bans `maxPages` (`tooling/src/eslint/ui-feature-policy.ts:130`) and `create-collection-surface.ts` does not set it; the three sites now say "never `maxPages`" with the reason |
| `baseui-anatomy` manifest and gate (`ui-package-design.md` §14) | claim removed | the manifest generator was custom AST tooling, which D333 deleted; the anatomy table stays as a review rule. ADR 0128 and ADR 0179 still name the gate; I did not edit those records (fork reported) |
| dependency-cruiser `ui-no-node-builtins` (`UI-Architecture-and-Layout.md` §1.1, `ui-package-design.md` §1) | renamed | the rule is `browser-and-iso-no-node-builtins` (`.dependency-cruiser.ts:691`) and its `from` list includes `UI` |
| registry-derived roster CT census (`client-architecture-lockdown.md` §6a) | claim removed | no census test exists; `Every roster search uses ListSearch` stays as a review rule |
| restoration register rows (`integer-line-boxes.md` §2, `UI-Theming-and-Content.md` §12.1) | point at real tests or say unbuilt | the register lists `ui/tokens/index.test.ts`, `ui/primitives/switch/switch.ct.tsx`, `theme-emit-pairing`, `seed-theme-pairing`, `palette-contrast`, `emit-surface` and `appearance-message-style-section` as unreviewed with no maintained home. The law now says unbuilt for each; AA of emitted tokens points at the real `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` |

Addendum from the 1323 review: ADR gate names that exist nowhere, checked against near-names first.

| ADR and claimed gate | Decision | Reason |
| - | - | - |
| 0078 `no-manual-autosave-flush` | claim dropped | the autosave hook is unexported and the session boundary owns the save driver, so a flush is never needed. A lexical `handleSubmit` ban cannot tell it from the 12 explicit-submit forms (13 call sites, 772 ts and 822 tsx files scanned); `character-editor-surface.tsx:265` is one, on a hand-mounted `<form>` |
| 0054 `no-static-staletime-on-bus-keys` | renamed | built as `orb/no-static-staletime` (`eslint.config.ts`) |
| 0054 `no-inline-cache-surgery-in-stream` | renamed | built as `orb/chat-stream-writes-in-bus-only` (`eslint.config.ts`) |
| 0054 `persist-partialize-and-total-migrate` | renamed | `partialize` and `migrate` are required options of the persisted-store factory (`persisted-store-implementation.ts`), and `orb/no-raw-zustand-persist` refuses any other persist |
| 0054 `virtualizer-only-in-seal` | renamed | dependency-cruiser `ui-satellite-seals-virtual` (`.dependency-cruiser.ts:188`) |
| 0073 `chrome-registry-completeness` | claim replaced | `tests/client/state/registry-definitions.dom.test.ts` (every co-located `ChromeEntry` is held by the door, ids unique, zones closed) and `chrome-registry.dom.test-d.ts` |
| 0073 `modal-registry-completeness` | built, arm dropped | the registry is total over `MODAL_SLOT_IDS` by `createRegistry`'s `Record<Id, Def>`. I added `ModalDefinition` to the door-wiring census in `registry-definitions.dom.test.ts` (11 modal files against the vocabulary length). The `surface-reachability` arm (a `surface` modal has an `openModal` caller) is dropped: no registry knows its callers, and a string search for ids would pass on a comment |

Still false and not in the addendum: ADR 0078 and 0054 name `form-factory-for-multifield`, ADR 0078 names `no-form-reset-in-autosave`, ADR 0073 names `no-parallel-section-map`, ADR 0220 cites `chrome-registry-completeness`, and ADR 0128 and 0179 name `baseui-anatomy`. I left those records as written.

Left alone (not in this item): `UI-Primitives-and-Reuse.md` §13.10 still names `accessible-name-quality.suite.ct.tsx`, which does not exist (the audit table lists it; the accessibility item owns it).
