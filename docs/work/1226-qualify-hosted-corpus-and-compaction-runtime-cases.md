---
kind: bug
status: open
updated: 2026-10-22
priority: P2
area: testkit
plan: test-foundation
---

# Qualify hosted corpus and compaction runtime cases

## What

Qualify hosted execution of corpus search, completed-capsule cloning and the managed-compaction pre-turn threshold case. Diagnose setup cost, contention or blocked resource lifetimes before changing a timeout.

## Why

These cases pass locally but time out in the hosted Node suite. Local results do not establish hosted qualification.

## Done when

The named cases complete on the hosted runner with their ownership, output and cleanup assertions intact. Explain the cause before changing timing budgets. Keep production composition and synthetic corpus data.

## Evidence

The [hosted Node job](https://github.com/Inktomi93/OrbWeaver/actions/runs/39703507878/job/119578008178) reports timeouts in:

- `tests/support/node/corpus-search.int.test.ts`: native routed search and publication.
- `tests/support/node/corpus.int.test.ts`: completed migrated capsule and independent DB/CAS clone.
- `tests/server/domain/chat/engine/managed-compaction.suite.int.test.ts`: pre-turn threshold one-row-short refusal.

The local application run passes these cases and the producer, fixture, library-clone, search-publication and fixture-lifetime suites. No timeout cause is established by that local success.

## Causes

Local runs pass because `budget()` stretches each deadline by the host load average. A quiet hosted runner gets the base deadline: 5000 ms by default, 30000 ms under `slow`. The hosted job ran with two workers.

- Pre-turn threshold: the binary search for the threshold was memoized and lazy, so whichever offset case ran first paid for about eight full SDK rooms inside its own deadline. Locally the one-row-short case took 7041 ms and the crossing case 1335 ms. The search now runs once in a describe-scoped `beforeAll` that both cases await. Each case then measures only its own room: 399 ms and 473 ms.
- Corpus search: the case produces the whole search corpus. A phase probe measured root 539 ms, actors 121, libraries 209, recall 1454, images 559 and `seedCorpusSearch` 3421 ms at load 36 on 24 cores. Workload settlement advances the controlled timers, so the case contains no wall-clock wait or held resource. The cost is real production work over the 5000 ms default.
- Completed capsule: about 25 production producers run in sequence: 36 to 42 s locally under the same load. An in-process CPU profile shows SQLite through drizzle as the largest busy cost, with 11 s of main-thread idle across child processes, scrypt and file I/O. No single producer dominates; the largest is the SDK session producer at about 5 s, with its real child processes. Nothing is blocked, so the case cannot finish within 30000 ms without less work or a longer deadline.

## Rulings applied

- Corpus search carries `slow`: a proven runtime of about 6 s of producer work, which is the tag's registered meaning.

- The capsule case keeps only its own claim. Producers close before cloning: no open descriptor, lock, pending turn or handoff, and a sole WAL. The publication and the clone DB are scrubbed. The DB and CAS stay independent of the source. The per-producer checks are gone; the header names the producer suites that own those facts.

- The case builds a small capsule. `createCorpusCapsule` takes `producers: "clone-boundary"` and runs only the producers each claim needs. Without the option it still runs every producer, so other corpus suites are unchanged.

  | Producer | Why it runs |
  | - | - |
  | OIDC owner initialization | The synthetic capsule requires its native owner. |
  | Actors | The lifecycle producer needs the second member. |
  | Private credential | A credential row the clone must drop. |
  | Baseline | Chats with messages, a password-login session and the published reads. |
  | Libraries | The CAS asset and the persona the reads name. |
  | Chat lifecycle | A held turn lock and a handoff that must be released before cloning. |

- The full capsule took 36 to 42 s. The small capsule case takes 3179 to 4372 ms alone, at load 28 on 24 cores. In the four-worker `tests/support` run it crossed the 5 s default at 5017 ms, so it keeps `slow`.

- The capsule case's published-secret check builds its list from the captures, apart from the list `publishWire` refuses on.

- The old capsule case's clone checks that no suite owned now have owners:

  | Check | Owner |
  | - | - |
  | Roster, persona and tag reads on a scrubbed clone equal the capture, including the five tag-reach reads, `listTagsWithUsage` and `rosterPreset.applyToChat` | `tests/support/node/corpus-library-clone.int.test.ts`, which now clones with the publication scrub |
  | A foreign caller gets NOT_FOUND from `rosterPreset.get`, `tag.listAttachedEntities` and `persona.listConnectedCharacters` on the clone | the same suite |
  | Members re-authenticate on the clone with fresh sessions; a password rotation and a logout each revoke only their own cookie | `tests/support/node/corpus-auth.int.test.ts`, the local clone admission case |
