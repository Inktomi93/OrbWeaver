# Orbweaver — Boundary Scan + Doc-Review Punch-List (2026-06-28)

> Split from `Core-Audits-and-Debt.md` (2026-07-02). **Archeology / reference only.** Two dated, RESOLVED analyses: the re-runnable AST boundary/build-order scan (with its `AST Scout CLI` method), and the 2026-06-28 doc-review findings punch-list (all resolved). Kept for provenance; not open work.

---
## Orbweaver — boundary / build-order scan

> **Status: analysis (re-runnable).** A ts-morph pass over the **steady clone** (`/tmp/neo-tavern-steady`,
> commit `da9af861`) that resolves every internal import, collapses each file to its orbweaver
> destination bucket, and computes the bucket-level DAG, upward (illegal-direction) edges, sideways
> domain↔domain edges, fan-in hubs, dir SCCs, and the topological build order. It answers two questions:
> _how interwoven is the code, and in what order do we build?_ The instrument is a standalone script
> (`orb-scan.ts`) that reuses the neo-tavern ts-morph install; re-run it against any snapshot to refresh.

## AST Auditing & Exploration Manual (AST Scout CLI)

For ad-hoc AST queries and domain audits, agents MUST use the **`scratch/find_interfaces.ts` AST Scout CLI** rather than hand-rolling ts-morph scripts or `grep` loops.
The script is a powerful wrapper over `codemod-kit` and supports wildcard searches, reference finding, call-site location, and importer discovery.

**Commands:**
- `npx tsx scratch/find_interfaces.ts find-symbol "<query>"` (Supports regex/wildcard, e.g. `"Chat*"`)
- `npx tsx scratch/find_interfaces.ts find-refs <file> <symbolName>`
- `npx tsx scratch/find_interfaces.ts find-calls <functionName>`
- `npx tsx scratch/find_interfaces.ts importers <moduleSpecifier>`
- `npx tsx scratch/find_interfaces.ts exports <file>`

**Flags:**
- `--neo`: Include the `neo-tavern` legacy codebase in the scan (essential for mapping old logic to new domains).
- `--json`: Output a machine-readable JSON array. **Use this to bypass the 50-result console limit** when performing large wildcard sweeps.

<!-- Source: Core-Audits-and-Debt.md -->

## Inputs

1,101 src files · 4,738 resolved internal edges · 1 unresolved-internal · file graph **fully acyclic**
(0 file cycles). Each file is bucketed to its orbweaver home (`kit` / `contracts` / `db` / a server tier
/ a domain / `client` / `_shared`).

<!-- Source: Core-Audits-and-Debt.md -->

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

<!-- Source: Core-Audits-and-Debt.md -->

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

<!-- Source: Core-Audits-and-Debt.md -->

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

<!-- Source: Core-Audits-and-Debt.md -->

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

<!-- Source: Core-Audits-and-Debt.md -->

## ARCHAEOLOGY — Doc-review findings punch-list (2026-06-28, RESOLVED — reference only)

> **✅ RESOLVED 2026-06-28.** All HIGH/MED findings + both systemic clusters (C1 D34 tuple-homes, C2 D32
> bimap-homes, C3 D45 fallout) + the LOW nits were fixed in a verify-then-edit pass (~60 doc edits). The
> scripting proposal was graduated to **ledger D46**; the 7 ST features to **D47**. **Remaining (low/none):**
> (a) db.md's full per-row movement-table D37 reconciliation — a D37 callout note was added listing the
> restored set (canonical per the baseline + code), full per-row rewrite deferred; (b) the broader
> `resolveRoleConnection`→`resolveRole` rename across the ~10 non-credentials docs (credentials.md done;
> `resolveRole` is canonical per connection.md); (c) the `CredProvider`/`CredentialProvider` name pick (verify
> against the code symbol first); (d) C4 "13 gates" shorthand left as-is (it's a correct count — 13 structural
> gates per Core-Laws-and-Precedents.md). This file is retained as the historical record.

