# Knob-drift enforcement design — gate review (2026-07-25)

Owner-ruled gate-design pass over the completed buried-knobs audit (`docs/reviews/misc/2026-07-25-buried-knobs-audit-wip.md`).
Scope: design the enforcement that makes the audit's six disease classes unrepresentable — where reasonable.
Review + design only; nothing fixed, nothing built.

Grounding read IN FULL this session: the audit ledger (both waves, both owner rulings), `.claude/agent-doctrine.md`,
`docs/architecture/core/AGENTS.md`, `Core-Laws-and-Precedents.md`, `Core-Enforcement-Active-Gates.md`,
`Core-0-Architecture-and-Structure.md` §7, `Spine-Config-and-Serialization.md`, `scripts/check/contract.ts`,
`scripts/check/bus-coverage-lib.ts`, gates `verify-registry-parity` / `bus-coverage` / `no-inline-union-redecl` /
`d-citation-integrity` / `no-manual-token-estimate` (+ `schema-banned-shapes` header/row-kinds),
`docs/history/reviews/stickler/2026-07-25-contracts-layer-audit.md` §"what NOT to gate". Every disease-class site
re-verified against live code this session (evidence inline below; "grep is a no-no" honored — every claim
is a full-file read or a typed sweep whose absence-result was cross-checked with `/usr/bin/grep -a`).

---

## 0. The headline design

**ONE new gate — `knob-wire-coverage` — with six arms sharing one reconcile skeleton and one two-map
ratchet registry (`DOORWAY` = sanctioned-indefinite, cited · `DEFERRED` = tracked debt, cited), both
self-cleaning in both directions (bus-coverage's D50 discipline).** Classes A, B, C, E, F are arms of it.
Class D is NOT gateable at the stub shape — it is enforced at its observable ends (arms B/C pick the
databank section up automatically the day it lands) plus a composed-real int test that ships WITH the
wiring, and its dormancy is encoded in the D-ledger mint (the anti-re-litigation mechanism stronger than
any gate-file comment).

Why one gate, not six: a new gate costs 4 coupled sites (module + Enforcement row + count bump +
`check-gates.int.test.ts` writeFixtures — the new-gate-four-coupled-sites law), and the house precedent
for multi-arm single-lens gates is exactly this week's `verify-registry-parity` (3 arms, one manifest
lens). The arms here share one lens: *a declared knob is wired, or carries a cited registry entry*.
`bus-coverage-lib` was evaluated for reuse and rejected: its `EMIT_SCOPE` is hardcoded to server
domain/transport and its consumer shape is literal-corpus-only; generalizing a lib two live gates depend
on is riskier than a sibling module. The token-estimate widening (§8) extends the EXISTING
`no-manual-token-estimate` module in place — zero new gates there.

Why not the type system first (§5.5 / enforcement-ladder check, performed per class): no mapped type can
force *consumption* (arms A/C/E/F) — exhaustiveness pins prove a member is declared everywhere, never that
anyone reads it. For arm B a client-side `satisfies Record<UserSettingsSection, Writer>` total map was
considered and REJECTED: it is a hand-kept parallel per-id map (the exact shape `no-parallel-section-map`
exists to kill) and it can lie (declares a writer without proving the call site) — the gate's corpus check
is the truth-shaped half, so the map adds a second home for zero proof. Type system loses this one;
gate wins.

Rename-proofing (path-keyed-gates-die-on-rename — 3 gates went silently green THIS WEEK): every arm's
member source is found **by symbol name project-wide** (`EffectiveAppConfig` interface,
`USER_SETTINGS_SECTIONS` const, the settings module's `z.object` property names, `DEFAULT_FORMAT_STRINGS`,
`chatMetadataSchema`), never by file path. Each arm carries a **paired-anchor rename tripwire**
(the `firehose-import-allowlist` pattern): if the arm's *companion symbol* is present in the tree but the
member source is not, the gate goes RED loudly instead of vacuous-green
(`getEffectiveConfig` ⇄ `EffectiveAppConfig` · `updateUserSettingsSection` ⇄ `USER_SETTINGS_SECTIONS` ·
`parseChatMetadata` ⇄ `chatMetadataSchema` · `presetSchema` ⇄ `DEFAULT_FORMAT_STRINGS`). Content-guarded
(the verify-registry-parity arm-2 pattern), so synthetic conformance mini-trees can't misfire.

Reader-shape honesty (gate-probe-literal-shapes): every arm's mustFlag fixture uses the exact shape the
reader matches, and each arm's bite is proven at landing with a scratch probe (`rm` it after — never git).

---

## 1. Class A — RESOLVED-BUT-CONSUMED-BY-NOTHING → **GATEABLE (arm A)**

