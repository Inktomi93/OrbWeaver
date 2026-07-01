# Orbweaver — boundary / build-order scan

> **Status: analysis (re-runnable).** A ts-morph pass over the **steady clone** (`/tmp/neo-tavern-steady`,
> commit `da9af861`) that resolves every internal import, collapses each file to its orbweaver
> destination bucket, and computes the bucket-level DAG, upward (illegal-direction) edges, sideways
> domain↔domain edges, fan-in hubs, dir SCCs, and the topological build order. It answers two questions:
> _how interwoven is the code, and in what order do we build?_ The instrument is a standalone script
> (`orb-scan.ts`) that reuses the neo-tavern ts-morph install; re-run it against any snapshot to refresh.

## Inputs

1,101 src files · 4,738 resolved internal edges · 1 unresolved-internal · file graph **fully acyclic**
(0 file cycles). Each file is bucketed to its orbweaver home (`kit` / `contracts` / `db` / a server tier
/ a domain / `client` / `_shared`).

## Result 1 — the 5-package cake is already clean

```
cross-package edges: 1099
UPWARD (illegal):    0          ← zero
cycles (SCC>1):      0          ← zero
build order:         kit → contracts → db → server → client
```

Every cross-package edge already flows **down** the cake:

| edge                | count  | type-only              |
| ------------------- | ------ | ---------------------- |
| server → kit        | 354    | 194                    |
| server → db         | 306    | 135                    |
| client → kit        | 153    | 110                    |
| server → contracts  | 129    | 81                     |
| client → contracts  | 71     | 41                     |
| **client → server** | **54** | **54 (all type-only)** |
| db → kit            | 16     | 16                     |
| contracts → kit     | 12     | 5                      |
| db → contracts      | 4      | 3                      |

`client → server` is 100% type-only — the cake's `client deps server(type-only)` rule already holds in
the real code. **The package boundaries are not aspirational; the existing graph obeys them with zero
violations.** Scaffolding the five packages is low-risk.

## Result 2 — finer granularity (tiers/domains as packages) buys ~nothing

Splitting the server tiers + each domain into their own packages surfaces only:

```
cross-bucket edges: 1676
UPWARD (illegal):   10 total / 6 runtime
SIDEWAYS dom↔dom:    7 total / 0 runtime (all type-only)
```

The 6 runtime upward edges are all already-known: `infra → _shared` ×5 (vanishes when `_shared`
dissolves) + `foundation → infra` ×1 (the `DEFAULT_*_MODEL_ID` constant, relocated to
`contracts/connection`). The 7 sideways domain↔domain edges are all type-only, all from `workloads`
(the `runner-env` composition hub working as designed).

**Verdict: keep the 5-package cake.** Don't make tiers into packages — enforce the server-internal tier
order (entry→transport→domain→infra→foundation→kit) with dependency-cruiser as the tier-3 backstop. The
finer split would catch ~6 edges you already know about, at the cost of 11 `package.json` files.

## Result 3 — the one real entanglement is `_shared`

```
_shared drawer reaches: 245
  chat 47 · world-info 25 · credentials 20 · admin 20 · character 16 · discovery 12 · tag 12 ·
  persona 11 · buddy 10 · import 9 · workloads 9 · transport 7 · preset 7 · entry 6 · stats 6 ...
fan-in hubs:  shared/_kit/ids.ts 446 · _shared/audit.ts 60 · _shared/ids.ts 42 · _shared/errors.ts 40
```

The single directory-level **cycle** runs entirely _through_ `_shared` (every domain + infra + transport

- foundation are in it only because they reach into the drawer and it reaches back). The file graph
  itself is acyclic. So the "interwoven" feeling is **one drawer**, not tangled features — dissolving
  `_shared` into real homes (see `core/Core-Core-Legacy-Migration-and-Gaps.md`) breaks the cycle and removes essentially
  all the cross-cutting coupling in one move. Feature-to-feature coupling is otherwise near-zero.

## Implication

You do not need finer-than-5 packages or heavier modularization to make pivots cheap. The two levers
that matter — **dissolve `_shared`** and **keep domain↔domain on injected ops** — are both already in the
plan. **Confirmed build/scaffold order** (leaves-first, clean once `_shared` is gone):

```
kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport → entry) → client
```

> The full per-edge / per-bucket data + the `orb-scan.ts` script are the re-runnable artifacts (kept in
> the working scratchpad during planning). Re-run against a fresh snapshot to verify the cake stays clean
> as scaffolding proceeds.