> **Source:** a 6-agent full-read rigor/adherence review of every architecture `.md` doc (Phase 0 → pre-chat;
> `chat.md`/memory excluded as the Phase-5 frontier). Each agent read its slice IN FULL and checked against
> the canonical sources (`core/Core-Laws-and-Precedents.md` wins on conflict; `Core-0-Architecture-and-Structure.md` = constitution).
> **This is a work punch-list for the doc-fix agent** — every finding, severity-tagged, grouped by file.
> Nothing here is a code change; these are doc corrections (the docs lagged decisions/edits).
>
> **Verdict overall:** no structural rot. The spine, the ownership model (D18→D20/D23), and the big
> decisions (D16/D17/D28/D31/D33) are clean and consistent. Findings are **staleness + propagation gaps**.

<!-- Source: Core-Audits-and-Debt.md -->

## Severity key

`HIGH` = a builder works from this doc and builds the wrong thing · `MED` = real defect, lower blast radius
· `MINOR`/`LOW` = staleness/naming/consistency nit · `INFO` = optional polish.

<!-- Source: Core-Audits-and-Debt.md -->

## Systemic clusters (fix these together — same root cause across docs)

- **C1 — D34 not propagated** (HIGH): db-enum-column tuples still homed in `domain/*/contract/` instead of
  `@orb/contracts/*`. Affects `Spine-TypeScript-and-Patterns.md`, `workloads.md`, `embeddings.md`, `search.md`,
  `db.md`. `@orb/db` cannot import a server-tier domain, so these get built wrong. D34 was written for exactly this.
- **C2 — D32 bimap home not swept** (MINOR): the ST role bimap / entry-injection role still shown at
  `kit/world-info` instead of `kit/message-role` (+ `{depth,role}` → `kit/injection`). Affects
  `domains.md`, `Core-Legacy-Migration-and-Gaps.md §9`, `world-info.md`, `Spine-TypeScript-and-Patterns.md`, `Spine-TypeScript-and-Patterns.md`.
  (serialization-core.md was already fixed — D40c.)
- **C3 — D45 fallout from the just-made vision edits** (HIGH/MED): `connection.md` Part II shape block,
  `providers.md` warning-code, `Core-Legacy-Migration-and-Gaps.md` vision rows, ledger D44 `MessageImage`.
- **C4 — "13 gates" shorthand is stale** (LOW): `core/Core-0-Architecture-and-Structure.md §7` no longer states a count; `Core-Laws-and-Precedents.md`
  is the real catalog. Cited stale in proposal §0, `PRE-SCAFFOLD-CHECKLIST §A1`, `COUNCIL-REVIEW §13`,
  `INCONSISTENCY-AUDIT`, ledger R10. Retire the phrase or repoint to Core-Laws-and-Precedents.md.
- **C5 — settled decisions still framed "Open"** (MINOR): ledger §2 already DECIDED items shown as open
  "leans" in `settings.md`, `foundation.md`, `Spine-Identity-and-Auth.md`, `db.md` (Groundhog-Day hazard).

---

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-STATUS.md` (read-first handoff doc — high impact)

- **MAJOR** — NEXT ACTION wave list (L100–101) is **pre-D38/D16**: omits `character` (W1), `connection`
  (W1.5), `notifications` (W1). Fix: replace with the D38 wave order, or point to `BUILD-PLAN §4c` without re-listing.
- **MAJOR** — "Latest decision" contradiction: header (L8) says **D44**, footer (L96) says **D40**; both
  stale → now **D45 + PD-11**. Fix: reconcile both to D45/PD-11.
- **MINOR** — (L99) "domain dirs hold 1-line stubs" — 4c W1 (sessions/admin) is committed, persona/preset/
  settings/notifications in progress. Fix: "Phase 4c NEXT" → "4c W1 in progress."

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-0-Architecture-and-Structure.md`

- **MINOR** — §6 (L232) "(corpus)" → **(discovery)** (rename).
- **MINOR** — "Open decisions" (L278–282): UI engine framed "DEFERRED (recommended Base UI)" + version pins
  "deferred to scaffold" — **D42** DECIDED Base UI + the `@orb/ui` package; pins landed in **Phase 0**
  (BUILD-PLAN L22). Fix: mark UI-engine DECIDED, note pins done.