**Verified this session:** `EffectiveAppConfig.rateLimits` and `.memorySummarizer` each have exactly ONE
property reference in the tree — the resolver itself (`domain/settings/effective-config/layer.ts:90-91`).
The rate-limit gate reads `env.RATE_LIMIT_*` directly (`entry/rate-limit-gate.ts:25-32` — read in full);
`memoryDefaults` is the healthy contrast (`entry/compose/chat.ts:481,844`, `entry/compose/search-discovery.ts:243`).
Client references to `rateLimits`/`memoryDefaults`/`memorySummarizer`: **zero** (the three UI-less
AppSettings, audit-confirmed). Admin edits to these fields change nothing — the dead-ended-pair class,
security-adjacent on rateLimits.

**Arm A spec**
- **Invariant:** every property of the `EffectiveAppConfig` interface has ≥1 *behavior-side* consumer —
  a property access / element access / object-binding read whose receiver's TYPE symbol is
  `EffectiveAppConfig` (the ts-morph `ctx.checker()` — type-keyed, not name-keyed, so an unrelated
  `.rateLimits` on some other object never counts) — in `packages/server/src` OUTSIDE
  `domain/settings/**` — or a cited `DEFERRED`/`DOORWAY` entry.
- **Why display doesn't count:** the settings domain serving the resolved view to the admin UI is
  machinery, not enforcement — a field can be displayed and still govern nothing (rateLimits today).
  Excluding `domain/settings/**` from the consumer scope encodes that. `entry/compose/**` stays IN scope
  (threading a field into behavior is real consumption).
- **Member source:** the `EffectiveAppConfig` InterfaceDeclaration, found by name project-wide.
  Tripwire: `getEffectiveConfig` identifier present + interface absent → RED.
- **Message (WHY):** "an `EffectiveAppConfig` field is resolved (env floor ⊕ admin override) but READ by
  no server behavior — an admin edit to it silently changes nothing (the rate-limit dead-ended-pair
  class). Wire the consumer to `getEffectiveConfig().<field>` or add a cited DEFERRED/DOORWAY entry.
  Spine-Config-and-Serialization.md §7.2."
- **mustFlag sketch:** contracts file declaring `interface EffectiveAppConfig { rateLimits: number }` +
  a server file with `getEffectiveConfig` mentioned + no typed read → expect "READ by no server behavior".
- **mustPass sketch:** same interface + a compose file `const c: EffectiveAppConfig = get(); use(c.rateLimits);`.
- **Day-one posture: launch-active with two founding DEFERRED entries** (this is tracked DEBT, not
  sanctioned dormancy):
  - `rateLimits` — cite: audit star finding #1; remediation = the gate consumes
    `getEffectiveConfig().rateLimits` (live-read per request via the cache getter, not boot-frozen env) —
    **route through `security-executor`** (rate limiting is security-sensitive; the fix changes an
    enforcement path).
  - `memorySummarizer` — cite: audit chat section; remediation = `domain/chat/memory/build/digests.ts`
    passes the resolved summarizer opts (and `OUTPUT_RESERVE_TOKENS=1024` mirrors it per the
    history-budget one-home rule).
  Self-cleaning: the day either fix lands, its stale entry goes RED and gets deleted.

---

## 2. Class B — SECTION-WITHOUT-A-WRITE-PATH → **GATEABLE (arm B + arm B2)**

**Verified this session** (all `section:` payloads enumerated, literal + literal-type shapes, client AND
server): client writes `seeds` `persona` `routing` `appearance` `chat` `regex` `theme`; server compose
writes `onboarding` `seeds` (`entry/compose/assets-character.ts:345,352,383,397`,
`entry/compose/search-discovery.ts:191`). **Five `USER_SETTINGS_SECTIONS` members have NO write path
anywhere: `worldInfo`, `memory`, `groupDefaults`, `workloads`, `profile`.** Sharpened facts:
- `memory.enabled` is live-read every turn (`entry/compose/chat.ts:844`) — the audit's #1 finding: memory
  is permanently OFF for every user unless raw-API-patched.
- `worldInfo.scanDepth/tokenBudget` live-read via ForeignInputs (3/6 files) — read-live, write-missing.
- `profile.avatarAssetId` live-read (`entry/compose/chat.ts:594`) — the user's own avatar is UNSETTABLE
  (persona avatars ride `persona.update`, a different verb; the settings `profile` section has zero writers).
- `groupDefaults` — the section AND the schema field are dead BOTH ways: zero readers, zero writers; the
  server resolves `metadata.group ?? DEFAULT_GROUP_CONFIG` directly, and `db/schema/chat.ts:133`'s
  "Seeded from `userSettings.groupDefaults`" comment is FALSE (the F1 lying-comment class, one more site).
- `workloads` — the pane exists; the knobs are unbound (no `section: "workloads"` write anywhere).

