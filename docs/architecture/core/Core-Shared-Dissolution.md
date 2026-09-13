---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Shared-Dissolution: the kit-purity law + surviving invariants

> The `_shared`/`shared/_kit` drawer dissolution is **DONE** — every symbol has a home in the built code. The resolved per-file symbol map (§1–§8, §10) moved to [`../history/Shared-Drawer-Dissolution-Map.md`](../history/Shared-Drawer-Dissolution-Map.md) with **§ numbering preserved** — code comments citing `shared-dissolution §N` and docs citing `Core-Legacy-Migration-and-Gaps.md §N` resolve there. This file keeps only what is still law: the kit-purity ruling (§0) and the load-bearing invariants (§9).

## 0. The kit-purity ruling (LOCKED 2026-06-25 — Nate confirmed)

> **`@orb/kit` MAY depend on isomorphic, side-effect-free npm libraries (zod, typeid-js, luxon, remend). It may NOT depend on: Node built-ins (`node:vm`, `node:fs`, …), `@orb/contracts`, `@orb/db`, any domain, or anything doing I/O.** "Zero runtime deps" means zero domain/I/O/Node deps, not zero npm. The split: isomorphic-pure → `@orb/kit`; Node-only-pure → `@orb/server/kit`.

- The proof case: the pure regex executor (`executeRegexScripts`) is kit, but its `node:vm` ReDoS guard is Node-only → `server/kit/regex`. `node:vm` is exactly the thing that can't be kit (the browser imports kit).
- Enforced: dependency-cruiser `kit-purity` + `kit-no-node-builtins` rules (`.dependency-cruiser.cjs`) — no higher-package import + no `node:*` import, NOT no-package.json-dep.
- `Core-0-Architecture-and-Structure.md` §2 carries the amended wording ("isomorphic npm deps (zod, luxon…) OK").

## 9. Load-bearing invariants that survived the move (pointer list)

Each is enforced at its code site (a rung-4 comment and/or a named test); this list is the cross-package index.

- **Credentials AAD** `` `${userId}|${provider}` `` byte-identical (else all GCM ciphertext fails). Single `aadFor()` site (`domain/credentials/persistence/aad.ts`; `secrets.ts` only consumes it).
- **`ResolvedCredential` brand** — constructable only after the owner check (`requireOwner` — owner-only box-cred mint, D17).
- **`neutralizeMacros`** U+200B between the `{{` braces (`kit/guided` — macro re-injection defense).
- **`globalMacroRegistry`** single-tenant singleton → vitest single-worker for macro tests.
- **`params: userIntentSchema.catch({})`** damage-bounding; **CONFIG_LIFTS v1→v2** three transforms (post-history-pivot guard).
- **PNG dual-chunk** (chara V2 + ccv3 V3, V2 first, before IEND), CRC-32 `0xedb88320` (`kit/png-card-chunk`).
- **ST role bimap** `{0:system,1:user,2:assistant}` — ONE home, `kit/message-role` (D32).
- **`scopedCharacterId=''` sentinel** — SUPERSEDED (D55: the shared bucket keys on a real synthetic-group `CharacterId`, never a sentinel; see `Tier-1-DB.md` esoteric #3) for the shared memory bucket (knowledge-cluster).
- **Two-layer prototype-pollution defense COMPLETE** (PD-101 done 2026-07-05): schema `superRefine` (Layer 1) + `deepMergeRequestBody` runtime scrub (Layer 2, `server/kit/custom-parameters`).
- **`parsePresetFile` strict** (the former `parseNeoPresetFile` — renamed; `@orb/contracts/preset`) vs `parsePromptConfig` lenient — both behaviors preserved.
- **storedVersion (DB column) beats in-blob version probe** (versioned-config) — else lifts re-run and corrupt.
- **Regex executor ordering**: macros run on the template before `$N` splice (captured model text never re-evaluated) — `kit/regex`.
