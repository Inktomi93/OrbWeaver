---
kind: review
status: active
updated: 2026-09-20
---

# Retained embedding generations design

## Decision

Keep the last jointly complete corpus queryable while a replacement is built. A vector generation is an
immutable tuple of owner, logical task, actual role, connection id, resolved non-secret encoder configuration,
and `model[@dtype]`. Its deterministic generation key, rather than the space tag alone, selects vector rows.
This distinguishes two connections that advertise the same model and dtype but reach different providers,
endpoints, or request configuration.

The four sweep scopes remain the completion authority. `cards`, `memory`, and `documents` jointly promote one
`embed` generation; `images` independently promotes one image generation, whose actual role is either
`imageEmbed` or the captioned-text `embed` fallback. A completed scope records a candidate generation without
changing the active generation. The final scope promotes all scopes and reclaims retired rows in one database
transaction. Until then, reads embed through and scan the previous active generation.

If the active generation's recorded connection was deleted, is unavailable, or now resolves to a different
encoder fingerprint, retrieval takes the existing named `SEARCH_SPACE_REINDEXING` refusal. A matching row id
alone is never proof that it still serves the recorded geometry.

## Why the current shape cannot implement Arm A

`embed_space_state` stores only one `space` per owner and sweep scope. A scope completion overwrites that row;
after the first of the three text sweeps finishes, the old joint generation is no longer named by all three
rows. The search fold therefore knows only “moving,” not which old corpus and connection remain usable.

Every primary vector table keys coexistence on `model`, where `model` is `model[@dtype]`. Two connections that
serve the same tag collide on the same upsert key, so a pending write can overwrite the active vector before
promotion. Connection provenance cannot be reconstructed from a vector row. The document shrink prune also
deletes `model != live` per document, and memory shrink deletes are not generation-belted; both can reclaim or
mutate active rows while a pending sweep is incomplete.

The existing runtime already resolves by connection id through `connection.resolve({ connectionId })`. Arm A
therefore needs a server composition op over that door and the existing executor, not another inference
resolver API.

## Durable shape

Add `embed_generations`, one immutable row per deterministic generation key:

| column | meaning |
| - | - |
| `id` | SHA-256 key over the canonical generation tuple; includes owner and connection id |
| `owner_id` | corpus owner |
| `task` | promotion group: `embed` or `imageEmbed` |
| `via` | actual encoder role: `embed` or `imageEmbed` |
| `connection_id` | immutable connection id, deliberately retained after deletion; the by-id resolver returning missing makes the generation unavailable without erasing which connection produced it |
| `connection_ref` | immutable original id for diagnosis; never used to bypass a null FK |
| `fingerprint` | SHA-256 vector-compatibility identity over provider, endpoint, model, capability, and request-shaping configuration; excludes the user-scoped connection row id |
| `space` | actual `model[@dtype]` stamped by the encoder |
| `created_at` | audit/order fact, not generation identity |

The generation id includes connection id plus the full resolved non-secret configuration; credentials remain
excluded. A surviving row is not enough: the by-id resolver recomputes that id before a query can use the
connection. Cross-owner document retrieval separately compares the stored compatibility fingerprint, so two
distinct user connection rows can share vectors only when provider, endpoint, model, capability, and all
request-shaping configuration agree; a matching model and dimension alone are insufficient.

Replace the single completion value in `embed_space_state` with nullable `active_generation_id` and
`candidate_generation_id`. The row stays keyed by `(owner, scope)`: completion is a sweep fact, not a task
flag. An active generation is usable only when every scope in `VECTOR_SCOPES_BY_TASK[task]` names the same
non-null active id. Candidate disagreement means retries or a binding change are still converging; it never
changes the active fold.

Add one `embed_generation_targets` row per owner and logical task. It names the authoritative pending
generation and carries a monotonically increasing epoch. Resolving the live binding creates or advances this
target before a sweep starts. A completion receipt includes that epoch and is accepted only while the target
still matches. An old worker therefore cannot overwrite newer candidate receipts or promote its generation
after a later binding has already become authoritative. Scope rows remain the proof that independent work
finished; the target controls which work is currently eligible to supply that proof.

Each vector table gains `generation_id` and changes its natural uniqueness key from `model` to
`generation_id`. The existing `model` and `dim` columns remain actual encoder evidence. Hash reads, upserts,
shrink prunes, discovery reads, and search scans select the generation id. This preserves two same-tag
generations and prevents pending maintenance from touching active rows.

