---
kind: work
status: doing
updated: 2026-10-21
priority: P2
area: packages
---

# Adjudicate unused production exports behind explicit package doors

## What

Use the native production Knip inventory and shrink-only baseline to review unused public re-exports and implementation exports in cohesive package or domain batches. Remove unnecessary surface, follow real callers, delete genuinely unused code, and retain deliberately supported external APIs with their actual contract. Explicit package paths are implemented; symbol-level adjudication is not complete.

## Why

Closing wildcard package paths exposes unused symbols but does not remove them. Tests and tooling must not keep production code falsely alive, and a baseline entry is debt rather than authority.

## Done when

The recorded production inventory is fully adjudicated in package/domain batches. Each batch records production roots and consumer scope. Removed exports preserve real callers; retained external APIs have explicit contracts. Baseline debt shrinks without new exemptions. No custom liveness reader or fake consumer is added.

## Evidence

Detailed implementation and qualification evidence is preserved in `reports/review/tooling-park-2026-10-21/work-before/0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md`.

Continue owner-authorized package batches. Keep other scopes parked and preserve their source, reports and unfinished qualifications.

## Selected kit cases

| Behavior | Decision and maintained home |
| - | - |
| Macro coercion, argument bounds, diagnostics and strict rendering | Rebuild through the production evaluator and registry in [argument enforcement](../../tests/kit/macro/argument-enforcement.test.ts). Remove the redundant `validateMacroArgs` facade. |
| Accepted-base foreground margin and ramp/input correction | Rebuild with live solvers in [accepted-base foreground](../../tests/kit/theme-derivation/accepted-base-foreground.test.ts). Preserve the attainable derivation target in D202. |
| Emitted foreground pairs, input composition and opaque reading bands | Move appearance checks to [native ThemeScope CT](../../tests/ui/content/theme-scope/emitted-contrast.ct.tsx). Remove unused convenience wrappers without changing live derivation. |
| Generated handle tables and runtime Unicode agreement | Keep provenance and move compatibility coverage to the [repository-contract test](../../tests/kit/handle-key/unicode-version.repo.int.test.ts). Add no production import door. |
| Tooling-only kit consumers | Keep existing pure APIs with maintained tooling consumers. Production-only findings do not establish unused code across the workspace. |

Registry completeness, autocomplete, other handle-key cases and unrelated theme reference cases remain outside this selected restoration scope. The [restoration register](../plans/test-foundation/design.md#restoration-register) records these bounds.

## Selected server boundaries

| Surface | Disposition |
| - | - |
| Unused boundary type forwarders | Remove unused aliases while retaining canonical definitions, consumed public exports and emitted JavaScript. |
| Generated AppRouter declaration entry | Keep the compiler source entry. Model its actual client consumers through native Knip source mapping. |
| Plugin Git packer | Preserve the implementation and use its module front door from the production Git adapter. |
| Domain contexts | Follow [the context construction rule](../law/Core-0-Architecture-and-Structure.md#4-the-per-feature-template--the-legibility-engine). Import types from their canonical contracts; retain real dependency adapters and state owners. |

The context migration uses JSSG against a resolved import inventory. Compiler, runtime-output equivalence and composed application checks qualify the changed boundaries.