**Arm B spec**
- **Invariant:** every `USER_SETTINGS_SECTIONS` member appears as the value of a `section` property —
  `PropertyAssignment` string literal (`section: "worldInfo"`) or `PropertySignature` literal type
  (`readonly section: "worldInfo"`) — in `packages/client/src` OR `packages/server/src/entry/**` — or a
  cited entry. (Both shapes verified as the ONLY live call-site shapes; whole-blob portability import is
  deliberately NOT a write path — no section literal, and importing a blob is not a settings surface.)
- **Member source:** the `USER_SETTINGS_SECTIONS` variable, by name. Tripwire:
  `updateUserSettingsSection` present + const absent → RED.
- **Message:** "a `USER_SETTINGS_SECTIONS` member has no reachable write path — no client section-patch
  and no compose seed writes it, so every schema default under it is permanently pinned for every user
  (the memory.enabled class: a master switch nobody can flip). Wire the writer or add a cited entry."
- **mustFlag:** contracts file with `USER_SETTINGS_SECTIONS = ["ghost"] as const` + a client file
  containing `updateUserSettingsSection` and no `section: "ghost"` → flags.
  **mustPass:** same + `mutate({ section: "ghost", patch: {} })`.
- **Day-one posture: launch-active, five founding entries:**
  - DEFERRED `memory`, `worldInfo`, `workloads`, `profile` — cite: the settings-wiring remediation
    program (the audit's NEXT step; pairs with the visual-polish phase).
  - DEFERRED `groupDefaults` — cite: **owner fork Q1** (wire the claimed seeding, or delete the section +
    field + the lying db comment; two sources of truth today, one dead).

**Arm B2 (the AppSettings admin-editor twin — same skeleton, three founding entries):**
every top-level `appSettingsSchema` key appears as a written field key in the admin write surfaces
(`packages/client/src/features/settings/**` ∪ `features/user-admin/**` — the `system-settings-model.ts` /
`engine-launch-config.tsx` homes verified this session: `corpusAutoindex`/`logLevel`/`forbidExternalMedia`/
`trustHtml`/`maxImage*`/`allowNonOwner*`/`localMultiUser`/`discreetLogin`/`vllmConcurrency`/`engineLaunch`
all present) — or a cited entry. Day-one DEFERRED: `memoryDefaults`, `memorySummarizer`, `rateLimits`
(the only UI-less AppSettings, audit-confirmed; cite the admin-editor wave of the settings-wiring program).
`importSkipCharacters` must be enumerated at build time (not confirmed either way this session — the
builder verifies before choosing DEFERRED vs pass).

---

## 3. Class C — SETTING-NEVER-READ (leaf) → **GATEABLE (arm C), with documented lenience**

**Verified this session:** `dupThreshold` has ZERO references outside its own zod line
(`contracts/settings/index.ts:307`) — dead from the schema down (both dedup arms starve; the runner is
1 of 18 that never calls `loadUserSettings`; `PARAMS_SCHEMAS["find-duplicates"]` = noParams).
**The arm design itself surfaced two NEW live members during verification:**
- `onboarding.personaWizardSeen` — **zero occurrences** in server+client+ui; the first-run persona dialog
  does not consult it. Dead flag.
- `persona.showNotifications` — exactly ONE reference: its own writer
  (`features/persona/surfaces/persona-settings-surface.tsx:91`). Zero readers — the toggle saves and
  nothing honors it (write-live/read-dead).
Healthy contrasts verified: `computeThemesK` read by its runner; `smoothStreamCps` 5 files;
`customStoppingStrings` 8; `scanDepth`/`tokenBudget` threaded.

**Arm C spec**
- **Invariant:** every leaf property name collected from the `z.object` literals in the settings
  contracts module (the file that declares `USER_SETTINGS_SECTIONS`; leaves = all `z.object`
  PropertyAssignment names minus the section names minus `schemaVersion`) has ≥1 **read-shaped**
  occurrence — `PropertyAccessExpression` name, `BindingElement` property name, or string
  `ElementAccessExpression` — in `packages/{server,client,ui}/src` outside the settings contracts module
  itself — or a cited entry. Read-shaped (not any-occurrence) is deliberate: it is what catches
  `showNotifications` (whose only occurrence is a write-side PropertyAssignment).
- **Documented lenience (the honest limit):** the match is name-keyed, so a generic-named leaf
  (`enabled`, `mode`, `model`, `scripts`, …) trivially passes on unrelated reads — the arm only bites on
  distinctively-named dead leaves. That IS the common failure mode for new knobs (dupThreshold,
  personaWizardSeen, smoothStreamCps-class names), and bus-coverage accepts the identical lenience on its
  literal corpus. A type-keyed leaf reader (checker on every property access in the tree) was considered
  and rejected: UserSettings flows through spreads/patches/serde where the symbol dissolves — the FP/FN
  trade is worse, and the cost is a full-tree checker pass per leaf.
- **Message:** "a settings schema leaf is READ by nothing — the knob is dead from the schema down (the
  dupThreshold class): the field validates, stores, round-trips, and influences no behavior. Wire the
  consumer or add a cited entry."
