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

Decisions are in the [case map](../plans/test-foundation/design.md#selected-case-map-inference-backends-import-identity-and-composition). Every defect below was planted in the final tree, the named case failed, and the file was restored (`git diff -- packages` clean after the run).

| Case | Test file | Planted defect | Case that failed |
| - | - | - | - |
| Carry-off key and non-object kwargs | `tests/inference/backends/openai-compat/body-shaping.int.test.ts` | the user-key guard in `applyPreserveReasoning` removed | a reasoning-off turn tells the template not to think |
| Mandatory-reasoning interlock | same | the `reasoningMandatory` exit in `applyPrefill` removed | a mandatory-reasoning model keeps its thinking |
| Image detail | same | `applyImageDetail` skipped | participant names, a prior reply's image and the image detail |
| Reply modalities | same | the modalities rule disabled | a reply that may carry an image asks for both modalities |
| Row re-attachment | same | the plan re-attachment disabled | participant names, a prior reply's image and the image detail |
| Cache-marker move | same | the pending-marker hand-off removed | an OpenRouter cache marker rides its row's last text part |
| Same-role fold | same | the fold disabled | same-role rows fold into one message of parts |
| User messages array | same | the `rowsOwned` exit removed | a messages array the user set keeps its own cache marker |
| Turn span events | `tests/server/foundation/observability/provider-turn-span-events.int.test.ts` | the cache event removed; the raw stop word blanked | a turn adds its first delta, finish and cache events |
| Registry order | `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts` | `publishInOrder` made unordered | an older store read cannot republish an admin provider |
| Claim rollback | same | the rollback `removePlugin` removed | an activation whose publish fails releases its claim link |
| Failed-read recovery | same | the lane tail made to carry a rejection | a failed store read does not poison later registry publication |
| Folder plan | `tests/client/data/import-tree-plan.int.test.ts` | the worlds shared role removed; group members dropped; the secrets arm removed | a split SillyTavern profile repeats settings; a split profile seats a group; the plan never sends a secrets.json |
| Two-profile upload | `tests/server/entry/http/import-identity.int.test.ts` | the first-profile `landed` guard removed | a two-profile upload binds a repeated world name |
| Room blob, summary, picks, art | `tests/server/domain/import/loader/library-planes.int.test.ts` | variable values nulled; compact summary nulled; room metadata dropped; imported avatar bytes truncated | a room's compact summary, room overrides and variable picks restore by value |
| Embed-space move | `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts` | the forced-sweep params dropped | binding a second encoder queues the owner's own forced rebuild |
| Refused enqueue | same | the repoint sweep supervised under another span name | a refused enqueue is logged under the reindex span |
| Live persona fan | `tests/server/domain/persona/verbs/seat-persona.int.test.ts` | the `personaSwitched` emit removed | switching the seat's persona reaches the room's live channel |
| Seat re-seat | same | the re-seat after a persona delete removed | a member who left a room is no longer a seat there |
| Forwarded negative prompt | `tests/server/domain/automation/engine/dispatch.int.test.ts` | the arm's `negative` field not forwarded | a rule-fired free-mode generate_image reaches the image provider |
| Asset-created lenses | `tests/server/domain/embeddings/persistence/asset-created-lenses.int.test.ts` | the `asset.created` handler made a no-op | storing an avatar with indexing on leaves the captioned lens |
| Memory off after a move | `tests/server/domain/embeddings/persistence/memory-scope-completion.suite.int.test.ts` | the vacuous-receipt branch bypassed | memory off after an encoder move drops the old-model segments |
| Memory without a summarizer | same | digests treated as always derivable | memory on with no summarize connection embeds segments |

Not independently planted: the unbind and re-bind controls in the embed-space case. Forcing the move verdict true makes the target resolve loop never settle (the run hangs), so they stay positive controls for the move case on the same wiring. The filter ahead of the verdict (`spacesMayMoveTarget`) is not asserted, because the stored target decides.

Dropped, with reasons in the case map: the boot sweep and two-trigger adoption (they need a stored target only an older release writes), the install-removal and two-activation registry variants, the derived runtime variables, the size preset of a forwarded image request (the scripted edge records a request line, not a body), and seeded content reusing shipped raw-image vectors (no root composes the shipped local-light seed or a scripted cache).

The moved fixture the coordinator allowed for is not needed: the embed-space case runs on `seedAlternateEmbedder`, a second corpus embedding connection added to the testkit's composed door beside `seedCorpusConnections`, so `runtime-funding.fixtures.ts` is untouched.

Runs: `pnpm test` over each file above, then the whole set together.
