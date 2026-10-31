---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-foundation
---

# Rebuild the open inference, import and composition restoration cases

## What

Open after restoration batch 5 (case map: the inference backends, import identity and composition section of docs/plans/test-foundation/design.md): a client unit case for planTreeImport (every upload carries settings, persona avatars and worlds); a server case for the embed-space rebuild trigger, which needs two real encoders; the registry publication-order and compensation cases, which need a held or failing store read that no door gives (build the seam or rule the guard out); plus the open body-shaping, anthropic span, bundle and services cases the register rows name.

## Why

The batch 5 register rows stay Partial until these are decided.

## Done when

Each named case is rebuilt through production with a planted-defect red, or dropped with a reason in the case map, and the batch 5 register rows read Accounted for.

## Evidence

Decisions are in the [case map](../plans/test-foundation/design.md#selected-case-map-inference-backends-import-identity-and-composition). Each rebuilt case failed under a planted production defect and passed restored.

| Case | Test | Planted defect that failed it |
| - | - | - |
| Carry-off key, non-object kwargs | `tests/inference/backends/openai-compat/body-shaping.int.test.ts` | the user-key guard on `applyPreserveReasoning` removed |
| Mandatory-reasoning interlock | same | the `reasoningMandatory` exit removed from `applyPrefill` |
| Names, assistant media, image detail, reply modalities | same | the image-detail pass, the reply-modalities rule and the row re-attachment disabled in turn |
| Cache-marker move, same-role fold, user messages array | same | the pending-marker hand-off removed, the fold disabled, the `rowsOwned` exit removed |
| Turn span events | `tests/server/foundation/observability/provider-turn-span-events.int.test.ts` | the cache event removed; the raw stop word blanked |
| Registry order and compensation | `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts` | `publishInOrder` run unordered; the rollback `removePlugin` removed; the lane tail made to carry a rejection |
| Folder plan | `tests/client/data/import-tree-plan.int.test.ts` | the world-book shared role removed; group members dropped; the secrets arm removed |
| Two-profile upload | `tests/server/entry/http/import-identity.int.test.ts` | the first-profile `landed` guard removed |
| Room blob, compact summary, variable picks, card art | `tests/server/domain/import/loader/library-planes.int.test.ts` | each of the three bundle fields nulled on import; the imported avatar bytes truncated |

The registry cases found the seam the case map ruled out: the root accepts a `db`, and its native libSQL client takes a spy, so one statement can be parked or refused while the store, the registry and the plugin lifecycle stay real.

Open, not decided in this leg: the embed-space rebuild trigger (it needs two real embedding connections and a pinned stored target), the persona-switch live fan, a left seat on persona removal, the forwarded diffusion knobs, old-model memory vectors, memory without a summarizer, the `asset.created` image lenses and fresh seeded content reusing the shipped raw-image vectors. The `services.test.ts` register row stays Partial and names them.

Runs: `pnpm test` over each file above.