- **mustFlag:** settings module fixture with `USER_SETTINGS_SECTIONS` + a section schema containing
  `ghostKnob: z.number()` and no read anywhere → flags. **mustPass:** same + a server file reading
  `settings.section.ghostKnob`.
- **Day-one posture: launch-active, three founding entries:**
  - DEFERRED `dupThreshold` — cite: the dedup wire-up chain (params schema slot + runner
    `loadUserSettings` mirror of compute-themes + `WorkloadDiscoveryEnv.findDuplicates` threshold in the
    op signature; post-workloads-migration it lands in the domain contribution factory).
  - DEFERRED `personaWizardSeen`, `showNotifications` — cite: **owner triage Q3** (wire or delete; both
    touch the settings vocabulary, so deletion is a schema change — squash rule applies if a column is
    ever involved; here it's blob-only).
  - The build step runs the full reconcile once and triages any additional zero-hit leaf it finds
    (generic-named dead leaves stay invisible by design — documented, not pretended otherwise).

---

## 4. Class D — COMPOSE-STUB-RETURNING-DEFAULTS → **NOT gateable at the stub; enforced at the ends + test-shaped**

**Verified this session:** `entry/compose/databank.ts:64` —
`getDatabankSettings: () => Promise.resolve(databankSettingsSchema.parse({ chunk: {}, retrieval: {} }))`
against the contract `type GetDatabankSettingsOp = (ownerId: UserId) => Promise<DatabankSettings>`
(`domain/databank/contract/service.ts:82`), consumed with a REAL ownerId at
`domain/databank/ingest/index.ts:70`. The zero-param arrow drops the identity arg and returns schema
defaults — the compose-stub-goes-stale class, live. **OWNER RULING (embedded in the audit, 2026-07-25):
this machinery is DORMANT-BY-DESIGN, not rot — "we still want it, obviously." Remediation = WIRE IT;
never cull.**

**Why no gate:** the structural signature (a compose PropertyAssignment whose contextual op type declares
≥1 parameter, bound to a 0-param arrow) is (a) legal and common for genuinely global ops
(`getActiveEmbedSpace: () => …`, correctly 0-param BY TYPE), (b) trivially dodged by naming an unused
`(_ownerId)` param, and (c) its only live instance is owner-sanctioned — the gate would launch with its
entire subject allowlisted and bite on nothing real after. A checker-driven "param-count mismatch" arm
was evaluated and rejected as FP-prone judgment territory (the F1-comment-drift precedent: machines don't
adjudicate intent).

**The enforcement that IS right:**
1. **The D-ledger mint carries the ruling** (build order step 1): the databank settings machinery
   (missing `UserSettings.databank` section + the compose stub + the `gather-retrieval` k/minScore/rerank
   pass-through, and `search`'s `DEFAULT_DOCUMENT_K=5`/`MIN_SCORE=0.25` whose "the real caller passes
   settings values" comment is aspirational) is a SANCTIONED DORMANT DOORWAY pending the wire-up. The
   ledger wins every conflict — that is the anti-re-litigation encoding the owner asked for, and it is
   stronger than a gate-file comment.
2. **Arms B + C auto-adopt it:** the day `UserSettings.databank` lands, arm B demands its write path and
   arm C demands its leaves' readers in the same change — the gate grows coverage with the wiring for free.
3. **Test-shaped acceptance (ships WITH the wiring, not before):** a composed-real int test —
   seed a non-default databank setting for owner A; `getDatabankSettings(A)` through the composed service
   returns the override (kills the stub); and the retrieval pass-through test — settings k/minScore/rerank
   reach `searchDocuments`' args (reuse-seam-check-both-ends: verify BOTH ends). Speccing it now as the
   wiring wave's done-criterion.
4. One-line comment fix routed to the orchestrator (not done by me): the stub at compose/databank.ts:64
   gains the ruling cite so a cold reader sees sanctioned-dormant, not rot.

---

## 5. Class E — DIVERGED-TWIN-DEFAULT → **fix-with-owner-timing + reintroduction rows; the formatStrings half is GATEABLE (arm E)**

**Verified this session:**
- Numeric twin: `agent-runner.ts:28` `DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 4096` (used at :136 as
  `req.maxOutputTokens ?? 4096`) vs `contracts/preset/index.ts:164` `DEFAULT_MAX_OUTPUT_TOKENS = 2048`.
  The healthy pattern exists ONE backend over: `infra/providers/vllm/surfaces/chat.ts:122` imports the
  contracts const. The cake does NOT force the twin (infra imports contracts freely) — it is a genuine
  diverged shadow, currently dormant (buddy purged; audit: the rebuilt caller feeds preset
  `maxOutputTokens`). Note: `no-hardcoded-side-gen-sampling` cannot catch this — infra is exempt by that
  gate's design.
- String twin: `domain/chat/verbs/turn.ts:118` hardcodes
  `CONTINUE_NUDGE = "[Continue the previous message from exactly where it left off, without repeating it.]"`
  while the editable, ST-importable `formatStrings.continueNudge` (default at preset/index.ts:639, a
  DIFFERENT string; editor at `preset-structure-tabs.tsx:125`; importer maps `continue_nudge_prompt` into
  it) has ZERO server reads — the only formatStrings key read anywhere is `wiFormat`
  (`assembly/context.ts:700`).

**Verdict:** the GENERALIZED class (name-similarity twin detection) is NOT gateable — judgment-call
territory, unbounded false positives. Two enforcement pieces instead:

**Arm E spec (the formatStrings coverage belt — small, closed vocabulary, permanent):**
- **Invariant:** every key of `DEFAULT_FORMAT_STRINGS` has ≥1 read-shaped occurrence (PropertyAccess of
  that name) in `packages/server/src` outside `packages/contracts` — or a cited entry. An editable,
  importable format string nothing reads is a lie to the user AND to the ST importer.
- **Member source:** the `DEFAULT_FORMAT_STRINGS` const, by name. Tripwire: `presetSchema` present +
  const absent → RED.
- **Day-one: DEFERRED `continueNudge`** — cite: the turn.ts wiring task (resolve the preset's
  formatStrings at the verb, `?? DEFAULT_FORMAT_STRINGS.continueNudge`; delete the local twin in the same
  commit — half a migration IS the rot). Future-proof bonus: the audit's proposed
  `formatStrings.impersonateNudge` slot (which also fixes the importer's documented
  `impersonation_prompt` drop) will be DEMANDED a server read by this arm the day the key lands.
- **mustFlag:** `DEFAULT_FORMAT_STRINGS = { ghostNudge: "x" }` + a server file with `presetSchema`
  mentioned and no `.ghostNudge` read. **mustPass:** same + `cfg.formatStrings?.ghostNudge ?? DEFAULT…`.

**The numeric twin:** rides the buddy rebuild per the audit's own classification (**owner confirm Q5**:
wait-for-rebuild vs align to 2048 now — behavior-changing on a dormant runner, not my call). WITH the fix,
extend `schema-banned-shapes` (its registry is the extensible-forever table; this is the extend-over-mint
play) with one new row kind — `const-decl` ban: a VariableDeclaration of a named identifier with a literal
initializer outside its sanctioned home — and one row: `DEFAULT_AGENT_MAX_OUTPUT_TOKENS` (cite: the
D-entry minted in step 1; fix: import `DEFAULT_MAX_OUTPUT_TOKENS` from `@orb/contracts/preset`).
A row for `CONTINUE_NUDGE` is unnecessary once arm E exists (the belt permanently demands the read; a
re-hardcoded *bypass* — read present but ignored — is not machine-detectable and stays review territory).

---

## 6. Class F — FIELD-WITH-NO-WRITE-VERB → **GATEABLE (arm F, two directions)**

**Verified this session** (all 7 `chatMetadataSchema` keys enumerated against
`domain/chat/verbs/**` ∪ `transport/trpc/routers/**` for writes, and the wider server for reads):
- `group` ✓ write+read · `roomOverrides` ✓ · `opening` ✓ · `background` ✓ · `databankVisibility` ✓
  (the fresh visibility lane).
- **`toolRecurseLimit` — RED both directions:** no verb/router reference at all; the resolver
  `getToolRecurseLimit` (contract/metadata.ts:64) is exported from the domain front door and called by
  NOTHING; the engine's `prep.toolRecurseLimit` (engine.ts:1057) is declared on the result type
  (results.ts:233) and populated by NOTHING — every chat is pinned to 5; the doc's "the funder tunes it"
  is fiction. TWO disconnections, not one.
- **`providerRouting` — write-side RED (NEW, not starred by the audit):** read-live at
  `entry/compose/chat.ts:805` (`meta.providerRouting` → `RouteChatAssignment`), but NO verb or router
  writes it — and `domain/connection/verbs/resolve-chat.ts:12` says the middle hop is "intentionally NOT
  wired". A founding DOORWAY candidate with an in-code intent cite, pending owner confirm.

**Arm F spec**
- **Invariant (two sub-belts per key):** every `chatMetadataSchema` key has (WRITE) ≥1 occurrence
  (identifier / property name / string literal) in `domain/chat/verbs/**` ∪ `transport/trpc/routers/**`,
  and (READ) ≥1 occurrence outside the parser file and the write scope (engine/assembly/compose) — or a
  cited entry per direction. A schema'd metadata field with no write verb is a knob whose documentation
  lies; one with no read is dead parse weight.
- **Member source:** the `chatMetadataSchema` variable, by name (non-exported is fine — project-wide
  variable lookup). Tripwire: `parseChatMetadata` present + schema var absent → RED.
- **mustFlag:** a metadata fixture with `ghostField: z.number().optional()` + verbs/router files without
  the name. **mustPass:** same + a verb file writing `{ ghostField: 1 }` + a compose file reading
  `meta.ghostField`.
- **Day-one posture:**
  - DEFERRED `toolRecurseLimit` (both directions) — cite: **owner fork Q4** (mint the host-gated write
    verb + populate prep from `getToolRecurseLimit`, or demote the field to a constant and delete the
    resolver + schema line; the doc-claimed tunability must become true or disappear).
  - DOORWAY `providerRouting` (write direction) — cite: `resolve-chat.ts` header's "intentionally NOT
    wired" + **owner confirm Q2**. Self-cleaning: the day a writer lands, the stale DOORWAY entry REDs.

---

## 7. The `knob-wire-coverage` gate — consolidated descriptor spec

- **name:** `knob-wire-coverage` · **status:** `active` · **scopeSafety:** `whole-project` ·
  **fsBacked:** false (pure ts-morph over the shared Project).
- **docRow:** `Core-Enforcement-Active-Gates.md` (+ the D-entry minted in step 1).
- **message (once, per the Finding contract):** "a declared knob is wired to nothing — a settings
  field/section/leaf, format string, or chat-metadata field that validates and stores but is never
  written or never read is a dead switch: edits silently change nothing (the rateLimits/memory.enabled/
  dupThreshold classes). Wire the missing half, or add a cited DEFERRED (tracked debt) / DOORWAY
  (sanctioned rebuild seam) entry. Spine-Config-and-Serialization.md §7.2; the buried-knobs audit report."
- **fix:** "wire the consumer/writer the arm names, or add the cited registry entry; a stale entry
  (member gained its wire) must be deleted in the same change."
- **Registry:** two module-const maps, `DOORWAY: Record<"<arm>:<member>", cite>` and
  `DEFERRED: Record<"<arm>:<member>", cite>`; reconcile flags (i) missing-wire members absent from both
  maps, (ii) stale entries whose member gained its wire, (iii) entries naming a nonexistent member.
  DOORWAY encodes the owner's dormant-vs-dead ruling as a first-class state — sanctioned doorways
  (databank machinery when it becomes scannable, providerRouting, the workloads dependsOn/scheduledAt
  precedent-class*) are never re-litigated, only stale-checked.
  (*dependsOn/scheduledAt verified FULLY WIRED today — client run-dialog + tRPC + scheduler DAG gate —
  so they need no entry; they are cited in the D-entry text as the canonical "declared doorway later
  wired" success story the DOORWAY state exists to protect.)
- **Arms:** A (EffectiveAppConfig consumption, type-keyed) · B (section write path) · B2 (AppSettings
  admin-editor coverage) · C (leaf read-liveness, name-keyed with documented lenience) ·
  E (formatStrings read coverage) · F (chat-metadata write+read).
- **Founding entries (day-one, all cited above):** DEFERRED = A:rateLimits, A:memorySummarizer,
  B:memory, B:worldInfo, B:workloads, B:profile, B:groupDefaults, B2:memoryDefaults, B2:memorySummarizer,
  B2:rateLimits, C:dupThreshold, C:personaWizardSeen, C:showNotifications, E:continueNudge,
  F:toolRecurseLimit(write+read). DOORWAY = F:providerRouting(write).
  Green day-one by construction; bites on the NEXT unwired knob and on every stale entry.
- **Coupled sites (one change):** the module + the `Core-Enforcement-Active-Gates.md` Layer-3 row +
  the registered-count bump (148 → 149) + `tests/tooling/check-gates.int.test.ts` writeFixtures.
- **Bite proofs at landing (scratch probes, `rm` after, never git):** one probe per arm in the reader's
  exact shape, PLUS the stale-entry probe (temporarily add a bogus DEFERRED entry → RED) and one
  tripwire probe (rename `USER_SETTINGS_SECTIONS` in a scratch copy → RED, restore via `cp` backup).

---

## 8. Ruling: the `no-manual-token-estimate` widening — **STAYS A CHIP (not this program)**

**Verified this session:** zero live dodge shapes in the tree — no `.length / <identifier>` division
exists in ts OR tsx anywhere in scanRoot (both `-l ts` and `-l tsx` sweeps); the only `/ CHARS_PER_TOKEN`
is the estimator's own home (`packages/kit/src/tokens/index.ts:35` — currently outside the gate's
scanRoot entirely); `embed-text.ts:57` is `maxTokens * APPROX_CHARS_PER_TOKEN` — a **multiplication**
(tokens→chars budget), the inverse direction, not a token estimate.

**Why chip, not program:** the widening shares zero machinery with the coverage belts (different gate,
incremental-safe, different reader), and it has NO live violations — it is pure pre-hardening. Bundling
it would couple an unrelated edit into the program's landing. It must not be forgotten: it gets its own
workboard row. Dispatch-ready spec for the chip:
- Extend the existing module's `visit`: flag `SlashToken` BinaryExpressions whose left is a `.length`
  PropertyAccess and whose right is an **Identifier resolving (ts-morph symbol) to a const with a
  NumericLiteral initializer in [3,5] whose name matches `/CHAR|TOKEN/i`** — the
  `.length / CHARS_PER_TOKEN` dodge.
- Widen scanRoot to include `packages/kit/src`, excluding the estimator home STRUCTURALLY (skip the file
  that exports `estimateTokens` — not a path pin).
- Multiplication shapes stay legal by design (the embed-text 3.67 inverse needs no allowlist entry —
  the reader never matches `*`).
- mustFlag: `const CHARS_PER_TOKEN = 4; export const g = text.length / CHARS_PER_TOKEN;` ·
  mustPass: the embed-text shape `maxTokens * APPROX_CHARS_PER_TOKEN` + the estimator home itself.

---

## 9. What NOT to gate (with reasons)

1. **The class-D stub shape** (param-dropping compose arrows) — legal-shape overlap, trivial dodge,
   single instance owner-sanctioned. Enforced at observable ends + the composed-real int test (§4).
2. **Generalized twin-default detection** (name-similarity across layers) — judgment-call class; the
   F1-comment-drift precedent says machines don't adjudicate intent. Specific reintroductions get
   `schema-banned-shapes` rows post-fix (§5).
3. **Comment claims of tunability** ("the funder tunes it", the db `groupDefaults` seeding claim) —
   prose truth; fixed by the sweep discipline, not a keyword gate.
4. **The byte-cap fragmentation (audit #3)** — the remediation is a DESIGN lift (one cap concept per
   family, declared once, SERVED to the client, admin-tunable). Gates are written before the code they
   govern, but this code's SHAPE doesn't exist yet — a gate now would ossify a guess. Revisit after the
   cap home lands (a seal gate "client never declares a byte-cap literal; import the served cap" becomes
   spec-able then).
5. **Smooth-stream drift (audit #4, `REASONING_CPS=40`)** — a component ignoring a setting is
   rendered-behavior territory: no AST reader can know reasoning-block SHOULD consult
   `chat.smoothStreamCps`. Fix + a CT asserting the pacer consumes the setting (and the sibling ghost row
   already models it). Not a gate.
6. **Orphan-export hardening** — `pnpm ast orphans`/`unwired`/`clientgap` stay ADVISORY (the
   contracts-layer audit's restraint ruling: a hard orphan gate fights "unwired ≠ worthless"; the DOORWAY
   registry now gives deliberate orphans a better home than a gate ban ever would).
7. **Size/count gates on settings schemas** — the no-size-gates-that-ossify precedent, unchanged.
8. **The security floors the audit demoted** (session TTLs, kit DoS caps, credential throttles, variant
   ladders, import ceilings) — (d) by rubric with header rationale; gating them as "knobs" would invert
   the audit's own findings.
9. **`AppSettings` env-mirror duplication** (`RATE_LIMIT_*` env + rateLimits field) — BY DESIGN
   (documented tiers, Spine-Config §7.2 two-origin floors); only the missing consumer half (arm A) is
   the disease.

---

## 10. Build order

1. **Mint the D-entry** (next free ≥ D107, owner/orchestrator act): the knob-wire ruling — "a declared
   knob is wired or cited-dormant; DOORWAY vs DEFERRED is the dormant-vs-dead distinction; the databank
   settings machinery is a sanctioned DORMANT DOORWAY (owner 2026-07-25) to be WIRED, never culled; the
   agent-runner 4096 twin dies with the buddy rebuild." Gives every registry cite and the future
   `schema-banned-shapes` rows a stable home (`d-citation-integrity` makes the cites physics).
2. **Build `knob-wire-coverage`** (arms A/B/B2/C/E/F + the two-map registry + tripwires + founding
   entries) + the 4 coupled sites + per-arm bite probes. One `mech-executor`-dispatchable unit off §7;
   the builder runs the arm-C full reconcile and triages any additional zero-hit leaves into the founding
   list before landing.
3. **The token-estimate chip** (§8) — separate small dispatch, own workboard row.
4. **The remediation program** (tracked BY the gate's DEFERRED entries, executed in waves, not part of
   this gate build): rateLimits enforcement fix (security-executor) · memorySummarizer wiring ·
   the settings-wiring UI wave (memory master switch, worldInfo, workloads knob binding, profile avatar,
   admin editors for the three UI-less AppSettings) · the dedup chain · toolRecurseLimit verb-or-demote ·
   groupDefaults fork · databank wire-up + composed-real int test + gather-retrieval pass-through test ·
   continueNudge read + twin deletion · buddy-rebuild twin kill + banned-shape row. Each landing deletes
   its stale DEFERRED entry in the same change (the gate enforces exactly that).

---

## 11. Open questions (owner) — genuine forks only

- **Q1 `groupDefaults`:** wire the seeding the db header claims (`chats.metadata.group` seeded from
  `userSettings.groupDefaults` at chat creation) or delete the section + schema field + the lying comment?
  Two sources of truth today; one is dead.
- **Q2 `chatMetadata.providerRouting`:** confirm DOORWAY status (resolve-chat.ts:12 says the middle hop is
  "intentionally NOT wired") and name the intended writer (a per-chat connection-overlay surface?) — or
  schedule the wiring now.
- **Q3 `personaWizardSeen` + `persona.showNotifications`:** wire or delete? Both dead (zero readers;
  personaWizardSeen has zero references at all). Deleting touches the settings vocabulary (blob-only).
- **Q4 `toolRecurseLimit`:** mint the host-gated write verb + populate the engine prep from the resolver,
  or demote to a constant and delete the field + resolver? The doc-claimed tunability must become true or
  disappear.
- **Q5 agent-runner `4096`:** confirm the twin waits for the buddy rebuild (audit's classification) vs
  aligning to the preset 2048 now (behavior change on a dormant runner).
- **Q6 `SUMMARIZE_CONCURRENCY=4`** (carried from the audit, unresolved): deliberate D17 ban-risk bound on
  the hosted sub, or surfaceable? Ruling needed before anyone "fixes" it.

---

## Verified clean / verification log (what my silence covers)

- Read IN FULL: the audit ledger; agent-doctrine; AGENTS.md; Core-Laws-and-Precedents; the full active-gates
  registry (282 lines); Core-0 §7; Spine-Config-and-Serialization; contract.ts; bus-coverage-lib;
  verify-registry-parity; bus-coverage; no-inline-union-redecl; d-citation-integrity;
  no-manual-token-estimate; schema-banned-shapes (rows/kinds portion); the contracts-layer audit
  (full file); `entry/rate-limit-gate.ts`; `domain/settings/effective-config/layer.ts`;
  `contracts/settings/index.ts` (all 677 lines); `domain/chat/contract/metadata.ts`;
  `entry/compose/databank.ts`; agent-runner.ts header+twin sites; turn.ts nudge region.
- Sweeps (typed, absence-results cross-checked with `/usr/bin/grep -a` per the sandbox-grep memory):
  `.rateLimits` property reads (1 = resolver only) · `memorySummarizer` (1) · `memoryDefaults` consumers
  (compose ×3, healthy) · every client+server `section:` payload (7 client + 2 server members) ·
  `updateUserSettingsSection` all call sites · `getToolRecurseLimit` callers (0) · chatMetadata key
  write/read presence per key · `providerRouting` full-server (read at compose:805, no writer) ·
  `dupThreshold` (1 = own schema) · 22-leaf occurrence census (found personaWizardSeen=0,
  showNotifications=writer-only) · `DEFAULT_MAX_OUTPUT_TOKENS` homes · `dependsOn`/`scheduledAt`
  (fully wired — client dialog + tRPC + scheduler) · `.length / $D` sg sweeps in ts AND tsx (0) ·
  `3.67`/`CHARS_PER_TOKEN` sites · AppSettings admin-editor field coverage · avatar/profile write paths ·
  `writeFixtures`/count coupled sites.
- NOT run: `pnpm check`/`pnpm test` (no code changed; this is a design pass on a tree with uncommitted
  lane work — the shared-tree-contention protocol; nothing here claims a gate/test verdict).
- NOT read: `Core-Path-Registry.md` in full (targeted anchors only); the settings verbs' bodies beyond
  update-user-settings-section's header; the engine-launch admin surface bodies. None are load-bearing
  for any verdict above except the D-entry numbering (delegated to the mint step, which
  `d-citation-integrity` will verify mechanically).

## Unconfirmed / low-priority (explicitly NOT findings)

- `importSkipCharacters` admin-editor presence — not confirmed either way; the arm-B2 builder enumerates
  it at landing.
- Whether `persona.showNotifications` was meant to gate the persona-switch toast specifically — intent
  question for Q3, not evidence.
- The db `chats.metadata` header's `groupDefaults` seeding claim may reflect a purged seeding arm
  (check-legacy-main pattern) — irrelevant to the fork's outcome, noted for the Q1 decider.
