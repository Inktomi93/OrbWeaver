# Stickler design review — THE CLIENT TIER: file-structure truth, the channel map, movability

**Date:** 2026-08-03 (session ran 2026-08-02 late) · **Scope:** design review, no diff — the owner's three
named worries. Review-and-propose only; no source touched.
**Law read IN FULL this session:** `.claude/agent-doctrine.md` · `docs/architecture/core/AGENTS.md` ·
`client-architecture-lockdown.md` (D70, whole) · `UI-Architecture-and-Layout.md` (whole) ·
`Core-Laws-and-Precedents.md` (whole) · `Core-Path-Registry.md` (D1–D78 + D106–D120 read; D115–D120 in
full) · `docs/history/design/set-seams-spec.md` (whole) · `packages/client/src/features/README.md` ·
`scripts/check/gates/client-structure.ts` (whole) · `scripts/check/gates/feature-structure.ts` (whole) ·
the client rules block of `.dependency-cruiser.cjs` · `main.tsx` (whole) · plus targeted full reads named
per finding (presets-section.tsx, rpg-context-section.tsx, registry-contracts.ts headers,
contribution-contracts.ts, home-tile-contracts.ts, chats-with-character.ts, peek-query.ts,
agent-nav/index.ts, agent-seed/index.ts, all 20 store headers, invalidation.ts header,
home-section-spec.md header, preset-surface-redesign.md §11–§13, retro-workboard DISCUSSION PILE).

**Gate battery:** `pnpm check` run whole-tree this session → **1 red stage: `structure:full` →
`suppressions` (3)** — `packages/server/src/domain/import/loader/collect.ts:192` over baseline budget +
two stale baseline entries (`infra/extraction/loader.ts`, `infra/providers/backends/kit/image-normalize.ts`).
**Server-side, pre-existing tree state, unrelated to the client tier.** Every client gate is green
(biome, eslint, all type stages, depcruise, knip, all client structure gates). Full log:
`reports/verify/structure-full.log`; verdict: `reports/verify.json`.

**Headline:** the client tier is in genuinely strong shape — the lockdown's registry/contributor
machinery is real, adopted, and grew five NEW seam families since ratification without a single
wrong-channel usage I could confirm. The defects are almost all **law-transfer defects**: the docs an
amnesiac reads first are stale against the built channel set, one section shipped against an unamended
ledger ruling, and two structural walls have holes nobody has fallen through yet. The one real
architecture gap for the owner's pivots is the **missing multi-owner-section primitive** (Q3 F-8).

---

## FINDINGS (ranked)

### F-1 · P1 — `features/README.md` teaches the SUPERSEDED inter-feature law and a stale slice roster