The inference program is explicitly pre-launch, so D163's standing exception applies: regenerate
`0000_baseline.sql` and committed metadata rather than add a forward migration. `DB_LAUNCHED` remains true;
the owner performs any deliberate local reset separately.

## Write and sweep protocol

1. Resolve the live bound connection for the corpus owner and actual role. Canonicalize its non-secret
   configuration and ensure the immutable generation row exists.
2. Pin that resolved snapshot for the operation. Every embed call in the operation uses the snapshot rather
   than re-reading the binding. Verify the returned `model[@dtype]` equals the generation's recorded space.
3. Stamp every vector row with the generation id. Content-hash no-ops compare only rows in that generation.
4. A completed, non-aborted, failure-free sweep records its scope's candidate id and target epoch only when
   the task target still matches. Aborts, failures, and stale workers leave state unchanged; partially written
   vectors remain unreachable and retryable.
5. In the same transaction, compare-and-set only if the authoritative target and epoch still match and every
   required scope names that generation and epoch. Then set every required scope's active id, clear those
   candidate receipts, and delete vector rows for retired generations in those scopes. The active switch and
   old-row purge cannot be observed apart.

If a binding changes during a sweep, the pinned snapshot keeps the writes internally coherent. A later sweep
advances the authoritative target to a different generation and epoch. The old sweep's stale completion is
rejected even if three old workers finish after a newer promotion. Re-running the new generation records
eligible candidate receipts scope by scope until the joint comparison succeeds.

Every scheduled task emits a successful empty-scope receipt when it has authoritatively established that its
eligible corpus is empty. Disabled memory remains a no-op and does not resolve or create generations; the
orchestrator supplies an explicit memory-ineligible receipt for the current target instead. Fresh owners use
the same target plus empty receipts, so an empty document or memory corpus cannot block the first promotion.

Online card/image indexer writes follow the same generation selection. A write matching the active generation
updates active rows. A write after a binding/config change lands in the pending generation and remains hidden
until the corresponding corpus sweeps promote it.

## Read protocol

Resolve the active generation from the completion rows before embedding a query. Re-resolve its
`connection_id` for the recorded actual role and owner, compare fingerprint and space, then call the backend
through that resolved snapshot. Scan only rows carrying the active generation id.

Promotion can race the remote query embed. After the database scan, re-read the active generation id. If it
changed, discard the result and retry the whole resolve, embed, and scan once against the new active
generation. A second change returns `SEARCH_SPACE_REINDEXING`; this bounded optimistic retry prevents a
promotion from deleting the selected rows and producing a transient empty answer.

The image scope remains independent even when it uses the text encoder: its promotion task is `imageEmbed`,
its actual role is `embed`, and only the `images` sweep can promote it. This preserves the joint-space fallback
without letting completion of any text sweep claim image completion.

No active generation means no complete corpus is known. Once candidate rows exist, retrieval refuses with
`SEARCH_SPACE_REINDEXING` rather than exposing a partial first build. The pre-launch baseline contains no
legacy rows requiring an unproven model-only bootstrap arm.

## Failure and isolation guarantees

- Generation and completion rows are owner-scoped; all mutation and promotion predicates include owner id.
- Deleting a connection nulls its FK and forces Arm B. The immutable reference is diagnostic only.
- Editing a surviving connection produces fingerprint drift and forces Arm B for the old active generation.
- A failed or aborted sweep never marks its scope complete and never purges active rows.
- A stale completion racing a newer candidate cannot promote unless all required scopes still agree on its id.
- The task target epoch rejects stale completion even when every old scope finishes after a newer promotion.
- Per-document and memory shrink operations are generation-belted, so pending maintenance cannot delete the
  active generation.
- Promotion and purge are one transaction. Extra abandoned pending rows are safe garbage; a later promotion
  or owner-scoped cleanup can reclaim them without affecting reads.

## Proof plan

The mandatory red-first integration uses real vector writes and reads: seed a complete old generation, switch
to a different connection with the same `model[@dtype]`, complete and purge one text sweep, then query through
the old surviving connection. Current code overwrites or purges the old rows before replacement is jointly
complete; the new code must keep old nearest-neighbour results until cards, memory, and documents all finish,
then atomically return the new corpus.

Additional focused proofs cover deleted old connection (named refusal), edited-in-place fingerprint drift
(named refusal), abort/failure retention, out-of-order stale completion, owner isolation, same-model connection
separation, an empty eligible corpus plus disabled memory, image fallback as an independent sweep, a promotion
during query with one bounded retry, and the final promotion's old-generation purge.
