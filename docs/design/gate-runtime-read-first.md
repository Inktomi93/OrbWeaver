---
kind: reference
status: active
updated: 2026-09-13
---

# Gate-runtime read first

Read this file first in a cold or compacted #1584 session. The standing law and procedure are the only other mandatory
whole reads. Everything else is selected by the question in front of you.

## 1. Ordered read list

| # | Read | Stop rule |
| -: | - | - |
| 1 | `gate-runtime-standardization.md` | read in full; standing contract and proof law |
| 2 | `gate-runtime-orchestrator-playbook.md` | read in full when orchestrating or executing a conversion |
| 3 | `tooling/src/verify/contract/*.ts` headers | read the headers governing the contract question |
| 4 | `docs/law/Core-Enforcement-Active-Gates.md` | read the affected gate row and linked constraints |

## 2. Lookup ownership

| Question | Read |
| - | - |
| final policy authoring and current enforcers | `tooling/src/verify/gates/GATE-AUTHORING.md`; use its verbatim archive only for legacy meaning |
| what a gate enforces | its row in `docs/law/Core-Enforcement-Active-Gates.md`, then implementation and tests |
| converted family precedent | that family's current modules and tests |
| contract meaning, status, or phase order | the owning contract/lib header before prose |

Review measurements and old refusals are dated evidence. Re-derive their conclusions against the current source and
board. A gate roster is not the complete enforcement ladder; check resolve, compile, lint/gate, and behavioral owners
before declaring a guarantee absent.

## 3. Session invariants

- Convert or delete each legacy owner. Build an admissible shared capability when required; a recorded refusal does not
  reopen itself after its blocker lands.
- A lane asks with a stated default and continues. It stops for an ownership-fence conflict or unresolved design fork.
- A superseded/delete ruling requires the current owner predicate and a planted control that goes red.
- Every verifier defect that survives review receives a `docs/work` item (`pnpm doc item`).
- Claim rows at dispatch and re-derive them before batching.
- Never wrap repository runners in an external timeout or interpret a killed run as a verdict.
- Read the source that owns the question. Grep locates candidates; code and exercised controls decide.
- When recovering promises from a transcript, read the relevant turns in full; keyword-only recovery cannot establish
  the complete remaining obligations. Re-derive those claims against the current tree and board before acting.