- **MINOR** — status header "Status: planning" — build is at 4c. Fix: "authoritative (build in progress)."

<!-- Source: Core-Audits-and-Debt.md -->

## `Core-BUILD-PLAN.md`

- **MINOR** — Phase 2 / Phase 5 (L41–50, L81–88) don't capture **D44/D45** "born-compliant before Phase 5"
  contracts obligations (`MessageContentBlock`, `ModelCapability.vision`, `ChatHistoryMessage.content`
  string→content-part reshape). Fix: add a contracts-amendment note before Phase 5.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains.md`

- **MAJOR** — "serialization core RESOLVED" (L257) homes the ST role bimap at `@orb/kit/world-info` →
  should be **`@orb/kit/message-role`** (D32/D40c). [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `AGENTS.md` (self-declared non-authoritative digest)

- **MINOR** — §7.1 (L295–306)/§7.5 (L398): "agents are FIRST-CLASS PRINCIPALS — LOCKED" framed as the v1
  model + `users.role` as `admin/user`. Council DEFERRED the agent-principal mint to v2 (v1 = borrowed-owner,
  ledger §5/§3); role axis is `owner|admin|user` (D17). Fix: annotate with the council deferral + D17.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MAJOR** — §2 (L80)/§5 (L189–190)/§1 (L48): homes `WorkloadKind`/`WorkloadStatus` at
  `domain/workloads/contract` and `SourceLens`/lenses at `domain/embeddings/contract`; these constrain **db
  enum columns** so they must be in `@orb/contracts/*` (**D34**, reaffirmed D38). Self-contradicts the doc's
  own §1 db-enum rule (L49). Fix: move the tuples to contracts; fix the gold-standard path (L97
  `contract/workload-kind.ts`). [C1]
- **MINOR** — §1 (L47)/§2 table (L64)/§5 (L195): lists `EntryInjectionRole` under `kit/world-info` and
  `messageRole` target home "@orb/contracts (chat/preset)" — D32 collapsed these into `MESSAGE_ROLES` at
  `kit/message-role` (the doc self-corrects in §2 L83–86 / §5 L183 / §8 L261; these cells are leftovers). [C2]
- **MINOR** — §1 (L42): cites the cake as `core/Core-0-Architecture-and-Structure.md §6` (it's **§2**) and writes the arrow direction
  reversed (canonical is `kit ← contracts ← db ← server ← client`). Fix: cite §2, use `←`.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MINOR** — §1 (L47): cites `ENTRY_INJECTION_ROLES` as a live kit↔contracts example — stale (D32 collapsed
  it into `MESSAGE_ROLES`). The rule is fine; swap the example. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-TypeScript-and-Patterns.md`

- **MINOR** — "Gate candidates" (L110) frames `no-decorators` as future ("add to Phase 0b") while the grit
  section (L136) lists it active now. Fix: reword the candidate framing to "active." (Doc otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-Identity-and-Auth.md`

- **MINOR** — §6 (L376–378): "does `Principal` carry `groups`?" listed as an open decision (Lean: drop) —
  ledger §2 DECIDED **no groups**. The interface body is already correct; only the open-decisions list is
  stale. Fix: demote to resolved, cite §2. [C5]
- **MINOR** — §5 invariant 14 (L334–337): "exactly one owner" specced **only** as a test; the structural
  enforcer is unnamed. **D40** tracks this as still-open (a partial-unique index on `role='owner'`, or
  seed-only-mint discipline). Fix: add the structural enforcer, or flag it as the open 4c item per D40.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Spine-Config-and-Serialization.md`

- **MINOR (low)** — "Open decisions" (L266–269) + §(b) (L99–104): stranded toggles framed "lean PROMOTE /
  decide per-knob" — ledger §2 DECIDED promote `VLLM_*_CONCURRENCY`, `RATE_LIMIT_*` stays boot-env; D40
  defers `IMPORT_DEFAULT_SOURCE`'s AppSettings half to the import slice. `VLLM_*_CONCURRENCY` is flatly
  decided and should not read as open. Fix: align language to §2 + D40. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `participants-agents-identity.md`

- **MINOR** — §6 (L149–150): agent-sdk session home written `infra/providers/agent-sdk/session/` — missing
  the `backends/` segment (**D8**; identity §1 L100 has it right). Fix: → `infra/providers/backends/agent-sdk/session/`.
- **MINOR (low)** — §6 (L151) vs identity §6 (L382–385): "agent = pattern vs domain" — participants says
  RESOLVED, identity says open/"Lean: pattern". Same conclusion; reconcile the status.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-1-DB.md`

- **MED** — Movement table + schema layout **predate D37** and omit its restorations: `chats.variableValues`,
  `chats.importedFrom`/`importHash` (note: L141's are the _characters_ flat-row keys — different),
  `message_variants.apiErrorStatus`/`toolCalls`, `sessions.lastSeenAt`/`userAgent`, `unique(characterId,
model)` on `character_embeddings`, `unique(ownerId, handle)` on `characters`, `audit_logs` FK+indexes. Fix:
  reconcile to D37. [C1-adjacent]
- **LOW** — Invariant 5 (L291)+L136: `hub_score` "advisory, never nulled" but the `integer→real` correction
  (D37, all 4 vector tables) isn't stated. Fix: note `hub_score` is `real`.
- **LOW** — "Still open (deferred)" (L344): the `runtime.ts`/`sdk-session.ts` item sits under "Still open"
  but its body says "RESOLVED (D35)." Fix: move to "Resolved decisions." [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-2-Foundation.md`

- **LOW** — "Open decisions" (L448–454): "drop the DbInspector port" + the `HOST_SECRET_ENV_KEYS` denylist
  split are DECIDED in ledger §2. Fix: demote both to DECIDED, cite §2. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-3-Infra.md`

- CLEAN. (The D40 infra/auth-never-yields-userId treatment is the cleanest in the set.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-3b-Providers.md`

- **HIGH** — §7.5 (L325): the `credential.source` dispatch union is `max-pro-sub | openrouter | vllm |
custom_openai` — **4 members, missing `local-light`** (D39/D31). The runner union (L321) correctly stays 4
  (`local-light` has no chat surface). Fix: add `local-light` to L325 only.
- **HIGH** — "internal layout" (L127–147, `backends/`): `backends/local-light/` is **absent** (D39; council
  §5 prereq). Fix: add `backends/local-light/` (embed/rerank/image-embed surfaces; keyless/loopback, no chat surface).
- **MED** — the D45 bullet (L513–514) cites a `warning` ChatEvent for image-part drop, but **D41 froze
  `WARNING_CODES` at exactly 4** (no image code) and sites emits at resolve-chat/the runners, not "at
  assembly." Fix: add a 5th `WARNING_CODE` (e.g. `image_dropped`/`vision_unsupported`) and update D41's
  "exactly 4" framing, OR specify the assembly-side warning rides a different ChatEvent. [C3]
- **LOW** — §7.1/Esoteric §1: `ROLE_SOURCE_POLICY` (the firewall map D39 amends to add `local-light` to
  embed/rerank/imageEmbed) is never named. Fix: add a line noting `local-light` joins those arms (NOT
  summarize/generateImage).

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-4-Transport.md`

- **INFO** — layout (L136) still shows `corpus.ts`; the Resolved decision (L430–434) renamed it to
  `routers/discovery.ts`. Cosmetic lag. Fix (optional): update the layout snippet. (Otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Tier-5-Entry.md`

- **INFO** — `compose/role-clients.ts` (L56) doesn't name D39's `mint-local-light` boot helper (covered by
  the general `resolveRole` rebind). Fix (optional): mention `mint-local-light` alongside `mint-vllm`. (Otherwise CLEAN.)

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/connection.md`

- **HIGH** — Part II §2 "capability descriptor" (L587–604): the **authoritative** `ModelCapability` shape
  block has **no `vision`/input-modality axis** (only Part I prose L36–39 mentions it). §4 axis table
  (639–646), §6 invariant 3 (L664), §7.4 list (L322) likewise omit it. Fix: add the axis to the Part II
  shape block (`input: { vision: boolean }` or `inputModality`) + the §4/§6/§7.4 enumerations (**D45**). [C3]
- **MED** — catalog layout (L109) vs cross-boundary tables (L211, L333) + front door (L154):
  `ChatModelId` + `DEFAULT_CHAT_MODEL_ID` listed both in domain `catalog/chat-models.ts` and
  `@orb/contracts/connection/catalog.ts`, with a backwards server→contracts re-export (L236). Since the
  client consumes both, canonical = `@orb/contracts/connection/catalog.ts`; domain imports DOWN. Fix: state
  the canonical, remove the "re-exported from contracts" framing.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/credentials.md`

- **LOW** — storable-provider union named both `CredProvider` (L71/238/265/360) and `CredentialProvider`
  (L382/394). Fix: pick one (§7.5 uses `CredentialProvider`).
- **LOW** — (L49/293) refers to connection's verb as `resolveRoleConnection`; canonical is `resolveRole`. Fix: align.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/tag.md`

- **MED** — §"write side BUILT" (L110) introduces `tag.attachCardTagByName({ownerId, characterId, tagName,
source?, status?})`, but the `TagService` interface + verb list (L131/170) still enumerate only 11 verbs
  (`attachTag`/`detachTag`/`bulkAttachTag`, no `source`/`status`, no `attachCardTagByName`). Fix: add it to
  `contract/service.ts` + the verb list, or state it's the by-name card path of `attachTag` with the signature there.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/persona.md`

- **MAJOR** — §Movement (L125): `AssemblePersona` double-homed vs preset.md (L141) — same source symbol
  (`shared/prompt/prompt-assemble-types.ts`) routed to `@orb/contracts/persona/assemble-persona.ts` here and
  `@orb/contracts/chat/assemble.ts` there. Fix: defer to **`@orb/contracts/chat/assemble.ts`** (the
  assemble-types cluster home); persona.md imports the shape from there. [one-home]
- **LOW** — §contract (L56) "interface PersonaService (9 verbs)" but §Verbs (L85–87) enumerates **10**. Fix: count → 10.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/preset.md`

- (No own findings; it is the recommended home for `AssemblePersona` — see persona.md MAJOR.)

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/world-info.md`

- **LOW** — §owns (L27)/§Movement (L118, L125): never references **D32**; `resolveEntryInjection` homed in
  `kit/world-info` and entry role/placement treated as world-info-local. D32 moved `{depth,role}` to
  `kit/injection` and the role axis to `kit/message-role` (world-info is a _consumer_ passing its own
  `role:user` default). Fix: note the derivation from `kit/message-role` + `kit/injection`. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/character.md`

- **MED** — §Cross-feature (L261): says `bulkAddCardTag` goes through `tag.attachToCharacter` — **no such op**
  (it's `attachTag` / `attachCardTagByName`; `attachToCharacter` is a world-info-shaped name). Fix: reference
  the real tag op (align with the tag.md fix).

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/admin.md`

- **MINOR** — 8-slot layout (L105–137) omits `guard.ts`, but Movement (L173) + Resolved Q1 (L370–377) name it
  as a real root file (home of `can()`/`requireAdmin`/`requireOwner`). Fix: add `guard.ts` to the layout tree.
- **MINOR** — Resolved Q1 (L370): "`guard.ts` … imported DOWN by any domain" contradicts the injection model
  (settings receives `requireAdmin` via composition-root injection; `domain-no-cross-feature`). A domain
  importing `domain/admin/guard.ts` _is_ a cross-feature import. Fix: strike "imported DOWN by any domain";
  the gate travels by injection (or relocate guard to the identity spine if a truly importable home is intended).

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/settings.md`

- **MINOR** — "Open decisions" (L497–507): "promote stranded (b) toggles?" + "split `envDefaults()`" presented
  as open but ledger §2 DECIDED both. Fix: convert to DECIDED, cite §2. [C5]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/stats.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/workloads.md`

- **NEEDS-FIX (HIGH)** — §"WorkloadKind mapped-type Record" (L94–105) / §7.4 (L391–401) / layout (L187–192):
  homes `WORKLOAD_KINDS` + `WORKLOAD_STATUSES` + `ACTIVE_WORKLOAD_STATUSES` in `domain/workloads/contract/`,
  but the `workloads.kind`/`status` db columns + the `workloads_kind_active` partial-index WHERE must
  derive/mirror them and `@orb/db` can't import a domain (the movement row L335 requires the index predicate
  to mirror `ACTIVE_WORKLOAD_STATUSES` — impossible from a domain home). **D34** names this doc explicitly.
  Fix: move the three tuples (+ their `z.enum` + a `.contract.test.ts`) to `@orb/contracts/workloads`; db
  derives + CHECKs. Keep `ParamsByKind`/`ResultByKind`/`Runner`/`WorkloadError`/`WorkloadEvent`/
  `WorkloadProgress` domain-internal. [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/embeddings.md`

- **NEEDS-FIX (HIGH)** — §7.5 (L332–340) / `contract/params.ts` layout (L121–122) / store params: homes the
  entire `SourceLens` union (incl. `image-raw`/`image-captioned`) only in `domain/embeddings/contract/params.ts`;
  the `image_embeddings.lens` db column needs a contracts tuple to derive (same db-can't-import-domain problem),
  and the doc never documents the `lens` schema column even though embeddings **owns** the schema. **D34**. Fix:
  add `IMAGE_LENSES` to `@orb/contracts/embeddings` (column derives + CHECK); keep the full `SourceLens`
  domain-side as the non-duplicated superset; add the `lens` column + `unique(assetId, model, lens)` to
  embeddings' movement/schema (it's the producer/owner, not search). [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/search.md`

- **MINOR** — movement (L241) / §7.5 (L309): adds `image_embeddings.lens` + says "lens owned by embeddings
  (`embeddings/contract/params.ts`)" without acknowledging D34's `@orb/contracts/embeddings.IMAGE_LENSES`
  home / column-derivation. Fix: note the column derives from contracts; search imports the image subset. [C1]

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/discovery.md` · `domains/assets.md` · `domains/sessions.md` · `domains/notifications.md` · `domains/memory.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/import.md`

- **NEEDS-FIX (HIGH)** — movement table (`env.IMPORT_DEFAULT_SOURCE → AppSettings`), §"Still open"
  (L443–454), §7.2/§7.5 (L306): treats `IMPORT_DEFAULT_SOURCE → AppSettings` as a live deferred decision and
  stamps imported chats' `source` from `env.IMPORT_DEFAULT_SOURCE`. **PROMOTION-DEBT PD-15** dropped this
  (2026-06-28, "neo-jank"): no chat-level default source — each ST message maps per-message provenance → its
  `message_variant` (D26); the env comment was pulled from `foundation/env`. (D40's "deferred to import slice"
  note is also superseded by PD-15.) Fix: remove the deferral + the env-stamp; replace with per-message
  provenance→variant mapping.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/export.md`

- **MED** — §owns / movement (L209) / Esoteric "basePng" / §"Still open": says the `sharp` transcode stays
  **inline** in `export-character.ts`, extract to `infra/image` only "iff a 2nd domain needs it." **D6** +
  the built code already inject `imageTransform` from `infra/image` (`domain/export/contract/service.ts`
  `FLAG[image-inject]` self-flags the doc as outdated since infra/image exists + assets consumes it). Fix:
  update to the injected `imageTransform` model.

<!-- Source: Core-Audits-and-Debt.md -->

## `domains/buddy.md`

- CLEAN. (Absorbed the prior B2/B3 audit hits: `resolveChatHost` not `chats.ownerId`; owner-delegated
  `credentials.resolve`; agent-as-pattern.)

<!-- Source: Core-Audits-and-Debt.md -->

## `UI-Architecture-and-Layout.md`

- **LOW (no change needed)** — §1 cake diagram is correct (parallel arms); the _linear shorthand_
  `kit ← contracts ← ui ← client` used elsewhere wrongly implies `ui → contracts`. D42/client.md §1.1/§8 say
  `@orb/ui` has no contracts dep. Fix: annotate the linear shorthand _elsewhere_ (not in client.md). Otherwise CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `proposals/scripting-automation-extensibility.md`

- **MED** — §0/§7/§10: pervasive "DECIDED/COMMITTED/LOCKED/BUILD" vocabulary commits new cake homes
  (`@orb/contracts/plugin`, `domain/plugin`, `infra/plugin-host`, `@orb/contracts/automation`,
  `domain/automation`, a globals KV table, a `message_variants` variable-delta column) — but **no ledger
  D-entry exists** and the doc's own header says "nothing here is law" until it graduates to the ledger. Fix:
  EITHER add a ledger D-entry (Nate decision) OR soften body vocabulary to "proposed/recommended (pending
  ledger promotion)." **(Requires a Nate decision — see "Open decision" below.)**
- **LOW** — §5.3 homes table: "Predicate engine — `kit/macro` (+ optional CEL)" contradicts §0/§5.1/§8/§10
  where CEL is ADOPTED/committed. Fix: drop "optional."
- NOTE (clean): §6 security framing is commendably honest — it states producer-scoping enforcement is unbuilt
  and `can()` capability gating is `FLAG[PD-1]`/aspirational. Do NOT "fix" this into an over-claim.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Legacy-Migration-and-Gaps.md`

- **HIGH** — §5 ("Vision / image INPUT" row) + §7 ("big lifts" + item 1): lists vision input
  `ABSENT`/`PAINFUL→ARCHITECTURAL` and "a _separate, OPTIONAL_ capability — NOT being built… a reservation."
  Contradicts **D45** (in scope, committed, born-compliant) + client.md §12.4. Fix: re-status to
  COMMITTED/born-compliant; delete the optional/reservation framing. [C3]
- **LOW** — cold-read orientation (L18): "no extension/scripting runtime" stated as a present design fact
  while §3 marks STscript/extensions "committed." Fix: add "(today; scripting runtime is proposed — see Tier 2)."

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Legacy-Migration-and-Gaps.md`

- **LOW** — §9 (L196): "ST role bimap … now ONE in `kit/world-info`" contradicts its own §1 (L62) + **D32**
  (`kit/message-role`). Fix: change L196 to `kit/message-role`. [C2]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Audits-and-Debt.md` (historical record)

- **LOW** — header (L6–7): "Q2 (ChatSource vs CredentialSource) is the only item left open" — **D31** resolved
  Q2, **D36** resolved Q3, export.md resolved Q7. Fix: note Q2 closed by D31 (and Q3/Q7 resolved).

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Core-Planning-and-Checklists.md`

- **LOW** — §A1 (+ shared across docs): the "13 gates (core/Core-0-Architecture-and-Structure.md §7)" shorthand is stale. Fix: retire or
  repoint to Core-Laws-and-Precedents.md. [C4]

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Laws-and-Precedents.md` · `core/Core-Core-Audits-and-Debt.md` · `core/Core-Core-Planning-and-Checklists.md` · `core/Core-Core-Audits-and-Debt.md`

- CLEAN.

<!-- Source: Core-Audits-and-Debt.md -->

## `core/Core-Laws-and-Precedents.md` (canonical — handle carefully)

- **LOW** — D44 "Homes" list names the primitive `MessageImage`; D44's own prose + all of client.md use
  `MessageMedia`. Fix: the stray `MessageImage` in D44 → `MessageMedia`. [C3]
- (If the "13 gates" shorthand is retired per C4, R10's "grown to 13" phrasing may need a pointer to Core-Laws-and-Precedents.md.)

---

<!-- Source: Core-Audits-and-Debt.md -->