`packages/client/src/features/README.md:24` — **"Cross-feature reads go through `trpc.*` ONLY — … A
feature is an island; the server is the only cross-feature channel."** This is the exact blanket rule
D70 §12 opens by calling **WRONG** ("The blunt rule 'cross-feature reads → trpc' is WRONG for
client-ephemeral state") and that thirteen door-assembled registries have since superseded. The same
file's slice list (line ~31) names **`corpus`** (dead name — the dir is `discovery`) and omits
**`discovery` · `home` · `notifications` · `refinery` · `rpg` · `stats`** (6 of 19 live slices). It also
omits the single most load-bearing per-slice fact minted since (O2/G23): a feature dir MUST co-locate a
registered definition at `lib/*-{section,modal,pane,chrome}.tsx` or be deleted.

- **Failure scenario:** this is the FIRST-CONTACT doc for an agent building a feature (co-located, short,
  authoritative-looking). An amnesiac following it will (a) round-trip a client-ephemeral read through
  tRPC instead of the state commons — the exact anti-pattern §12 row 1 marks RETIRE-on-sight, or
  (b) conclude a needed cross-feature extension is impossible ("a feature is an island") and inline it
  into the host feature instead of raising a contribution.
- **Evidence:** full read of both files this session; grep receipts above. The same stale sentence lives
  in `.dependency-cruiser.cjs` `client-features-no-cross` comment ("the server is the only cross-feature
  channel — UI-Arch §11.0/§5.1") — the rule is right, its comment teaches the old law.
- **Doctrine cite:** D70 §12 (the matrix IS the law); Documentation-Law (docs are the amnesiac's memory).
- **Fix class: DOC-LAW.** Rewrite the README as a pointer-first card: the slice shape, the
  feature-owns-definition bar, and a one-line pointer to §12's matrix (or the refreshed table in §Q2
  below). Fold the dep-cruiser comment fix into the same pass.

### F-2 · P1 — the HOME section shipped against an unamended ledger: D62 P6 says "seven is the ceiling," the rail has eight; no D-entry; the spec's status line says "nothing here is built" while it is live

- `state/shell-store.ts:36` — `SECTION_IDS = ["home", "chats", "characters", "corpus", "worldInfo",
  "presets", "refinery", "analytics"]` — **eight** members, assembled live at `main.tsx:210`
  (`home: makeHomeSection(homeTiles)`), with its own gate (`home-tile-registry-completeness.ts`) and
  feature dir.
- `Core-Path-Registry.md` D62 P6 — "the rail is SEVEN sections … **seven is the CEILING** — anything
  further goes to modals/settings." Unamended. `UI-Architecture-and-Layout.md` §4.1 still enumerates the
  seven-section rail. A registry-wide grep for a home-section D-entry finds none (D115–D120 are
  populate/injections/workloads/SSE/HUD-1/SET-SEAMS).
- `docs/design/home-section-spec.md:8` — "**Status:** DESIGN SPEC — DRAFT, nothing here is built" — false
  on the tree's evidence. The spec also deliberately reverses the lockdown-§7/O7 recorded claim "there is
  NO home page concept" (its §1.1 argues why that is legal) — an argument that lives only in a
  draft-status spec, not in the ledger that outranks it.
- **Failure scenario:** the ledger wins every conflict by constitution (§0.1 tripwire 1). An amnesiac
  doing rail work reads D62 P6 + §4.1, sees eight sections, and either flags home as illegal, "fixes" it
  (deletes/demotes the section), or — worse — cites P6 to refuse the owner's own config-rail direction.
  A stale ledger on the exact axis the owner is actively riffing (fewer-vs-more rail sections) is a
  decision-corruption vector, not cosmetics.
- **Fix class: DOC-LAW (cheap, urgent).** Mint the home D-entry (amending D62 P6 with the new ceiling
  posture and the O7 "no home page" reversal), update §4.1's rail list, flip home-section-spec's status
  header to BUILT with the sha. `d-citation-integrity` then carries it.

### F-3 · P2 — the composition-tier directory modules (`agent-nav/`, `agent-seed/`) exist outside every written tier law, and no wall stops a feature from importing them

- `packages/client/src/agent-nav/index.ts` + `agent-seed/index.ts` are top-level src dirs that import
  feature front doors (`agent-nav/index.ts` imports `deriveChatTitle` from `#features/chat`) and #state
  module actions — composition-tier privileges. They appear in NO law: not the lockdown §3 five-tier
  ladder, not §7's door description, not UI-Arch §2.1's tree, not the client-structure gate (which scans
  `features/*` only). The pattern exists only in orchestrator memory ("client comp-tier dir module").
- **The wall is missing both ways:** grep of `.dependency-cruiser.cjs` finds zero rules naming them.
  Nothing bars `features/**`, `lib/`, `state/`, or `components/` from `import … from "#agent-nav"`
  (the tier rules enumerate specific `to:` dirs; agent-nav isn't in any list), and nothing pins "only
  `main.tsx` imports these" (the `client-nothing-imports-main` mirror they need). Verified: today the
  only importer is `main.tsx:110-111` (repo-wide grep).
- **Failure scenario:** an agent needing "navigate + a chat title" finds `buildAgentNav` by search and
  imports it from a feature — a backdoor to another feature's front door THROUGH the composition tier,
  dep-cruiser-green. The `client-feature-front-door`/`no-cross` pair would never fire because the edge
  is `features/x → agent-nav → features/chat`, and each hop individually passes.
- **Fix class: GATE + DOC-LAW.** (a) One dep-cruiser rule: `from: {path: CLIENT, pathNot: main.tsx} to:
  {path: CLIENT + "(agent-nav|agent-seed)/"}` — the nothing-imports-main mirror; (b) a §3/§7 sentence
  naming the composition-tier dir-module pattern (what earns residency there: dev-only glue that must
  compose feature front doors + state actions and is injected into the agent bridge).

### F-4 · P2 — `client-structure` does not recurse into buckets: nested dirs inside `surfaces/`/`anchors/`/`hooks/` silently escape every per-bucket rule, and bucket-nesting legality is unlegislated

- `scripts/check/gates/client-structure.ts:73-81` — `filesIn()` is
  `readdirSync(join(dir, bucket)).filter((e) => e.isFile())`: only TOP-LEVEL bucket files are checked.
  A file at `surfaces/nested/foo.tsx` escapes rule 5 (`-surface.tsx` naming) AND rule 7 (no outer
  Dialog/Drawer in a surface); `hooks/nested/whatever.ts` escapes rule 6. `checkFeature` similarly never
  descends, so the nested dir itself raises nothing.
- The tree already nests: `features/preset/components/{prompt-assembly,readout}/` (the only two today —
  verified by `find features -mindepth 3 -type d`). Harmless where they are (components/ carries no
  per-file rules), but the law nowhere says whether bucket-nesting is legal, so the preset precedent
  reads as blanket permission — including for the buckets where nesting would void the gate.
- **Failure scenario:** a chat-sized feature (72 files in `components/` today) starts grouping surfaces
  the way preset grouped components; the first `surfaces/thread/…-panel.tsx` with its own `<Drawer>` root
  ships gate-green, and the surface/anchor containment law (the responsiveness model itself, §4) rots
  invisibly.
- **Fix class: GATE (small).** Either recurse `filesIn` (apply rules 5/6/7 at any depth) or add an
  explicit arm: nesting legal ONLY under `components/` (+ document it in the README rewrite). Pick one;
  the current state is neither.

### F-5 · P3 — the lockdown doc's ratified type/shape sketches have drifted from the code on ~6 axes; core-law text now teaches shapes tsc will reject

Code-is-doc covers per-domain law, but `client-architecture-lockdown.md` is promoted CORE LAW whose §6
type blocks read as normative. Confirmed deltas (each verified against source this session):

1. `RailEntry` — doc §6a: `mobilePrimary?`; code (`state/section-registry.ts:36-42`): `mobile: "tab" |
   "sheet"` (an explicit-fate axis, shell-chrome §A). A copy-typed def from the doc fails tsc.
2. `SectionDefinition` — code has `listHeader?` (`section-registry.ts:89`, D66 A1 band content); doc has
   no such member.
3. `ContextTabDef` — doc §6b: `{id,label,when,body}`; code (`lib/registry-contracts.ts:40-73`) adds
   `icon` · `strip` ("game"/"meta") · `crown` · `badge` · `disabledReason` · preferred-default — the
   HUD-1/D119 growth. The doc's §6b/H1 amendment notes record the region claim but not the tab-def axes.
4. `ContextDefinition` `single` arm — code carries `header?` (`presets-section.tsx:42` uses it); doc's
   union sketch has none.
5. §13's bus table: four buses; the tree has five (`data/bus/use-rpg-bus.ts` + `RPG_BUS_FILTERS` in
   `invalidation.ts`, D108's `rpg-bus-coverage` gate — belts followed, table stale).
6. §9's registry census: "4 registries"; the door now assembles **13** (sections · modals · chrome ·
   settings-panes · settings-sections · chat-context tabs · chat-context regions · chat-surface ·
   tool-renderers · message-tools-renderers · slash-commands · character-detail · home-tiles —
   `main.tsx:155-325`).

- **Failure scenario:** the §15 reconciliation discipline exists precisely because ratified prose that
  disagrees with code re-teaches the dead shape; the doc's own history shows agents build from these
  blocks (M3 was specified off §6b).
- **Fix class: DOC-LAW.** A §15-style reconciliation pass (half a day): re-point the type blocks at the
  code headers ("the header is the law; this sketch is illustrative as of <sha>") or refresh them.

### F-6 · P3 — the §12 channel matrix is missing rows for over half the channels that now exist; the when-to-use-which law needs a refresh (the Q2 deliverable — full map + drafted table in §Q2 below)

A WRITTEN when-to-use-which law DOES exist (D70 §12 + the §1 IF-YOU-ARE-ABOUT-TO table) — the owner's
expected "no" is wrong, which is good news. But it predates: region claims (D119), the settings-section
seam (D120), home tiles, slash commands, the two tool-renderer seams, the door-injected `trpcProxy`
factory pattern (`makeRpgContextTabs({trpc, queryClient})`), the door-threaded cross-feature render-prop
projection (list-pane-projection Arm A: `makeCharactersSection(…, (view) => <ChatsWithCharacterPane/>)`),
`peekQueryData` (the hookless cache-first read for pure `when()` predicates), and the cross-feature
filter-store pattern (`state/chat-list-filter-store.ts` — character's editor hero scoping chat's list).
An amnesiac choosing between "raise a contribution," "thread a render prop at the door," and "inject the
trpc proxy" today finds the answer only by reading `main.tsx`'s comments. §Q2 below drafts the refreshed
table; it should land into §12 (or the README rewrite) as the amnesiac-transfer fix.

### F-7 · P3 — Q1 judgment-call delta list: seven slots the layout law doesn't cover (every one currently answered by convention only)

The audited features (chat, preset, character, rpg, discovery, settings + world-info/stats spot-checks)
are **consistent** with each other — the drift is between the code's conventions and what the law states,
not between features. What an amnesiac cannot derive from the written law today:

1. **View-models** → `lib/` (`preset/lib/preset-editor-model.ts`, `character/lib/character-card-form-model.ts`,
   `settings/lib/theme-editor-model.ts`, `user-admin/lib/*-model.ts` — uniform). README says only
   "feature-local pure helpers."
2. **Context-tab / claimed-pane bodies** → `components/`, NOT `surfaces/` (chat's tab bodies, rpg's whole
   HUD — `rpg` ships NO `surfaces/` bucket at all). The observed rule: `surfaces/` = region-level bodies a
   section def's `list`/`content` or a modal/pane mounts; everything mounted INSIDE a region is a
   component. Nowhere written; the README's "containment CONSUMERS" definition fits both.
3. **Settings-section anatomy** — def `lib/<x>-section.tsx` + nav `lib/<x>-nav.ts` + model
   `lib/<x>-model.ts` + body `components/<x>-section.tsx`, body and def sharing a basename across two
   buckets (chat, character do this; user-admin inlines bodies in the def file — both legal). Recorded
   only in SET-SEAMS §11 (a history/ doc that redirects to code headers).
4. **The `-section.tsx` suffix is overloaded** — `lib/chats-section.tsx` is a `SectionDefinition`;
   `lib/appearance-avatars-section.tsx` is a `SettingsSectionContribution`. G23 accepts both as "owns a
   definition"; a reader can't distinguish rail-section defs from settings contributions by name.
5. **Feature-local stores** → central `state/`, never a feature bucket — documented in lockdown §9, but
   absent from the README/§2.1 tree where a feature-builder looks.
6. **Bucket nesting** — see F-4.
7. **The composition-tier dir modules** — see F-3.

Store census receipt (Q1/Q2 both): all 20 `state/` stores read in full at header level — every one is
client-ephemeral or device-local with an explicit channel rationale; **zero server-row mirrors** (the §5
"server state never in zustand" law holds tree-wide).

### F-8 · P2 (forward-looking, the Q3 core) — the multi-owner rail section has NO primitive, and it is exactly the shape both named pivots need; plus the door-factory arity smell

Everything single-owner is portable-by-construction (see §Q3 scorecard). The gap: a `SectionDefinition`
is structurally single-feature (G1 co-location + `feature-owns-definition` + `client-features-no-cross`),
so a section whose CONTENT spans features — the CONFIG-RAIL riff (presets+tags+world-info+regex under one
glyph) and the characters+chats RAIL-MERGE — cannot be one def in one feature. Today's only mechanisms:

- **Door-threaded render props** (Arm A, live: `makeCharactersSection(characterDetailContributors,
  (view) => <ChatsWithCharacterPane {...view} />)` — works, but is per-pane bespoke plumbing; N foreign
  panes = N positional params.
- **The arity smell is already visible:** `makeChatsSection(chatContextContributors, chatContextRegions,
  chatSurfaceContributors, toolRenderers)` — four positional registries (`chats-section.tsx:98-103`).
  Every new seam family grows every host factory's signature; a fifth seam churns the door and every CT
  provider. This is the coupling point where the next "hardcoded and bolted on" will actually accrete —
  not in the features, at the factory signatures.

**Failure scenario:** the config-rail pivot lands as four render-prop threads + a hand-rolled mixed list
inside whichever feature draws the short straw as "owner" — a god-section, the settings-god-feature
disease re-born one tier up. The SET-SEAMS/D120 shape (anchor + contribution + skimmer host + partition
pin) is the proven antidote and is one generalization away.

**Fix class: SCAFFOLD (a design set), gated after.** Proposals in §Q3.

### Tree-state note (not a client finding)

`suppressions` gate red as described in the header — routes to whoever owns the import-loader lane;
regenerating the baseline (`pnpm tsx scripts/check/gen-suppressions-baseline.ts`) also ratchets the two
stale entries down. Not actioned here (review-only mandate).

---

## Q1 — FILE STRUCTURE: stated law vs actual usage

**The stated law** (`client-structure` gate + UI-Arch §2.1 + features/README): flat slice, buckets
`{surfaces, anchors, components, hooks, lib}` (+ `registry`/`store` for app-shell), front-door
`index.ts`, name reserved-or-domain-mirror, `-surface.tsx` naming + surface purity, `use-*` hooks,
container-suffix anchors, no stray root files.

**Actual usage, audited across ages** (chat = oldest/biggest 72+59 files in components/lib; preset =
newest big; character; rpg = newest, no surfaces/ or anchors/; discovery; settings = post-SET-SEAMS
skimmer residue): **fully gate-conformant, mutually consistent, and consistently BEYOND the written
law** — the deltas are F-1/F-4/F-7, all law-transfer gaps rather than code defects. No mis-slotted file
was confirmed anywhere in the six audited features (candidates checked: every `*-content.tsx` in
components/ follows the region-body convention (item 2 above); `home-*-tile-body.tsx` in chat components
is the home-tile contribution body — correct owner, correct bucket; dual-basename settings pairs are the
§11 SET-SEAMS anatomy, not duplicates).

The composition-tier health check (memory: "glue = client/src/<name>/index.ts") — the pattern is healthy
at both members (`agent-nav`, `agent-seed`: dev-only, front-door-only imports, real store actions,
vocabulary-validated) but undocumented and unwalled (F-3).

**UI-Arch §2.1's own tree is stale** (misses `home`, `regex`, `rpg`, `tag`) — fold into the F-1/F-5 doc
pass.

## Q2 — THE CHANNEL MAP (every mechanism that actually exists, with enforcement + verdict)

Sweeps behind this section: repo-wide cross-feature import grep (zero runtime hits; one comment);
`ast-grep` over `setContextTab` (only chat sets its own tab, typed `satisfies ChatContextTabId`);
panel-mode action grep outside app-shell (zero); `CustomEvent`/`EventTarget`/`dispatchEvent` rogue-channel
sweep (zero); all 20 store headers; `main.tsx` whole; `invalidation.ts` header + filter maps.

| # | Channel | Home / receipt | Enforced by | When it is THE choice |
| - | - | - | - | - |
| 1 | state commons — narrow hooks + intent-named module actions | `state/*` (shell, active-chat, per-section drills, composer, chat-list-filter) | `state-files`, selector belts, `no-effect-on-shared-selection`, `client-state-below-data` | client-EPHEMERAL cross-cutting state: selection, panel modes, drafts, filters |
| 2 | tRPC query cache, cache-first | `trpc.*` queryOptions; `staleTime: Infinity` + bus freshness | `no-array-literal-querykey`, `no-static-staletime`, G9 seals | another feature's SERVER-persisted entity |
| 2b | `peekQueryData` — hookless sync cache peek | `data/peek-query.ts` | its own header law + `client-cache-surgery-only-in-data` | a pure resolve-time predicate (`when(state)`) that can't run a hook; NEVER a substitute for a hook read |
| 2c | door-injected `trpcProxy` into a contributor factory | `main.tsx:148` → `makeRpgContextTabs({trpc, queryClient})` | convention only (door comments) | a contributor whose `when`/resolve logic needs the cache OUTSIDE render; ordinary defs read `#data` hooks directly |
| 3 | TOTAL registries (closed vocab, tsc-total) | sections · modals · settings-panes | G1/G2/G4/G8/G13 + tsc Record | a member of a closed shell vocabulary |
| 4 | contributor registries (open) | chrome · settings-sections · context tabs · context REGIONS · chat-surface anchors · tool renderers ×2 · slash commands · character-detail · home tiles (10 families, `main.tsx`) | G3 (8 arms) · G8 · `chrome-`/`modal-`/`home-tile-registry-completeness` · partition assert (S2) · duplicate-id throws | a foreign feature EXTENDING a host surface — THE graft channel |
| 5 | door-threaded render-prop projection (Arm A) | `makeCharactersSection(…, view => <ChatsWithCharacterPane/>)` | convention + `client-features-no-cross` (forces it through the door) | ONE foreign pane projected into a host, host controls placement; ≥2 foreign panes ⇒ mint a contribution seam instead (F-8) |
| 6 | shared derivations at tier 4 | `lib/chats-with-character.ts`, `message-role-labels`, `row-qualifiers` | `client-lib-floor`, `client-lib-below-components` | ONE pure predicate/vocab both sides must agree on (the "second spelling" wall) |
| 7 | tier-2 composites | `components/` (24+ importer files) | G5 trio, G6/G7 | domain-aware UI ≥2 features need |
| 8 | event/sync spine → ONE invalidation seam | `data/bus/*` + `invalidation.ts` (chat + user + rpg maps, heal set derived) | `bus-coverage`×3, G10/G11/G12, `no-inline-invalidate-outside-seam`, `bus-onData-no-store-write` | server truth changed; freshness fan-out |
| 9 | editor-bridge | `forms/create-form-handle-bridge.ts` | §12 row 6 (INTRA-feature only) | a feature's own CONTENT↔CONTEXT |
| 10 | type-only cross-feature imports | dep-cruiser exemption | `client-features-no-cross` type-only arm | shapes wired at the root |
| 11 | agent-bridge observer | `lib/agent-bridge.ts` + `agent-nav`/`agent-seed` impls | header law; **wall missing — F-3** | tooling observation/drive, never product code |

**Wrong-channel audit result: ZERO confirmed misuses.** Specifically hunted and not found: server rows
mirrored into stores (all 20 headers clean); trpc round-trips for client-ephemeral pointers (the §12
RETIRE-class — none; `setContextTab`/selection all ride the commons); registry bypasses (no parallel
maps — G2 green; no feature renders a foreign surface outside the door channels); rogue event channels
(no CustomEvent/EventEmitter in client src). The gates + the store-header discipline are genuinely
holding. **The Q2 deliverable is therefore the table above** (fold into §12 / the README rewrite), not a
remediation list.

## Q3 — MOVABILITY: portable-by-construction vs welded, and the pivot scorecard

**Portable-by-construction (relocation = door-assembly edit + def edit, no shell surgery):** rail
sections (single-owner) · modals + their triggers (derived chrome) · chrome widgets · settings panes ·
settings SECTIONS (D120 — §11's seven-site move recipe, three tsc/assert-forced) · context tabs ·
context REGION claims (D119 — a whole pane re-owned by one claimant file + one array member) · home
tiles · chat surface-anchor grafts · tool renderers · slash commands. The SET-SEAMS test ("does it own
its read and its write?") plus the one-predicate-per-applicability discipline (`rpg-game-chat.ts` shared
by tabs AND region claim) is the house portability model and it is REAL — HUD-1 re-owned the entire
context pane with zero shell edits.

**Welding patterns actually found (named, with the honest severity):**

1. **No multi-owner section primitive** — F-8. The one genuine structural gap for the named pivots.
2. **Door-factory positional arity** — F-8's smell; each new seam churns every host signature.
3. **Section-vocabulary edits carry an undocumented coupled-site set** — a `SECTION_IDS` change touches:
   the tuple, the def(s), the persisted shell-store `migrate` (activeSection + per-section
   `panelOverrides`), per-section selection stores, `agent-nav`'s vocabulary validation, the two
   hand-maintained door mirrors D120 names (`settings-pane-registry.test.ts`, `ct-data-providers.tsx`),
   and mobile-fate curation (`rail.mobile`). All individually walled (tsc/total-migrate/gates), none
   written down as a playbook — the rpg-writable-field "~7 sites" lesson, one tier up.
4. **NOT welding (checked and cleared):** surfaces do not reach shell layout state (zero
   `togglePanel`/`resolvePanel` outside app-shell); context-tab ids are host-opaque by design with
   self-healing fallback (resolveActiveTab → first visible); no feature paints shell chrome (G3 arm 7);
   no hardcoded layout knowledge found in any audited feature.

**Pivot scorecard under today's structure:**

| Pivot | Cost today | Why |
| - | - | - |
| Panel redesign (Waystone/context) | **LOW — mechanism proven** | D119 shipped it: region claim + 8 gate arms + computed-value CTs. A future pane redesign = one claimant + door line |
| Config-rail riff | **MODERATE-HIGH** | list rows already speak the projection grammar and preset's editor decomposes (preset-surface-redesign §11, verified claims) — but the host section needs the missing multi-owner primitive; plus a SECTION_IDS edit (playbook item 3) + a mixed-kind selection shape (`createDrillSelectionStore` has no kind axis) |
| Rail-merge (characters+chats) | **MODERATE** | Arm A already projects chat's list into characters (live at the door) — the projection half is paid; full merge = the same multi-owner + vocabulary costs, under the D18 rider's projection-only guardrail |

**Proposed portability laws (each marked gate-able / doc-law / scaffold):**

1. **Mint the COLLECTION-CONTRIBUTION seam** (SCAFFOLD — a design set, pre-config-rail): generalize
   D120's shape to rail sections — `SectionContentContribution` = `{id, kind, nav/listProjection, body,
   when}`, host section skims, one door array, completeness pin. Rule: a section whose content spans ≥2
   features MUST consume a contributor registry, never stack ≥2 render props. Gate after (G-class arm on
   `section-registry-completeness`: a section def factory taking ≥2 render-prop params is RED).
2. **Host-factory contributions BUNDLE** (gate-able, cheap): one named-field `contributions` object per
   host factory instead of positional registries; a ts-morph arm caps `make*Section` registry-typed
   positional params at 1. Kills the arity churn before the fifth seam lands.
3. **The section-vocabulary playbook** (DOC-LAW): the coupled-site list from item 3 above, one paragraph
   in the lockdown §6a; cite it from the shell-store header.
4. **The F-3 wall** (GATE): composition-tier dir-module dep-cruiser rule.
5. **The F-4 recursion fix** (GATE).
6. **Feature scaffold generator** (SCAFFOLD — the owner's GDOC instinct is right): `pnpm scaffold:feature
   <name> --section|--pane|--chrome` emitting the slice dirs, the def stub at the gate-correct path, the
   nav/model/body triple for settings sections, the front door, and the test mirror. The generator is
   where the F-7 judgment calls become executable convention; the existing gates already verify its
   output, so it needs no gate of its own — it just has to be born agreeing with them.
7. **The doc pass** (DOC-LAW, one lane): F-1 + F-2 + F-5 + F-6 + §2.1 tree — one reconciliation commit
   in the §15 discipline.

---

## Verified clean (what my silence covers)

- `pnpm check` whole-tree: every client-relevant stage green (the one red is server-side suppressions
  baseline drift, receipted above).
- Cross-feature runtime imports: ZERO (grep, both directions, all 19 features).
- Routes: exactly the two sanctioned composition seams (`router.tsx`→auth, `app-root.tsx`).
- All 20 state stores: no server-data mirrors; every header states its channel rationale.
- `setContextTab`: no cross-feature magic-string tab welding (one caller, typed).
- Shell layout state: no feature outside app-shell reads/writes panel modes.
- No rogue event channels (CustomEvent/EventTarget/dispatchEvent sweep: zero product hits).
- The 13 door assemblies: all at `main.tsx`, G8-conformant; settings key-partition asserted at the door.
- The SET-SEAMS/D120 and HUD-1/D119 machinery: spot-verified live (defs, gates on disk, door wiring).
- Sections audited in full-def reads: presets, chats (factory), rpg context+region; gate files
  `client-structure`/`feature-structure` read whole.

**Regions NOT read** (scope honesty): individual surface/component bodies beyond those named (this was a
structure/channel review, not a logic review of ~400 client files); `tests/client/**` CT quality;
`app-shell` internals beyond grep-level; the ui package; server tiers except where cited. The
`Core-Enforcement-Active-Gates.md` catalog was consulted via the gate files themselves, not read whole.

## Unconfirmed / low priority

- `home` rail entry's mobile fate + D62 P3's mobile tab-bar list (Chats·Characters·Corpus·You) may also
  need the F-2 amendment's attention — not traced to render.
- `chat/components` at 72 files is within gate law but approaching the point where the F-4 nesting
  ruling matters practically; no defect today.
- Whether `agent-seed`'s verb-parity comment ("the same wire schemas use-rpg-mutations rides") still
  holds verb-for-verb was not re-verified this session (seeded-data≠verification memory noted; it is
  dev-only).
