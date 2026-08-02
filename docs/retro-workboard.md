# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state + work
> log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D114**) wins on ANY conflict.
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **CURRENT-STATE ONLY.** When a block goes stale, REWRITE it — never stack a new session layer on top.
> Rewritten in full 2026-08-01 EOD (the shakedown-cruise close; audited against the accreted day notes
> before deletion — the 07-31 thread-loss lesson). Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved the posture: one full owner dogfood day found ~20 real
defects, every one was fixed at its ROOT the same day, and five whole bug CLASSES were made
unmakeable. Judge every "done" against that frame.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
([[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ ▶▶▶ COMPACT-SAFETY SNAPSHOT #2 (08-03 late — THE current block; supersedes everything
## between here and the wave-3 seals below. A resuming orchestrator: read THIS, then the whole
## board, then git log -60.) ═══

**MAIN @ `0137d36a`** (tree clean; ~85 local commits past origin `851f625e` — PUSH NEEDS ITS
OWN WORD). Six-lane cap stands (owner). Board-only commits = `--no-verify` (owner word). Dev db
DROPS on next stack boot (DBG baseline regen) — expected, reseeds via latch.
**POST-COMPACT SEALS (08-03 late):** ✅ **RETRO MERGED (`88659d7a`, hook 14/14, torn down)** —
terminal state: 25 gates given stale arms (grain chosen per gate: strong for who-does-it claims,
path-rot for tier permissions, rejected arm written into each header) · 7 stale rows DELETED ·
2 renames out-of-vocabulary + 1 rename INTO it (feature-structure's hidden exemption) · axis 2:
6 vacuous scope.kind-only guards anchored, 14 dispositioned · axis 3: ZERO dead scanRoots
mechanically over all 119 · baseline+generator deleted per §4.8 · +3s (~7%) check:structure cost.
Lane lessons (bank on quiet slot): anchor must never double as an example subject ·
diagnostic-legibility reads message TEMPLATE text (const-prefix assembly invisible — pointer must
sit inside the literal) · measure scanRoots with ts-workspace.harnessGlobs NOT harness.getProject ·
ui-primitive-structure's 15-name mustPass = the corpus's most expensive example if trimming ever
needed. ✅ **CERD LANDED (`0137d36a`, hook 14/14, torn down) — D121 IS LAW** (7 clauses A-G) +
the permissions page (Spine-Identity §2c-§2e) + §4 dormant-doorway rewrite + D60 build-state
rider + eight-rail (UI-Arch §4.1) + home-spec BUILT flip + admin/index.ts comment truth-repair.
Landing checklist DISCHARGED: both re-derived framings verified source-pinned (promote-actor.ts:12-14
says exactly clause F's post-mint refusal framing; tracker-view.ts:200 cast filter), all §2c/§2d
symbols verified on tree (hostSeatOf/hostUserIdOf · viewerHoldsHost/viewerReadsHidden ·
assertHost/permitsHost · isAdmin export real), R4-parked board lines struck below. The verify --push
output that landed post-compact was the ALREADY-PROCESSED run (its 2 reds = the pair fixed in
`26e5856f`) — no new carnage; PUSH-READY still pending the clean re-run at quiesce.
✅ **PRIN MERGED (`6e310118`, hook 14/14, torn down)** — 3 gates live: table-scoping-class
(76 tables = 22 ownerId/18 membership/13 junction/18 parent/5 global, derived coherence arm —
a class can't outlive its column; the census map now lives IN CODE as TABLE_SCOPING_CLASSES,
citable by the permissions page) · owner-scoped-reads ((a)-set derived per-run; F3-AUTHZ
post-fetch-filter recognized structurally; READS-only declared limit) · injected-op-caller-param
(id vocabulary derived from kit/ids TypeIdOf<>; UserId/Handle excluded by construction).
**REAL DEFECT FIXED red-first: CopyCharacterBooks carried lore CROSS-TENANT both directions**
(signature never carried ownership; now takes ownerId + proves BOTH ends owned, matching
LinkCarriedBooks' guard; 2 new specs). ReapAssetsOp = EXEMPT structurally-safe (authority-safe
via ref-registry proof, returns no rows; reasoned row w/ end condition). Arm-2 sweep: 19
unfiltered-id sites (census's 3 was a sample), ALL verified zero-defect, each markered.
**FLAGGED follow-on (queue): the WRITE half** — same predicate over update/delete finds 30 more
sites, all guard-in-verb today; classification job, own lane.
✅ **CHAIN MERGED (`1b0c8771`, hook 14/14, torn down)** — `pnpm ast chains` live: whole
dead-chain naming (head ← link ← link), @public reader consolidated into ast.ts (ratchet
imports it — two-homes class closed), edge map opt-in {edges:true} w/ byte-identical-liveness
receipts (edges OFF/ON identical; ratchet output byte-identical vs HEAD). First audit: 14,759
decls / 52,989 edges / 15 unconsumed heads / **0 chain-dead** (zero proven real via planted
probe; graph prints its own size). Its 39 first-run hits were ALL lens bugs (lesson banked).
✅ **TRUTH MERGED (`fe46f9df`, hook 14/14, torn down) — the core-docs corpus is TRUTH-REPAIRED:**
all 35 docs swept; 14 STALE-BUILT-TENSE + 6 COUNT-DRIFT + 6 PHANTOM-REF + 2 CONTRADICTS-LEDGER
fixed (dated riders on snapshots, in-place on inventories); ~95 spot-checks held. Report:
docs/reviews/misc/2026-08-03-core-docs-truth-audit.md. Headlines: Core-STATUS was a wholesale
pre-retro lie · both ST registers stale BOTH directions · Tier-3b taught a 6-member BackendKey
w/ purged anth-direct · Spine-TS gold-standard pointed at a D117-deleted file · enforcement docs
claimed a standing CI against D62's no-CI ruling · SegmentedClock stale PREBUILT marker retired.
**LEDGER SWEEP D1-D121: one more D60-class lie — D67** (anth-direct "sealed a sixth
BACKEND_KEYS member", zero code refs) + D68's shadow + 2 rename drifts (D109/D112) + D31
parenthetical + D59 crew-vs-crew-DEAD. Rot concentrates in SNAPSHOT docs, not rulings; the one
systematic failure mode = "purge nobody swept the registry for." **GATE SPEC verdict:** general
build-tense linter REFUTED (tense = prose NLP); two honest mechanical arms recommended instead
(backticked-PATH existence + backticked-SYMBOL existence via ts-morph name index — the audit's
own scripts found 5 phantoms in one pass; dangling-refs family, both-ways) → QUEUE as a build
item. **⚠ NEW OWNER ITEM: monotonic-tests' deleted-test arm is silently INERT** (its manifest
was lost in the retro; readManifest fail-opens) — re-arm is an owner call, rider added in-doc.
✅ **SM3 MERGED (`44aeaaf4`, hook 14/14, torn down)** — all 6 smalls: gateAndResolveConnection
DELETED (pure passthrough confirmed at both call sites; canAgent lie gone) · users.ts +
set-enabled.ts comments truth-repaired to the D60 rider · databank-spec rail count → D121-C ·
responseFormatSchema @typeonly-ok (lens verified) · spanToWirePart now dispatches THROUGH
CONTENT_CLASS_POLICY (exhaustive Record + binding test that reds on table/dispatch disagreement;
the ignored-documentation class closed) · CharacterFacetId switches ×2 → exhaustive Records.
✅ **GRAD MERGED (`23078849`, hook 14/14, torn down)** — TRUTH §4 ALL APPLIED (D67 D60-shaped
rider [BACKEND_KEYS=5 verified] · D68 purge-shadow note · D31/D109/D112 fixed against the TREE ·
D59 crew disposition · reserved-range → D122+ · AGENTS.md §6 [buddy struck, roles 7→8, 4 stale
program pointers → the workboard] · lockdown §13 buddy-bus struck, automation-bus documented).
GRADUATED: home-section-spec + actor-state-model review → docs/history (refs repointed,
dangling-refs green). **CORRECTLY LEFT: preset-surface-redesign.md** (header still says
nothing-built — stale header vs built tree, needs a BUILT stamp pass before graduating; also
D121-G residue is genuinely open) **+ crunch-list (2 rows genuinely open, no receipts: item 14
macro pill [lane-C claim/code mismatch CONFIRMED] + O-2 provenance chip)** → both rows to POLISH.
**OWNER WORDS (08-03): monotonic-tests re-arm = GO ("flip it") · lane cap back to SIX + "fan
out if there's more work."**
✅ **PERSONA MERGED (`c736ae8a`, hook 14/14, torn down) + D122 MINTED (`67a04383`)** — the
R0-R4 program complete: multi-human keyhole CLOSED red-first over the real composition root
(3/4 specs failed on HEAD: member anchor/active/card all resolved wrong; green now) via the
persona-domain principal-less op `resolvePersonasForRoster` gated on the ONE consent-set home
`roster-humans.ts::presentHumanUserIdsOf` (verb + resolver share it — permission and reach
can't diverge) · member descriptions in shared prompt unconditionally · three-state
triggerPersonaId (explicit null binds ANCHOR; unit home activePersonaIdFor) · FORCED first-run
dialog on real sign-in ONLY (seeder auto-creates solely under E2E_HARNESS/DEV_SEED; DEV_SEED
minted + pinned in stack.sh — the owner's dev-regen constraint holds, both arms CT-proven) ·
sacred pin suite UNEDITED and green · ResolveForeignInputsOp.presentHumanUserIds REQUIRED
(fail-closed, every caller decided). Zero ruling forks. rpg linkage parked per ruling 5; noted
seam: turn.ts:509 steerIdentity.user now resolves live member identity for free. FLAGS: drain
end-to-end proof needs a compose-tier provider tape (doesn't exist — flagged not faked) ·
2 files added to SERIAL_INT (documented cold-import class). Lane lessons: peekPrompt/
getMemberCard = the cheap compose-level persona observables · foundation/env parses at module
load (vi.stubEnv can't flip composed knobs — injected unit tests own the other arm) · new
full-createServices int file needs a SERIAL_INT row.
**HANDOFF-COPY now waits on REGEX's drain instead** (BOTH regen the db baseline —
0000_baseline.sql collision; REGEX's regen is already in its branch).
**⚡ OWNER WORD (08-03): MERGES GO `--no-verify` on branch-side hook-green receipts** ("this is
insane" — the double hook-run per merge dies). Consolidated proof = the quiesce verify --push.
Track as explicit debt: any --no-verify merge is listed here until that run.
✅ **MONO MERGED (`3f7d4fee`, hook 14/14, torn down)** — the deleted-test tooth BITES again:
manifest regenerated (1,447 files, the post-retro floor), readManifest FAIL-LOUD w/ regen
remedy (real-tree anchored), two-sided deletions ledger (unaccounted deletion RED · ledgered
GREEN · returned-file stale row RED), 4 probe receipts. Account-a-deletion flow documented in
the gate header (add a why-row, no regen needed).
✅ **POLISH MERGED (`634db1b8`, hook 14/14, torn down)** — item 14: macro pill tone="soft"
(the mock's own .tok grammar; computed-style CT red-first 2/4 on HEAD; --color-info now
CT-load-bearing = the don't-re-hue ruling is enforceable) + Badge inline arm draws no border
box in any tone (single-consumer swept) · O-2: "resolved for {model}" via SHARED literal
`resolvedForLabel` in effective-knobs.ts (header + readout byte-identical — the drift class
dead) · preset-surface-redesign.md restamped BUILT/CLOSED w/ per-stage receipts + honest
clause-G residue. **CRUNCH LIST = 36/36 ACCOUNTED, GRADUATION-READY** (next pass moves it,
no re-verify needed). Lane lesson banked below (pathspec commit drops untracked NEW files).
✅ **WRITES MERGED (`316d92b5`, hook 14/14, torn down)** — `owner-scoped-writes` gate live
(SIBLING gate w/ DISJOINT marker vocab @owner-scope-write-ok — shared vocab would invert the
read gate's stale arm, lesson banked); 33 sites classified, 29 markers each naming its
authorizer; shared substrate extracted (tenancy-read.ts + ownerScopedTableIdents — the two
halves can't drift on what a WHERE is; read gate −165 lines). **SECOND REAL CROSS-TENANT
DEFECT FIXED red-first: credentials `promoteActive`** — Alice naming Bob's credentialId
flipped BOB's credential active + broke his one-active-per-slot invariant (verb checked
ownership but the query leg didn't; now owner-scoped in the WHERE + spec). **FLAGGED
FOLLOW-ON → Lane UPSERT dispatched:** onConflictDoUpdate is an update in disguise — a conflict
target omitting the owner column can overwrite a foreign row; live (a)-table upserts to judge:
plugin_kv ([pluginId,key] — NO owner) · stats apply-delta ×4 · settings/theme-queries ·
automation (owner-targeted, likely fine); needs UNIQUE-index derivation × target list.
**Lane DANGLE also dispatched** (TRUTH's ruled gate arms: backticked-PATH + backticked-SYMBOL
existence, dangling-refs family, both-ways).
**LIVE NOW (5): REGEX · F14 · UPSERT · DANGLE (+ MONO's zombie instance TaskStopped after
merge — owner spotted it lingering).**
**✅ PERSONA×RPG STICKLER DELIVERED + 3 RULINGS (owner, 08-03; report committed `1ed993c7`:
docs/reviews/stickler/2026-08-03-persona-rpg-and-history.md):** Q1 rpg = COHERENT-AS-IS
(receipted — actor keys persona-stable, every read live-resolves; Ashen Spire root cause =
frozen prose from a persona-less generation stack, NOT resolution) · Q4 stored history =
RIGHT (names never freeze into rows; ids+stamps, live derive; freezes = assistant prose,
digests-by-design, export header only). RULED: **(1) REGENERATE the six demo transcripts**
on a persona'd stack (re-generate-never-edit law) → Lane TRANSCRIPTS queued for a QUIET
stack slot (needs live engines + the post-REGEX reseed; after the baseline-drop reboot).
**(2) Mid-session persona-change linkage STAYS PARKED — owner's reasoning AND the ruled
solution FLAVOR, record both (the design direction for whenever this unparks):** "if you form
relations with NPCs with persona A and then swap to persona B, all those keyed things will now
point to persona B even though they haven't done anything — the same debacle as persona pin
and why we made it." **Owner clarified (08-03 #2): the answer is PERSONA-PIN SEMANTICS applied
to rpg-lite state tracking** — relations/keyed state PIN to the persona they were formed under
(the pin's story-accuracy job, extended to the game plane): a swap opens new/parallel context,
never a silent re-point. Recast-is-story is NOT the full answer; the future design derives
from the pin concept (owner-sacred), not from live-resolution. **(3) RESYNC = the two thin affordances**
(bulk arm on reattributePersona {mine:true, fromSeq?} killing the client 100-row window hack ·
opt-in restamp checkbox on the host resyncFromStory dialog, restamp-then-rebuild; never-touch
list stands: content D26, snapshots, digests D55, exports) → Lane RESYNC queued next drain.
**REGEX mid-state:** R1-R6 BUILT + suites green (133 files +3200/−865; regex portable kind at
PORTABLE_IMPORT_ORDER[5] pre-character; scope-key ORDER pin new; carriers dead; raw columns
dead; ONE baseline regen — dev db drops next boot, BACKREST-MANUAL for owner scripts);
CONTINUING WARM to close its enumerated 52-item tail (owed domain test mirrors + behavioral
bundle round-trip + RECEIVE/WI ORDER pins). **OPEN OWNER FORK: DISPLAY-tier sourcing** —
viewer-only (implemented, law-literal: a host can't rewrite what others SEE) vs ST-parity
(room carriers' DISPLAY scripts render for every viewer + viewer's on top) — posed.
**→ DISPLAY RULED (owner, THIRD arm): viewer-only default + a HOST PER-ROOM TOGGLE** — host
enables → the HOST's display scripts render for every viewer ("a GM might want to do something
special"); default OFF (D121-B options-never-defaults grammar); viewer's own scripts apply
LAST (counter-style always possible); both arms CT-pinned. Relayed to REGEX's warm tail.
✅ **F14 MERGED (`509a6550`, --no-verify on branch-side green receipts [first under the new
word — debt row, cleared by the quiesce run], torn down) — HOME BOOT CLS 0.0913 → 0.0000
measured.** THE F-14 ROW IS REWRITTEN: the pinned shell.css cause was REFUTED by measurement
(first-commit grid template already carries resolved tracks — zustand persist rehydrates
sync at module init; the 0px defaults are never observable; shell.css is CORRECT AS-IS).
Real mechanism: home tiles suspend onto a fixed 3-row skeleton ≠ settled box → recents grows
+189px and shoves the tiles below. Fix = TileBody remembers each tile's settled height
(home-tile-box-store, DEVICE_LOCAL_REGISTRY) and TileFallback reserves EXACTLY it (not a
floor); first boot reserves nothing; stale entries self-heal on mount. Red-first CT pins ×2 +
the app-shell first-commit pin (addInitScript+reload — a story landing state in an effect
can't pin first commits, lesson banked) + a store unit guard vs absurd measurements.
SIDE-EYE RIDER boarded: loading recents = 3 skeleton rows in a remembered 422px box (blank
below), temp-chat clips its 3rd bar — honest ~300ms flash; polish = row-pitch token (none
exists today).
**LIVE NOW (5): REGEX · MONO (monotonic-tests manifest regen + fail-loud
readManifest + two-sided arms) · WRITES (PRIN's write-half: the owner-scoped predicate over
update/delete, 30 sites classified w/ markers, world_books rows coordinate w/ REGEX) · POLISH
(crunch item-14 macro pill + O-2 provenance chip + preset-surface-redesign BUILT-stamp pass) ·
F14 (the CLS lane — shell.css:11-12 boot-track squeeze, cause pinned: resolved modes into the
grid pre-first-commit + suppress track transition during boot).** Queued: HANDOFF-COPY (behind
PERSONA) · PORTABILITY R0-R6 (behind REGEX — PORTABLE_KINDS collision) · dangling-refs gate
arms · TD design pass · CAP-GATE small · D8 residue · span-coverage smalls.

**LANE TRUTH DISPATCHED (Fable-tier, OWNER-EXEMPTED — the day's closing act):** the core-docs
TRUTH AUDIT — every verifiable claim in docs/architecture/core verified against the tree
(build-tense assertions · counts · named symbols · behavioral claims), classified TRUE /
STALE-BUILT-TENSE (→ dated riders, the D60 fix shape) / COUNT-DRIFT / PHANTOM-REF /
CONTRADICTS-LEDGER; mechanical fixes land per fix-don't-park, design-flavored rows flagged;
CERD's five drafted surfaces EXCLUDED (notes route to its merge). Deliverables: the truth-debt
table (docs/reviews/misc/2026-08-03-core-docs-truth-audit.md) · the build-tense-claim GATE
spec-or-refutation · **the full D1-D121 ledger sweep** (any other entry lying built-tense —
the highest-value item). Rationale: five core-doc lies found INCIDENTALLY today = the corpus
holds more; the ledger outranks everything, so its truth is load-bearing.
**✅ CERD DELIVERED (branch `wt/agent-ada8d9c0033d2f420` @ `9e966692` — DRAFT for the
SUCCESSOR'S REVIEW-THEN-LAND, per design):** **D121 minted** (7 clauses A-G: role law verbatim ·
permissions pointer + name-the-bypassed-option rule · home/D62-P6 amend · chrome anatomy ·
regex D53-storage + ORDER table · rewind asymmetry · D8 residue) + Spine-Identity §2c/2d/2e
(three layers · who-owns-what · BY-DESIGN register) + §4 dormant-doorway rewrite + UI-Arch §4.1
eight-rail + lockdown/home-spec annotations. check:docs + d-citation-integrity green in-lane.
**ITS BIG FIND: D60 ITSELF still claims agent principals BUILT** (the ledger outranks the spine
— a spine-only repair would be overruled on cold read); CERD added a dated build-state RIDER at
D60's head — **APPROVED, keep it** (lesson: purge waves must sweep the LEDGER, banked below).
SUCCESSOR'S LANDING CHECKLIST for the CERD merge: verify the re-derived rewind-asymmetry +
promoted-unseated framings (no durable text existed — CERD re-derived source-pinned; check
before landing) · R2's three-questions paragraph was reconstructed from code homes (R2's text
lives only in its lane SendMessage — the reconstruction is anchored on the three real homes,
acceptable) · the board's own R4 self-contradiction: CODE WINS, R4 IS BUILT
(promote-actor.ts + actor-rekey.ts + tests) — strike the stale "parked" line when landing ·
the 6 stickler reports ARE committed (verified, 6/6 tracked — citations resolve) · regex-R0
ORDER-table inclusion approved (the board's version governs, per-leg pins = owed work).
NEW SMALLS from CERD: engine.ts:171-179 gateAndResolveConnection = live no-op passthrough w/
lying canAgent docstring (delete-or-truth-repair) · 3 more stale canAgent/seatAgent comment
sites · databank-spec's "SEVEN sections" line.
**RETRO mid-run (approved, finishing axes 2+3):** the machine-checked baseline BURNED 13/16→0/0
across four commits — baseline + generator DELETED per §4.8 (arm B now unsuppressed: a new
one-sided table reds on arrival). 22 gates retrofitted; SIX dead purge-debris allowlist rows
found+deleted (the whole crew + roster-preset domains + 4 rpg files). Two calls approved:
rename-out-of-vocabulary ×2 (TIER_ENTRIES w/ mirror ratchet · NON_FABRICATING_CAST_TARGETS) ·
§12.6 prose → UI-Theming §12.6 (the D44 table the prose actually meant; gate docRow stays
§11.6 — do NOT unify). Remaining: anchor guards on ~9 stale-armed gates + the zero-match
scanRoot sweep.
**PUSH BATTERY VERDICT (owner: "see the carnage"):** 9,677 tests + e2e smoke + all 15
structural stages GREEN; exactly TWO reds, both TODAY'S landing debris caught by TODAY'S gates —
(1) the orphan-ratchet's FIRST push-tier catch: chatUnavailableCauseSchema orphaned by SM2's
demotion → DELETED per the ratchet's own fix text (never baselined) · (2) chat-component-
presence: message-wire-trigger needed its coveredBy waiver (variant-wire-viewer.ct). BOTH FIXED
+ committed, both stages re-run green individually. **PUSH-READY pending one clean full re-run**
(cheap successor confirm) — then the owner's push word ships ~80 commits.
**PERSONA REVIEW DELIVERED + ALL 5 FORKS OWNER-RULED (recommended arms):**
docs/reviews/stickler/2026-08-03-persona-model.md — model COHERENT single-human (ground truth =
FINAL-Persona PART A's worked examples + Chat-Macro-Resolution's five-context table); defect
class = ONE KEYHOLE (multi-human under a single host principal). RULED: (1) resolution widens
via persona-domain factory op gated on the owner's PRESENT membership · (2) member descriptions
enter the shared prompt unconditionally · (3) explicit-null trigger binds the ANCHOR · (4)
seeder auto-creates ONLY under E2E_HARNESS/DEV_SEED, forced dialog on real first sign-in ·
(5) rpg linkage parked. R0-R4 program QUEUED (multi-human arms ADDED to the sacred suite,
never editing existing; one ceremony D-entry — CERD gets the membership-consent clause as
verbatim input). F7 = MY MEMORY was wrong (persona-pin file corrected: the persona marker
renders ACTIVE not anchor; the anchor governs CARD context). The half-remembered macro FOUND
(card-context {{persona}} = the anchor's whole description, pinned). Traveler clause verified
template-homed; ST comparison says keep our wording.
**CHAIN fork RULED:** NO fifth exemption marker — chain heads are orphan candidates under the
ratified @public + ratchet stale arm; exemption lives at the HEAD (mid-chain exemption states
nothing true); chains reads @public roots as alive. Scope EXTENDED one file: the @public reader
consolidates into ast.ts (exported), orphan-export-ratchet.ts imports it (two spellings of the
predicate = the two-homes class; ratchet's bare-tag probe staying red = the receipt). Edge map
is opt-in {edges:true} — flag-OFF path pinned byte-identical.
**✅ HEAL MERGED (`14c88995`)** — both handoff heals in the atomic swap batch via a NEW
co-statement seam (rpg→chat handoffHealStatements returning UNEXECUTED BatchStmt[] — table
ownership intact, one-batch crash safety; the chat→notifications pattern now runs both
directions — lesson-grade); anchor arm = NULL (code-derived: the ?? active fallback IS D51's
intent; re-pin would trip sameProjectedPersona); fork.ts twin healed; export name-leak closed
as a side effect; audit flags healedAnchorPersona/healedGmPreset (booleans never ids); U2
deliberately NOT taken (unarchive-on-accept = unruled semantics — flagged). MULTI-PERSONA
receipts in its final report. **verify FIRED CORRECTLY as `pnpm verify --push`** (first attempt
was a wrong script name — verify:push does not exist; the push tier is `verify --push`) —
background, successor reads the verdict. PERSONA stickler got the owner directive: read the
ENTIRE persona docs+code corpus — exact pin examples exist in docs and are the authority.
**FINAL-7% DISPATCH (owner: "dispatch until you run out") — SIX LIVE NOW:** RETRO (gate
retrofit, has GDOC's baseline loop) · HEAL (handoff heals) · **PERSONA stickler** (the
consolidated design pass: multi-human resolution + pin/anchor integration + forced-first-run
w/ the dev/harness constraint + ST comparison) · **PRIN** (principal-flow gate: 3 arms on the
census, ReapAssetsOp verdict inside) · **CERD** (DRAFTS the ceremony doc set: close-out D-entry
w/ all six riders' text + the permissions-model page + rail-list refresh — successor REVIEWS
then lands; graduation verifier + history moves stay orchestrator steps) · **CHAIN**
(declaration-granular liveness edge [byte-identical-liveness guard mandatory — it sits under
the push ratchet] + pnpm ast chains fixpoint + first audit). **verify:push FIRED in background
(owner: "see what the carnage is")** — output at the task file; expect POSSIBLE contention
flakes from six lanes' verification phases (the paid-for law: re-run suspicious reds isolated
before believing them; the tree was hook-green at every merge today).
**LIVE LANES (4, resumable via task notifications — process each per the THREE MERGE LAWS:
--no-ff merge → verify separately → teardown separately; format-drift reds get fixed in the
staged merge, scoped biome only):**
· GDOC — gate-authoring law doc (scripts/check/GATE-AUTHORING.md) + contract.ts ExemptionRow
  (mandatory why) + pnpm gate:new scaffold + gate-modernization meta-gate (derived baseline
  handed to RETRO). My memory-hub gate lessons are MIGRATING INTO the doc.
· RETRO — ~57 one-sided gates get stale arms (40-join priority) + 22 guard shapes + 16 complex
  scanRoots + the §12.6 citation fix ×3. Adopts GDOC's type if it lands first.
· RAWVIEW (security) — per-variant PROMPT-SNAPSHOT inspector grafted into the EXISTING chat
  diagnostic surface (owner correction: no new home) + THE FORK-LAUNDERING FIX (member→host
  promptSnapshot leak, red-first) — the raw_request/raw_response columns are WRITE-NEVER and
  RULED DELETED (deletion rides regex R1's baseline regen, NOT this lane).
· HEAL — handoff F1 (foreign gmPresetId nulled in swap batch) + F2 (anchor persona conditional
  null, fork.ts twin if cheap); verb/resolver fork RULED (resolver is the widening point, its
  own ticket); found+confirmed: MULTI-HUMAN ACTIVE-PERSONA IS SILENTLY DEAD for non-host
  members (single-principal resolveForeignInputs) → TICKET below.

**RULED TODAY (all owner, question tool):** regex all-8 forks · portability all-8 · raw blobs
= build reader (then columns ruled DELETED post-census) · TYPO class-B = plain types (done,
SM2) · handoff = heals now + MINIMIZED COPY ARM approved as near-wave program (stickler-shaped:
one toggle at nominate, pendingHandoffOffer column, copy-at-ACCEPT, cards+books-as-copies+
optional-GM-preset, seats re-point in place, decline=D64 drop) · DB boundary = amended law +
own-tables gate (landed) · migration-readiness NOW (landed) · six-lane cap · board --no-verify.

**QUEUE (after live lanes drain, priority order):** CEREMONY — strike DONE; ~~close-out D-ENTRY
w/ six riders~~ **DONE 08-03: D121 LANDED with all six riders** (two-class clause · permissions
page · Spine truth-repair · home/D62-P6 amendment · chrome anatomy · regex D53-storage);
REMAINING ceremony = graduation verifier → docs/history move — QUEUED BEHIND TRUTH's drain
(the moves repoint refs inside docs/architecture/core, TRUTH's territory; dispatching it now
would collide). THEN: Lane PRIN (principal-flow gate — census DONE: ownerid-registry
already gates class-a; 3 mechanical arms specced [class-declaration 0-red ·
fetchOwned-or-justification 3 rows · caller-param sweep]; ReapAssetsOp compose-closure
verification inside; membership-rung = behavioral-only, honest limit) · MULTI-PERSONA ticket
(persona.getForRoom-class op + membership gate — HEAL's confirmed find; design fork to owner) ·
HANDOFF-COPY program (approved shape above) · F-8 collection-contribution design set
(pre-config-rail) · CHAIN (substrate blocker verbatim in queue notes: buildLiveness is
FILE-granular; declaration-granular edges = substrate change under the live push ratchet) ·
BRAND gate (string-where-kit/ids-brand-exists, positions derived) · REGEX R1-R6 program
(report §7; R1 regens baseline + carries the raw-column deletions) · PORTABILITY R0-R6
(lifecycle registry; databank F1 at R1 priority) · side-eye re-check on FX's 31 · F-14 CLS ·
TD design pass · CAP-GATE + FirstRunPersonaDialog smalls · D8 residue (+BINDING_VIEWS) ·
span-coverage smalls (fireRpgTurnCompleted outside any span · structured-turn retry
unobservable · provider.* spans never opened) · TYPO class-A dispositions + responseFormatSchema
@typeonly-ok one-liner · MacroTextarea other-consumers user-plane question · content-class
table-dispatch + CharacterFacetId Record smalls · cookie-parser… done · ENDGAME: quiesce →
verify:push → PUSH-READY (word).

**✅ GDOC MERGED (`fafa228f`)** — GATE-AUTHORING.md (288 lines, the hub lessons now REPO LAW) ·
ExemptionRow mandatory-why in contract.ts · pnpm gate:new (self-proving scaffold, probed) ·
gate-modernization meta-gate #167 (arm A no-descriptor · arm B one-sided-exemptions BASELINED
13 gates/16 tables shrink-only [RETRO's machine-checked loop; ~57→16 = narrower vocab, delta is
RETRO's judgment sweep] · arm C §-anchor-DEFINED check — 3 live phantom citations FIXED at
landing). RETRO handed the baseline flow + the 2 prose §12.6 refs. Lessons: PROBE_ARTIFACT_RE
is what makes gates unfixturable · §-checks must require DEFINED not mentioned.
**✅ RAWVIEW MERGED (`de3c7bb4`)** — fork-laundering CLOSED red-first (traitor-lie + vault-code
receipt) · chat.getVariantWire host-gated + PROBED + the host-B-cross-room belt proven by
join-deletion · grafted onto MessageMetadataRow (the real per-variant diagnostic home; Preview
tab = chat-level prospective, couldn't host) · sentPromptSchema exact-key-set pinned so a
widened AssembledPrompt can't grow the read · 3 registry rows flagged for skim · census: the
raw columns are WRITE-NEVER (copy-writers aren't originators — lens nuance recorded).
**OWNER ANSWERS (4):** PV = KEEP + three riders → **FIRSTRUN item reshaped**: persona creation
FORCED at first sign-in (kills the dead-dialog small's premise — the seeder/dialog relationship
redesigns), clause stays template-homed (verify it is — C1 landed in DEFAULT_MARKER_TEMPLATES),
wording pass compares SillyTavern's first-run persona UX → folds into the PERSONA DESIGN PASS
(one stickler when a slot frees: multi-human resolution [host-default + host anchor control +
the half-remembered macro] · persona-pin integration · forced-first-run flow · ST comparison ·
HEAL's getForRoom receipts) · **AV2 = CLOSED (owner, 08-03: "I approve what we have" — pack stands as-is, no re-push, no sticker, $0; fix-later-if-needed)** · AGENT-1 =
PARKED until current programs land · DRAFT-TRUST = design pass when reached (boards behind the
tail).
**STANDING OWNER ITEMS:****PERSONA DESIGN PASS — OWNER CONSTRAINT ADDED (08-03, why the forced-dialog never shipped):**
forced persona creation MUST NOT fire on dev regens / test harnesses — every stack re-mint +
E2E boot would prompt. The design needs the force scoped to REAL first-sign-in only (the
E2E_HARNESS stamp + dev-seed latch are the existing discriminators; the seeder likely keeps
auto-creating under harness/dev and the force applies only outside them). This constraint is
first-class in the pass's brief.

**═══ REPORTS INDEX (everything today's programs cite) ═══**
docs/reviews/stickler/: 2026-08-03-role-authority-model.md · 2026-08-03-regex-model.md ·
2026-08-03-client-architecture.md · 2026-08-03-lifecycle-portability-model.md ·
2026-08-03-handoff-card-ownership.md · (08-02) zod-leverage-audit.md · actor-state-model.md
docs/reviews/misc/: 2026-08-03-export-rot-dispositions.md (one-shot record) ·
2026-08-03-registry-map.md (v2) · 2026-08-02-preset-execution-crunch-list.md (STRUCK w/
receipts) · 2026-08-03-avatar-pack-v2-contact-sheet.png
LAW LANDED TODAY: scripts/check/GATE-AUTHORING.md (the gate law; hub lessons migrated IN) ·
Tier-1-DB.md (ownership law + migration lifecycle + pragma hole) · agent-doctrine.md (floors:
depcruise, fix-don't-park, test-seam naming, dynamic-seam-ships-with-lens) ·
Spine-Identity-and-Auth §3 row. Scout censuses live in THIS BOARD's blocks (principal-flow ·
db-ops · registry map · gate scorecard) — the board IS their durable home.
TOOLING MINTED TODAY: pnpm ast {swallowed,typeonly-alive,columns,regkeys,respell} · pnpm
gate:new · gate-modernization/own-tables-only/two-class-role-authority/contract-derives/
zod-modern-spellings/no-hover-display-swap/fk-index/ondelete/pk gates · structure:drizzle-kit ·
structure:db-baseline (commit tier) · deps:orphan-ratchet (push tier) · chat.getVariantWire.

**STANDING OWNER ITEMS (post-answers): D22 (multi-user stack) · F6 strict-fidelity nit (leave unless owner cares) · regime-2 landmine (launch-day) — everything else RULED/CLOSED today.**

## ═══ ▶▶▶ HANDOFF #3 — 2026-08-02 NIGHT (SESSION-END; the ONE current block. Owner is
## swapping accounts — the resuming orchestrator has NO conversation memory; this block +
## MEMORY.md + git log are the whole truth. Everything below it is archeology.) ═══

**⛔ DISPATCH FREEZE IN FORCE (owner word — weekly usage cap): NO agent spawning, NO new lanes,
until the owner lifts it.** Answer questions, keep the board current, nothing else launches.

**TREE:** main @ `e1c07cbc`, clean, ALL lanes drained (zero worktrees, zero branches, zero
running agents). Every merge today was hook-certified (12/12 static check). **Origin @
`32539eda` — everything since is LOCAL (~45 commits); NEVER push without the per-push owner
word.** Stack: dev up on :5173/:8788, **dev db RE-MINTED today** (V2 baseline squash + R2R3
blob reshape both required it — owner's games are gone from dev, seeded-data caveat applies).

**LANDED TODAY (all merged + certified; details in the struck blocks below + git log):**
· **ACTOR-STATE R1-R3 COMPLETE** — op-shaped `rpg.patchActor`/`rpg.dismissActor` (writeHandState
  seam), NPC IS an actor (identity plane, slug keys w/ contract refine), presence plane, cast*
  projections dead, hp demoted to unified trackers (d20-seeded def), GM→HOST copy. Stickler
  pre-merge pass: all 6 findings fixed red-first. ~~R4 (promotion doorway) NOT built — parked~~
  STRUCK 08-03 (CERD landing checklist): R4 IS BUILT — promote-actor.ts + actor-rekey.ts + tests;
  D121 clause F records its two named gaps (rewind asymmetry · promoted-then-unseated).
· **PRESET-1 BUILD COMPLETE P0-P5** — five views, KnobRow ghost grammar, rack select≠drill,
  drill-in consolidation (bridge/inspector dead), TEMPLATE_DEFS Actions, per-view readouts, list
  projection (inline activate, Select dead, G6 export/import doors, G7 header truth), side-eye
  DO-NOT-SHIP round FIXED (33/34 + F-24 argued; GhostValue unified; EffectivePreset.qualityMapping
  server datum). Reports: docs/reviews/side-eye/2026-08-02-preset-program.md.
· **PROSE-1 S2** — Prose settings section live in Chat behavior (D107 arm B; derived cohort;
  spec-text delta owed: §8 said settings/**, D114/D120 homes it with the reader = chat).
· **smalls #2 + #3** — Jobs vocab, toolround usage record, bang-prefix gate arm (14-row baseline
  re-opened → square-glyph Button small queued), QUOTE-1 tint, prose sweeps; 4 stale board rows
  caught already-built (struck with receipts).
· **e2e mirror-parity pin** (types:tests-dom enforces; 26 shapes) · **ZOD AUDIT** (verdict NOT
  lazy; 3 stale truth claims; staged build program A-D in
  docs/reviews/stickler/2026-08-02-zod-leverage-audit.md — AWAITS OWNER READ) · **ICON SEAL** —
  weight/fill/partialFill axes, FillableIcon brand, byte-identity CT (client adoption FROZEN).
**ZOD PROGRAM A-D: APPROVED (owner read the report in full, 08-02 night — "we do it right and we
do it once even if it means more work").** Direction on the stage-D forks = the do-it-right arm:
F1 strip-observability hole on the D112 folded wire gets CLOSED properly (no quiet
invented-key-vanishes path survives), F5 stringbool with pinned {truthy,falsy,case} params,
F11 z.hostname swap PROBE-FIRST (SSRF-adjacent — the report's own caveat stands). Dispatches as
ONE do-it-right lane (A truth-repair → B prettifyError → C respellings → D arms) at the next
heavy slot after Lane B/C drain (contract-file adjacency).
**Z-LANE F11 PROBED + RULED (08-02 late):** z.hostname swap APPROVED on receipts — 15 garbage
inputs narrowed, ONE widening (uppercase, immaterial: egress hostAllowed lowercases both sides).
**PROBE FOUND A LIVE HOLE the swap closes: leading-dot manifest entries (`netHosts:[".com"]`)
act as SUFFIX WILDCARDS in hostAllowed while the contract claims no-wildcards** — landing with a
named contract refusal test + cross-cited comments + validateUrl truth-repair. MERGE RIDER: the
F11 hunk gets a security-executor eyeball at merge (routing law formality; analysis complete).

**⚠ OWNER-REPORTED LIVE DEFECTS (08-02 night, post-fix-all — REAL, seen by the owner's own
eyes; these are the FIRST work when the freeze lifts):** (1) **INFINITE RENDER on hover in the
preset LIST, especially at the EDGE of preset names** — prime suspect: the P4 ROW_REVEAL_SWAP
mechanism (Active badge hides ⇄ action cluster reveals on hover; if the swap moves layout, the
hover boundary oscillates → flicker/re-render loop at the name's edge; the fix-all's
subtitlePlacement="inline" + min-w-24 changes touched the same row geometry). Diagnose with
React profiler / __orb.animations() + a pointer parked on the boundary; the fix must make the
swap layout-stable (reserve the space, opacity-swap, never conditional-mount width). (2) **the
LIST-VIEW buttons are JANK** (owner verbatim) — the reveal cluster's appearance/hit-targets;
judge live, not from CTs. The re-verify side-eye STARTS with these two before its normal sweep.
**→ FULL EXECUTION CRUNCH LIST DELIVERED (08-02 night, orchestrator mock-vs-rendered pass +
owner's own list merged): `docs/reviews/misc/2026-08-02-preset-execution-crunch-list.md`** —
P0 mechanism PINNED from owner console (conditional-mount badge⇄cluster swap, (detached)
oscillation; synthetic hover can't repro — real-pointer proof required), 17 orchestrator items +
15 owner items incl. 7 ★rulings (active=filled lucide dot [P4 badge arm OVERRULED] · zone vocab
In-Chat + conditional depth/order · Spoken-as/Delivered-as→Role · triggers=dropdown multi-check ·
rack descs→hover · compaction label shorten · quality-strip redo) + the VERIFIED memory-marker
vocab lie (compaction writes compactSummary, never Memory — 3 copy sites) + dead inject-at-depth
input + dead Delivers-via button + missing drill OVERRIDES block. Mock crops for side-eye:
`reports/snaps/preset-mocks/` (INDEX.md); rendered set `reports/snaps/mvr-*.png`. THE FIX LANE
BRIEFS FROM THAT DOC.

**✅ PRESET FIX WAVE FULLY MERGED @ `7689b5aa` (A trailing-slot/dot + B layout/type/amber/quality-
dropdown+maxBudgetUsd-lift + C vocab/zone/Role/triggers/Overrides/readout-headers + D focus-flag +
E smalls — every merge receipted; B+C reconciled-in-lane after main moved; C refuted O-8 [depth
input works — the ghost/zone confusion was the real defect, died with O-9] + item 16
[only-when-set cues correct; firesCue landed]). REMAINING on the wave: real-pointer probe (owed — owner's Chrome
extension DISCONNECTED overnight; fallback = chrome-devtools MCP continuous hover sweep
[20+ stepped coordinates across the New-preset name edge] + in-page pointerover/out counter on
[aria-label="Presets list"]; single-digit crossings = pass, hundreds = loop; owner's real mouse
in the morning is the gold verify; ALSO re-check :5173 serves post-merge modules — zombie-vite
bit once tonight already, fix = stack restart) → crunch-list strike pass → side-eye RE-VERIFY
(desktop+mobile) → close-out D-entry + graduation verifier. Lane F (density S6 + monogram voice + memory-noun rider) still building.
CHARACTER program: recon DELIVERED (docs/reviews/misc/2026-08-02-default-character-recon.md);
**ROSTER WRITTEN (Fable lane, owner-exempted tier): 10 characters @ its worktree
docs/design/default-character-roster.md, commit `3c66f08f` — 5 derived/3 net-new/2 rebuilds;
4 taste forks RULED (JFC uncensored · Charlotte STAYS a spider · 10 stands · backtick device →
one card); ORCHESTRATOR FULL LINE-READ + SIGN-OFF OWED next context window (then edit round →
lane merges main → doc lands → avatar-gen + demo-chat + seed-wiring lanes). Lane HOLDING WARM.
Reseed-latch caveat: existing installs need a migration decision to get the new pack.**
**═══ ▶▶▶ COMPACT-SAFETY SNAPSHOT (08-03 morning — THE current block; owner AWAKE and ruling) ═══**
MAIN @ `dfcc393d` (+1 board commit may follow), clean except uncommitted docs (board · crunch-list
strikes · character-recon doc untracked). ALL of last night MERGED+certified (see v2 block below).
**FX MERGED (`193a8907`, hook-certified, torn down): ALL 31 side-eye findings closed** — F-1/2/3
P1s live-proven (receipts reports/snaps/fx-*.png); F-24 refuted (zone derived not stored —
protects the owner's SETUP/POST queue item); F-12 Home arm refuted (context:"unavailable" per H3,
no pane exists); F-10 resolved by reordering Placement BEFORE Delivery (both owner rulings
untouched — flag if he'd rather overrule); ONE gate allowlist row added (empty-state-has-action
← WorldInfo no-selection, precedent-matched — second-look flag); blast radius deliberate+swept
(macro-textarea 8 sites, Badge inline, Card nested, EntryListEditor, LibraryRow shared).
**F-14 CLS = ITS OWN LANE, cause PINNED:** shell.css:11-12 boots both tracks 0px → content
paints full-width → squeezed when panelDefaults land; :21 animates the squeeze. Remedy: resolved
modes into the grid pre-first-commit + suppress track transition during boot. QUEUE IT.
**QUIESCED @ `52116394` — EVERY LANE MERGED. PV IN (`1a53d5cc`: Traveler + address clause,
assembled-bytes proven; retracted its own stale combobox lesson post-FX). MIG IN (`52116394`:
pack-version-stamped migration, 3-handle fixture map + anti-drift oracle + mutation-proven
rename guard; crash-safe stamp-last). ENDGAME STATE: docs+doctrine COMMITTED · verify:push run 1 red on schema-baseline-parity →
ROOT-CAUSED + FIXED (baseline schema_version DEFAULT 5→6; B's v5→v6 lift skipped baseline regen
— the schema-version-bump=baseline-regen-trigger class, SECOND occurrence, lesson re-proven) ·
verify:push run 2: 11/12 — sole red = the capability-freshness CT losing 3/3 retries under
full-battery contention (passes isolated; thrice-A/B-proven load race) → **LANE FLK: MECHANISM NAMED + FIXED + LOAD-PROVEN (approved; READY report pending)** — the test
asserted a TRANSIENT: the connect-a-model note paints only in the in-flight window before the
scripted rejection settles (F-02 changed the settled arm); isolated catches the ~ms flash, load
misses it. Fix = barrier on the RENDERED FAILURE ARM (settled state) before the tick — also the
first-ever pin on F-02's arm; A/B 5-fail→10/10 under 40-busyloop×14-worker contention; zero
timeouts touched; two stale comments that GENERATED the flaky assertion corrected. LESSON
(flake class): a CT asserting an in-flight transient is a contention flake by construction —
barrier on settled states. **NEW FOLLOW-ON SMALL (FLK product observation, ruling=build it
later): CapabilityGate's no-error arm is UNREACHABLE as a settled state** (capability required |
error — undefined+null = PENDING), so every editor open FLASHES "connect a chat model" at users
who have one — the F-02 lying-empty-state class; fix = pending arm + delete-or-reach the note.
**OWNER 08-03 MORNING #2: AVATAR PACK v2 APPROVED ("pictures are okay") — no re-push of the 4
tiles needed. NEW BUG REPORT (owner live): after stack restart, NO character's background pulls
up when opening a chat with them.** TRIAGE NOTE for the investigating lane: FIRST discriminate
draft-vs-committed (SW's pinned lesson: chat-room-surface.tsx:98 gates resolveRoomTheme on
isCommitted — a DRAFT room shows the viewer theme BY DESIGN; owner asked which) · then whether
the dev user's cards actually carry backgroundOverride post-MIG (did migratePack fire? stamp vs
CARD_PACK_VERSION; cards possibly classed edited → untouched by design) · then the seeded-bg
resolve chain (listSeededBackgrounds slug → public/backgrounds/<handle>-bg.jpg served). **RULED (question tool, 08-03 #2):** BG bug = COMMITTED example chats (real defect — prime
suspect: bulk-imported demo chats never set the field resolveRoomTheme keys on) · Traveler KEPT
+ NEW BUG: seeded persona not set as PLAYING-AS (owner's was None) · --color-info: blue STAYS ·
zone vocab: BOTH stay (SETUP/POST=wire zones, Relative/In-Chat=placement; hint doc line).
**LANE BG DISPATCHED** (all four bugs + doc line). **BUG 1 ROOT-CAUSED + OWNER-RULED (08-03):**
demo payloads CORRECT, solos PAINT (receipts reports/snaps/demo-bg-*.png); the 3 GROUP demos are
excluded by the 07-18 true-solo takeover LAW — owner RULED: **widen the gate to single-human
(humanCount===1) both arms, cascade chat-set > card-carried, card-carried stays true-solo-only,
DC seeder sets curated chat backgrounds for the 3 group demos** (law text + predicate header
amend; two-human refusal stays the load-bearing pin; heal arm for existing rows). BG also found:
5 of 6 demo human seats read displayName "owner" vs Ashen Spire "Traveler" — two seeding paths
disagree (bug 3's thread). **BUG 5 (owner 08-03 #4, ride BG):** solo chat PAINTS the card
background but the CONTEXT PANEL's background row reads "None" — the panel echoes only the
CHAT-SET field, blind to the card-carried arm of the cascade; the row must show the EFFECTIVE
source with provenance ("<name> — from the character card"), same honesty grammar as the preset
readouts' provenance rows. The settings-echo and the paint must be ONE truth.
**+2 owner reports (08-03 #3, ridden onto BG):** (3) the Ashen Spire demo's rpg game lists
"owner" as the player — the generating fixture-user's identity was frozen into the seeded game
state instead of resolving to the RECEIVING user's persona (the game's player identity must
re-bind at seed, or render via the persona plane, not a frozen name); (4) the demo's rpg-lite
PANELS are near-empty — the snapshot DC replayed was sparse; the flagship demo exists to show
the panel at a glance and needs a RICHER final state (trackers/sheet/inventory/quests populated;
regenerate the Ashen Spire chat with fuller play or enrich via real hand-door ops).
**✅✅ PUSHED TO ORIGIN (08-03): `7c312220..851f625e`, 74 commits — FLK merged (`851f625e`),
verify:push run 3 = TRUE 12/12 PASS, push executed on the banked owner word.** The entire
overnight program is on origin: preset program complete+fix-all'd+re-verified · actor-state
R1-R4 · zod A-D + SSRF seal · shell fixes (focus flag, overlay sheets, registry defaults) ·
density S6 + registry split · THE CHARACTER PROGRAM (10 cards · v2 reference-school art ·
10 themes · 10 backgrounds · overrides · migration · 6 live demo chats) · Traveler persona ·
baseline parity fix · the flake killed structurally. Post-push remaining: strike pass · close-out D-entry · graduation verifier ·
F-14 CLS lane · TD design pass · CAP-GATE pending-arm small · FirstRunPersonaDialog small ·
scoped side-eye re-check on FX's 31. Then remaining: scoped side-eye re-check · strike pass ·
close-out D-entry · graduation verifier · F-14 CLS lane · TD design pass · smalls
(FirstRunPersonaDialog dead-trigger · schema-baseline-parity red · worldInfo... done in FX ·
D8 residue · O-4/O-5 chat-side... done in F). Was LIVE: MIG = reseed migration
(GENERAL 3-handle arm [assistant/jfc-coder/niko] + name/nickname-counts-as-edit + pack-version
int stamp; approved) ·
PV = DONE-PENDING-RECONCILE (branched pre-FX; FX removed the combobox role its CTs worked
around — merging main + re-gating now; commits 7902e0b7+01a36590: Traveler constant + main_prompt
clause, assembled-bytes red-first, drill-in geometry fits). NEW SMALL from PV:
**FirstRunPersonaDialog can never fire** — it triggers on zero-owned-personas but the seeder
creates one on first authed request; "onboarding" is effectively the seeder. Own lane. Was: no first-run flag exists BUT defaultPersonaSeeded
latch already gates structurally (seeded users untouched, fresh users get the constant), so
rename = one constant "You"→"Traveler"; framing = C1: append to DEFAULT_MARKER_TEMPLATES
.main_prompt ("Address {{user}} in the second person; use their name only when it is one they
have chosen for themselves") — F-03 precedent, per-section override IS the edit path, no new
slot (C2 rejected: breaks PROSE-1 byte-identity for a nit). NAME + WORDING still owner-vetoable. **QUEUED: Lane TD** (theme doors: character themes OUT of global picker · save-as-theme
promote door · save-override-WITHOUT-theme arm · + owner NEW musing 08-03: character-embedded
APPEARANCE SETTINGS generally — which appearance keys may a card carry vs viewer-sacred keys
[SW precedent: density/chatStyle deliberately NOT card-forced]; design pass needed before build).
**PUSH WORD BANKED (conditional): FX+AV2 merged → verify:push 12/12 → PUSH ORIGIN, no ask.**
THEN: scoped side-eye re-check on FX → crunch STRIKE PASS → close-out D-ENTRY (rewind asymmetry ·
promoted-unseated gap · D8 residue) → graduation verifier → docs/history. MERGE PROTOCOL LAWS
(3, paid-for): no defer of post-FF check · no chained teardown (merge→verify→teardown separate
calls) · `git -C <abs-main>` ALWAYS (cwd can die/sit in a worktree and lie). Remaining owner
items: --color-info hue · SETUP/POST vs In-Chat vocab · AV2 sheet verdict (4 slightly
harder-edged avatars, re-push offer ~$0.56; Calamity missing $4 sticker) · PV name/wording veto ·
JSON-card/absent-char/DRAFT-TRUST/AGENT-1/D22 (old queue).
**✅ GATE PROGRAM + LANE BG: ALL MERGED (08-03, main @ `2429fa18`, every merge --no-ff
hook-certified, all worktrees torn down, branches deleted):**
· **G2 (`b623bf25`)**: `cn` fixed AT ROOT — tailwind-variants keeps its twMerge config in
  MODULE-LEVEL MUTABLE STATE primed by the first `tv()` CALL (not createTV), so import-graph
  order silently decided merge behavior; now class-merge.ts owns ONE config + both seams, sealed
  by depcruise `ui-class-merge-seal` + biome noRestrictedImports (cn/cnMerge/tv banned from
  tailwind-variants). + near-duplicate colour lint in tokens:build (ε=0.008 Oklab ΔE — measured
  between the 0.005 drift class and the 0.010 deliberate Hearth ladder; BASE RAMP only, seed
  value-sets proven design not drift; secondary→{color.muted} collapsed, raster receipt one
  8-bit blue step; caught a 4th hand-copy in seed-themes.ts).
· **BG (`47562f44`)**: all 5 owner morning bugs live-proven on an isolated stage — takeover gate
  widened to `isSingleHumanRoom` (card arm stays true-solo; two-human refusal = red-first pin);
  bugs 2+3 were ONE root cause (seeder hardcoded `anchorPersonaId:null` — produced BOTH
  "Playing as None" AND the rpg "owner" name via resolveUserPublics fallback); Ashen Spire ships
  an authored opening state replayed through the REAL rpg hand doors (orbs/cast-NPC/quests/
  journal populated); background echo now reads the ONE cascade home `resolveCarriedBackground`
  with provenance copy; zone-vocab hint doc line. Existing installs: DEMO_CHAT_PACK_VERSION
  stamp + only-if-unset heal (unit-proven; LIVE heal fires on owner's next app touch post-merge
  — OBSERVE IT). Merge-side: 2-file biome format drift fixed in the staged merge (formatter
  scoped, diff inspected).
· **G1 (`2429fa18`)**: gate `no-hover-display-swap` LIVE (#159) — and the baseline was NOT
  terminal-zero: THREE live P0-oscillator instances found+migrated (persona-panel-row badge⇄
  cluster, list-row subtitleReveal one-cell grid stack, member-row CastInlineCluster → ROW_REVEAL
  + pointer-coarse:hidden; CTs re-keyed to visibility + byte-identical boundingBox). +
  `structure:db-baseline` stage at the COMMIT tier (13th stage, ~1.5s; ONE comparator two
  callers; drift probe refuses with the regen remedy named). Honest cost flagged: persona/member
  rows spend reveal-cluster width at rest (reserved boxes) — if side-eye wants it back, the
  answer is actionsFloat, never a display swap.
**QUEUED, design-pass-before-build (owner word):** (5) ct-oneshot arm flagging
first-assertion-after-mount on a state the story scripts away (FLK's transient class). Still
riding Lane TD: settings appearance partition `embeddable-by-card` column.
**DEAD-CODE SWEEP (08-03, orchestrator, all six packages × 3 lenses):** prodonly = ZERO dead
files everywhere; orphans 74 (+14 star-suppressed contracts candidates) — mostly z.infer/alias
type twins, 2 real clusters (world-info verbs ×10 = dead-wire-vs-dead-ended question; ui
handle.ts ×5 = unadopted imperative API); testonly 122 (ui 39 = sealed-lib surface question).
**SCOUTS DELIVERED (all 3) — SYNTHESIS:** (1) **zod-cruft theory REFUTED** — the one zod
commit touching contracts is pure respellings/additive, zero consumer removals; every orphan
predates it. (2) **`pnpm ast` LENS BUG FOUND (load-bearing):** liveness keys consumption on the
CONSUMED name but candidates on the DECLARED name → any rename-through-re-export barrel
(`export { createCreate as createCreateBook }`) reads as a false orphan — 15 server false
positives (10 world-info verbs ARE wired via service.ts; 5 portability verbs ARE wired via
entry/compose/portability.ts, a second composition root). **✅ LANE AST MERGED (`f4958491`, hook-certified, torn down):** liveness now keys on the
DECLARATION NODE (declFile+declStart — total identity; lane rejected name-based keying with a
probe: local renames fork names, the node never forks) across all THREE candidate consumers
(scanOrphans/scanTestOnly/cmdClientGap — the third was a bug site the brief missed); red-first
3 shapes (aliased barrel · namespace · star-chain) + a distinct-keys pin so a lazy file-only key
can't fake the fix. **TRUE ROT COUNTS (lane re-derived, post-fix): orphans kit 2 · contracts
30(+14sup) · db 0 · server 15 · client 7 · ui 6 — testonly kit 1 · contracts 30 · server 32 ·
client 18 · ui 39.** 16 false positives removed (all wired verbs). Lesson banked in
[[knip-ast-liveness-lens-gotchas]]. (3) Real dispositions: ui handle×5 +
all 39 ui testonly = R2 SEALED SURFACE by doc law (ui-package-design.md:362 mandates
createHandle exposure; CT-only = designed steady state — NO action) · client registry-context
×5 = ONE root cause (raw `.Context` export unused, wrapper is the live surface — single
un-export call, read createRegistryContext header first re: escape-hatch intent) · client store
clearX/readX = repo-wide test-reset-seam CONVENTION (formalize once, not per-file) · kit
SessionToken = branded type NEVER wired into the auth path (auth uses plain string —
wire-or-delete owner call) + OwnerStatId dead · server debugAuthMiddleware dead (shadowed by
registerDebugRoutes' own build) + *ServiceDeps ×5 dead convention scaffolding · contracts ~14
convention twins (Spine doc house style — tag-not-delete) + databank/memory pre-built + ~28
owner-questions. **✅ CLEAN MERGED (`de36d51a`, hook-certified, torn down):** `cfa2049f` 69 files — TAG 32 ·
DELETE 23 decls + 20 barrel rows + 2 whole files (connection/contract/views.ts,
discovery/contract/errors.ts) · WIRE 1 (EmitNotification — CLEAN corrected my over-count: only
automation-watcher was a re-spell; chat's is a DELIBERATELY WIDER two-arg NotificationsEmitOp,
wiring it would've been a defect) · TRUTH-REPAIR 2 · RENAME 12 test seams · FLAGGED 7 (in the
table). Lens re-run proof: contracts 30→24 · server 15→4 · client 7→0 · kit 2→2. Table + codemod
checked in (docs/reviews/misc/2026-08-03-export-rot-dispositions.md ·
scripts/codemods/export-rot-cleanup.ts, data-driven, re-runnable). **LOAD-BEARING PROBE FIND:
@public is NOT enforced by knip (exports maps already public-ize subpaths) — the LENS ratchet
must read the tag ITSELF (hard requirement, in its brief).** Doctrine lines LANDED (test-seam
self-identifying naming · dynamic-seam-ships-with-lens). NEW SMALL boarded: codemod-kit custom
Plans that under-declare touchedFiles go SILENTLY INVISIBLE in the preview (silent-error class —
kit should refuse or warn). Discovery errors question → already owner-ruled AUDIT-THEN-BUILD,
queue the lane.
**LENS MID-RUN FORKS RULED (08-03):** ARM 1 (registry-aware liveness) = NOT BUILT on census
receipts — every registry value on this tree is an inline literal or imported identifier, so the
import edge already carries liveness (client orphans = 0 where every registry lives); mechanism
proof + EXPIRY boundary condition ("breaks when a registry resolves members from constructed
strings — build the pass then") written into the lens header. ARM 4 rpg fork = rpg/guard.ts
SANCTIONED as rpg's ratified single chokepoint (rpg-design/05 §4.4); six verb re-spells
collapse onto one rpg-local assert (red-first, byte-identical error); gate's sanctioned-homes
config carries BOTH cited chokepoints; **QUEUED (architecture): unify rpg's chokepoint onto an
injected authority op (can/permitsHost through compose)** — the minted law reads
"one CITED chokepoint per authority domain," chat=can(), rpg=guard.ts pending unification.
**✅ MAC MERGED (`47b72704`, hook-certified, torn down) — macro three-home stack COLLAPSED:**
PROMPT_MACROS + PromptMacroDef DELETED (header truth-repaired to name kit as the one home);
autocomplete now DERIVES via queryMacros over the default registry (the better seam — composes
volatile per D51; a raw-table export would have minted a second surface); filter = EXCLUDE
lists (fail-open: tomorrow's macro auto-appears): LEAD_MACROS 8 (bare-{{ popover: char user
persona scenario description personality example input) + 48 name-sorted; excluded
ALIAS_SPELLINGS 8 + BLOCK_OR_LITERAL_FORMS 11. **OWNER TASTE FLAGS: `{{if}}` excluded (real
vocabulary but un-insertable in bare call form — fix would be a block-template suggestion, not
a filter change) — veto/confirm.** Rendered red-first receipts (getvar option appears, noop
absent; 19/19 + 90 sibling CTs). viewerIsHost now DERIVES from member-visibility
(viewerHoldsHost helper; cross-cite became an import; pin passes against OLD source =
byte-identical proof). ToolbarSeparator CT'd (self-stretch geometry proof).
**FOLLOW-UPS from MAC:** (1) user/game-macro UNION gap CONFIRMED not built — none of the 5
surfaces union live macros; wiring shape named (withUserMacros derivation, memo'd on array
identity; rpg needs BOTH planes w/ shadowing) — needs a derivation-home ruling then it's
trivial; queue. (2) proposed/world-state-clips-trackers-spec.md:267 still names the deleted
PROMPT_MACROS — one-line repair rides whoever next opens that parked set. (3) LENS BASELINE
RECONCILE AT MERGE: drop any PROMPT_MACROS ratchet row (source is gone — phantom otherwise).
Lesson banked ct-hub #27 (FABRICATION-OK line adjacency).
**✅ FIX MERGED (`321b562d`, hook-certified, torn down) — codemod-kit preview lies KILLED:**
MutationLedger baselines full project text pre-run (3ms/25.5M chars), diffs at every plan
boundary, REFUSES on undeclared mutation naming files + plan. Red-first proved the class was
worse than reported: `--apply` WROTE invisible files, and the kit's OWN moveFiles +
renameExportedSymbol under-declared fan-out (12 silently-rewritten files in the probe). Also
fixed: cwd-relative preview paths; `project.getSourceFile(path)` answering for MOVED-AWAY paths
(exact map from getSourceFiles now). 12/12 int tests. NEW SMALLS from FIX: (1) same
moved-path cache lie in moveFiles/deleteFiles/copyFile path VALIDATION (guard now converts
mis-resolution to loud refusal, but the asserts themselves deserve the map — own ticket) ·
(2) `pnpm codemod` script referenced by kit docs but ABSENT from package.json (docs-vs-scripts
drift — add script or repair docs) · (3) export-rot-cleanup's disposition table is STALE
post-apply (aborts loudly on re-run — correct behavior, note in table header that it's a
one-shot record). Lessons banked in [[knip-ast-liveness-lens-gotchas]].
**TAG-ROT + REGISTRY MAP (owner questions, 08-03, probed + scouted):** exemption-liveness
posture: biome suppressions SELF-CLEAN natively (suppressions/unused fires in check — probed
live); eslint-suppressions.json is EMPTY (nothing to rot; config line
reportUnusedDisableDirectives still worth adding — small); ~31 of ~77 exemption-carrying gates
have stale-entry arms (gold standards: bus-coverage STALE_MESSAGE · dialog-via-composite:99 ·
firehose keyed-name blindness guard) — **LENS ORDERED: every vocabulary it mints is TWO-SIDED
FROM BIRTH** (@public-on-consumed-export = red · baseline row w/o live orphan = red ratchet-down
· allowlist row matching zero sites = red); RETROFIT SWEEP boarded for the ~46 one-sided gates +
ast.ts @server-only/@test-fixture liveness. Law banked gate-hub #10. **REGISTRY MAP v1 landed:
docs/reviews/misc/2026-08-03-registry-map.md** (census + enforcement classes + candidates;
first-pass). Shortlist: BINDING_VIEWS→real table (S, rides D8 residue) · verify REGISTRY
completeness check (S) · TWO SEED CLAIMS CONTRADICTED needing re-scout (AssembleTrace looks like
ONE file multi-site not three producers; content-class wire may already be gate-enforced by
content-part-seam — verify what it checks). SECOND SCOUT PASS owed: rpg writable-field ·
bus-event +5 · SERVICE_KEYS · fresh switch-sweep.
**✅✅ LENS MERGED (`09822fe3`, hook-certified incl. its own new gates, torn down) — THE
ENFORCEMENT LAYER IS COMPLETE:** ARM 2 star-suppressed candidates now NAMED per-symbol (the 14
rpg-barrel hiddens visible) · ARM 3 `deps:orphan-ratchet` at push+full tier, TWO-SIDED from
birth (probe receipts ×4: new orphan red · bare-@public does NOT exempt [caught its own regex
bug — `*/` satisfied `\S`] · stale baseline row red ratchet-down · @public-on-consumed-export
red) — **with tags honored the WHOLE TREE collapses to 1 orphan** (addSpanEvent, owner-call
cited); ratchet's FIRST LIVE CATCH = its own PROMPT_MACROS row post-MAC-merge · ARM 4
`two-class-role-authority` gate live; SEVEN inline role compares collapsed (6 rpg verbs →
guard.ts::assertHostRole, byte-identical refusals pinned 15/15; chat fork gate → permitsHost);
SANCTIONED_HOMES two-sided (rpg's row goes stale-RED by itself when the can()-unification
lands) · ARM 5 `contract-derives-not-respells` live (name-collision + $inferSelect arms; scoped
on EVIDENCE not allowlist — 11 legitimate read-aggregates excluded by matching against real
sqliteTable exports; ONE real defect fixed: WorkloadScheduleRow was an 11-column hand-copy, now
derives) + `pnpm ast respell` as a manual-tier registry row (mutual-assignability; never
auto-runs — structural identity is evidence not proof). Timing: no measurable check delta.
ARM 1 census + expiry condition in the lens header. **NEW OWNER-JUDGMENT ROWS from respell:**
chat MemoryBackfillCounts ≡ contracts MemoryBackfillResult · search DigestsParams/SegmentsParams
≡ contracts MemoryQueryOptions — derive-or-cite calls. Lesson banked gate-hub #11 (real-tree
anchor for stale arms).
**═══ PROCEED-IN-FULL WAVE (owner word 08-03) — 4 DISPATCHED + STICKLER: ═══**
Lane STRIKE (mech) = crunch-list strike pass w/ per-row receipts · Lane DISC = discovery
failure-path audit-then-build (errors-as-data; close-with-receipts is a valid outcome) ·
Lane SM1 = smalls (3 respell derive-or-cite rows · verify-REGISTRY completeness confirm/build ·
eslint reportUnusedDisableDirectives · pnpm codemod script drift · export-rot table one-shot
header) · Scout RM2 = registry map gaps (candidates 3-5 · the 2 contradicted seeds ·
unclassified rows · fresh switch-sweep). **STICKLER DISPATCHED (owner mid-wave): ROLE/AUTHORITY
MODEL design review** — "role is messy and will get worse when we add agents"; unify rpg onto
can()? centralize all role stuff? Actor-state-review form: coherent-as-is w/ receipts OR
spec-grade staged reshape + owner forks; the two-class gate's SANCTIONED_HOMES = the derived
inventory; the AGENTS-future extensibility question (kind × role × context kernel) is the
driver; report → docs/reviews/stickler/2026-08-03-role-authority-model.md. **RM2 SCOUT DELIVERED — map doc UPDATED:** content-class debt REOPENED (v1 credited the WRONG
gate — content-part-seam guards the ChatContentPart SYMBOL; pipeline.ts:794 spanToWirePart
if/else does NOT read CONTENT_CLASS_POLICY — the table is ignored documentation; fix = dispatch
THROUGH the table + binding test) · NEW candidate: CharacterFacetId switched in BOTH
facet-editor:92 + facet-inspector:115 (Record-of-components collapse) · AssembleTrace DROPPED
(single-home confirmed; stale memory corrected) · SERVICE_KEYS = hardcoded array in
services.test.ts (7th check-invisible new-domain site) · rpg writable-field re-verified at 13
files on a real commit (memory's ~7 was an undercount — appended) · ALL GAP-3 rows enforced
(prose shards = deliberate double-direction Partial+composed-Record; TEMPLATE_DEFS = the
Exclude nonempty-type trick). Verify-REGISTRY = the one remaining suspected (d) (SM1 confirming).
NEW SMALLS from RM2: content-class table-dispatch fix · CharacterFacetId Record collapse.
**LANE OBS DISPATCHED (owner-ruled: wire addSpanEvent IN FULL):** intended use recovered from
Tier-2-Foundation.md + its docstring (point-in-time span annotation — cache hit, retry attempt;
sibling setSpanAttrs live at trpc ×2, the pair split at adoption). Wiring: model-catalog caches
hit/miss/refresh · effective-config cache · provider retry loops · engine wake/single-flight ·
judged degrade arms; only under ACTIVE spans (span-less valuable seams = findings, not blind
wires); landing PROVEN per event class via the trace ring; removes its own ratchet baseline row
(the last one — baseline goes EMPTY). OWNER FIX-DON'T-PARK GATE LAW landed in doctrine + hub
same hour (allowlists = permanent deliberate only, reason + stale-arm; out-of-scope violations =
SendMessage fork, never a silent row; retrofit sweep now applies it retroactively).
**ROLE/AUTHORITY STICKLER DELIVERED + ALL 3 FORKS OWNER-RULED (08-03):** VERDICT = COHERENT
CORE, reshape-LITE (kind≠role≠action cleanly split; agents future EXTENDS via reserved DDL
seams; the mess is SPELLING debt). Report: docs/reviews/stickler/2026-08-03-role-authority-model.md
(clause text §6 = the ceremony D-entry's awaited input). RULINGS: **F1 = PROJECTION CLASS**
(byte-selection verdicts home at viewerReadsHidden per D110; the read.ts:1127/1167 permitsHost
payload uses re-route onto the projection lens; listMessages inline compare collapses same
sweep) · **R0-R2 DISPATCH NOW** (R0 = clause + Spine-Identity-and-Auth truth-repair [claims
agent principals BUILT — purge escapee; §0.3 router sends every identity task there] — rides
the ceremony, orchestrator-side · R1 = rpg onto can() via RpgContext.can [automation's exact
pattern; Principal already in every rpg verb; gate row self-reds = the receipt] →
SECURITY-EXECUTOR on next drain · R2 = one-spelling sweep [hostUserIdOf ×~14 + F1 collapse] →
executor on next drain) · **ChatRoster kind widens AT THE SEAT WAVE** (R3 deferred; clause
names the seam + the agent-ceiling non-inheritance constraint F5). Stickler lessons banked:
same-day lanes landed CONTRADICTORY LAW on one boundary (SEC's #6 comments vs projection-class
comments — single-arbiter rule for same-boundary same-day lanes); purge waves must sweep the
spine docs their domains cite.
LIVE: DISC (typed discovery errors) · OBS (addSpanEvent full adoption) · SWAL (swallowed-exports
lens + respell alias fix). Behind drains, in order:
**CEREMONY** (strike DONE → close-out D-ENTRY minting rewind-asymmetry + promoted-unseated +
D8-residue pointers + the §6 two-class clause + R0's truth-repair → graduation verifier →
docs/history) → R1 (security-executor) + R2 (executor) → SEC3 cookie-parser · MACU user-macro
union + {{if}} block template · preset-polish small (O-2 chip · item-14 macro pill — lane-C
CLAIM/CODE MISMATCH: commit message claimed the fix, diff never touched macro-text.tsx ·
re-check) · content-class table-dispatch + CharacterFacetId Record smalls · F-14 CLS · CAP-GATE
+ FirstRunPersonaDialog + SSE labels + ct:140 smalls · TD design pass · one-sided-gate retrofit
sweep · side-eye re-check on FX's 31 · D8 residue (+BINDING_VIEWS table). relations.ts KEPT
(owner-ruled): header now names the nested-tree consumer class (databank trees, export bundles)
vs the explicit-join dialect for flat/aggregate — dialect split by read SHAPE, cited.
**DB-OPS CONSISTENCY AUDIT DELIVERED (scout, 08-03):** reads consistent · raw-sql exactly where
sanctioned · not-found one idiom (throw, 4/23 sampled) · db.batch-over-transaction defensible
for libsql but UNDOCUMENTED as intentional (only 2 db.transaction sites, both import paths) ·
upsert spelling split 17/14 with no stated rule · ~~clock leaks~~ **RETRACTED (orchestrator
re-verified): all 11 "Date.now" grep hits are COMMENTS documenting observance of the law —
the `no-raw-clock` gate is active (AST-parsed, ignores comments; sane exemptions kit/time +
entry/ + tests) and the tree has ZERO real clock leaks. Instrument error: scout grepped raw
text; the grep-vs-AST class (ast.ts's own header warns it). Clock-leak small DROPPED.**
**DB BOUNDARY RESOLVED (scout delivered → orchestrator ruled on owner delegation):** the strict
law was ASPIRATIONAL-FROM-BIRTH (sentence written 07-03; verbs imported tables since 06-27; doc
self-contradicts within 5 lines via its own sanctioned patterns). Real convention: persistence/
= curated READ helpers + ownership checks · verbs write their OWN tables · bulk-serializer
domains direct by design · shared junctions one seam. RULING: gate-the-rule beats make-truth-real
(enforce-strict = ceremony not properties — discovery's ad-hoc SQL forced into "reusable"
helpers nobody reuses is the *ServiceDeps disease at scale; the real property [own-tables-only +
cross-domain via injected ops] is what practice honors and a gate holds cheaply; write-door
builds consumer-driven IF an outbox/audit need ever lands). **LANE BOUND LIVE**: Tier-1-DB
amend + `own-tables-only` gate (table→domain map DERIVED from schema files; reasoned two-sided
exemptions; fix-don't-park on real leaks) + 4-file batchMany barrel-path nit.
**✅ OBS MERGED (`93e40fb1`)**: addSpanEvent wired across cache/retry/wake with trace-ring
landing proofs (cold/warm/coalesced/failed arms; retry+abandoned; wake 5-state); ratchet
baseline now EMPTY {}; cpu-fallback wire correctly REVERTED (couldn't prove landing — the law
holding); 3 SPAN-LESS FINDINGS boarded: fireRpgTurnCompleted runs outside any live span (post-
commit rpg round invisible — fix = withRequestSpan at dispatch) · structured-turn retry
unobservable by construction (server/kit below foundation; needs injected onRetry; callers are
discovery) · providerDurationMs total permanently 0 (no provider.* span ever opened).
**TRPC LEVERAGE AUDIT (orchestrator census, 08-03, v11.18.0): FLUENT** — SSE ping/inactivity
config verified vs 11.18 · tracked() envelopes · 2 subscription sites GATE-HELD
(single-stream-transport) · splitLink→httpSubscriptionLink/httpBatchLink+CSRF · errorFormatter
rides domain reason codes · span-per-proc middleware. Correctly absent w/ stated reasons:
.output (double-validate) · transformer (raw-JSON law) · wsLink (SSE is the design). **ONE
candidate boarded: httpBatchStreamLink probe** (stable v11; batched responses stream
per-resolution — free latency on mixed-speed batches; one-line swap + Hono-adapter probe).
**ZOD BACKSLIDE GATE (owner-asked): Lane ZG QUEUED behind BOUND** (gates territory collision) —
scan the retired spellings: .strict() legacy · union-of-literals vs z.literal([...]) ·
issues[0] hand-flattening outside sanctioned model-facing joins · hand-rolled env booleans vs
pinned stringbool · .transform() on tool/extraction schemas; fix-don't-park, two-sided.
**DB-TIER AUDITS COMPLETE (drizzle + libsql scouts, 08-03) + OWNER RULINGS:** drizzle FLUENT
(127 FKs 100% onDelete-verified · 50+ CHECKs · casing deliberately-unset-with-comment); REAL
FIND = unindexed FK columns (plain B-TREE on fk cols — SQLite doesn't auto-index; chat.ts
sample: a dozen incl. messages.userId/characterId; **owner confirmed: NOT ANN — shadow ANN
stays fundamentally rejected, and the audit verified that rejection is documented in code**).
libsql FLUENT — native F32_BLOB vectors + SQL-side vector_distance_cos ALREADY adopted, ANN
correctly-absent-with-trigger; interactive tx BANNED with documented reason; 6 pragmas
read-back-verified. REAL FIND = busy-timeout dual mechanism (boot PRAGMA vs per-connection
Config.timeout — unverified persistence across logical connections; load-bearing).
**OWNER: "do all recommended + build migration-readiness NOW"** (don't wait for the need —
mid-migration is the worst time to discover the tooling gap): **Lane DRV LIVE** (busy-timeout
probe+belt w/ answer written at the pragma block · batchMany explicit "write" mode ·
httpBatchStreamLink probe-first) · **Lane DBG queued behind BOUND** (FK-index sweep+fix+gate ·
onDelete gate [pure prevention] · PK gate · drizzle-kit check as a standing stage ·
post-baseline migration workflow documented in Tier-1-DB) · Lane ZG queued (zod backslide).
**TYPO forks ruled:** arms-split deviation APPROVED (unread vocabulary = the rot class itself;
reference-position dominates import form) · chain-dead DECLINED-correctly → **Lane CHAIN
queued** with the substrate blocker verbatim (buildLiveness attributes at FILE granularity;
declaration-granular edges = substrate change under the live push-tier ratchet — isolated lane,
own red-first). TYPO audit incoming: 38 type-only-alive candidates / 30 files.
**✅ BOUND MERGED (`1c3c7995`)**: Tier-1-DB law amended ("the line is OWNERSHIP, not slot"; 4
sanctioned patterns; supersession note); `own-tables-only` gate live (TOTAL derived map — an
unmapped schema file reds AT THE MAP; foreign WRITES red unconditionally, proven by the
export-domain probe; 2 real leaks FIXED into persistence/, zero exempted); 7-file barrel-kit
repoint. Follow-ups boarded: barrel root-fix final sweep (~8 src + ~19 tests → drop export*) ·
batchLinkAvatars cross-domain-write fork · lesson banked (file-home ≠ producer).
**✅ TYPO MERGED (`13566512`)**: typeonly-alive lens live (COMPLETE reference-position arm;
mutation-proofed 6/6; the heritage-extends isTypeNode trap special-cased + banked). **AUDIT: 38
type-only-alive candidates / 30 files** — CLASS B (5): zod schemas built ONLY for z.infer
(validators that never parse; fork per row: plain type vs wire as tRPC .output) · CLASS A (33):
as-const tuples never iterated (6 doc/self-cited conformance seams; 27 conventional).
DISPOSITION PASS queued (rides the ceremony window). Bonus finds: ENGINE_LIFECYCLE_STATUSES
union re-derived ×2 (new facet-class instance, boarded) · authority tuples flagged
security-routing if dispositioned. **LANES DBG + ZG DISPATCHED** (db gate wave + migration
readiness · zod backslide gate + THE MAIN RED fix [check-gates fixture rows for the 2
faa6adb2 gates] + the 14 biome stragglers incl. 2 stale suppressions). **DRV mid-run:** ITEM-2
premise FALSIFIED source-pinned (drizzle 0.45.2 batch has NO mode param — deferred is the only
emittable mode, not a choice; raw-client bypass = wrong arm, forfeits typed BatchResponse/PD-24
seam) → approved: the answer lands in batch.ts's header, no code change. **BIOME COUNT
(owner-asked): 11 warnings + 3 infos / 4313 files** (error tier = 0) — all 14 in ZG.
**═══ SIX-LANE WAVE (owner: cap→6 + fresh weekly budget + host processes freed) ═══**
LIVE BUILD (6): DBG (fk-indexes×37 + 3 schema gates + drizzle-kit check + migration doc +
barrel root-fix + avatar-write ROUTE) · ZG (zod backslide + main-red fixtures + 14 biome) ·
LIV (columns lens + monotonic-tests STRENGTHEN-IN-PLACE [premise-corrected: skip gate EXISTED;
tree has ONE reasoned skip — my "~6" was a battery-summary/runtime-skipIf instrument error] +
regkeys informational) · TAGF (content floor) · R1 (rpg→can(), security) · SEC3 (cookie parser,
security). ✅ DRV MERGED (`bf86e641`): busy-timeout HOLE proven+fixed (client.transaction()
replaces the native connection un-PRAGMA'd; busy_timeout was 0 post-tx; Config.timeout belt,
red-first; FK-enforcement survives via libsql native default) · batch-mode premise falsified
(drizzle emits no mode — header truth) · httpBatchStreamLink CLOSED w/ 2 source-pinned blockers
written at the site. Lessons banked ([[sqlite3-wal-danger-on-live-db]]).
READ-ONLY LIVE (3): gate-corpus modernization scorecard scout (162 gates/24.5k lines vs the
8-axis modern checklist; retrofit plan by-axis; end-state = the checklist becomes a META-gate) ·
**REGEX MODEL stickler** (owner direction: WI/tag shape — first-class + attach-by-reference;
established: D53 unions 3 embed-by-value carriers at RESOLUTION but authoring has no
references/picking [can't pick a card's script in preset]; review maps ALL regex planes
[script-library vs regex-AS-SYNTAX vs CEL/macro engine family], the lift-on-import/re-embed-on-
export WI precedent, engine-family fork, R-staged program) · (role stickler done earlier).
QUEUED next drains (priority order): **GDOC** (gate-authoring law doc IN-REPO [my memory hub
migrates in — the amnesiac-transfer fix] + contract.ts ExemptionRow type w/ MANDATORY why
[verified: no shared type exists — reasons are 162 local conventions] + pnpm gate:new scaffold +
the meta-gate) → **RETRO** (~57 one-sided gates [40-join priority; 10/10 sample real] + 22
unverified guard shapes + 16 complex scanRoots hand-read + the ONE broken §-citation
[UI-Gates §12.6 phantom, cited 3×]) → R2 · MACU · CHAIN · BRAND · content-class dispatch ·
facet Record · preset-polish · TYPO dispositions · span-coverage smalls · ceremony (D-entry
awaits R1). **CLIENT-ARCH STICKLER LIVE (owner's 3 worries):** feature-layout law gaps ·
THE CHANNEL MAP (zustand/tRPC-cache/registries/#lib/bus/nav — when-to-use-which decision table,
the written law that doesn't exist; wrong-channel audit) · MOVABILITY (SET-SEAMS portability =
the model; welded-vs-portable surface census; pivot-cost scoring; portability laws/gates).
**MERGE WAVE 2 SEALED:** ✅ ZG (`ef906b68` — zod gate live, ARM C caught a LIVE pathless
refusal in plugin manifest; main-red fixture rows landed; 14 biome stragglers → tree-wide
info-level ZERO; unsafe-autofix lesson) · ✅ SEC3 (`d3069801` — ONE cookie reader, 12-case
parity suite incl. duplicate-header first-wins; killed a 4th hardcoded cookie-name drift
surface; flagged: read-decodes/write-raw asymmetry [unreachable today] + app.ts missing from
Spine §3's cookie-sites list) · ✅ R1 (`c466477e` — rpg kernel-unified; SANCTIONED_HOMES down
to ONE row; self-red ratchet receipt worked exactly as designed; merge conflict on the gates
doc row resolved as union) · ✅ TAGF (`70f45c30` — content floor both arms; summarizer
never-called proof; skipped-count gained a REAL reader [progress line]; toast at pixels;
CtAppDataProviders minted [memory-worthy: plain CtDataProviders has no errorToast channel];
story-module notify-binding lesson).
**REGEX STICKLER DELIVERED (docs/reviews/stickler/2026-08-03-regex-model.md):** headline — the
reshape is ALREADY RULED LAW never built (Core-0 §6:207 rules regex = library + scope junctions,
"the world-info pattern, regex reuses it"); R0 = D-entry amending D53's STORAGE clause only.
SIX confirmed defects: F1 P1 dead DISPLAY tier (zero writers) · F2 P1 WORLD_INFO leg runs
preset-only, missing the union (2-line fix, recommend PRE-program) · F3 card-editor scripts
born placement:[] unfireable · F4 SLASH_COMMAND phantom placement · F5 minDepth/maxDepth stored
never executed · F6 readout order contradicts execution. Engine family: kit-level composition
EXISTS, must NOT merge further (3 different safety envelopes); share the junction PATTERN + one
inter-engine ORDER home only. 8 owner forks (O-1..O-8, all w/ recs) + R0-R6 (~2wk laned).
LESSON banked: check Core-0 §6 partitioning table BEFORE treating a reshape question as new —
it and the D-ledger drifted apart. **PORT STICKLER DISPATCHED** (owner's CRUD/import-export
scatter question): full lifecycle census per entity family [the missing-import gap map] ·
is entry/compose/portability.ts the half-remembered seam · PortableEnvelope deletion
archaeology [the never-built unified envelope?] · serde-vs-verbs-vs-portability layer answer ·
the LIFECYCLE REGISTRY proposal (exhaustive-by-type doors — a family missing import = red).
**✅ DBG MERGED (`07da68ac`; 2-file format drift fixed in the staged merge):** 37 FK B-tree
indexes (sweep found 3× the audit's sample: 21 cascade · 14 set-null · 2 restrict; 8 were
non-leading-composite-covered incl. chat_participants.userId = FULL SCAN on "list my chats";
per-table judgment applied — chat_stream_events stands w/ receipts; ZERO exemption rows AND no
exemption map [an empty allowlist = untestable branch]) + fk-ondelete-stated +
table-explicit-primary-key gates (both minted at zero violations, pure prevention; shared
schema-read.ts substrate) + `structure:drizzle-kit` standing stage (NAMING RATIFIED — my
"quality/" spelling was wrong, structure is its group; probe proved it bites on a forked
snapshot chain; `--dialect sqlite` SPACE-form misparses into AWS Data API — use `--config=`) +
Tier-1-DB migration-lifecycle section (two regimes; the TWO-SWITCH launch-day flip warning;
+DRV's pragma-hole rider as §Esoteric 6) + barrel root-fix COMPLETE (47 files → @orb/db/kit,
`export * from "./kit"` DROPPED — wrong path no longer compiles) + avatar write ROUTED
(character owns the seam; AssetsContext.linkCharacterAvatars REQUIRED not optional — absent op
would silently no-op while reporting linked:n). Lessons banked.
**⚠⚠ DEV DB DROPS ON NEXT STACK BOOT** (baseline regen → boot detects hash change → backup +
DROP + re-migrate, logged "BASELINE REGENERATED… RESETTING") — owner's dev games/chats reseed
via the latch+heal; DO NOT be surprised. **REGIME-2 LANDMINE ticket boarded:**
structure:db-baseline is regime-1-SHAPED (generates from {} vs 0000 alone) — MUST re-point at
the applied chain on launch day or it reds every legitimate incremental (documented in the doc,
not fixed). Gate count now 166 (Core-Enforcement line = the concurrent-lane collision point).
**FULL-READ DELTAS (owner-ordered sweep of both stickler reports — items the summaries
dropped, now boarded):**
· REGEX report §1b: **ST `use_regex` WI-entry flag is INERT** — imported regex-keyed lorebook
entries silently degrade to LITERAL matching (kit/world-info escapes keys; no matcher reads the
flag) → WI parity-ledger item, NOT part of the regex reshape. · **Presets have NO export verb
at all** (domain/export = character+chat only; PromptConfig.regexScripts has no portability
wire; ST profile import carries no global-regex mapping) → feeds the PORT census as a known
missing-door row. · The inter-engine ORDER table exists ONLY in the report §1c — R0 mints it
into the D-entry + pin tests (SEND pin exists at context.int:215; RECEIVE + WI twins owed).
· REGEX F2 pre-program small QUEUED NOW (context.ts:771 → the union, 2 lines + pin; users
silently losing configured behavior today) + F6 readout-order one-liner rides it. 8 forks
stand default-approved (owner veto window open).
· CLIENT report: F-2 home-vs-D62-P6 unamended ledger = CEREMONY RIDER (urgent — the ledger
currently outlaws the built 8th section) · F-1 README/depcruise-comment teach SUPERSEDED law
(doc lane) · F-3 comp-tier dir modules UNWALLED (one depcruise rule + §3/§7 sentence) · F-4
client-structure doesn't RECURSE buckets (surfaces/nested escapes naming+purity rules; nesting
legality unlegislated) · F-5 lockdown type sketches drifted 6 axes (§15 reconciliation) · F-6
the §12 channel matrix misses half the live channels — the 11-row refreshed decision table IS
DRAFTED in the report §Q2, land it into §12 · F-7 seven judgment-call slots (feed the feature
scaffold + README rewrite) · F-8 the MULTI-OWNER SECTION PRIMITIVE gap = the config-rail
prerequisite (collection-contribution design set + contributions-BUNDLE arity gate [make*Section
capped at 1 registry-typed positional param] + the SECTION_IDS coupled-site playbook ¶) ·
suppressions red the stickler saw = MID-WAVE STALE (ZG's baseline regen landed; DBG's
post-merge floor + every hook since = clean) · unconfirmed rows: home mobile fate ·
agent-seed verb parity (dev-only) · chat/components at 72 files nearing F-4 practical relevance.
**PORT STICKLER DELIVERED (docs/reviews/stickler/2026-08-03-lifecycle-portability-model.md) —
THE OWNER'S QUESTION ANSWERED:** the "DI seam skimmer" IS REAL AND COMPLETE for the bundle
plane — entry/compose/portability.ts::buildPortabilityRegistry, master spec
docs/architecture/history/export-import-portability.md (07-11), 5-part template, 10 kinds,
entity-agnostic zip/staged-archive core, round-trip-pinned. The doubt is CORRECT for the three
planes it never covered (post-spec families · single-entity doors · client chrome) — nothing
enforces completeness on any = the "agents say xyz missing import" mechanism. "We rewrite per
domain" = TRUE at the serde-file tier (orb-JSON skeleton hand-cloned ×4, drifted policies),
FALSE at delivery (written once). PortableEnvelope = the never-consumed R8 envelope (each serde
re-spelled it; deleted correctly; the non-uniformity it evidences is the live defect).
FINDINGS: **F1 P1 DATABANK ABSENT from PORTABLE_KINDS entirely** — a full-account backup
silently loses the whole databank library (born after the spec froze; no gate could notice) ·
F2 world-info single-book import/export = verbs BUILT, ZERO doors (no route/proc/chrome — the
dead-wire archetype) · F3 persona chrome violates the ruled band/kebab anatomy (predates the
ruling, never re-swept) · F4 envelope drift ×3 (wi spells `version`; persona has NO envelope;
compliant serdes never GATE on schemaVersion) · F5 restore-policy drift (skip vs merge vs
case-insensitive — per-family winners) · F6 serde skeleton clones (the CPD pairs + decodeJson
×4) · F7 parse-strictness drift (one bad wi entry nulls the FILE; others drop the row) · F8
compose descriptor bodies carry real import logic vs the template's owning-domain law · F9
post-spec chat-anchored planes unportable by construction (rpg campaigns · injections · room
overrides · re-links) + automation_rules/global_variables/plugins have no arm — DESIGN fork.
PROPOSAL: the LIFECYCLE REGISTRY — (a) completeness gate deriving owned-canon families from
schema, each PORTABLE or cited NON_PORTABLE (self-cleaning) → a new domain registering nothing
REDS AT BIRTH · (b) exhaustive-by-kind door table + "every single door = thin arm over the
bundle descriptor" ratified (twice-proven law) · (c) ONE defineJsonSerde kit spine for orb-JSON
families (card/chat/preset/assets stay bespoke; accept-old-forever/emit-new — portable files
are external artifacts NO-LEGACY doesn't govern) · (d) chrome anatomy MINTED as a D-entry
(currently workboard-only — ANOTHER ceremony rider) · (e) descriptor bodies shrink to wiring.
R0-R6 + 8 owner forks in the report — incl. HOMES for both parked queue items: JSON-card
export = `?format=png|json` on the existing character door · absent-character transcript =
"import as characterless chat" arm recommended. LESSONS: the chars+chats lifecycle audit
tables were LANE-EPHEMERA never durably committed (this report §1 is now the standing census);
**the regex program's R2/R4 MUST register a `regex` portable kind or it becomes the next F1**
(cross-linked into the regex program's brief-to-be).
**✅ LIV MERGED (`92e4a318`) — THE LIVENESS PROGRAM IS COMPLETE:** columns lens (685 cols/76
tables: **0 NEITHER — no pure schema rot**; 25 write-only = 2 real [raw_request/raw_response
blobs · chat_locks.acquired_at] + 20 timestamp stamps + variants; 90→25 after the mapped-type
arm — drizzle $inferSelect rows have ZERO declarations, lesson banked) · monotonic-tests third
tooth (allow-skip reason-required + two-sided) · regkeys informational (145 registries/1380
rows/239 flagged; TOKENS/computed-key noise proves why it never gates; CHAT_SURFACE_AUTHORITY 5
rows = the one signal). check-gates red confirmed resolved by ZG's fix at LIV's merge-forward.
**OWNER RULED (4):** REGEX all-8 recommended (incl. backrest-manual live-data — his scripts
re-enter by hand) · PORTABILITY all-8 (incl. F9 orb-native chat-bundle arm ALONGSIDE jsonl;
databank F1 at R1 priority) · **raw blobs = BUILD THE READER** (the write becomes a feature) ·
TYPO class-B = demote to plain types (responseFormatSchema keeps its seam). MINOR DEFAULTS
TAKEN (proceed-in-full): card.ts:165 → prettifyError (same ruled class) · cookie
read/write asymmetry = cite-and-close (unreachable by construction) · acquired_at = cite
diagnostic · TYPO class-A 27 tuples stay untagged manual-lens candidates · F-8
collection-contribution design set queued AFTER this wave.
**═══ WAVE 3 DISPATCHED (6 lanes, at cap): ═══** GDOC (gate law doc + ExemptionRow type +
pnpm gate:new scaffold + gate-modernization meta-gate w/ derived baseline handed to RETRO;
the orchestrator-memory hub lessons MIGRATE INTO the repo doc) · RETRO (~57 two-sided
retrofits [40-join priority] + 22 guard shapes + 16 complex scanRoots + the §12.6 citation
fix ×3) · R2 (hostUserIdOf ×~14 + the F1 three-spellings collapse onto the projection lens
per ruling; byte-identical pins) · MACU (withUserMacros union at the ruled #lib home + rpg
both-planes shadowing + the {{if}} block-template insertion) · SM2 (REGEX-F2 union fix + pin ·
F6 readout order · card.ts prettify · TYPO-B demotion ×4 · Spine §3 app.ts row · cookie
asymmetry cite · acquired_at cite) · RAWVIEW (security-executor: the per-variant wire
inspector — host-gated, member-visibility/hidden-span/credential-scrub laws called out;
writer census first; PROBED tenancy classification; honest not-captured empty states).
**R2 MERQUEUE:** landed both arms + found the report's lists stale-by-two (15 lookup sites [roster-host.ts hostSeatOf/hostUserIdOf, belt kept w/ seat-wave rationale] + 4 projection collapses incl. a missed replayStreamEvents site); taking F6 clamp rider in the warm lane; the THREE-QUESTIONS lesson (act?/read-hidden?/which-seat? — three cross-citing homes) goes into the permissions page verbatim. **PRINCIPAL-FLOW scout LIVE** (76-table scoping-model census [one census, two consumers: the gate + the permissions page] · read-path spelling counts · injected-op caller audit · gate-arm spec w/ red counts) → one M gate lane after. **HANDOFF × CARD-OWNERSHIP stickler LIVE** (owner catch: the built two-party handoff transfers the ROOM but seated cards are the old host's PROPERTY — core question: whose authority resolves cast cards post-swap, cross-tenant-or-breaks; sad paths edit/delete/leave/account-delete/export/fork/rpg-mid-handoff; arms copy-on-handoff / room-scoped license / seat-freeze / refuse; precedents demo-seeder-copy · synthetic mint · promote-actor · characterless import).
**WAVE-3 SEALS:** ✅ R2 (`7a0e8c08`+`c3edc452` — 15 lookup + 4 projection + 2 clamp sites; the
THREE-QUESTIONS taxonomy COMPLETE [act?/read-hidden?/which-seat? — 3 cross-citing homes; final
census: 6 remaining role==="host" sites all class-homes or declared exemptions]; the verbatim
paragraph for the permissions page is in R2's final report) · ✅ SM2 (`42dc7ebb` — REGEX-F2
union fix w/ vacuous-watchdog-test re-route · F6 swap [residual: REASONING prints slot 4 vs
executes post-postProcess — unobservable, owner-call for strict fidelity] · card.ts prettify ·
TYPO-B ×4 demoted [lens receipt clean; responseFormatSchema still self-nominates — needs its
@typeonly-ok marker, one-liner queued] · Spine §3 row · cookie-asymmetry cite [brand-keeps-it-
true noted] · @column-ok on acquired_at [lesson: the columns lens HAS two-sided markers]) ·
✅ MACU (`95f4c00b` — withUserMacros on all 5 surfaces w/ per-surface red-first CTs · rpg
shadow-precedence proven · {{if}}+5 block macros via MacroSuggestion.insertTemplate w/ $0
[ui seal additive; byte-identity pinned; insertTemplate in storeFields — searched picks would
have silently downgraded] · exclusions 11→5 each reasoned · PROMPT_MACRO_SUGGESTIONS now
module-private. FOLLOW-UP boarded: other MacroTextarea consumers [persona editor, imagery
templates, prose settings, character facets] pass own catalogs — do any want the user plane?).
**PRINCIPAL CENSUS DELIVERED:** class-(a) enforcement ALREADY GATED (ownerid-registry,
both-ways!) — the census adds: 76-table class map (a×22/b/c/d/e receipted) · read-paths:
fetchOwned ×6 + hand-rolled ×58-files (legit — list reads have no helper) + 3 justified
unfiltered ids + the loadWorkload POST-FETCH-FILTER arm (a distinct legal class the gate must
recognize) · op audit ~15/28 domains: all sampled SAFE except ReapAssetsOp (no caller param —
compose-closure safety UNRESOLVED, verify before ruling) + CopyCharacterBooks (likely-safe
unverified). GATE SPEC: 3 mechanical arms (class-declaration extension [0 red] ·
fetchOwned-or-justification [3 exemption rows] · caller-param-on-op-signatures [full 28-domain
sweep needed]) + the HONEST LIMIT: membership-rung completeness is behavioral-only (control-
flow-dependent — the cross-tenant sweep stays that proof). → Lane PRIN queued (S/M).
**HANDOFF: owner ruled OPT-IN POINT-IN-TIME COPY then ADDENDUM (simplicity weighs heavily,
defers to stickler)** — both relayed mid-review; stickler licensed to recommend the simplest
non-betraying arm incl. transfer-as-fork (copy problem = the already-solved fork problem).
**HANDOFF REVIEW DELIVERED + RULED (docs/reviews/stickler/2026-08-03-handoff-card-ownership.md):**
the owner's question answered — the new host does NOT get the cards and that's D64 LAW (seats
drop in the atomic swap batch, nominee-scoped resolution, no cross-tenant read; test-pinned).
Transfer-as-fork = FALSE ECONOMY (fork drops foreign seats identically — copies the room never
the cards). TWO LIVE DEFECTS found in the current arm → **Lane HEAL dispatched** (F1 foreign
gmPresetId survives the swap = silent GM-voice change + lying knob [fork-game guards exactly
this]; F2 anchor persona dies silently = {{user}} POV drift + the setChatAnchorPersona
verb/resolver mismatch [verb permits any present human's persona, resolver reads host-only];
both heals ride the atomic swap batch; U2 if one-line). **OWNER RULED: heals now; the MINIMIZED
COPY ARM is an APPROVED PROGRAM for a near wave** — one class-level toggle at nominate
("also give copies of your characters & worldbooks used in this room"), pendingHandoffOffer
column beside pendingHostUserId, COPY-AT-ACCEPT (acceptance freezes the point-in-time),
copy set = seated cards (duplicate+promote-actor mint precedents, provenance-stamped for
idempotent re-accept) + their character books AS COPIES (reference-carry silently kills lore —
owner-filtered pool) + host-owned chat books + optional GM preset; seats re-point IN PLACE;
messages.characterId + digest speakers re-stamp; rpg = rekeyActor only (chat id unchanged);
variants transfer by construction; decline = the built D64 drop. ~90% machinery exists.
F3 (cards-drop vs books-license asymmetry) reconciles via the copy arm. Verified: declining
strands NOTHING host-authored (room state is the room's, in code, today).
STANDING OWNER QUEUE unchanged: PV wording veto · AV2 re-push offer ~$0.56 + Calamity $4 ·
DRAFT-TRUST · AGENT-1 · D22 (multi-user stack). CEREMONY (now 6 riders) runs after this wave.
**CEREMONY R0 SCOPE GROWN (owner nit, 08-03 — agents re-flag by-design visibility):**
Spine-Identity-and-Auth's truth-repair becomes THE PERMISSIONS-MODEL page: (1) the THREE
LAYERS one-page (app user/admin/owner via GlobalAction · room host/member via membership+can()
on OWNERLESS chats [host=role not ownership, D18] · visibility DEFAULT-VISIBLE with
host-OPTIONED limits [D16 floor · hidden spans · member-strip — options, never defaults]; the
philosophy sentence: "a room is a shared document; members see it; the host may limit") ·
(2) who-owns-what table (cite BOUND's derived gate map, don't duplicate) · (3) the BY-DESIGN
do-not-re-flag REGISTER (member-sees-admitted-history IS the point · empty anchor slots ·
adopt-only engines · accrete as reviews re-flag) · (4) agent-def line after the doc lands: a
visibility finding must name WHICH host option/floor is bypassed (the real-leak test — what
made cold-scrubber + fork-laundering real and "member sees history" noise). RPG-VARIANT
RELATION: scout verdict CLEAN with receipts (variantId=identity, messageId=cascade
convenience documented · swipe-flip = zero-write derive-don't-stamp, pinned · fork = real
re-keying pass, evidence FOR the F9 export arm · variableDelta vs rpg state = distinct planes
documented) — owner unease answered: surface complexity, not flaw; closed.
GATE-CORPUS VERIFICATION P2 DONE: ~57 real one-sided · ZERO dead scanRoots (mechanical set) ·
why NOT type-enforced (→GDOC) · 1 broken §-cite / 112 · anchor-file guards = valid alternate
shape (meta-gate must accept).
**LIVENESS TAXONOMY CLOSED (owner-asked "any more ways?"):** 9 classes instrumented; 4
residuals ruled — (1) **DEAD DB COLUMNS lens boarded** (column-grain read/write/neither
classification; completes the db lock; the RV-11/inventory-fields class mechanized) · (2)
**SKIP-ROT lint boarded** (every .skip/.todo carries reason + un-skip condition, stale-armed;
6 live skips; knip-blind because test files are entries) · (3) registry-key-never-dispatched =
review-lens note only (key-flow analysis, weak ROI) · (4) unreachable state arms = stays
judgment + empty-states doctrine (halting-adjacent; the 2 known instances already boarded) ·
dynamic-swallow twin already armed w/ documented trigger.
**BRAND GATE boarded (owner-asked design)**: plain `string` in a name-position whose brand
EXISTS in kit/ids (chatId: string reds because ChatId is minted) — positions DERIVED from the
id vocabulary, zero hardcoded paths; foreign-wire ids = reasoned markers; the SessionToken class
generalized.
**CPD REPORT (owner-asked): 1.15% dup (269 clones) = HEALTHY**; concentrations mostly by-design
(seed data · D71 value-sets · parallel embedding schemas); 3 opportunistic rows boarded
(invites verb+persistence pair · embed-store-reads per-store shapes · rebuild-from-canon) —
consolidate when next IN the file, no dedicated lane (DRY-not-gospel).
**✅ DISC MERGED (`2f1ba51b`)**: 24 paths already-honest (receipted) · 0 generic · 3 SILENT
fixed (dead errorToast → DistillFailedError/NotFound leak-free-ordered w/ inversion pin;
compare degraded-as-data; askCard 3-state badge + grounded semantics restored) · 5 comment-only.
CardNotDistillableError deleted (unthrown) — re-mints in Lane TAGF with the owner-ruled
content-floor. Lesson banked (batch-vs-on-demand dual posture + refusal-order-as-tenancy-oracle). SMALLS boarded: clock-leak audit (the 2 write-path sites) · tx-vs-batch rule
codification · upsert decision-rule doc line.
**TAG-FABRICATION RULED (owner): REQUIRE REAL CONTENT** — name-only cards get an honest refusal
instead of staged model-invented tags (both arms: button + batch sweep); Lane TAGF queued on
next drain: re-mint CardNotDistillableError WITH the content-floor throw site (DISC deleted the
unthrown class correctly — birth order restored: error + throw site together), flip the two
name-only distill.int.test.ts seeds to assert the refusal, client copy per DISC's toast wiring.
DISC also mid-run: cross-tenant sweep caught its BAD_REQUEST leak (stranger probing = card
existence oracle) → leak-free NOT_FOUND-first ordering + inversion pin. Endgame:
verify:push on quiesced tree → PUSH-READY report (push needs its own word).
**Lane SEC LIVE** (security-executor) = SessionToken branded through the auth boundary
(kit id-cast helpers; compile-refusal pin; no auth-semantics change) + permitsHost
wire-or-delete disposition. **QUEUED behind CLEAN's merge: Lane LENS** = registry-aware
liveness (the collectServerProcedures pattern generalized to as-const registries) +
star-suppressed per-symbol grain + the orphan-export ratchet gate at PUSH tier (reasoned-marker
exemptions, terminal baseline from CLEAN's landed tree).
**MID-RUN FORKS RULED (both lanes, 08-03 — the new ruling-fork law fired twice, both textbook):**
CLEAN: 14+1 seeded delete-rows re-classed to @public on sibling evidence + the 07-25 stickler F8
precedent ("wire-or-annotate-or-delete, never reflex delete"); EmitNotification WIRED not
flagged (3 compose re-spellers); DiscoveryError deleted + lying header truth-repaired ("should
discovery grow typed errors" = board question); .Context factory KEEPS its escape hatch (2 live
direct-useContext optional reads — root fix unavailable, 5 dead re-exports die + header
documents the pattern). SEC: permitsHost NOT vestigial — wired at the 2 ENFORCEMENT sites
(read.ts:1125,:1164; spine invariant #6); sites 3+4 are the D106-F1 DATA-PROJECTION class
(member-visibility = its documented Principal-free home) — NOT wired, boundary cross-cites added
instead. **OWNER RULED ALL FOUR (08-03, question tool — every mantra-fit arm):** (1) discovery errors =
AUDIT-THEN-BUILD (sweep failure paths; typed errors WITH throw sites + surfaced client states
wherever failures are generic/swallowed; close-with-receipts if already honest) — queue a lane.
(2) viewerIsHost = DERIVE from member-visibility (host-projection helper moves INTO the class
home, chat-detail consumes it; no Principal threading) — small, chat territory. (3) two-classes
boundary = MINT INTO LAW (D-ledger clause rides the close-out D-entry: enforcement →
can()/permitsHost per invariant #6; role-derived payload projections = member-visibility class,
Principal-free) + SEC's flagged enforcer: a ts-morph gate making an inline role-compare in an
ENFORCEMENT position red — fold into Lane LENS as a 4th arm. (4) Lane LENS = FULL SCOPE
confirmed (registry-aware liveness · star-grain · push-tier ratchet · + the two-class gate).
**LENS ARM 5 (owner-asked 08-03): contract-derive gate** — domain/<x>/contract/ must DERIVE,
never re-spell: (1) commit-tier syntactic: name-collision with the sibling @orb/contracts dir
must be a type REFERENCE not an object-literal re-declaration; (2) commit-tier: `*Row`/`*Insert`
types in contract/ must derive via $inferSelect/$inferInsert; (3) anonymous structural twins =
`pnpm ast respell <domain>` lens verb + push-tier arm (mutual-assignability, ≥3-prop floor,
flag-and-verify like clientgap — never per-commit). Dead view-aliases (the ModelCatalogView
class) need NO new gate — the fixed lens + push-tier ratchet already red them.
**✅ SEC MERGED (`22389aff`, hook-certified on retry, torn down):** SessionToken branded end to
end (mint→seam→cookie, 14 positions; red-first type pin 4/4; 5 test-fake cast sites = the
compile-refusal receipt; brand=provenance, authenticity stays the peppered-HMAC lookup —
deliberately NO shape validator at the read) + permitsHost WIRED at the 2 enforcement sites +
two-class boundary cross-cites + entropy pins on the mint. Bounced ONCE at the hook (its
verbs→tokens/ edge broke domain-substrate-mediates-subsystems; fix = mintToken rides the DI
seam like hashToken — the domain's own context.ts header had already written that rule; gate
probe receipts). LESSON LANDED IN DOCTRINE: the lane floor now includes whole-graph depcruise
whenever files move or imports change (check:structure ≠ depcruise — a scoped-green lane
shipped an import-boundary red). SEC follow-up small boarded: THREE byte-identical
session-cookie parsers (entry/auth/seam.ts:56 · http/auth-routes.ts:115 · app.ts:140) —
divergence hazard, consolidate to one exported reader (behavior-neutral, spans two tiers).
Invite-token hasher stays generic `(string)=>string` DELIBERATELY (chat invite tokens share the
primitive and are not SessionTokens — narrowing lives on SessionsContext). AGENT-FILE ACCRETION DONE this stretch: doctrine gained
the lane invariants + verification floor (briefs shrink now); executor.md
red-first/hypothesis/SendMessage + KISS-purge **+ 08-03: settled-state CT law (never assert
in-flight transients; node-side counts ≠ browser settles) + ruling-fork law (defect traces to an
owner-ruled law → report the fork with the law verbatim, never code around it)**; side-eye full
snap mastery + record **+ 08-03: publish-retractions law + clean-scan-is-floor-not-verdict**;
SendMessage granted to all executors.
DONE-MERGED late-morning: AV2 avatar redo (`b1d9c098` — reference-school art, spider-isekai
Charlotte, $2.24, sheet in docs/reviews/misc/2026-08-03-avatar-pack-v2-contact-sheet.png).
LIVE: FX · MIG (general 3-handle arm + name-counts-as-edit ruled) · PV (C1 + Traveler approved).
**═══ OVERNIGHT RUN-STATE v2 (~01:30) — ALL BUILD LANES DRAINED @ `f3c0ef20` ═══**
MERGED TONIGHT (every one hook/gate-certified): preset wave A-F · focus-flag D · R4 · zod A-D +
SSRF seal · types:graph repair · registry split · ROSTER + ART PACK (20 originals, $3.35) +
SEED WIRING (pack+themes+overrides LIVE, picker 3→13, tokens/themes.gen.ts split) · G (Field
hint primitive fix app-wide + Grid pair + triggers normalize) · H (overlay sheets: elevation +
inert; amber edge scoped) · D8 (binding + resolved preview + select-half; 4 structure reds fixed;
receipts reports/snaps/laneD8-*.png). LANE-DOCTRINE ACCRETION owed at the quiet slot: add `pnpm
check:structure` to the executor verification floor (D8's lesson: test-file rules are invisible
to source-focused scoped sets — bit THREE lanes tonight).
SIDE-EYE RE-VERIFY DELIVERED: **SHIP WITH FIXES** (0 P0 — every night-fix VERIFIED w/ rendered
receipts incl. P0 boxes byte-identical rest/hover; 3 P1 [F-1 preview strips braces · F-2 drill
desyncs readout · F-3 combobox a11y] + 17 P2 + 11 P3; rulings: braces+chip wins everywhere ·
CD2 keep-fill-drop-border · radius pop intended · 418 stays OPEN for owner; report
docs/reviews/side-eye/2026-08-03-preset-shell-reverify.md). **LANE FX (fix-all, ALL findings)
DISPATCHED.** After FX merge: scoped side-eye re-check (fix-rounds law) → strike pass → D-entry
→ graduation → verify:push. **LANE DC MERGED (`dfcc393d`, hook-certified): the CHARACTER
PROGRAM IS COMPLETE END-TO-END** — 6 live-generated EXAMPLE chats seed per new user
(virgin-boot proven; deletion-respect via latch; narrator via the real synthetic-mint N2;
bulkImportChats widened additively w/ cross-tenant pins; receipts reports/snaps/dc-*.png).
MORNING-QUEUE LIFT (DC verbatim, receipts in its report): **flipping the latch ≠ migration —
seedCard's handle_conflict arm never re-dresses; existing installs keep OLD Assistant in
Charlotte's seat + Rev/Mara in the library; the `assistant` handle needs an owner
re-dress-or-retire decision.** + product nit (persona-sacred): default persona named "You"
reads as a vocative in formal registers. Was: **Lane DC demo chats**
(live-generate on the dev stack [restart+latch-flip authorized] → export → demo-chat seeder on
bulkImportChats; EXAMPLE-prefixed; Ashen Spire rpg-lite ON). THEN: fix-all on side-eye findings →
crunch STRIKE PASS → close-out D-ENTRY → graduation verifier → verify:push → PUSH-READY.
**═══ (superseded) OVERNIGHT RUN-STATE (owner OFF ~00:30; full-auto; NOTHING DROPS) ═══**
MERGED + CERTIFIED through `edd5c2d5`: preset wave A-F · R4 (actor program COMPLETE R1-R4) ·
zod A-D + SSRF seal (`18868af7`) · types:graph repair (`7abe9146`) · ROSTER DOC on main.
IN FLIGHT (4): **G** preset drill alignment (Field-primitive hint fix app-wide + Grid pair +
triggers all-selected→"Every generation" normalize-on-write rider) · **H** shell narrow-band
panel presentation (item 22 both arms; repro receipt reports/snaps/item22-418x634-*.png) ·
**AV** avatar gen via OR (cap raised ~$8; contact sheet → reports/avatar-pack-contact-sheet.png;
+RIDER: 10 LANDSCAPE backgrounds, environment-only NO PEOPLE, vibe-matched per art direction) ·
**SW** seed wiring (roster→cards.ts, purge rev/mara, latch-note only; +RIDER owner-ruled: 10
custom THEMES via the D71 pipeline [palette from each art direction, born-valid] + themeOverride/
backgroundOverride wired at seed [update-arm; both-ends discovery; storeAvatar-pattern for any
asset step] — the pack exercises the theme+background override planes end-to-end).
QUEUED ON DRAINS (dispatch as slots free, in order): ~~D8 lane~~ DISPATCHED (binding chip
[BINDING_VIEWS-gated, Actions-only today] + chat.previewActionTemplates [host-gated plural read,
ResolveForeignInputsOp.presetOverride reuse] + the §6.1 select-half mint via G27 store — all 5
lane calls approved). **D8 RESIDUE, explicitly boarded: the Prompt readout's real MATERIALIZED
carrier rows + true token costs via previewAssembly+presetOverride — its own small after this
lane merges (Prompt then joins BINDING_VIEWS).** → preset-cohort prose slots → SIDE-EYE RE-VERIFY desktop+mobile
(after G+H; leads: item-22 verify · P0 confirms · CD2 box-in-box · chip radius pop · O-7
sr-description note) + fix-all → crunch STRIKE PASS → close-out D-ENTRY (incl. R4 rewind
asymmetry + promoted-then-unseated gap) → graduation VERIFIER → docs/history move → demo-chat
generation lane (after SW+AV merge; fresh-user path around the reseed latch; engines authorized;
one rpg-lite chat incl.) → combined rpg side-eye (model-populated) → **verify:push on the
quiesced tree → report PUSH-READY for the morning word (NO push tonight)**.
**MORNING RULINGS (owner, 08-03, via question tool):** (1) RESEED = re-dress `assistant` to
Charlotte ONLY if unedited (byte-compare vs old seed prose; edited rows sacred; Rev/Mara stay) —
Lane MIG dispatched. (2) PICKER = character themes LEAVE the global picker (card-only via
override) **+ TWO NEW DOORS ordered: "save as theme" from a character (promote its override
into a real picker theme) AND save a character override WITHOUT minting a theme (custom values
arm)** — Lane TD queued next drain (both-ends design: check whether themeOverride is
values-vs-theme-ref today). (3) PUSH = the word IS given, conditioned: after FX+AV2 merge +
verify:push 12/12 green → PUSH ORIGIN, no further ask. (4) PERSONA = prompt-side framing fix
(no vocative use of literal persona names — prose-slot) + rename the seeded default persona for
users who HAVEN'T completed first-run (completed-first-run users keep theirs); name proposal
flagged for veto in-lane; demos stay (Example-labeled, minor mismatch acceptable) — Lane PV
dispatched. Superseded row: OWNER MORNING QUEUE: **THEME PICKER 3→13** (SW full-arm ruled: 10 character themes join the
picker as real D71 seed themes — taste checkpoint: keep all 13 visible or curate? trim is
cheap) · spider veto (Charlotte tile flagged on contact sheet) · avatar eyeball ·
push word · reseed-latch migration decision · --color-info hue ruling (item 14) · SETUP/POST vs
Relative/In-Chat vocab split (C's flag) · zod F16 prettify-unbounded already ruled.
LATE-NIGHT STATE: F (density S6 + registry-contracts SPLIT) MERGED + post-FF check PASS ·
Z (zod A-D) DONE incl. the F11 SSRF wildcard-hole close — HOLDING WARM pending security-executor
eyeball on `c21d7893` (dispatched; probe corpus preserved to main reports/zodlane-probe*.ts) ·
R4 building on 3 approved arms · MAIN DEBT found: tests/tooling/schema-baseline-parity.int.test.ts
red on main (Z proved pre-existing) — needs its own small. preset-editor-surface.ct:140
parallel-load flake now A/B-proven pre-existing (F) — upgrade WATCH → needs real fix
(bus/invalidation race under contention). Was:**
**⛔̶ FREEZE LIFTED (owner word, 08-02 night — new account, fresh usage). WAVE 1 IN FLIGHT:**
Lane A (list trailing-slot P0 + O-1 dot) · Lane B (layout/typography/control grammar + O-18
quality dropdown) · Lane D (shell focus-mode desync + O-19 registry defaults) — all worktree
lanes off `cfc7b2b3`; the crunch list is the brief. Lane C (semantics/vocab batch: O-4/5/6/7/
8/9/10/11/12/13/16/17 + items 11/12) dispatches as slots free. Stale worktree debris cleaned
(9 merged wt/ branches deleted w/ 0-unmerged receipts; 2 dirs removed, 0 unique files).

**THE RULED ORDER (running):** preset fix round (above) → real-pointer probe re-verify (Chrome
session live; counters 1700→single-digit) → preset side-eye RE-VERIFY round (fix-rounds law;
side-eye agent doc UPDATED 08-02 w/ full snap usage + the real-pointer-only hover-class law) +
close-out D-entry + crunch-list graduation (verifier → docs/history) → D8 binding + Actions
resolved preview (§7.1) + preset-cohort prose slots →
R4 promotion doorway → icon-seal client adoption (F-06 bolt, tracker orbs, meters) → zod stages
A/B/C (comment truth-repair · prettifyError · respellings) → square-glyph Button small → density
S6 (transcript+composer) → SSE close-out residue (impersonate +1 socket verify; 3 stale
precedent labels) → combined rpg side-eye on a MODEL-POPULATED game (NPC-only band question ·
Known-characters disclosure · CastCard mood-wrap · waystone-compact · the accumulated W-H list)
→ @live rpg-lite-loop pass → **DATABANK alone, last**.

**★ DEFAULT-CHARACTER PROGRAM (owner-approved 08-02 night; readback confirmed):** replace the
new-user seed roster (defaults + avatars copy per account at first login — scout mapping the
mechanism) with 5-10 publicly-respectable, field-complete demo characters, each a different
angle; JFC survives REBUILT from global-CLAUDE.md DNA + Ruby's structural bits (Ruby = the card
CLAUDE.md was modeled on); Niko survives w/ coherence rewrite + proper mark grammar
("quotes"/*emphasis*); rest PURGED. Mining rule: derive attitude/voice/structure from the top
.st-data cards (Hikari's attitude = gold), SANITIZE — no explicit content in derivatives OR in
reports, coworker-safe bar, no avatar reuse. Avatars: generate fresh via OR credits (Google
latest / Flux 2), consistent set. Characters exercise the full field surface + macro engine;
several rpg-lite-ready (sheet/trackerGrants/d20). DEMO CHATS: generated LIVE and exported, never
hand-seeded — few solo, group chats per group mode, one rpg-lite-ON; labeled EXAMPLE. Tiering:
scout mining (DISPATCHED) → ONE Fable-tier authoring lane (writing is the product) → normal
tiers for avatar gen + chat runs + seed wiring. Runs after the preset wave drains.
SIGN-OFF: the ORCHESTRATOR approves every character before it ships (owner delegation 08-02) —
and the bar is FUN, not sterile: "don't mormon-sanitize them into gray blobs." Sanitize the
explicit; KEEP the edge, attitude, bite, chaos that made the source cards top cards. A character
that couldn't make someone grin is a fail even if it's squeaky clean.

**NIGHT-TAIL (owner, 08-02 night — end of night if time):** (1) CHARACTER + CHAT mock-vs-made
pass (yesterday's mocks: list-pane-projection + home-section + the lifecycle surfaces), desktop
AND mobile side-eye rounds; full GPU control granted (sleeping vLLM lies dead — `/is_sleeping`
is truth; stack restarts fine). (2) THEME-CUSTOMIZE ZERO-EDIT FORK (owner saw live): pick
built-in theme → Customize → change nothing → back → a copy exists. Owner: "technically fine…
might not be worth the juice" — LOW priority; the preset fork-choice precedent (interception,
nothing written until an arm/keystroke) is the fix shape if ever taken. Board-log only unless
adjacent work touches theme-picker.

**OWNER RULINGS (08-02 night, four via question tool):** zod A-D APPROVED do-it-right (block
above) · **D6 maxBudgetUsd: DELETE IT** (no verify — the knob dies; schema+consumer sweep, queue
behind Lane B's contract merge, warm-B candidate) · **probe corpora: ARCHIVE w/ stale-vocab
header note** (freeze as historical; fresh corpora mint on next probe need — light item, Lane E
follow-up) · **VRAM-refusal drill: DEFERRED** · **PUSH: owner pushed himself through `7c312220`
(origin now 6 behind); next push = MORNING, his word — verify:push prep when quiesced is fine.**

**SEEDS/E2E RETIRED-VOCAB SWEEP: CLEAN (scout, 08-02 night, both-methods receipts):** nothing in
tests/e2e/** / __orb.seed (agent-seed/index.ts) / agent-bridge injects retired R1-R3 vocab; all
hand-mirror deltas are DELIBERATE pinned subsets enforced by mirror-parity.test-d.ts (drift =
typecheck red). Nits for a docs batch: trpc.ts:829 comment overstates presentCharacters (mood/
relationship live on the actor row now); not-covered list in the scout report. LANE E MERGED
CONTENT: perf-meter LoAF-first (rAF-gap kept for the 34-49ms band, `04745207`) · __orb.shell()
now exposes `focus` via data-focus-mode (`c745e85c`) · labels item was ALREADY DONE (e8e7d825).
EXECUTOR.MD UPGRADED from Lane D retro: red-first-compiles-against-OLD-source law · worktree-Bash
compound-command workaround · mechanism-claims-are-hypothesis · SendMessage back-channel.

**OPEN OWNER ITEMS (remaining):** JSON-card export format · absent-character transcript import
policy · DRAFT-TRUST architecture call · macro-feed cast-guides celBindings · Doc-Law
§-refs-in-comments ruling · AGENT-1 word · D22 multi-user (needs multi-user stack).

**WATCH:** preset-editor-surface.ct:140 flaked ONCE under full-parallel (green isolated ×2 —
load flake) · rpg-scene-tab.tsx near the 450 cap · registry-contracts.ts AT the cap.

**RESUME READ ORDER: read THIS WHOLE FILE, in full — every block, including the archeology**
(a resuming orchestrator that reads only the current block loses the queue tail, the open
smalls, the discussion pile, and the standing posture; it happened 08-03, corrected by owner) →
`git log --oneline -40` → MEMORY.md (auto-loads; hubs updated today: gate-authoring #5 new
entries, ct-gotchas #24-26, op-shaped-hand-door-write-seam minted) → AGENTS.md for architecture
work.

**═══ ORCHESTRATOR QUICK-ONBOARD (post-compact tips — skip the usual re-setup, minted 08-02;
refined 08-03 after the smoothest resume yet) ═══**
· 08-03 LATE REFINEMENTS (the second full day of this pattern — all proven): BOARD COMMITS =
  `--no-verify` (owner word; code merges keep the hook). SIX-lane cap (owner word, "until
  further notice"). Merge-hook format-drift reds: fix IN the staged merge (scoped biome on the
  named files, inspect diff, git add, commit --no-edit) — happened 3×, always trivial.
  Gate-authoring briefs now POINT AT scripts/check/GATE-AUTHORING.md instead of pasting lessons.
  OWNER CADENCE: he answers question-tool batches fast and almost always takes the
  mantra-marked arm — pose ALL pending forks, batch of 4, recommendations marked; text-list the
  minor defaults you're taking under proceed-in-full. When he says "read the reports in full" —
  do it, the summaries drop load-bearing items (proven twice). Lanes cite their own defaults
  mid-run (the default-and-deadline law) — rule fast, they don't stall. EVERY scout PRESENCE
  claim needs AST not grep (three instrument-error retractions today). Sticklers are the
  design-question vehicle (5 ran today, every one changed the plan) — dispatch with the
  actor-state-review form + "write the file first".

· COMPACT RITUAL ADDENDUM: any OWED DELIVERABLE (unanswered owner question, undelivered
  report/recommendation) gets written INTO this board's current block before compact — never
  trust the summary alone to carry a whole deliverable across the boundary.
· The context-sentinel can fire a STALE ~99%-full warning on the first post-compact turn —
  ignore it, don't re-run the ritual on a fresh window; sanity-check against actual context age.
· Message live lanes by AGENT ID, not role name (SendMessage "executor" → not reachable; the id
  from the spawn result / task notification is the address).
· MEMORY is SYMLINKED across both accounts (`~/.claude-b/...orbweaver/memory` → `~/.claude/...`);
  one store, either login. context-sentinel hook active on BOTH (compact ritual fires ≥90%).
· LANES: `Agent {isolation:"worktree"}` — the WorktreeCreate hook owns creation (local HEAD +
  auto-install). POST-DISPATCH: verify bases (`git -C <wt> rev-parse HEAD` = main HEAD). Briefs
  ALWAYS include: the back-channel line (lanes SendMessage you MID-RUN — owner wants this), scope
  boundaries vs sibling lanes, `git -C` discipline, lane-unique scratchpad names.
· MERGES: a FAST-FORWARD merge SKIPS the pre-merge-commit hook — run `pnpm check` on main after
  any FF (or `merge --no-ff` to force the hook). Teardown: `status --short` (untracked survivors)
  + `git show --stat` receipts FIRST; never tear down a resumable lane. **NEVER DEFER the post-FF
  check when the branch's gate list missed ANY of the 12 stages** (R4's scoped-tsc-green merge
  shipped a types:graph red to main for ~an hour — the char lane caught it; scoped tsc NEVER
  covers tests/ [hub lesson #5]; fixture fix `promote-actor/rpg.int` landed direct-on-main).
  **NEVER CHAIN TEARDOWN BEHIND A MERGE IN ONE COMMAND** — burned TWICE tonight (B: `| tail`
  swallowed the hook failure, teardown ran on a failed merge; SW: hook red left staged-no-commit,
  the chained `rm -rf` deleted a lane worktree that then needed resurrection). Protocol: merge →
  SEPARATE call verifying `git log -1` + hook verdict → THEN teardown. A staged-failed merge =
  `git merge --abort` (working-tree docs survive; never reset --hard with uncommitted work).
  Recovery receipt: branch always survives; `git worktree add <same-path> <branch>` + the
  post-checkout hook auto-installs. **AND: the ORCHESTRATOR'S OWN shell cwd can silently sit in
  (or die with) a worktree — a bare `git log`/`git merge` then reads/acts on the WRONG repo and
  even the verification lies** (burned once: SW's "verified" merge was the worktree's own HEAD;
  main never moved). LAW: merge + verify commands use `git -C <ABSOLUTE-main-path>` always.
· snap: STUDIED IN FULL in side-eye.md now (agent doc carries complete usage). --eval = BARE
  arrow (arrow-IIFE double-invokes); --jsclick for list rows; --isolated/--dirty stages beat
  dev-stack HMR; --goto/__orb.nav for all SPA reach; HOVER-LOOP CLASS IS REAL-POINTER-ONLY
  (synthetic/CT/CDP-discrete all blind — assert the structural invariant instead).
· Chrome MCP (claude-in-chrome) available for live pairing w/ owner: CDP hover survives
  screenshots, zoom regions, in-page counter probes — the tool for "I see it but can't shoot it".
· MERGE RECEIPTS: `pnpm ast refs/jsx/orphans/unwired` (resolution-based, beats grep) to verify
  lane deletion/sweep claims. Scouts carry the code-recon skill (still enforce evidence standards
  in the prompt). Probes: snap + design-audit + perf-meter + motion-audit + `pnpm record`
  (transitions/jank GIF w/ click-latency tile strips).
· Doc lifecycle: working defect docs live in docs/reviews/misc; section complete → verifier pass
  → graduate to docs/history. Stickler = truly-stuck only. Commits BATCH at merge points (owner
  word) — no per-edit doc commits.
· AGENT-DEF REFINEMENT LOOP (owner practice, 08-02): at lane completion, occasionally ask the
  agent for onboarding friction (what was missing/wrong/rediscovered-the-hard-way vs what proved
  load-bearing + one concrete agent-file edit) and fold the good ones into .claude/agents/*.md.
  Only scout has had a real pass so far; executor/mech/verifier/side-eye briefs accrete here.

## ═══ CURRENT STATE — 2026-08-02 DAWN (STALE — archeology only; superseded by HANDOFF #3) ═══

**Tree:** green — check 12/12 + battery certified through the whole night (final integration
fixes `83a03778`; last full battery 8760/8786 with the 3 reds fixed+committed after). **Origin: PUSHED
08-02 (owner word given) — `32539eda` + tail; verify:push 12-stage battery green in the hook
(621s). The ~315-commit local era is REMOTE.** **Stack:** dev on :5173 serves the
fully-polished tree; engines adopt-only.

**⚠ SECURITY LANDING (08-02): the COLD-SCRUBBER LEAK fixed on main** (`ed2aafc5` merged, check
12/12) — a mid-slot reconnect leaked hidden-span TAILS to members (member-triggerable: the
withheld ghost's stall is an oracle; close/reopen delivered the tail). Fix = producer-side
`memberText` stamp before the durable append; all read seams stateless; fail-closed on undefined.
**MERGE-ORDER CONSEQUENCE: the S2 branch must merge main AGAIN post-stickler-verdict and
reconcile its moved room source** (its pump-scoped deltaScrubbers machinery DELETES — the stamp
makes the two-room-isolation property hold by construction); its security tests re-run; THEN S2
merges. `scrubStreamReplayForMember` (unwired token log) still cold-starts — cited, needs the
same class of fix IF ever wired.

**▶▶▶ LIVE STATE (08-02 midday — compact-safety snapshot):** main @ `13963039`+ (SET-SEAMS S0 +
HUD-1 ledger amendments merged; ~190 commits past origin `24989143`, NO pushes). **IN FLIGHT:**
HUD-H1 fix-all (all side-eye findings P0→P3 incl. the shell ≤1024px dead toggle) · ~~density-S5 fix-all~~ MERGED (tiers.css now LOAD-BEARING with strip-attribute liveness CTs;
all findings incl. one-rhythm 32px avatars, marker-slot title columns, weight 600, inset focus
ring; honest deviations recorded: padding/radius deliberately un-mapped, no 9.5px token invented,
home kicker cited to the mock). Dev stack :5173 had a STALE-VITE break (missing-export ghost) —
restart launched detached; verify it serves before the next side-eye · **SSE S2 branch IN FINAL ROUND** (re-review verdict MERGE-WITH-FIXES: RF1 HIGH — the reconnect thunk heal is guard-dropped by any pre-attach durable row [monotonic guard + out-of-band resume don't compose; repro in the report]; lane is fixing RF1 [ordering-barrier lean] + reconciling the cold-scrubber producer-stamp merge + the park-skip corner; merges on its report) (`wt/agent-ae7a23e7ea4435982` @ `261b728b`
— F1 fixed STRUCTURALLY: cursor advances at DELIVERY pre-yield; shed PARKS the pump, delivering
roomLagged resumes it from last-delivered; reconnect re-announce carries a sinceSeq THUNK reading
the seq-guard's highWater; regression tests probe-verified to bite; e2e+live green on isolated
stacks — re-review the delta then merge) · the scrub mid-slot-reconnect verification
(security-executor) · ~~reachability suite~~ LANDED (`b5c1d9ff` merged: 80 leaves/60 tests, cast-volatile parity FIXED
via castVolatile+one volatileSegs; healthz test assertion fixed post-merge) · ~~workloads junk-drawer exit~~ MERGED (58→30 files; 8 owner-domain contribution factories;
D117 minted; full battery green pre-merge). DEFERRED into D117, each independently landable:
two-lane worker + workloads.lane column (the head-blocking defect stands) · durable progress
column · poison-row visible surface. Q4 (reconcile-stats direct mutation) deferred as additive
surface. **NEW OWNER QUESTIONS (cited in the suite):** inventory item `description`/`location` are
model-writable but read by NEITHER surface — render-capped, or make unwritable? **FOLLOW-ON
QUEUED: the macro/CEL feed is a THIRD model-facing surface** (macro-view.ts carries NO volatile
state for any carrier — same drift class; extend the suite's matrix to it + fix, ~a lane). **THEN:** re-verify both fix-alls → SSE S3-S5 +
close-out ledger → HUD H2-H3 → SET-SEAMS S1-seal → PROSE-1 S1+ (app-tier; after SET-SEAMS S1
merges) → density S2/S6 (+S3 post-HUD) → #16/D22 live probes → **DATABANK LAST, alone — HARD PRECONDITIONS: SET-SEAMS through S6 + workloads stage-E complete (owner, 08-02)**.
Owed to owner: verify:push when quiesced (his earlier run hit contention+stale-port, both
resolved); the E2E_LIVE specs on the next push window.

**═══ ⛔ DISPATCH FREEZE (owner, 08-02 late — weekly usage near the cap) ═══**
**NO further agent spawning after the two in-flight lanes return** (preset side-eye FIX-ALL ·
icon-seal lucide lane). Process their reports, merge on receipts, keep THIS BOARD updated —
then STOP and idle. Everything queued below (R4 · density S6 · SSE residue · combined side-eye ·
zod stage-A/B/C · icon-seal client adoption · probe-corpora call · DATABANK) WAITS for the
owner's word. The freeze binds future orchestrator turns until the owner lifts it.

**═══ COMPACTION HANDOFF #2 (08-02 evening — CURRENT; supersedes everything between here and
the old handoff below) ═══**

**TREE:** main green through `pnpm check` as of the SE-A-era merges; THREE unhooked merges since
(cast-fix 775ba2c9 · retention 760be66e · SE-D 859c674e · SE-A 44ee46d1 also unhooked) — **OWED:
one consolidated `pnpm check` batch certification when the lanes drain (load was ~60, easing).**
Origin: pushed through `32539eda` mid-day; everything since is LOCAL (next push needs the word).

**IN FLIGHT (4 lanes; resume via SendMessage):**
· ~~SE-B~~ MERGED (`09f6178e`, unhooked): all 9 fixed — band budget took FORK (b) w/ arithmetic
  receipt (set-arm ≤30% UNSATISFIABLE: rails 116px + set-band floor 159px > 270 ceiling; two-arm
  law amended + **D119a MINTED — needs owner ratification**: compact ≤30% / set ≤45% / both <50%);
  meters honest (—/30, null end-to-end); six kickers + Host-controls group (D-1); crown recedes;
  lock names tsc-forced; dead class ×5 fixed vs CSSOM; ghost tile dead; ORB RULE stated+enforced
  (ceilinged=ring, max-less=coin — the permanent-full-ring lie fixed); caption wrap at 20rem.
  ~~ESCALATION~~ TABLED (owner 08-02 — no action; the duplication stands as chrome-vs-body).
D119a RATIFIED (stamped in the ledger). Optional small boarded: lefthook post-checkout →
auto-install on raw `git worktree add` (closes the one manual-install recovery path; the
harness WorktreeCreate hook already covers all dispatched lanes). Was: band-orb READOUT
duplication owner call — DESIGN §2 mandates
  text-under-orb (text is the datum); de-duplicating = a MOCK AMENDMENT + RingGauge caption
  mode, not a feature-tier call. Band = persistent chrome across 7 tabs vs roster = one tab's
  body (the OSRS idiom). Rule if you want numbers to appear once. ALSO: rpg-scene-tab.tsx sits
  AT the 450 cap · name-echo placeholders ("act title…" class) left for a sweep · the SE-B/HUD
  surfaces still owe a LIVE snap on a model-populated game before side-eye-closed.
· ~~SE-C~~ MERGED (`79ab1dd5`, unhooked): TabsPanel FOCUS_RING_INSET (offset ring clips in
  scroll parents — CT via real Tab presses) · Button inline arm + ALL 13 sites, zero ! left
  (arm ships NO padding — twMerge keeps BOTH custom-token spacings; 2 sites were Select/Input →
  own layout arms, FIELD_CONTROL split) · icon tiles dead · bubble single-homed at lib/ (runtime
  cross-feature = RED; type-only allowed) · --color-sheen minted STATIC_RATIONALE. DIALOGUE HUE
  RESOLVED NO-RETUNE (orchestrator): the side-eye's violet exists NOWHERE — likely measured a
  colorForCharacter HASH color; Hearth amber is owner-picked 07-31 and STANDS. FLAGS: default
  Button w/o explicit intent gets no data-cta ring (documented, not repainted) · admin-rail-pin
  CT = the known DEF-14 parallel-load flake.
**NEW WAVE (post-SE, 3 lanes):** ~~R1~~ **MERGED (`a2bf1085` via hooked merge, 12/12 green;
worktree torn down).** The op-shaped hand door is LIVE: `rpg.patchActor` (10 per-field ops,
in-order against the TRUE head via the new `writeHandState(derive)` seam in snapshot-edit.ts —
read-modify-write atomic with the resolve; applyHandEdit is a thin arm of it) + `rpg.dismissActor`
(drops state row + presence row + locks at/below) + editSnapshot refuses actorState-as-image
naming both verbs. volatile-patch.ts + its test DEAD; 4 client call sites → one-op mutates; 622
scoped tests incl. the headline red-first regression (flush-interleave: human datum lands, flush
fields survive, retired image PROVEN to have clobbered) + inverted cast-NPC CT (72 green) +
cross-tenant rows. Decisions: item ops address `id` (raw-id gate; blob strings deliberate) ·
ctx.ids.item minted server-side · conditions/inventory KEEP plane-level pins (per-element pins
must FOLLOW a per-element Release UI — flagged, not skipped) · e2e dismissActor helper deleted
(knip-red, unverifiable from lane). DEFERRED→R2: panel dismiss affordance (Known-characters
disclosure is its home) · member-own-volatile doorway noted in patch-actor.ts header · @live
rpg-lite-loop pass owed next stack window (SPEC 1 now drives patchActor). Lesson banked:
[[op-shaped-hand-door-write-seam]]. ~~R2+R3~~ **MERGED (hooked 12/12 green; 70 files; worktree down) — THE ACTOR-STATE PROGRAM
R1-R3 IS COMPLETE ON MAIN.** All six stickler findings fixed red-first before merge (`c39e5811`):
F1 took the GOOD arm (compose wired THROUGH actorCarrier — §1.4 drift dissolved in code) · F2
presenceName→actorLabel + the reminderAbsent lens + roster-carrier probes (2 unit + 2 suite reds
on revert) · F3 SPEC 5 re-keyed + full e2e op-literal sweep (7 live members, 0 retired) · F4
castKey slug refine at the contract (5 refusal pins; toJSONSchema untouched verified) · F5
isPartyActor gates the purse note · F6 stub/comments. 719 battery + 74 CT + knip EXIT=0 in-lane.
**DEV DB RE-MINT: stack restart issued post-merge** (V2's baseline squash + the blob reshape both
require it; old actorState blobs would SILENTLY ZERO, not throw — N1 corrected). REMAINING in
the program: R4 promotion doorway (parked, not this wave) · @live rpg-lite-loop pass on the next
stack window (SPEC 2/5 now drive identity/tracker ops) · combined rpg side-eye incl. the
NPC-only-game band question + the Known-characters disclosure + CastCard mood-wrap nit.
[08-03 NOTE: the "R4 parked" framing in this archeology block is STALE — R4 was built later
that day; see D121 clause F.] FLAGGED
stale probe artifacts (hpDelta in run-coverage.mjs/native-wire-probe.mjs/real-cheap-toolround
.json — already stale at merge-base with 13 pre-existing retired symbols): OWNER CALL whether
probe corpora are maintained or archived. Stickler report:
docs/reviews/stickler/2026-08-02-r2r3-premerge.md. F1 knip-red (actorCarrier gains its
compose consumer — the ONE-derivation claim becomes literal; offstageLine de-export) · F2
SCENE-OPENS leaks `character:chr_…` raw keys into the PROMPT (roster identity-less post-reshape;
+ the missing roster-carrier first-snapshot reachability probe) · F3 stale setHp op in the @live
SPEC 5 (invisible to tsc — loose-typed e2e helper; + literal sweep for retired ops) · F4 RULED:
castKey slug refine AT THE CONTRACT (purity trade judged false) · F5 PurseLine cast-subject
carried-note incoherence · F6 stub-shape hygiene. All 3 lane spec-contradictions VERIFIED TRUE;
all judgment calls sound; mirror pins tightened-not-loosened; N1: old actorState blobs are
silently ZEROED not thrown (wipe still required — the framing corrected). LESSONS: reachability
matrix needs a roster carrier on every first-snapshot-arm probe · retired op-union members need
a literal tests/e2e/** sweep (loose-typed helpers invisible to every type gate). STICKLER
UNCONFIRMED SUSPICIONS boarded (report §3 tail, not findings): (a) trackerOrbs picks "first
actor with state" roster∪cast — on an NPC-only game the BAND may render HER pinned meters where
pre-R2 it rendered none (plausibly desirable; → the combined rpg side-eye checks the band on an
NPC-only game) · (b) a hand editSnapshot presence IMAGE racing a model flush wholesale-replaces
the presence list — the stale-image class survives in MINIATURE on the presence plane (client
ships no presence-image writer today; dies whenever R1's trailing presence image-exit lands —
the program already contemplates it, §5 R1 "image-exit can trail"). Lane
branch `wt/agent-ab0c8130e32fd8c95` (2 commits, tree clean): NPC IS an actor (identity on the
actor row, slug keys, emptyActorEntry births cast identity); presence = plane; cast* projections
DEAD (one actorCarrier derivation both consumers); hp DEMOTED (§6 all 8 sites ✓; seed by
ATTRIBUTE VOCABULARY not profile name — special seeds hp too, RPG_SEED_HP_MAX=20); 2 NEW op
arms setIdentityText/setRelationship; lock paths grew volatile/identity segments; GM→HOST copy
done (gmPresetId/gmUserId wire fields deliberately kept); Status excludes cast (one edit home);
partyTotals excludes cast; Known-characters disclosure rendered+screenshotted. 710 rpg battery +
73 CT + sweep + gates green in-lane. **⚠ ANNOUNCE: dev db WIPE required on next boot (blobs are
old shape, parseSnapshotRow throws) — but NO baseline squash (JSON text columns, zero DDL; spec
conflated the two).** Lane CONTRADICTS the program report ×3 (no hp bar/orb existed; no DDL;
presentCharacters.characterId written by NOTHING → deleted RelationshipBadge rendered for
nobody) — stickler charged to verify all three + the raw-castKey sibling-mint hole (normalization
seam ruling owed). Deferred: side-eye lens on the new disclosure (mood wrap nit at 320px,
pre-existing CastCard behavior) · @live rpg-lite-loop run. ·
~~V2~~ **MERGED (`c4112f85`, hooked 12/12; merge-side knip cleanup [dead zone-summary-strip +
2 de-exports] + density-baseline shrink 326→321).** P3 + Actions LANDED: rack select≠drill
(name=select/echo, chevron=drill; pivot's enable Switch DELETED; Add auto-drills; carriers ~—) ·
section drill-in owns the whole object — **bridge + inspector + controls DELETED** (compile-time
receipt) · tri-state DEAD w/ G8 lift (`template:""` → {undefined, enabled:false}; db baseline
re-squashed for DEFAULT 4→5 — dev db re-mints next boot) · CONTEXT = per-view readout
(kind:"single" — no-selection arm is first-class; zero new reads = zero freshness rows) · Actions
DERIVED from TEMPLATE_DEFS (G5 responseNudge + G9 newChatMarker got editors with NO code naming
them; caps → exhaustive Record dispatch) · RENDERING CAUGHT A CONTRACT BUG gates couldn't: drill-in
offered inject/trigger on plain markers (invalid section on write) — supportsArrangement() derives
from the schema branch, fields ABSENT not disabled (`628a3666`). 51 preset CT + 128 unit/contract.
~~P4~~ **MERGED (`30022a1f` tail, hooked 12/12; worktree down):** inline ACTIVATE toggle radio
semantics, ALL THREE paths one setDefault writer; pane Select DEAD same-commit; G6 doors (export
= buildPresetFile bytes-asserted CT, hidden on built-in; orb import = the ONE dialog, schemaKind
sniffed, merge semantic stated, server rejection keeps dialog open); G7 header truth chips.
67 preset CT + 217 unit. RECEIPTED DEVIATION (correct, sanctioned in RowToggleAction's header):
§9's "amber always-visible" toggle is UNCLICKABLE under actionsFloat (pointer-events-none at
rest, overlaps title) — state rides a title-line "Active" Badge + ROW_REVEAL_SWAP, toggle
rest="never" (D11 chats-row arm; the INVARIANT holds). FLAGS: preset.importFile sweep row is
EXEMPT "self-scoped" not PROBED (correct on evidence — no id to aim; spec/tree divergence noted)
· PresetImportOutcome flat bag doesn't narrow ok:false→error (bundle-path shape, future
single-arm-union pass) · LibraryRow grew generic stateToggle/menuItemsBefore/After slots.
Lessons banked (hub #25). ~~FIX-ALL~~ **MERGED (`11ee38d8` tail, hooked 12/12; worktree down) — 33/34 FIXED + F-24
ARGUED-CORRECT (size=icon is 48-coarse/34-fine BY TOKEN, D62-ratified).** GhostValue grammar
unified (built-in ships template:undefined — wire-identical; 3 selects ghost effective defaults
w/ minted DEFAULT_NAMES_BEHAVIOR/CONTINUE_POSTFIX rewiring the assembler's ??-sites; slider
fills dead both arms); F-01 via ListRow subtitlePlacement="inline" (name floor min-w-24); F-04
via NEW useFocusOnSwap (useFocusOnMount's body-guard can't see in-place swaps — lesson banked
hub #26); F-15 forced a server datum (EffectivePreset.qualityMapping — §12 bans client
re-derivation, correct shape); F-08 shipped /55 not /70 (probed: 0.4 luminance sep vs old 0.017);
§16 rows 7+27 updated same-commit for the header-Export echo. 844 CT + 1608 node green; density
baseline ratcheted DOWN (7 files off). WATCH: preset-editor-surface.ct:140 flaked once under
full-parallel (passed isolated ×2 — load flake). **PRESET-1 BUILD = COMPLETE P0-P5.** OWED WHEN
FREEZE LIFTS: the side-eye RE-VERIFY round (fix-rounds law: re-verify catches fixes that create
regressions) · D8 binding + Actions resolved preview (§7.1 post-P5) · preset-cohort prose slots ·
close-out ledger D-entry (mint at re-verify green). Was: ~~SIDE-EYE~~ **DELIVERED — verdict DO NOT SHIP** (report + orchestrator rulings persisted:
docs/reviews/side-eye/2026-08-02-preset-program.md; owner's mock-vs-rendered axis included).
34 findings: P0 F-01 three Actions rows render NO name · P1 band incl. custom-badge lies on the
BUILT-IN (defaults materialized as values — the F2 defect reborn), capability ERROR rendered as
"connect a model", ghost slider paints a FULLER bar than explicit (both fills ruled DEAD — mock
draws all sliders neutral), rack ON/OFF indistinguishable (ON is DARKER), color-only activation,
no-selection readout contradicts the list, import dialog states no merge semantic, focus dumped
to body on drill. Mock-vs-rendered: 13 RENDERED-WRONG (incl. GREEN budget bars, glyph-disc
noise, chunky QUALITY strip) · 2 MOCK-STALE sanctioned (P4 badge arm, pivot switch) · 2 JUDGMENT
RULED (subtitle inline per mock; carrier depth = mock-stale per 628a3666). Rider verdicts:
amber badge = second CTA (soft + shape fix); KnobRow ember DIES. WORKING (don't touch): rack
keyboard model, carrier attribution, freshness fans FIRE live, motion clean. STACK NOTE:
side-eye found+cleared a stale-vite ghost on :5173 (restart). **FIX-ALL LANE DISPATCHED**
(GhostValue unification first — closes F-03/05/09 + badge lie in one motion; all 34 + 10 ARIA
recs accounted). D8 binding + Actions
resolved preview stay post-P5 per §7.1 sequencing. · ~~smalls#2~~ **MERGED (`165cd85e`,
HOOKED — the 12/12 check on this merge CERTIFIED the whole unhooked pile incl. mirror-pin; batch
debt CLEARED).** All six landed: Jobs = the one user noun (pane copy swept, filtered-tab CTAs
dropped, 44 CT green) · `rpg.toolround.usage` economics record (§10.1a true, 42 int green) ·
ember-CT title rename · retry-drift sweep = NOTHING TO BUNDLE (3 call sites tree-wide, all clean
by construction; invariant commented) · lefthook post-checkout auto-install (4-arm scratch-repo
probe) · bang-prefix arm (v4.3.3 engine probed: both `!x` and `x!` spellings bite). NEW FROM IT:
**DEBT_BASELINE re-opened 14 rows** (all `features/rpg` `!size-N !p-0` icon buttons — the gate
was blind to `!` so the old TERMINAL {} was a LIE) → the queued square-glyph Button small below
is now the payoff path · side-eye item: "Jobs > Jobs" doubled nav row (Personas>Personas
precedent kept; eyeball it) · ember PROSE strays remain (rpg-context-section.ct.tsx:1604 body
comment, rpg-hud.tsx:319/:1811) + 2 "workload" strings outside the pane
(admin-create-user-dialog.tsx:74, admin-ops-section.tsx:67) — fold into the next docs/copy sweep
· lefthook caveat: hand-added worktree w/ dead baked binary path prints "can't find lefthook"
and exits 0 (pre-existing gap, recorded). LESSON banked: gate blind spots make baselines lie —
re-derive blind spots before trusting a terminal zero. ~~mirror-pin~~ MERGED (`acad5df6` — 26 shapes pinned two-axis [keys+values]; proven
on the exact TRK-2 regression; found+fixed FOUR more live drifts on landing [poolDefs debris,
missing flavor/grants, phantom namesBehavior, weather |undefined]; envelope-sourced shapes
listed as honest scope). Remaining in flight: R1 / V2. **WAVE-2 ADDS (owner word "dispatch any
other needed waves", 08-02): ~~PROSE-1 S2~~ MERGED (`ec78ea20`, hooked 12/12; worktree down).**
The Prose section is LIVE in Chat behavior: `prose` joined USER_SETTINGS_SECTIONS same-commit
(D107 arm B); editable cohort DERIVED (`USER_PROSE_SLOT_IDS` = home:"user" minus the 6
imagery-adapted ids — a new user-home slot reaches the editor with ZERO client edits); ghost
defaults + Reset + missing-token lint-never-block; 5 CT + 122 unit/int + rendered proof.
RECEIPTED DEVIATION (correct): section homed in features/CHAT not settings/** — spec §8 predates
D114/D120 (section homes with its READER; chat reads 12/18 slots) — spec-text delta owed on the
next docs sweep. TRAP PINNED: dotted slot ids × partition nesting arm would throw at BOOT; a
contract test REDs the day one id nests inside another. OPEN REMAINDER: the preset-cohort prose
rows (49, 53-73 + responseNudge) are NOT slots yet — they need the preset-side migration; folds
into the preset program after V2. Stale affordance ("Keep mine" rung) unexercisable until the
first default revision — pinned at the model boundary, lights up then. · **smalls#3 lane** (ChatSummary game-marker+snippet fields [one
migration, both markers] · ChoiceBlock picks tRPC pair into the MU pane · DRAFT-CAST union fix ·
QUOTE-1 greeting-preview tint · VER-1c custom-byo isError [verify-first] · ember/workload copy
strays). Four lanes total; load 8.8 at dispatch; lanes are scoped-verification-only per §L.
smalls#3 RESULT: 2/6 were live work (QUOTE-1 greeting-preview tint via ONE-HOME hook
`data/use-color-quoted-speech.ts` [computed-color CT both arms] · ember/jobs prose sweep) —
**4/6 ALREADY BUILT on the tree** (ChatSummary marker+snippet `4f3d689b` [projection-time, NO
migration] · ChoiceBlock picks pair `0925bb0d` · DRAFT-CAST union `2b1bdc09` · VER-1c custom-byo
isError `9e58c49d` — audit-lists-are-snapshots bit at BATCH granularity; queue rows struck
below). **MERGED (hooked, 12/12 green; worktree torn down)** — the parked test-presence-client
red was cleared by the warm lane (`97f06b32`: mirror CT at tests/client/data/, four real arms
incl. missing-key→true [pins the !== false spelling] and failed-read→degrade-to-default).
**~~ICON-SEAL LUCIDE-LEVERAGE~~ MERGED (`89c787ae`, hooked 12/12; worktree down).** The Icon
primitive now carries `weight` (hairline/regular/bold via absoluteStrokeWidth — optical at every
size) · `fill` none|solid (lucide's own fill=currentColor — "officially unsupported but works",
cited) · `partialFill` 0..1 (the ONE hand-built piece — lucide's official half-star recipe is
per-icon minting, banned; ours rides lucide's DOCUMENTED children-in-svg door + objectBoundingBox
linearGradient, useId-sanitized, currentColor/D71 throughout). FillableIcon = phantom-brand
tsc-enforcement (11 glyphs chosen from RENDERED evidence; Menu/Settings counter-examples in the
gallery; Pause/Square fill per-subpath — single-outline glyphs for meters). Default arm
byte-identity PROVEN vs HEAD render + frozen as CT (12/12 green). Probe receipts: nothing wanted
is newer than the 1.22.0 pin (no upgrade). Merge-side fix: typeof-Star stand-ins (persona-panel-
row ×2 → LucideIcon; the lane pre-fixed relationship-badge). FOLLOW-UPS named not built (freeze):
LucideProvider at client composition root · vector-effect CSS stroke route · iconNode door for
brand glyphs (weave-glyph) · fillRule=evenodd probe to grow the fillable set · CLIENT ADOPTION
(F-06 bolt → fill axis, tracker orbs, meter glyphs, weight= for selection emphasis). Gallery
receipt reports/icon-seal-gallery.png. Lesson banked (typeof-stand-in sweep before branding).
**+ ~~ZOD LEVERAGE AUDIT~~ DELIVERED** (report rescued to
docs/reviews/stickler/2026-08-02-zod-leverage-audit.md, 412 lines; worktree down). **VERDICT: NOT
lazy** — settings prefault/catch self-heal, per-boundary strict/loose posture, and the
conservative-or-refuse JSON-Schema lift are v4-fluent and deliberate; every headline absence
(codec/fromJSONSchema/brand/templateLiteral/xor) is CORRECTLY absent with receipts. REAL findings
= THREE STALE TRUTH CLAIMS baked into comments/law: **F1 MED-HIGH** kit/json-schema:3-5 says extra
model keys "fail our parse" — FALSE, v4 z.object strips them silently (and the D112 folded wire
sends tools WITHOUT strict, so an invented key vanishes with a SUCCESS record — quiet hole in the
no-silent-fork doctrine; strip-observability = OWNER CALL) · **F2 MED** the .strict()-over-
strictObject rationale in contracts/preset:201 is a fixed upstream issue (tsgo probe w/ planted-
error control) · **F3 MED** the branded-transform law's MECHANISM was half-stale — .transform()
still throws in toJSONSchema, .brand() no longer does on 4.4.3 (memory CORRECTED) · F4 hand-
flattened ZodError drops the PATH on preset-import/automation errors (z.prettifyError, 0 uses) ·
F5 env booleans → stringbool ONLY with pinned {truthy,falsy,case} params · F11 plugin NET_HOST_RE
accepts junk where z.hostname() is a real validator (SSRF-allowlist adjacent — probe first) ·
F6/F7/F16 small respellings. BUILD PROGRAM staged in report: A truth-repair comments → B
prettifyError → C respellings → D OWNER-GATED (stringbool · hostname · strip-observability).
AWAITS OWNER READ before any build dispatch.
· ~~V1~~ MERGED (`f7e8bb89`, unhooked — batch-check debt): five-view strip + params deck LIVE
  (KnobRow ghost=placeholder idiom [B1 has no NumberField tone]; maxContextTokens ghosts from
  capability under its OWN `window` rung; --width-label-col minted; MANAGED_VERBATIM_TAIL lifted
  to contracts [two consumers one home]; maxBudgetUsd got NO editor — D6 stays an OWNER FORK:
  verify the wire enforces budgets, then editor-or-delete; roundtrip helper grew dotted paths).
  V2 scope = P3-P5: readouts + section-editor consolidation [bridge+inspector die] + list
  projection + Actions rebuild + DELIVERY cluster + rest-of-surface density shrink.
· ~~nav-label~~ MERGED (`a89b3cb1`, unhooked): navLabel ?? label; the CT SWEEP found TWO clipping
  rows empirically (Message details + Message handling — proven red-first); search matches both
  names (non-substring fixture pins the wiring); ListRow.fullTitle prop (tooltip full, a11y name
  stays VISIBLE text — WCAG label-in-name); clipping now REDs automatically via
  readClippedNavLabels. The nav/heading split is a real contract.

**THEN, IN ORDER:** batch `pnpm check` → **R1** (op-shaped patchActor + dismissActor — the
APPROVED actor-state program's first stage; supersedes volatile-patch.ts) → V2 preset views
(rack build · Actions off the registry + kind badges · template drill-ins · per-view readouts +
D8 binding · list projection) → R2+R3 one lane (NPC becomes actor · presence plane ·
cast* projections die · HP DEMOTION + condition stat-enum→tracker-key widening + GM→HOST vocab
sweep, all in R2's baseline squash; stickler pass before merge) → preset program side-eye +
freshness live drive → R4 promotion doorway → smalls batch (jobs-vs-workloads vocab+CTA ·
toolround usage record · Doc-Law §-refs ruling · ember-CT rename · runStructuredTurn retry-drift
sweep) → density S6 (transcript+composer, baseline→{}) → SSE close-out residue (impersonate +1
socket verify) → **DATABANK alone**.

**OPEN OWNER ITEMS:** JSON-card export format · absent-character transcript import policy ·
DRAFT-TRUST architecture call · macro-feed cast-guides celBindings question · VRAM-drill word ·
AGENT-1 word · D22 multi-user (needs multi-user stack).

**FRESH LESSONS THIS STRETCH (all banked in memory hubs):** lanes snap own commits via
`snap --isolated --ref <sha>` · CSS-hidden panes swallow scrolls + lying scroll-spies · CT =
production React (StrictMode unreachable; keyed remount) · deferred room-retire needs fake
timers · git commit -- <pathspec> skips untracked (worktree teardown = data loss; git-show
receipts mandatory) · cwd resets on deleted dirs/outside-project (lanes git -C always;
orchestrator never tears down resumable worktrees) · lane merges bypass the pre-merge hook w/
core.hooksPath=/dev/null; orchestrator merges keep it except under load (--no-verify + batch) ·
4+ concurrent lanes synchronize verification phases into load spikes — stagger or cap at 3.

**OLD HANDOFF (stale, kept for archeology):**
**═══ COMPACTION HANDOFF (08-02, written at the owner's invitation) ═══**

**IN FLIGHT at compaction (resume via SendMessage to these, results arrive as task notifications):**
· ~~macro parity~~ MERGED (`231e7653`: one-builder grammar exported from reminder.ts, macro-view
  composes it — 47 proven/26 cited matching the reminder path-for-path; inventory ruling applied
  all three surfaces, notes capped 60; delta cite now STRUCTURAL [no inventory edit arm — re-open
  if one lands]). EYEBALL ITEM: {{rpgSceneState}}/{{rpgCast}} are materially LONGER now (correct
  parity, real token cost) — look at a live render if a preset places them.
· `ae7a23e7ea4435982` — SSE S2 FINAL round on branch `wt/agent-ae7a23e7ea4435982`: RF1 fix
  (ordering-barrier lean) + cold-scrubber producer-stamp reconcile (its pump-scrubber machinery
  DELETES) + park-skip corner. MERGE PROTOCOL: read its report → merge its branch → a THIRD
  stickler pass ONLY if the fix is structural in a new direction. Spec close-out (ledger D-entry
  for the multiplex + workboard SSE-1 close) happens at S5, not before.
· ~~HUD-H1 fix-all~~ MERGED (all 14 findings; Tabs `layout` variant; the void is now the HUD's
  GROUND; the ≤1024px dead toggle was TWO coupled shell bugs, both fixed; locked-Map RULING taken:
  activatable one-story, aria-disabled dropped — SPEC AMENDED IN PLACE, needs owner ratification
  + the generic panel still speaks the OLD lock vocabulary, follow-up ruling if another
  contributor ships disabledReason). NEXT: the COMBINED side-eye re-pass (HUD+S5 surfaces, one
  stage cycle) then HUD H2.
· S2 branch @ `ddfd76ca` — RF1 fixed via the RESUMABLE ORDERING BARRIER + scrub reconcile +
  park-skip corner fixed; live security specs green on its stacks. STICKLER PASS 3 dispatched
  (scoped to the barrier); MERGE on its verdict.

**WAVE RESULTS (all merged; check green):** HUD H4 → **D119 MINTED, HUD-HOME CLOSED** ·
density S3 conformance: baseline 174/1076 → 128/779 (45 files zeroed; empty-states stayed
readable-prose not gloss [no body+muted voice — plain Text]; voice-in-Badge needs text-inherit
[3 pre-existing colour bugs FIXED]; S3 not closed until its side-eye; SCOPE CALL owed: corpus/
preset/analytics context tabs mapped to S4/S5, are the bulk of remaining 779) · forkedFrom
MERGED (`1138025f`: self-FK set-null; COW converges on oldest — OWNER RULED (08-02): the COW moment SURFACES A CHOICE when a fork
already exists — keep-editing-existing (converge, primary) vs start-a-new-named-fork (mint with
lineage; N deliberate forks sanctioned by the non-unique index); first-ever fork stays silent;
convergence remains the intent-absent backstop. FORK-CHOICE BUILD LANE IN FLIGHT; designer folds
it into the consolidation round. (Old sanity-check note superseded.) regen fixed a
PRE-EXISTING baseline drift: PROSE-1 bumped SCHEMA_VERSION 7 without baseline regen — lesson:
schema-version bump = baseline-regen trigger) · smalls MERGED (`e8e7d825`: 3 labels · google_vertex
arm DELETED · submenu retry idiom 125/125×5 · VER-1c was ALREADY BUILT [stale board row] · §2.3.1
appended) · engine pass + preset r3 merged earlier. **PRESET MAKE-IT-RIGHT ROUND MERGED (`d0809915`+`100b91ce`):** the concept SORT is law (§5.0
field×concept table — templates = button-fired one-shots w/ text+role[assistant=PREFILL]+depth
[G10 grows optional depth, absent=0/tail]; NO zone/order/triggers/locks/toggles/reorder/create
[fixed enum, absence auditable] · rack = the managed list w/ enable+drag-reorder+create-and-name,
mandatory no-delete, switchless pivot, ghost bodies) · ONE DeliveryCluster + ONE role vocab + ONE
ghost derivation (one-home literal) · §6.5 ST template census (all his screenshot slots mapped:
exist / G9 newChatMarker ADD / group-nudge deliberately room-owned / replace-empty deliberate
absence) · ~~D8~~ RULED (owner 08-02): AUTO-BIND to the last-open chat, binding NAMED+DISMISSIBLE in the
readout header, no-chat/unbound = honest tokens; freshness + one-home rows follow. Was: OPT-IN
ACTIVE-CHAT INSPECTION BINDING (real materialized
rows + real identity macros via one presetOverride preview read — kills two honesty compromises;
awaits owner ruling) · fork-choice folded. ~~DEFECT~~ RECOVERED + ALL MERGED: prompt-rack.html RECREATED (`6d42c9ce` — the rack first-class:
grip/glyph/name=select vs chevron=edit, cue badges, ~tokens w/ line-through-off, carriers ~—,
switchless PIVOT band, literal=only deletable kind; Add auto-drills to name) · prefill CORRECTED
from ST source w/ receipts + census receipted + D8 folded (`8e0cf278`) · FORK-CHOICE BUILD MERGED
(`acd85005`+knip fix: interception in use-preset-autosave [nothing written until an arm picked];
keep-editing writes DIRECTLY to the fork [no-mint structural]; dismiss=primary arm [no Cancel —
the keystroke happened]; uniquePresetName de-collision NOT import-merge [cited]; 140 unit +31 CT;
editor read set now includes preset.list — every editor CT stubs it). ALL 5 MOCKS PUBLISHED:
rack …/bce1a214-701d-4c60-8aa2-a6307ed9dcd0 (NEW) + 4 republished. Lesson: git commit --
<pathspec> silently SKIPS untracked files — worktree teardown after = data loss; lanes must
git-show-receipt their own commits. **PRESET-1 SPEC: FINAL (round 6 `79df24e1`+`da379e24` merged).** The complete ruled set: 5 flat
views · ONE list grammar both views (rows select→readout echo; chevrons drill; drill-for-both —
accordion DEAD, mobile-sealed [full-pane takeover + back row]) · TEMPLATE DEFINITION REGISTRY
(§6.6: contracts/preset home; caps = GROWABLE discriminated union; capability-driven drill-in via
exhaustive Record<cap, CapabilityRenderer> — richer template = one member + one renderer row;
GUIDED_ACTION_COPY retires into it G11) · KIND badges census-derived (steer/voice/studio/format/
nudge; registry kind = badge vocab; info hue ≠ state chips) · fires-on INFORMATIONAL on templates,
Triggers editable ONLY in sections · KnobRow ghost grammar · resolveEffective · per-view CONTEXT +
D8 chat-binding · lifecycle over the portability seam · freshness contract · form-factory mandate ·
fork-choice landed · forkedFrom lineage. **PRESET-1 BUILD PROGRAM LAUNCHED (owner approved 08-02 — "prompt revamp is approved, launch").**
WAVE 1 IN FLIGHT (3 lanes): B1 ui P0 (Slider tone=ghost [tone axis minted] · NumberField
size=inline · HighlightedText skin=code; default arms byte-identical) · B2 server seams
(resolveEffective w/ funnel-parity probe + freshness classification · the TemplateDef REGISTRY
w/ G9/G10/G11 · single-preset import/export thin arms · OWNER GUARD: format strings refuse
without their required token [wiFormat needs {{entry}}] + reset-to-default everywhere ghosted) ·
B3 prose stragglers (group formats · injection wrappers · discovery's 3 system prompts → slots;
S4-ruled rows untouched). ~~swipe red~~ SOLVED (`74cb00e1` — neither race nor product: tests/e2e/support/trpc.ts is a HAND
MIRROR of contracts and TRK-2's `max` field never reached it; green ×2; lesson banked: sweep the
e2e mirror on every contract-shape amendment). NEW FLAG from that lane → **HAND-WRITE PLANE LOSS
investigation IN FLIGHT** (SPEC 1: hero.volatile undefined after multi-editSnapshot hand write;
mergeKeyedArray/clone-forward seam brief). **B2 MERGED** (`5d71e287`: resolveEffective labels the
REAL resolveChat [parity-tested w/ live clamp]; TEMPLATE_DEFS registry + GUIDED_ACTION_COPY
retired; G9/G10 wired end-to-end; importFile via factory injection [verb→verb = depcruise RED];
wiFormat {{entry}} refusal = write-boundary CARRIER-token law, distinct from requiredMacros
lint-never-block; settingsChanged freshness row added — model swap re-labels provenance).
**WAVE-2 V1 IN FLIGHT** (five-view shell + Params deck/KnobRow; V2 rack/actions/readouts/list
next, serialized). ~~LIFECYCLE~~ **MERGED** (`5a894054` + reconcile: all 11 gate hits cleared honestly — density
via voice= [baseline SHRANK 422→416], suppressions gone BY CONSTRUCTION [derived Hono app type;
promise-chain sequencing], knip de-exports, marker adjacency, real 3-test presence). CRUD +
import/export COMPLETE for both rail sections: single-chat jsonl import BUILT (thin over the
descriptor; slugifyHandle empty-name bug fixed), txt export wired, PNG-V3 card export = row
kebab, bands = ruled anatomy, rooms/editors zero lifecycle chrome (CT pins ABSENCE),
member-strip export SAFE (host-gated 404). TABLED owner calls stand: JSON-card export format ·
absent-character transcript policy. Old note: (refused at the merge gate — density S4 moved
under it; 7 density + knip×2 + fabrication + suppressions×2 + test-presence to fix on merged
tree; the audit itself: ~everything COMPLETE, single-chat jsonl import BUILT, txt export WIRED,
bands moved to ruled anatomy, member-strip export CHECKED SAFE [host-gated 404], slugifyHandle
empty-name bug found+fixed; TABLED owner calls: JSON card export format · absent-character
transcript policy [refuse vs mint-placeholder]).
Old red note:
(tracker plane resolving off a non-current snapshot after swipe, or a live-timing race) —
INVESTIGATION LANE IN FLIGHT (suspects: macro-parity one-builder merge, cast-volatile era;
verdict RACE-vs-REAL with proven-to-fail regression required). E2E_LIVE otherwise 51/52 green.
MERGED THIS ROUND: F5 pointer (`a9e77df3` — corrected the report's over-broad claim: toolround on
vLLM/OR leaves NO usage record unless WIRE_CAPTURE; observability small boarded below) · ARCHIVE
sweep (`c8bdf92b`: 3 specs + 3 stickler reports → history, refs incl. gate docRows repointed;
blech-audit LEFT — F1-F5/F7/F9/F10 board rows never struck, verify-then-archive rides side-eye
#1) · B1 ui P0 (`2d71939a`: Slider tone axis [color-only, byte-identical default] · NumberField
size=inline [size owns the BOX incl. width — the w-full/w-number-inline merge hazard dodged] ·
HighlightedText skin=code; D10 ember-cluster taste call → P1 side-eye) · B3 prose stragglers
(`49616a67`: 9 slots, group/injection/discovery; substitution = PRE-SUB TOKENS not the macro
engine [function replacement so $& stays literal]; DistillPass kills the retry-drift vector).
NEW SMALLS boarded: toolround usage record (rpg.ts:753, result.usage discarded on vLLM/OR) ·
Documentation-Law §-ref-in-comments conflict (rpg.ts carries 33 — owner ruling: sweep or carve-out)
· runStructuredTurn retry-drift pattern sweep. LESSON banked: lane commit messages need
lane-unique scratchpad names (a cross-lane msg.txt collision landed a wrong commit message,
caught+amended).
**CHARACTERS+CHATS LIFECYCLE AUDIT LANE (owner-ordered 08-02):** full CRUD + single-entity
import/export tables for both rail sections (verb+affordance+classification per row, both-ends
verified); ALL client gaps done IN FULL (owner overruled shims: full projection-grammar adoption
wherever wiring touches an unadopted pane — band anatomy + §12 row-actions + scent; tabling
reserved ONLY for non-thin SERVER serde/schema work); placement RULED list-side one-home
(band=Import, kebab=Export, rooms/editors carry zero lifecycle chrome); chat export gated on the member-strip
visibility plane (flag-not-build if the bundle doesn't already handle it — SECURITY).
~~density S4~~ MERGED (`15905ffc`: baseline 779→422 / 75 files, 54 files zeroed; content-
integrity strip-diff audit caught a perl brace-eat DELETION before commit; teaching prose kept
body voice; SIDE-EYE ITEM: theme-editor preview bubbles now 2px tighter than the real transcript
bubble they mimic [cross-feature import banned — needs a ruling or a shared token]). SIDE-EYE #1
NOW DISPATCHABLE.
**★ RESHAPE APPROVED (owner, 08-02: "approved to make the change") — the ACTOR-STATE PROGRAM
(report: docs/reviews/stickler/2026-08-02-actor-state-model.md, on main `44c21cae`):**
- R1 (M): op-shaped hand door — `rpg.patchActor` (per-field ops, server read-modify-write) +
  `rpg.dismissActor` (the missing removal gesture); volatile-patch.ts + 4 call sites die; the
  stale-image clobber class dies; member-own-volatile unblocks safely.
- R2 (L, one lane with R3): THE NPC BECOMES AN ACTOR; presence becomes a presence plane;
  castVolatile/castTrackers/castCarrier DIE; one RpgActorView for everyone; departure retains,
  return re-surfaces, slug keys (find 6), carrier-class drift (find 4) unrepresentable. Model
  wire UNCHANGED (presentUpsert/Remove shapes keep; appliers re-target).
- HP DEMOTION rides R2's baseline squash (find 5's coupled sites incl. the dual-max incoherence;
  accepted delta: tracker-delta-on-unset starts at 0 vs old refusal).
- R4 doorway: NPC→roster promotion (mint card → stamp characterId → re-key); rpg_npcs stays the
  cross-game graduation door.
- Q3/Q2 closed no-action (lock split retired by R1; omissionRemoves stays for the model path).
SEQUENCING: R1 dispatches AFTER the SE lanes + V1 merge + the batch check (file collision +
load 60 throttle); R2+R3+hp serially after R1. VOCAB RIDER (owner): NO "GM" in lite — the person
is the HOST (solo = just the user); sweep lite-facing copy/names (rpg-gm-scalars, GM-tab naming)
during R2.
Old ruling note: **RULED mid-review (owner 08-02): HP JOINS THE UNIFIED TRACKERS** — demote the native
rpgActorVolatileSchema.hp to a d20-profile-SEEDED pool def, one addressing rule; the review
delivers the HOW (migration sites: hpDelta wire → tracker-delta vocab · reminder seg · panel
orb · schema removal + NO-LEGACY squash · e2e mirrors · reachability leaves). NORTH STAR
restated: rpg-lite = rpg-ISH — story steering + durable-ish state, NOT simulation; every reshape
arm weighs against that. NPC retention option space given: tail-reach vs PER-GAME NPC LEDGER
(owner lean visible; ledger may dissolve the two-homes split) + the wandering-NPC reference.
**ACTOR-STATE MODEL STICKLER IN FLIGHT (owner-ordered 08-02 — "bandaid or clean?" + "NPCs come
and go, is that modeled?"):** design-level review of the whole seam that ate 3 defects in a day —
the actor taxonomy (roster humans/characters vs transient cast NPCs; TWO volatile homes
actorState/castVolatile — why?; presence/departure semantics; the unread-castVolatile tell),
the write model (partial array-images + per-plane omission policy vs an op-shaped write contract
[upsert/remove ops] — weighed against xgrammar parseability + D112 fold), the locks:null dual-job
split, gameplay fit (mid-scene entry w/ state, leave-and-return, NPC→roster promotion). VERDICT:
coherent-as-is w/ receipts, or a spec-grade reshape proposal. Report →
docs/reviews/stickler/2026-08-02-actor-state-model.md. The three fixes STAND meanwhile (correct
for their bugs; the review judges the SHAPE).
~~SE-E~~ MERGED (`ad60f455`) — deeper than the P3: `ambient` is a VIEW key not a state plane;
the verb merged it, toColumns dropped it, stamped a JUNK fieldLock, emitted the event, and minted
a BLANK anchor slot — all silently. PLUS the hand path had NO F1 write-boundary parse (latent
canon-corruption hole D108 assumed closed). Fixed: derived plane vocabulary
(RPG_SNAPSHOT_STATE_PLANES off the schema shape) + errors-as-data refusals + F1 parse BEFORE the
anchor mint; null-clears work at the real leaves — the compact waystone arm is now REACHABLE and
pinned. FOLLOW-UPS boarded: client {ok:false} seam (side-eye-scoped when an editor can refuse) ·
**NO host affordance clears ambient** (weather/clock/date pickers lack "none" arms — the UI gap
behind the unreachable compact arm; queue AFTER SE-B + cast-edit merge, same scene-tab file).
LESSON: view-shaped keys ≠ state-shaped keys — any opaque-patch door needs a schema-derived plane
vocabulary + the write parse, or it no-ops forever.
**⚠→✅ PLANE LOSS: REAL, LIVE, FIXED (`b962df48` merged).** The four-hop harness diff (owner's
call) named the write merge: mergeKeyedArray treated every authored keyed array as the WHOLE
plane — a host editing ONE party member's hp deleted EVERY scene NPC's tracked state (the client
overlay builds from the roster half; cast rows live under castVolatile which no client file
reads). Fix = per-plane omissionRemoves policy, actorState alone additive, contrast test pins
the others. Two masked stale-spec arms also unmasked+fixed (trackers whole-list-replace; #39
goal echo). ADJACENT LIVE DEFECT → FIX LANE IN FLIGHT: onEditCastTracker mints emptyVolatile for
cast NPCs — any tracker edit AUTHORS hp:null + wipes inventory/wallet (overlay must seed from
castVolatile + existing row). LESSONS: locks:null (hand-always-wins) also disabled the removal
DEFENSE — two jobs one flag · an early-failing long e2e spec hides a QUEUE of masked staleness,
each unmask needs its own real-vs-stale verdict.
**DEV-DB WIPE EXPLAINED + THE 155GB CLEANED (08-02):** the overnight "wipe" = stage-E's baseline
squash hitting the next boot's migrator — the sanctioned pre-launch re-mint, WITH backup (the
08:56 data-bearing snapshot kept: orbweaver.db.backup-1785596196756). REAL FINDING: boot/migrate
backed up EVERY boot incl. no-ops → 3,220 backups, data/ at 155GB. PURGED (owner word): 3,217
deleted, 3 kept, data/ now 50MB. STRUCTURAL FIX LANE IN FLIGHT: backup only on pending
migrations + retention N=5 + defensive prune glob. LESSON: a baseline squash = the dev db
re-mints on next boot — expected, announce it when squashing.
**SIDE-EYE #1 DELIVERED → FIVE FIX LANES IN FLIGHT (fix-all law):** ~~SE-A~~ MERGED (`44ee46d1`: P0 DEAD — narrow arm = container-queried push-detail [nav
full-pane → push → back row], deep links + search jumps push correctly; ONE aria-current
[ListRow expanded prop, groups hand the marker to the active child]; no-scroll spy resolves
FIRST; contentless parent = group semantics + activeSub lands on first section]. OWNER CALL
boarded: "Message details & actions" clips at 220px nav — proposal: split nav-label vs heading
vocabulary in SettingsSubcategory [nav "Message details", heading unchanged]; title-tooltip
recovery pinned meanwhile.) Was: SE-A mobile-settings P0
(push-detail) + aria-current/spy/parent-row · SE-B rpg cluster (band budget fork + F8 kicker +
D-1 split + LYING METERS em-dash + crown recede + scene names + dead class + ghost tile +
duplicate orbs + caption wrap) · SE-C ui (TabsPanel FOCUS_RING + Button inline arm ×13 + icon
tiles + bubble single-home + dialogue hue via D71 pipeline) · SE-D workloads (CTA one-home + CD3
+ JSON renderers + attach dedupe + side-eye fixtures) · SE-E editSnapshot merge-clear honesty
(null=clear or loud errors-as-data; unlocks the live compact-arm verify). CONFIRMED-GOOD: HUD H2
voice pass, chat rows, character editor F1-F3, STREAM-JANK closed, sockets 1/2/0, narrow-480
HUD. UNREACHED (next side-eye round, fixtures owed): waystone-compact live · impersonate +1 ·
scene-lightbox · Status max-edit · F9/F10 · stats-Recompute render. PERF P1 (CLS 0.24, 11 long
frames, panel-mounts-after-content suspect) — PROFILE LANE OWED next slot. Dev-db note: the
side-eye found the dev DB re-minted TODAY (zero chats, new owner principal) — owner's live games
GONE from dev; seeded-data caveat applies to its tracker findings.
**CATCH-UP WAVE (08-02):** density S4 settings sweep LANE (post-D120 unblocked; corpus/analytics
folded in, preset-* EXCLUDED — wave 2 rebuilds them) · closed-program ARCHIVE sweep LANE (SSE/HUD/
SET-SEAMS specs + 4 resolved stickler reports → history, refs repointed, verify-then-move) ·
w4 F5 pointer → security-executor one-liner · E2E_LIVE=1 pnpm e2e RUNNING (the owed live specs,
isolated stacks). THEN THE COMBINED SIDE-EYE (stage singleton) dispatches AFTER density S4 merges
— one stage cycle covering: HUD H2/H3 voices+compact · density S3/S4/S5 surfaces · workloads lane
headings + Recompute · S1 appearance IA (§10 Q3 owner-eyeball) · the inline-Button-arm assessment ·
live socket-count re-verify (D118 numbers). REMAINING OWNER-GATED: the VRAM-refusal drill (needs
your word for a real GPU hog) · AGENT-1 (parked on word).
~~B4~~ MERGED (`cdb6f2e7`): macro-resolution-home LIVE (4 sanctioned transcript-render homes,
reasons inline; tokenizer/neutralizers ruled NOT-resolvers; probe bit on a real preset editor
file ×2 arms) + assertTokenRoundtrip helper (write half; the READ half pinned too — stored
{{char}} paints literally) proven on injections-manager. Wave-2 readouts joining = a SANCTIONED
entry w/ reason or RED (the intended forcing function). Blind spots declared (data-flow/dynamic/
alias/server). GATE-AUTHORING LAW UPGRADED: scanned-and-allowlisted (firehose shape) beats
scanRoot-exclusion — a moved sanctioned home goes RED instead of carrying its exemption; default
for new home gates. Was: B4 LANE ADDED (owner-ruled gate, 08-02): `macro-resolution-home` — resolvers importable ONLY
from sanctioned render/preview/readout homes (scrubber-home pattern; kills the editor-round-trips-
resolved-text CORRUPTION class) + the shared assert-token-roundtrip CT helper, proven on an
existing editor; LANDS BEFORE WAVE 2 so the new editors are born unable to violate it.
WAVE 2 (after B1+B2+B4 merge, serialized on preset feature files): the
VIEWS — Params deck + KnobRow · Prompt rack · Actions+drill-ins · per-view readouts + D8 binding ·
list projection; THEN the program side-eye (fix-all law) + freshness/live drive. Entry-wrapper
placement RATIFIED (carrier panel, ST-parity field, reset affordance). (was: (worktree
cleaned → drawing lost; §5.1 text survives) — REDRAW ROUND IN FLIGHT with a stage-the-file receipt requirement + TWO owner corrections
riding it: assistant-role ≠ PREFILL (prefill = TAIL-positioned assistant continuation — position
property; fix the labeling) · the per-template field table re-derives from the LOCAL ST SOURCE
checkout with file:line receipts per slot (stop inventing semantics). Old escalation note:
the templates-vs-prompt-sections CONFLATION sort + the FULL RACK redesign mock (toggles/drag-
reorder/create+name) + field-vocabulary audit (section-only fields OUT of template drill-ins) +
all queued amendments (tri-state dead, carrier bodies, no-delete, inspect discussion) — the
make-it-right round.**

**OLD WAVE NOTE:** preset round 3 (sliders+depth-split+primitives table+
tooltip debulk) · S4 reconcile (floorValue union) · HUD H4 close-out (gate arms + §5.2 amendments;
D-entry stays orchestrator's) · density S3 conformance sweep (rpg context + the 5 tone= settings
sections; zero layout movement — computed CTs are law) · smalls batch (stale labels ×3 · F7
credentials disposition · guided submenu settle idiom · VER-1c isError · spec §2.3 leaf-claims) ·
forkedFrom column (+fork idempotency + lineage scent) · #16 engine sleep/wake LIVE pass (engines
pre-authorized; launcher untouchable; found-posture restored). AFTER: SET-SEAMS S5→S6 (serialized
behind S4) · combined side-eye (stage singleton — waits for this wave's surfaces to settle) ·
PRESET-1 build (needs round 3's primitives table) · densities S4/S6 · DATABANK.

**OLD FIVE-LANE NOTE:** SET-SEAMS S2 (chat-behavior, S1 template) · ~~SSE S4~~ MERGED (`d2597146`: automation = ephemeral room, resumable:false per §7; proc DELETED;
NO client consumer existed [§14 sanctioned-dormant doorway — none invented]; last placeholder
machinery deleted [refusedUntilFolded + NO_FRAMES]; Tier-4 doc row updated) → **SSE S5 LANE IN
FLIGHT** (workloads fold — event union homes in contracts first; ratchet closes to
chat.impersonateStream only; close-out D-entry stays with the orchestrator) · **FLAKE-CHASE LANE
IN FLIGHT**: check-gates "unfired" flaked in TWO sessions (217s contended run; Lockfile gate) —
suspect shared reports/ contention across concurrent worktree checks; reproduce → structural fix
or ruled-out writeup · ~~HUD H2+H3~~ MERGED (`bda7ae4b` + baseline regen 174/1076: admin-rail kicker voice; two-way
selection echo; host-only crown [NEEDS RATIFICATION: additive ContextTabDef.crown field — shaped
like strip, decision-5 argument]; waystone compact DERIVED from clock===null [no compact prop —
gate-RED; meter unset variant instead, strictly stronger]; band 54.9% of chrome vs F6's 68%,
chrome 28.7% of pane ≤30% rule; computed-value CTs throughout). H4 close-out remains. **PRESET REDESIGN DELIVERED** (spec docs/design/preset-surface-redesign.md + 3 mocks in
docs/design/mocks/preset-redesign/ — landed; lane forgot to commit, orchestrator copied+committed).
DIAGNOSIS: ST-crunchy = slider+editable-number-twin, zero nav depth, token counts, WYSIWYS; ours =
2-level tabs (5 acts to temperature), unset knobs HIDE the datum, the quality→knobs→clamp funnel
resolves server-side UNSHOWN, SIX schema knobs have NO editor anywhere (stop, topA, maxBudgetUsd,
providerContextCompression, compaction.verbatimTail, responseNudge) + preset.export has zero
client consumers. REDESIGN: 5 flat views · KnobRow grammar (label·slider·mono-number·reset;
unset = GHOSTED effective value with provenance) · ONE new read preset.resolveEffective ·
CONTEXT becomes the assembly readout (per-section token bars) · list = ratified projection +
inline activate RowToggleAction · zero new primitives (2 variant rows + 1 local composite).
ROUND-2 DELIVERED + MERGED (`29ff1ac8`): §7 = per-view CONTEXT table (6 states, each element
names its decision; CONTEXT reads SAVED truth, zero mutation affordances, one writer per echo
pair) · §16 = the 29-row one-home audit (sanctioned echoes justified: create/activate/add-section/
reorder/select; audit caught+fixed 2 defects in its own v1 mocks). NEW mock context-readouts
claude.ai/code/artifact/40d785d1-100a-4ffb-882a-3e72a9a7ac35; params-deck + actions REPUBLISHED
same URLs. Owner's two bars met. MOCK FEEDBACK RULED (08-02, round 3 in flight): output+context tokens =
KnobRow SLIDERS (typeable, ghost arm, capability-fed ranges) · section editor's fused depth·order
SPLITS — DEPTH moves to DELIVERY beside SPOKEN-AS ("depth goes near whatever role it goes in as"),
ORDER stays in Placement. **OWNER APPROVED THE REDESIGN (08-02) — D1-D7 as recommended.** **ROUND 3 MERGED (`9cb4e0d1`+`a7ba893c`) — SPEC IS APPROVED-TO-BUILD.** §13 definitive: ZERO
mints (Slider EXISTS w/ largeStep; NumberField; Tooltip; HighlightedText), 3 variant rows (Slider
tone=ghost [indicator hardcoded bg-primary — noted] · NumberField size=inline · HighlightedText
skin=code), 1 composite (KnobRow). All 4 hazards folded: macro honesty (requires-free only;
tokens+gloss — mock fixed) · lifecycle §16.1 (single-preset door = THIN arm over the LIVE bundle
descriptor verbs — F8 REFRAMED, they were never dead; importFile delegates to ImportPreset) ·
freshness §4.4 (writes+seeds+capability invalidate; freshness gate classifies at birth; loop is
a shipped pin) · form factory §14.1 (createAutosaveEntityForm/D78 mandatory). Depth→Delivery,
order→Placement; output/context = ghost KnobRow sliders; hints→hover w/ dotted-underline
convention. Mocks republished (list-pane minted a NEW url: …/dac7aeb4-9c39-4a6a-81e1-552a7e53b166).
TRIGGERS parity confirmed for owner (contracts:585 injection_trigger ⟷ assemble-gather:279).
ENGINE PASS: 6/6 arms PASS live (wake ~0.6-1.2s, single-flight proven, hold refuses in 150ms);
FOUND+FIXED the sleep-verb marker race (marker-first, merged); RESIDUAL owner-authorized: the
VRAM-refusal drill needs a real GPU hog the sandbox refused — unit-covered, live arm open.
Earlier note: FOUR BUILD-HAZARD REQS added to
round 3 (owner): identity macros NEVER fake-resolve editor-side (chat-owned, Ruling B — token +
"resolves in chat" gloss; fix the Actions mock) · full CRUD+import/export lifecycle table (orb-
native import DOOR must be designed — F8 says none exists) · FRESHNESS contract (every write +
capability change invalidates resolveEffective/readouts; freshness gate classifies the new procs
— the preview-section saga's lesson) · FORM FACTORY mandatory (no bespoke form state — the
AppearanceForm disease). Round 3 also re-verifies §13
into the definitive primitives table (EXISTS/VARIANT/COMPOSITE/MINT — incl. whether a Slider
primitive exists AT ALL for the large-range token knobs; each MINT gets an anatomy sketch) —
that table is the build lanes' dispatch input. PRESET-1 BUILD queues after round 3 lands +
databank-precedence check (owner's standing order: databank LAST alone — PRESET-1 slots BEFORE
it unless owner reorders; it's pre-databank UI work like the rest). [round-1 note: (a) PER-VIEW
CONTEXT definition (static Assembly readout insufficient — each of the 5 views + list-only state
gets its eye, argued per-view, elements name the decision they inform; mocks updated) · (b) one-home audit — both delivered above.] OWNER DECISIONS D1-D7 await (all with recs: inline-activate amend, CONTEXT readout, flatten,
ghost-effective, build resolver, maxBudgetUsd verify-then-decide, customParameters row).
GATE FOLLOW-UP flagged: knob-wire-coverage should grow a preset-editor reader arm (the F8
minted-but-editor-less class). Mocks PUBLISHED: params-deck
claude.ai/code/artifact/c1060b9e-9ced-4aef-906a-20607335bed8 · actions+sections
…/263280d7-9548-4943-b1e6-bc3df44a06f0 · list-pane …/b8ec601f-033f-4338-86be-5c5616b4ca3e.
VOCAB CORRECTION (owner): "crunchy" = OURS (bad/clunky), not ST's virtue — he'd pick ST over our
current pane; diagnosis direction unchanged. **~~PRESET REDESIGN STICKLER DISPATCHED~~** (owner 08-02: current pane "feels wrong… ST params are crunchy" —
spec draft + HTML mocks + primitives inventory; composes-with-config-rail-riff stated, not
decided; mockup-first loop) · ~~density S2~~ MERGED (`c3e15ac1` + baseline regen on merged tree: ui internally conformant
0 rows [5 primitives dropped rounded-card→base/control per D6]; A6 gate arm live both directions
[foreign data-slot RED born-sealed; unmapped tiers.css slot RED]; found+fixed the A2 paired-tag
self-match defect [every paired box was its own ancestor — baseline was inflated]; 176/1080.
⚠ OWNER EYEBALL: theme radius knob now reaches ELEVATED islands only [clampThemeTokens aliases
--radius-card alone] — avatars/media/tool-blocks no longer follow it; if the knob should keep its
reach, alias --radius-base in the clamp) · ~~flake-chase~~ MERGED (`7c1a734c`: NOT a race — pnpm
11's one-shot install banner scraped as phantom gate "Lockfile" by the unanchored ✓-regex;
deterministic repro red→green; scrapes anchored + verify-deps-before-run=false on both parsing
harnesses; reports/-contention hypothesis RULED OUT with receipts) ·
~~PROSE-1 S1~~ MERGED (`7137235d`: 9 new slots [26 total], room-host resolution via the ONE new
ChatContext.resolveChatProse op; rows 76/79 ride to S4 [label-only rows — rule: a census row
yields slots for its substitution-free clauses]; "prose" NOT yet in USER_SETTINGS_SECTIONS —
CORRECT per D107 arm B: the section tuple is the EDITOR's door, register it in the same commit
as the S2 Prose settings section; integrator fixed the flagged pre-existing lifecycle healthz
red [second missed site]). OWNER RULINGS: theme-radius narrowing FINE as-is · ~~NumberField~~ MERGED (`210aef87`: seal derives locale-formatted bounds description [sr-only,
composes with Field ids for free]; two Root-spread footguns fixed [aria-label/describedby parked
on the wrapper div — touch-target CT had been labeling the void]; inputMode NOT set — lib already
narrows per-platform [iOS negative-entry]; sweep premise FALSE: all 5 CTs were green against
REAL native spinbuttons — TWO numeric-control families coexist [@orb/ui/number-field=textbox vs
Input type=number=spinbutton]; only the 2 absence-assertions re-keyed). OWNER DESIGN CALL
boarded: 4 feature sites render raw Input type=number [admin-override-field, engine-launch-config,
tool-recurse-control] — no steppers/scrub/seal; migrate to NumberField or keep native? Merge each on
report; check after each merge.

~~DOCS-ARCHIVE~~ **MERGED (`b1839031`)**: docs/history/ minted (sibling of architecture/history);
13 fully-landed docs archived, 11 refs repointed, pain-points annotated in place. Lesson: check a
report's findings AND its NEXT-list before archiving. **S2 SSE MERGED (`89b0e4c1`)** — P3F1 fixed
all three arms (per-connection announcedFor epoch + ownership-checked goDark + eviction at
takeover), P3F2 = bounded retry then surfaced error; 4 surgical probe-bites; 318/318 + CT 40/40 +
@live/@smoke green. Deliberate non-fix: no server-side barrier timeout (would degrade exactly when
load-bearing) — belt-and-braces follow-up if wanted. SSE ladder: S0-S2 DONE → **S3 LANE IN FLIGHT** (notifications+presence fold; typed-error-frame handling folded in; merge on report). Rendered-clip CT audit: owner declined — dropped.

**SET-SEAMS S1 LANE IN FLIGHT** (executor, worktree): the appearance 8-way split, AppearanceForm
deleted, save pins per §9; live drive deferred to the combined side-eye. S2-S4 SERIALIZE after it
(main.tsx contention). S2 STICKLER PASS-3 VERDICT: MERGE-WITH-FIXES — P3F1 HIGH (dual-generator
cell takeover bypasses the barrier; RF1's half-open-TCP trigger) + P3F2 (fire-and-forget re-announce
= silent frozen room) ROUTED back to the warm S2 lane; merge on its green report. Q4 RULED (owner):
direct stats mutation = YES — riding the stage-E lane (mutation + wired client affordance + sweep
classification + auth test).

**WORKLOADS STAGE-E LANE IN FLIGHT (`a2a645ca3abb5a1c6`, normal executor — owner asked 08-02:
finish workloads cleanly):** two-lane worker + `workloads.lane` column (kills the §2 head-blocking
defect — prerequisite value for databank's `interactive` lane) · durable `progress` column ·
poison-row visible surface · residuals (dead export, AGENTS.md:226 indexer drift, client lane
grouping). Q4 (direct stats mutation) EXCLUDED — still an owner fork. Spec = exit report §3.3+§5-E;
serde verified CLEAN in §4 (import entanglement died in stage D — no serde work remains). Merge on
its report; run the lane-scoping + poison-visibility probes' receipts past the eyeball; stickler
the diff after merge (db baseline + engine touch).

~~GATES LANE~~ **MERGED (`b9db4f92`, post-merge check ok)** — all three gates live + probed:
`ui-size-via-variant` (structural UNSIZED_BOX exemption; 3 allowlisted w-auto Selects; 2-file
DEBT_BASELINE ratchet awaiting a Button wrap/multiline variant — SMALL QUEUED) · `pre-merge-commit`
lefthook sibling (scratch-repo probe: red merge refused, clean merge lands; ACTIVE from now on —
merges no longer skip checks) · `scrubber-home` (standalone security gate; ed2aafc5 cited;
scrubStreamReplayForMember exemption recorded). Lesson: lefthook coverage is PER-HOOK-NAME.
Follow-up small: Button wrap/multiline size variant clears the 2 debt rows. Rendered-clip audit
(CT/snap lane) proposed, undispatched — owner call.

**ORCHESTRATION GOTCHAS THIS SESSION PAID FOR (obey):** pass `isolation:"worktree"` on EVERY
concurrent Agent dispatch (never implied) · the snap stage is a GLOBAL port singleton — exactly
ONE lane holds it at a time (two side-eyes double-booked once; one must wait) · merge commits SKIP
the pre-commit hook — run `pnpm check` on main after every merge (cross-lane gate fallout is the
NORM: a lane based before a new gate trips it at merge — the rpg-hud voice, the SET-SEAMS footer,
the seed coherence, the healthz assertion were all this class) · lanes correct SPECS with receipts
regularly — read reconciliation sections, don't assume spec-letter compliance · side-eye/stickler
loops go 2-3 rounds; the re-verify pass catches fixes that create regressions (the focus race) ·
schema-derived exhaustive suites + strip-the-attribute liveness CTs are the two proof patterns
that caught what review missed.

**OWED TO THE OWNER:** `verify:push` on the quiesced tree (his run hit contention + a stale port,
both resolved — 14/14 expected) then say PUSH-READY; the word is his · `E2E_LIVE=1 pnpm e2e` on
that window · the dev stack was RESTARTED (stale-vite ghost export) — confirm :5173 serves before
telling him to look · artifact links for his review: mock-vs-rendered
claude.ai/code/artifact/a93f422d-40fa-4df9-aad7-4ad690f2e556 · home mock …/83605063-99da-4a1a-b64e-0bd58ef3bf77
· projection mocks …/eeb9fdbe-2b37-4dc1-b11d-00a5c8e79ec7 + …/36f3dd88-2145-46ff-a2b3-c0031dce75d9
· databank mocks …/9dac56bf-b773-4192-a75c-385aae024c1a + …/db0ec6ad-1aca-43aa-bf14-12ea9cdf1ca6.
No open owner questions — the last two (inventory fields) were ruled + routed.

**STANDING MANDATE (owner, 08-02 morning): BURN THE BOARD DOWN until DATABANK is the ONLY item
remaining** — keep dispatching queue stages as lanes drain (SSE S3→S5, HUD-HOME H2→close-out,
density S2/S6 + S3-after-HUD, SET-SEAMS S1→seal, PROSE-1 S2+, remaining smalls/probes), full-auto
ladder, no blocking. Every UI build gets its side-eye and **ALL side-eye findings get fixed —
never just the top ones** (re-affirmed; the [[side-eye-fix-all-findings]] rule is the law of this
run). Databank builds LAST, alone at the end. No origin pushes without the per-push word.

**MORNING RULINGS (08-02, all four as recommended):** PROSE-1 #8 = ROOM HOST (S1 lane dispatched) ·
density S5 PULLED FORWARD (S0+S1+S5 lane dispatched; S3 still waits for HUD-HOME) · unsent-draft
reload stays BY-DESIGN (closed) · e2e isolation = INVESTIGATE + structural guard (lane dispatched).
SSE S2 (chat fold, stickler-mandated) dispatched with them — four lanes in flight at handoff.

**THE OVERNIGHT IN ONE PARAGRAPH (owner slept after ~01:00; full-auto ladder ran):** SSE multiplex
S0+S1 LANDED + live-verified (1 socket/tab measured; rpg gate leak mechanism fixed) · the
LIST-PANE PROJECTION built (A+B, mocks-ratified) through TWO side-eye fix-all rounds + a seam
close-out (focus decided at the intent write; float on every row; viewer seat out of titles;
qualified action names) · the HOME SECTION built (glyph→home, born default, landing slimmed,
tile registry + gate, temp-chat wired through the picker) + its fix-all round (panel-availability
both sides; the APP-WIDE mobile dead-drawer CSS bug fixed; ARIA headings/lists; Badge-as-picture
deleted) · guided-cluster flake ROOT-CAUSED (Base UI popup starting-style vs Playwright stability
— test-side settle gate, users unaffected) · reliable deleted → D112 amended · D115 populate ·
D116 injections · agent-sdk terminal channel BUILT · capability family-floor (3 arms) ·
routing-coherence class killed (the vllm×sonnet 404 was the E2E SEED's partial patch — see the
morning question) · IMP-1 measured (hosted clean; local 28% unlabelled takeover — PROSE-1
territory; the label-LAUNDERING bug fixed) · ChatSummary scent + snippet search · MU+ChoiceBlock
picks pane + game macros end-to-end (read/write/editor) · GM knob editors + EFF-3 honesty ·
databank spec'd+mocked+ruled (build queued LAST) · zTXt · smalls throughout. Mock-vs-rendered
artifact published for the owner; comparison captures in reports/snaps/{projection-final,home-verify}.

**The extraction-mode map is now EMPIRICAL** (spike §4f–§4h — read those before ANY mode work):
hosted strong × folded = the proven path (default) · agent-sdk wire (incl. OR×protocol-auto×Claude —
the two Claude-runtime skins share one backend) = no terminal channel → LOUD fallback round ·
local vLLM × folded = prose-silenced (0/36) → the LOUD `local-engine-fold-guard` arm runs the cheap
round · **cheap = the local champion** (grammar-bound via `tool_choice:"required"`; §4f: only
that and `response_format:json_schema` bind — `"auto"` buys NO grammar on vLLM+hermes) · reliable
was CONTRADICTED by measurement (0/12 hpDelta) and **DELETED 2026-08-01** (owner ruling; axis is
`["folded","cheap"]`, stored values heal to folded, D112 amended, structured machinery survives for
the agent-sdk degrade + resync via `hasStructuredWriter`). Sonnet card "reluctance" was OUR
tokenizer eating malformed opens (§4h) — F2a leniency + F2b example shipped.

## ═══ ▶▶▶ THE QUEUE ═══

### NOW → NEXT (owner-ruled order)

1. **PRE-MULTIPLEX SMALLS** (one batch lane): notifications consumer handles typed error frames
   (today it DROPS them — worst of the class-sweep) · `rpg.stream` gains `withSubscriptionErrors` +
   its stale "nothing throws" comment corrected · **START-1** — `startChat({opening:"generate"})` is
   non-atomic: a dead-engine opening orphans a real committed chat behind the draft + a lying toast +
   duplicate-chat risk (server returns chat id + opening-failure outcome; fork's degraded-not-broken
   catch is the model pattern).
2. **~~SSE MULTIPLEX~~ — COMPLETE + CLOSED (08-02, D118 MINTED)**: S0-S5 all merged (S5 `d01b6c7e`
   + reconcile `b17b88bd`: workloads room, union homed in contracts, ratchet closed to
   chat.impersonateStream only). One socket/tab measured; five legacy procs deleted. Close-out
   residue: 3 files cite the retired "[workloads.subscribe cross-feature]" precedent LABEL
   (rpg-choice-echo, use-rpg-mutations:101, chat-options-menu:37) — rename the label on next
   docs sweep. LIVE re-verify of socket counts rides the next stage window. Original stage notes: merged at `accaf133`;
   one socket/tab measured on the wire (1 plain · 1 with a GAME open — rpg adds ZERO · 2 across
   two tabs · 0 after close, reap working) via `/api/_debug/stream/sockets`. The rpg gate leak's
   mechanism found+fixed (`use-rpg-bus` re-spelled isRpgEngaged as a null-check — disengaged
   games held sockets); BOOT-4X heal semantics carried into a per-room gate (one home, both gap
   classes, re-proven-to-fail); `single-stream-transport` gate live + ratchet-probed;
   sessions.streamUserEvents + rpg.stream DELETED. **REMAINING: S2 chat (needs its stickler
   pass) → ~~S3~~ MERGED (`474b74d9`: notifications = resumable room, client asks NO replay
   [refetch-trigger semantics; reconnect heal covers it]; presence at the CONNECT RESOLVER edge,
   P3F1-safe; notifications proc DELETED + ratchet down; multi-human belt = per-ROOM attach
   verdict [future multi-human streams: belt in authorizeAttach — stream.connect stays authed])
   → S4 automation (server-only) → S5 workloads (event union → contracts FIRST) → close-out:
   exempt list down to chat.impersonateStream + ledger D-entry. WATCH: check-gates.int "unfired"
   flaked ONCE (217s run) then passed ×2 — recurs ⇒ chase.**
   Spec `docs/history/design/sse-multiplex-spec.md`, §14 fully ruled.
3. **~~HUD-HOME~~ COMPLETE + CLOSED (08-02, D119 MINTED)** — H0-H4 all merged; gate live with
   8 probe-receipted arms; spec stamped BUILT; two better-than-spec deviations recorded in D119.
   Residue: the combined side-eye re-pass still owed (stage singleton) · registry-contracts.ts
   sits AT the 450-line cap (next doc line forces a split) · owner ratifications: locked-Map
   one-story + ContextTabDef.crown (both spec-amended in place, D119 records them). Original: (owner-ruled 2026-08-01, from the stickler visual audit F6,
   `docs/reviews/stickler/2026-08-01-visual-blech-audit.md`): **the pre-HUD chrome seams in the
   CONTEXT panel get YEETED — the context panel (where the rpg game lives in lite mode) IS the
   HUD's home** (owner lean refined same evening: the panel wholesale IS the HUD when a game is
   active — not a region inside a generic panel; detail rulings deferred to when the program is
   reached — "I'll probably focus on more when we get there"). Spec draft in flight centers that
   arm; its owner-decisions section is where the deferred calls land. Spec-first: the takeover contract, the fate of the meta tabs
   under HUD ownership (lean: they fold into the HUD's own grammar as its admin voice — F6's
   state-vs-admin split is real), the bracket strips' replacement, the reclaimed ~400px dead zone,
   waystone breathing room. Fixes F6's four legibility defects at the seam level instead of
   polishing rented chrome. Sequencing: spec can start now; build coordinates with density S3
   (same surfaces).
4. **W-H FULL SIDE-EYE** — after multiplex S1-ish, needs a MODEL-POPULATED game ([[RV-15 posture|
   seeded-data-never-verification]]). The accumulated list: panel-beauty §4.2 · context-panel
   fidelity re-verify (`docs/design/context-panel-fidelity-findings.md`) · CT-harness band/kicker
   overlap vs the real shell · panel synthesizes `0/max` for UNSET meters (the panel is the lying
   surface now — reminder renders honest carriage) · STREAM-JANK (message box resizes during
   streaming) · inventory-grid tile design vs mock (owner eyeball) · QUOTE-1 hue taste check (new
   amber/apricot/ink dialogue colors) · scene-cards lightbox lacks a render policy (external images
   paint in transcript, not archive) · Status max-edit UX · icon-only meta-tabs at narrow widths.
5. **SET-SEAMS — S0 MERGED; the FULL remaining ladder (spec §8; S1-S4 SERIALIZE on main.tsx;
   ALL of it lands BEFORE DATABANK):**
   - [x] S0 mechanism (registry, owns+partition pin, save-status seam, body union)
   - [x] S1 appearance MERGED (`9d4646d4`): pure skimmer, 41-key exact partition, zero cited
     gaps; per-section Pick-typed patches (full-blob patch = tsc error; new kit pickKeys); two
     subs ABSORBED with receipts (motion→sizing, message-actions→details — one reader one owner);
     shared THEME tables → lib/theme-appearance-items (3-feature floor); container-query context
     re-established per Section (@container — split had silently killed narrow stacking); latent
     settings-shell CT red root-caused (unstubbed resolveChatCapability). RIDERS: pane IA visibly
     changed (7 rows, renamed groups) → §10 Q3 owner-eyeball in the COMBINED side-eye ·
     formatting done via biome format --stdin (never wrote; deltas inspected) — owner may want an
     explicit formatter-stdin carve-out ruling · 5 pre-existing sections still carry tone= budgets
     (cheap sweep).
   - [x] S2 chat-behavior MERGED (`65f0865c`): message-handling + streaming sections owned by
     chat; settings owns ZERO chat knobs; 2 cited gap-arm exemptions (autoContinueRounds,
     tempChatTtlHours — MERGED `663b956b`: both editors live in message-handling [rounds disabled-
     not-hidden under the switch it modulates; TTL copy matches the REAL semantic — hard delete,
     from CREATION, swept on Home mount]; UNCLAIMED rows removed. ⚠ S3-MERGE NOTE: this touched
     settings-pane-registry.ts — resolve vs the S3 lane at its merge. SWEEP-SMALL flagged: Base UI
     1.6 NumberField renders a TEXTBOX not spinbutton — 5 existing CTs locate by
     getByRole("spinbutton") and are either red or on different controls; also an a11y question
     for the ui NumberField seal [no aria-valuenow/min/max]); S1-miss fixed (the "real door"
     partition test now mirrors main.tsx — hand-maintained, every stage MUST add its sections);
     926 CT green.
   - [x] S3 MERGED (`1eaa962c`): both panes skimmers, surfaces+nav-bags+OWN_SUBCATEGORIES
     deleted; anchors byte-identical (Ops stayed TWO sections — §7.1 anchor stability beats §6's
     naming); per-section reads+suspense re-homed (found the blank-render class: a nested
     suspender with no boundary renders BLANK, silent to tsc/gates — Engines was blocking live
     status on a config read it didn't need, now scoped). ⚠ STAGE-4 CARRY: Engines declares NO
     owns — cited hold; engineLaunch is claimed by admin-system-tuning at top-level while the
     launch editor writes leaf-disjoint keys; the claim SPLIT lands with stage 4's app-tier
     per-section baselines.
   - [x] S4 MERGED (`723ea15d` reconcile + `7813dbed`): System pane DELETED, 12 admin
     contributions, footnote dead; leaf-aware app claims + nesting arm; floorValue:number|null
     union (Switch/Select keep string floors — receipted); rate-limits/system-tuning honesty bug
     FIXED (override no longer echoes as default); unbounded-floor arm; clearNumber helper; all 3
     save-status CTs green on main.
   - [x] S5 MERGED (`0072e598`): features/tag + features/regex minted (git mv, zero owns —
     surface-mode panes; regex = cited RESERVED in client-structure [UI-only slice, scripts
     persist via UserSettings.regex]; anchors byte-identical; 6-coupled-sites lesson banked).
   - [x] S6 SEAL MERGED (`66a68408`) — **SET-SEAMS COMPLETE S0-S6, D120 MINTED.** Every §8
     deletion was already landed per-stage (receipted, no manufactured work); the seal's real
     content = the DEAD GATE ARM found+re-keyed (placeholder arm keyed on the pre-S0 shape —
     dead-green for six stages) + the new SKIMMER-PURITY arm (probed) + prose sweep. Old row: delete SETTINGS_SECTION_ANCHORS + make*Pane
     factories + emptied shells + OWN_SUBCATEGORIES; gates updated; ALSO sweep the stale prose S4/
     S5 left (pain-points:192 two panes out of date; spec §8 stage-table stamps).
   - (superseded build row below)
   - [ ] S4-old-row (`7813dbed`) — RECONCILE ROUND IN FLIGHT (semantic conflict vs numeric-
     unification's AdminOverrideField NumberField+floorValue rework; union = floorValue:number|null
     [null=env-unknowable arm]; lane merging main into its branch). S4 content: System pane DELETED
     (12 admin contributions, footnote dead); Engines hold RESOLVED via LEAF-AWARE app claims
     (AppSettingsClaimPath + a nesting arm in assertSettingsKeyPartition — structurally catches
     parent-null-wipes-co-owner; claim derives from the editor's field tuples). FOLLOW-UPS: fold
     the leaf-claim mechanism into spec §2.3 (spec-text delta, orchestrator) · lesson: a floor is
     UNKNOWABLE once its override is stored (getAppSettingsWithOverrides returns floor⊕override) —
     rows degrade to "reset to fall back", never name a fake default.
   - [ ] S5 O3 amendment — features/tag + features/regex mint + pane move (ruled, D114)
   - [ ] S6 SEAL — delete SETTINGS_SECTION_ANCHORS, make*Pane factories, emptied shells,
     OWN_SUBCATEGORIES; gates updated. NOT DONE until S6 — half-migration is banned.
   §10 fully ruled (system→admin merge at stage 4 · sub-deep-links IN program · Q3/Q5/Q6 as
   recommended).
6. **DENSITY PASS** — approved-to-build; §7 all ten ruled (incl. D6 rounded-card demotion + D7
   Card.padding retirement). **QUEUE-ORDER TENSION (side-eye, 08-01 overnight): the projection
   pane's mock look is UNREACHABLE until density S5 retunes ListRow's instrument scale** (title
   15px vs the mock's 12.5 — honest sequenced debt, the build correctly didn't touch it). The
   owner ruled density stays in queue order BEFORE the projection existed — consider pulling
   S1+S5 forward at the next queue review; morning call. Also P3 owner call: the characters
   picker band shows NO count (keyset paging = any number lies); accept or ship a server total.
   RIDER (08-01 late): the ghost tag-chips (F3-B, merged `98fdff28`)
   are quieter but not mock-TIGHT — box height is dominated by the D62 touch-floor icon buttons
   and the smallest spacing token (field=6px). S1's `--spacing-tight` (4px) + `--radius-inset`
   make mock-tight chips ON-TOKEN — fold chip tightening into the S1/S3 sweep, don't pre-solve.
   Card.padding retirement). S0 computed-value probe FIRST; S3 waits for the panel to stop moving.
7. **WORKLOADS EXIT — STAGES A-D MERGED (D117); the FULL remaining stage-E ladder (report §3.3+§5-E;
   LANE IN FLIGHT; ALL of it lands BEFORE DATABANK — the interactive lane is what makes
   databank-ingest jump the queue):**
   - [x] ALL LANDED + MERGED (`bea2851c`; D117 amended clauses 9-12): two-lane worker (head-block
     DEAD, driver-proven) · durable progress (mid-run read proof + CT) · poison visible+retryable
     (raw-blob clone; proven-to-fail ×2) · residuals (2 were already done) · Q4 stats.reconcile
     (principal-scoped + Recompute-now button + EXEMPT row)
   - [x] STICKLER DONE (report 2026-08-02-workloads-stage-e.md): stage E itself SOLID — every
     ledger claim verified; claim/reap/baseline/poison/heartbeat/wake all clean. TWO findings →
     ALL FIXES MERGED (`26423eda`): scheduledAt now ENFORCED at the head query (no IS NULL arm —
     column is notNull, receipted deviation) with boundary + non-starvation pins; stage-E lane
     test repaired in place; F2 = header CORRECTED (verb→engine emit needs a ctx seam; ≤2s poll
     is designed-for). OWNER's dependsOn suspicion: it IS enforced (resolveDependencyGate per
     head row, fail-fast dependency_failed) — the SCHEMA COMMENT lied the OTHER way; corrected +
     the missing starvation regression added. Lesson: wired-and-tested ≠ enforced — read the
     WHERE, not the column.
   - [x] stats.reconcile single-flight guard MERGED (`883c86e4`): domain-root registry
     (active-turns precedent), per-service build, CONFLICT → quiet inline role=status notice
     (errorToast null for CONFLICT, isSilencedTurnAbort precedent). **WORKLOADS = FULLY DONE
     including review + fixes.**
   - [ ] side-eye rider: lane group headings + Recompute-now button → fold into the COMBINED
     side-eye re-pass
   Serde/import-export: verified CLEAN (§4) — stage D killed the entanglement; nothing remains.
   (`docs/history/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md`)

### OWNER DECISIONS — ALL RULED (2026-08-01 evening; none pending)

- **`reliable` mode: DELETED** ("reliable can get yeeted") — lane dispatched; stored values coerce
  to `folded` (NO-LEGACY pre-launch), picker copy refreshed (folded=default, cheap=local champion).
- **POPULATE-FROM-CHARACTER: per-character button** on the roster card/takeover, button-only, never
  auto-runs. Build item below.
- **RV-11: the writes are INTENTIONAL — build the readers** (owner: appearance/outfit/thoughts are
  persistent per-character guides, extracted every turn). Design receipts: proposed
  `03-state-and-schema.md:175` ("visible in tracker") + `11-client-ui.md:279-282` (cast row lists
  outfit/thoughts). Lane dispatched: reminder renders them back per cast member (today mood-only,
  `reminder.ts:223` — the model was re-inventing its own guides) + Scene-tab cast card renders them +
  `sheet.flavor` gloss line.
- **Partial-abort persistence: KEEP the pin** — abort persists nothing. Closed.
- **CSP layering: TIGHTEN-ONLY** — deployment block is absolute; lower tiers only restrict. Lane
  dispatched (security-executor): one resolver seam, per-character toggle honest-disabled when
  deployment-blocked.
- **Cast-NPC tracker grants: KEEP explicit-list-only.** Closed.

### BUILD ITEMS QUEUED

- **STICKLER-AUDIT FIX LANES** (owner 2026-08-01: ALL findings, not just top —
  `docs/reviews/stickler/2026-08-01-visual-blech-audit.md`): Lane A character surface (F1 crushed
  search input · F2 portrait-over-label + 34px target · F3 pills→quiet chips, CD3 · F4 panel opens
  populated/overview card) · Lane B list scent (F5 preset subtitles; the "Default (edited)"×9 was the
  FIXED autosave-fork bug's debris — owner-confirmed — so mint numbering is hygiene not fix ·
  F7 chat rows: resolved portraits, star, game marker, receded archived) · Lane C smalls
  (F9 swatch grid · F10 landing glow clip). Dispatch worktree-isolated after the 08-01-evening
  commits. F6→HUD-HOME (queue 3) · F8→density S3 receipt. Residue: ChatSummary last-message
  snippet field (build small) · transcript 1920 gutter verify (may be reading-measure by design) ·
  roster placeholders re-check post-merge · Members tab capture needs the multi-user e2e stack.
- ~~POPULATE-FROM-CHARACTER~~ **BUILT + merged 08-01 evening (D115 minted)** — separate schema
  root, live planes structurally empty, fill-only sheet, host-gated, canPopulate verdict.
  REMAINING: one live-model smoke on a hosted wire (owner's next dogfood click).
- **agent-sdk terminal tools** — the fold on the agent-sdk wire (max-pro-sub + OR×protocol-auto
  Claude skin run the loud fallback every turn). Lane dispatched 08-01 evening. PRIORITY NOTE
  (owner 08-01): the owner mains OR chat-complete + local vLLM — folded already works natively on
  both daily paths; this closes the remaining arm, it is NOT the everyday default.
- **EFF-3** — degrade-warnings client surface + effective-delivery freshness + GM-tab
  recommend-don't-force notes (thinking-off; "cheap recommended for local models"). Urgency
  demoted with the above — the guarded-wire degrade is off the owner's daily paths.
- **Per-actor tracker grant/revoke EDITOR** (`sheet.trackerGrants`/`trackerRevokes` — RV re-audit
  2026-08-01): the fields exist and gate NPC tracker applicability, but NO client editor exists
  (`rpg-game-tab.tsx:42-44` documents the gap). The "keep explicit-list-only" NPC-grants ruling
  DEPENDS on hosts being able to edit the list — without this editor the ruling is a dead letter.
  Home: the takeover/sheet view beside the other per-actor editing (TRK stage-2 primitives).
- ~~KNOB EDITORS batch~~ **BUILT + merged 08-01 late** (`a2c2a730` — six editors incl. the shared
  hint-map editor; EFF-3 effective-delivery honesty landed with it; side-eye flag: fallback WHY is
  hover-title-only, visibility is a copy/layout call). **`config.userMacros`: OWNER RULED (08-01
  late) — WIRE THE READ END** (own chat-domain lane: game-config macros register into the turn
  beside the preset's; collision policy game-shadows-preset; editor after). QUEUED behind the
  ChoiceBlock lane (shared domain/chat contract files). EFF-3 residual (documented in headers):
  the runtime no-terminal-channel arm is post-turn-only — such a room still reads "Live".
  Same-ruling closures: card-note mute stays DEAD (no replacement knob until missed in play) ·
  ST export stays ONE-WAY (no note_prompt heuristic) · snippet search LANDED (`86f172e0`).
- **INLINE-TEMPLATE SCOUT (08-02, owner-ordered, both-methods receipts):** 26 slots + marker
  templates verified HOMED by content-match. SIX inline stragglers, dispositioned:
  (a) GENUINE GAPS — new slots owed: group format strings (`assemble.ts:162-169` [Also present /
  X's scenario / X's example dialogue] + `round.ts:47` group-round nudge) · injection wrappers
  (`injections.ts:44-46` [Note from system/user:]) · **discovery's THREE full system prompts
  entirely outside the catalog** (`analyze.ts` COMPARE/ASK + `distill.ts` DISTILL — no
  resolveProseText import at all). Dispatch as a PROSE S1-style migration small.
  (b) ALREADY-RULED S4 territory (template-shaped, cite the ladder): arbiter user-frame
  (`smart-arbitrate.ts:131`) · compaction lead-ins (`compaction.ts:73-77`).
  Not covered: non-suspect domains beyond grep, client-side dupes, byte-audit of slot sources.
- **PROSE-1 — S0 MACHINERY LANDED** (`174bbad2`: prose-slot/prose contracts split [depcruise
  type-only cycles], two-rung resolver, prose-baseline.json with BOTH refusal arms probed live,
  17 slots incl. the impersonate nudge as editable data with the IMP-1 probe named as its
  iteration instrument). **LADDER RULING (logged): the escalated tool-description fork = option
  (b)** — rows 37/90 move to S5's close-out with the rest of the tool-description class (one
  migration, not two; widening the sealed resolveTools seam waits for the class). S2 CAVEAT
  recorded: guidedActions defaults materialize at zod PARSE time — "unset" unrepresentable, so
  placeholder-as-default can't work there until the storage semantic changes. NEXT: S1 app-tier
  cohort (clean threading paths named: resolveChatHostUserId precedent) — dispatch AFTER
  SET-SEAMS S0 merges (shared settings territory); then S2 editors → S5 gate+ledger.
- ~~IMP-1~~ **MEASURED + landed what the data justified** (`4fa8a65b`, 84 real gens,
  `scripts/probes/impersonate/RESULTS.md`): hosted 0/12 clean · local 8B **28% bleed, dominant
  class = UNLABELLED first-person takeover** (invisible to every mechanical layer, ST's included).
  Fixed the real bug found: impersonate inherited ASSISTANT-turn cleaning and LAUNDERED leaked
  `Char:` labels into the composer as the user's words (self=persona now; labels survive for the
  reviewer). Stop-string layer built as ST-parity INSURANCE (never fired in 84 gens — do not cite
  as the fix). **OPEN (owner-adjacent, prose territory): the 28% unlabelled class** — only nudge
  iteration (the probe's fixture set is the harness — long-scene 3/3 reproduces), model choice,
  or a review-UI tell ("this reads like {{char}} — regenerate?") can move it. Folds naturally
  into PROSE-1 (the impersonate nudge becomes editable data there — iterate it against the probe).
- ~~IMP-2~~ WAS ALREADY BUILT (`4848306c`, on main — the board row was STALE; audit-lists-are-
  snapshots strikes again). Audited + verified 08-02: Stop at the cluster's right edge (turn-abort
  visual precedent), stop = completion not rejection (partial stays, no toast, no D57 restore);
  honest "impersonating" wait reason; AND the server-stops question answered with a 7-link receipt
  chain: the provider stream aborts end-to-end on unsubscribe (trpc subscription signal ← fetch req
  signal ← hono socket close), classified clean {aborted:true}, no token burn into a dead pipe
- ~~QUOTE-1 follow-up~~ DONE in smalls#3 (`a8ba4b55` — one-home hook data/use-color-quoted-speech.ts [#data because greeting-studio is a two-feature tier-2 composite]; computed-color CT ON + zero-tint OFF arms).
- **ZTXT-1** — zTXt PNG chunks in kit/png-card-chunk, dependency-free via
  `DecompressionStream("deflate")` (verified present in Node here + browsers; kit stays isomorphic).
- **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed trustHtml renders
  them; needs a "what render policy would this card get" server seam (architecture call).
- ~~DRAFT-CAST~~ ALREADY BUILT (`2b1bdc09` — resolveDraftCharacterIds threaded; CT pin at chat-room-surface.ct.tsx:129; verified by smalls#3).
- ~~#24 MU-picks pane~~ **BUILT + merged 08-01 late** (`24e4f38d` — incl. the missing READ,
  `chat.getUserMacroPicks`, least-privilege: members get identity+inputs, never macro bodies).
  ~~FOLLOW-ON small~~ ALREADY BUILT (`0925bb0d` — chat.setVariables + getVariablePicks, sweep rows + freshness + macro-picks-section consumer; verified by smalls#3). ·
  **DATABANK SURFACE — SPEC'D + MOCKED + RULED (08-01 late), build QUEUED LAST** (owner: "own
  rail section... they look good. this can go at the end after everything"). Spec
  `docs/design/databank-surface-spec.md` + artifact-published mocks. D-0=own 9th rail section ·
  D-1..D-7 as recommended (listGlobal twin · sources on the active view · workloadId ingest
  progress · rack after Injections · home tile). Legacy audited CARRY/REJECT, 5 named defects
  die. S1-S3 fork-independent; RowToggleAction minted by the projection lane (first). DISPATCH
  after projection + home + SSE stages land. · **AU-10** background-library manage UI ·
- ~~VER-1c~~ ALREADY BUILT (`9e58c49d` — turnWarnings tool_result_error_dropped mirrors the OR arm; 30 unit green re-verified by smalls#3).
- **Preset multi-tab fork idempotency** — two tabs editing the built-in can still mint two forks (no
  `forkedFrom` column; cheap when it bites).
- **`ChatRpgOps.gatherTurnContext` args-object refactor** — 5 positional args, 2 lite-ignored
  (~35 call sites; honest-shape debt from the regen threading).

### SMALLS / HYGIENE

- **THEME-PURITY SCOUT: CLEAN (08-02)** — zero strays across every gate-blind shape (palette
  classes, inline styles, svg attrs, css literals); the defense was already layered
  (no-color-literals + no-off-token-inline-style + no-off-token-radius-shadow gates). ONE GRAY
  for owner: the low-alpha WHITE SHEEN literals in gradient glows (globals.css:88,106,148 +
  shell.css:241 — `oklch(1 0 0 / 0.0N)`) — deliberate polarity-fixed gloss or should it mint a
  `--color-sheen` token? REC: mint the token (intent explicit, theme-overridable, one-line).
- **VOCAB: "ember" is a THEME, not a design constant (owner 08-02)** — the default theme's value
  for the accent tokens. Design/spec/CT language says ACCENT/PRIMARY; sweep the strays (a HUD CT
  named "ember state colour"; any spec prose) in the next docs/test-touching lane. Code already
  token-clean (D71 pipeline); mock-local --ember-tint = drawing shorthand, fine.

- ~~WORKLOADS-PANE VOCAB + JOBS CTA~~ DONE in smalls#2 (`165cd85e` — "Jobs" is the one user
  noun; filtered-tab CTAs dropped; side-eye rider: the "Jobs > Jobs" doubled nav row).
- **SQUARE-GLYPH BUTTON size variant + 14-site sweep** (from smalls#2's bang-prefix arm): the
  re-opened DEBT_BASELINE's 14 rows are ONE shape — `<Button intent="ghost" size="sm"
  className="!size-N !p-0">` icon buttons in features/rpg at scales 4/5/6/8 + one `!w-block`
  TrackBar. Honest fix = a square-glyph size arm + sweep with computed-geometry proof; UI change,
  own review + side-eye. Clears the baseline back to terminal {}.

- ~~SMALLS LANE~~ MERGED: blur ON by default (`96c6df7d` — .catch+.default, explicit-[] survival
  pinned, CT toggle test corrected both directions; contracts audit ARCHIVED to
  docs/history/reviews/stickler/) · w4 emit order (`5272120b` — rpg-fire now precedes
  turnCompleted, probe-proven; report annotated, NOT archived: F5's §10.1a economics pointer
  comment in compose/rpg.ts never landed — one line, security-executor-owned file, route on next
  security batch). NEW VERIFY-SMALL: contracts F7 residue — credentials.ts:3-7 comment says 5
  providers incl. google_vertex, CRED_PROVIDERS has 4, and the google_vertex
  providerMetadataSchema arm survives; disposition (archived doc carries it).
- **ORPHANED ITEMS status:** ~~w4-my-lane S1~~ APPLIED (`5272120b`) · ~~contracts-audit F6~~
  CLOSED (blur ships ON) · ~~Button wrap variant~~ MERGED (size="wrap" arm — size axis stays the
  SOLE box owner; debt baseline terminal {}; rendered-proofed; NEW SMALL from its sweep: 10 call
  sites use `!h-auto min-h-0 !py-0` — deliberate sub-touch-target inline buttons, deterministic
  via !important, NOT the hazard class — candidate "inline" Button arm ticket, needs side-eye) ·
  ~~join-history #8/F6~~ MERGED (`e6e4a2e2` — floored fork folds the FULL chain through the floor
  into one absolute-set baseline batch stamped AT the floor [inclusive — clobber-safe vs the floor
  row's own delta]; throughSeq-below-floor = empty; proven-to-fail both halves. RECEIPTED
  DEVIATION: ruling #8's literal fold-at-fork-point + replay recipe double-counts non-idempotent
  inc/add — the lane followed the ruling's own INVARIANT [floor-fold] instead; D79 text needs no
  amendment) ·
  stats.reconcile single-flight guard = LANE IN FLIGHT (owner ruled: no second start while one
  runs; wait, no cancel).
  join-history detail: SEVERITY NARROWED (owner + code, 08-02): fork is gated
  host-or-sole-present-human, floor is OPT-IN — the leak path needs floored member → becomes sole
  human → forks. Kept because fork's own §3.6 strip already covers content+reasoning on exactly
  this path; VARIABLES are the one missed plane, + the no-baseline divergence half is
  floor-independent.

- Macro feed (`chat-ops/macro-view.ts`) cast projection does NOT carry the new guide fields
  (appearance/outfit/thoughts) — RV-11 lane left it deliberately. Decide: should user macros be able
  to bind cast guides via celBindings? If yes, thread them; if no, note the asymmetry in the file.
- PRESET-PANE FOREVER-SKELETON — **NOT REPRODUCIBLE (08-01 diagnosis: ~25 live loads, every
  composition path incl. forced-race + socket-loaded + mobile + the original DB — rows every
  time; all four suspect classes ruled out with receipts).** Likely original sighting = a
  `--dirty` stage rsync-restart artifact (502s mid-load against the suspended boundary — the
  class was caught live). DEMOTED to needs-a-repro-recipe; reopen only with stage mode +
  `__orb.queries()` capture for `preset.list`. PARKED design note (latent hazard, not a bug):
  presets is the only `useSuspenseQuery` library list — a cancelled suspended query hangs with a
  clean cache; moving it to the Characters `useQuery`+SkeletonRows pattern changes the shared
  `LibrarySurfaceShell` contract (world-info rides it) — owner-taste design call if ever wanted.
- ~~Chat-row rpg/game marker + snippet~~ ALREADY BUILT (`4f3d689b` — both ChatSummary fields at projection time [row_number window + isRpgEngaged], NO migration; Swords marker + subtitle scent live; verified by smalls#3).
- ~~BUS-FLAP~~ CLOSED (dev-only StrictMode double-invoke of the devlog MIRROR effect; the wire
  opens ONE socket — server-log receipt; causal StrictMode probe). · ~~BOOT-4X~~ FIXED
  (`46d75eaf` — heal starts from the SECOND connection; 4 wasted round-trips/load gone; both CTs
  proven-to-fail against old code). · ~~VERIFY-BURST~~ CLOSED (claims held live: 2/2/0 across all
  three drives, zero tripwires). · ~~✨-PERSPECTIVE~~ CLOSED (works end-to-end; the old "zero
  traffic" was a blind instrument — subscriptions bypass loggerLink by design).
- **rpg.stream SOCKET-GATE LEAK** (found by the stage drive, unchased): rpg.stream opens on a
  plain HOME route with no chat + doubles after one chat open — the use-rpg-bus header's law
  ("non-game chat holds no socket") is NOT holding. ROUTED to the SSE S1 lane as must-cover
  (find the mechanism while swapping the body + the missing zero-attach CT).
- ~~LIVE DEV DB broken routing pairing~~ **CLASS KILLED + row SELF-HEALS** (`2586a2d0`): the
  doorway was PARTIAL DEEP-MERGE patches (a patch naming source without model is a no-op on the
  stale model key), and the exact bad row was written by `tests/e2e/support/global-setup.ts`'s
  role patch — the pane was innocent. Now: write-boundary coherence (source-without-model gets
  model:null; a pin on a config-derived source is REFUSED), read-side heal with a WARN naming
  stored vs resolved, ONE (source,role)→model home shared by pane + resolver, and the display
  names an ignored pin instead of labeling it "server config".
- ~~⚠ OWNER MORNING QUESTION: an e2e run wrote to the DEV stack~~ **ANSWERED + STRUCTURALLY FIXED.**
  The isolation memory was wrong for ONE project: the `single-user` mode-project was DEFINED on the
  dev ports with no `DATABASE_URL` (`tests/e2e/support/modes.ts`) and `reuseExistingServer` locally
  (`playwright.config.ts`), so every local `pnpm e2e` / `pnpm e2e:smoke` (the `verify --push` browser
  lane!) attached to the running dev stack and ran globalSetup's unconditional `pinRouting` against
  the LIVE DB. Now: single-user owns an isolated stack (8796/5181 + `.cache/e2e-single/orb.db`), every
  mode boots with `E2E_HARNESS=on`, `/healthz` reports the stamp, and globalSetup HARD-FAILS on an
  unstamped or dev-port target (`tests/e2e/support/target-guard.ts`) unless `E2E_ALLOW_DEV_TARGET=1`.
  Verified: full `pnpm e2e` 30/30 green on the isolated stacks; the dev stack's `/healthz` carries no
  stamp, so the guard refuses it.
  Related note: `import-user-settings` bypasses the new write guard (whole-blob verb) — imports
  heal+warn at read instead of refusing at write; lift the guard into the import path on want.
- WAKE-STATUS: the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.
- ~~Freshness DEFERRED debt~~ **ALL WIRED (`b0d35cee`)**: 12 stats.* keys ride chatsChanged (the
  cost argument was FALSE — refetchType:"active" means hidden surfaces pay one stale mark, not a
  fetch); assets.listOwned rides the new use-upload-asset front door (proven load-bearing CT);
  DEFERRED registry now EMPTY. Residuals recorded in the seam: rename/star over-fires a spare
  stale mark; chatless imagery.editImage under-fires (needs a stats-grain producer event).
- Scout: `connection.getCatalog`/`getAgentSdkCatalog` appear in admin `invalidates` with zero literal
  consumers — aliased reads or dead rows.
- `composer-guided-cluster.ct` flake — **MECHANISM FOUND (08-01 overnight): Base UI NESTED-SUBMENU
  timing** — the ✨ menu's Plot submenu intermittently never opens ("game steers" test, line ~448;
  3×fail-then-pass pattern observed twice, screenshot shows menu open + submenu collapsed). Fix =
  a submenu-open wait/retry idiom in the test or a Base UI hover-intent workaround — not a timeout
  knob. Also the original whole-file 30s note stands (no per-file timeout idiom exists repo-wide).
- Personas list: owner RULED FINE AS-IS (08-02) — no grammar sweep needed; do not re-board.
  "People" = the roster's HUMAN SUBSET (no tab exists; app-root comment corrected); multi-human
  verification parked with D22.
- ~~blurSurfaces~~ ALIVE (full wire verified, CT-covered — closed). · ~~useListDocked~~ KEPT with
  an honest header (the ONE sanctioned list-pane-visibility read for section bodies; deleting it
  re-opens the M10 hand-copy class — closed).
- `staging.ensure` residual: first-write-wins seeded from HEAD — dormant unless rpg tools ever mount
  as REGISTRY tools again (D112 keeps `tools: []`); reroll accumulation would return via that seam.
- R5b(a) verify: `refEnumerationLines` (non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm stage-1's R6 build carried it; ~2 lines if not.

### PROBES / OPTIONAL

~~F4/F4a/F5/OR-5/OR-7~~ **ALL MEASURED 08-02** (`scripts/probes/openrouter/RESULTS.md`, $0.32):
F4 any tool-payload byte change re-bills the WHOLE prefix · F4a effort KEYS the cache (entry per
effort, no invalidation) · **F5 native thinking depth is UNREACHABLE via OR (205 vs 5783 tokens,
28×; tool-call counts unaffected)** — the agent-sdk skin (terminal channel now built) is the
deep-thinking path · OR-5's under-cache hypothesis REFUTED (lookback serves reads; waste = one
small write/tool-depth) · OR-7 replaying reasoning is safe SIGNED, hard-400 unsigned.
**FOLLOW-UP QUEUED (the one actionable): F4-CACHE-VOLATILITY** — `buildToolRoundWireTools`
re-renders descriptions + ref-constrained schemas from LIVE game state every call
(compose/rpg.ts:407,411), so each new condition/actor re-bills the entire prefix (~10× that
turn). Verify whether that path's system block is already per-turn volatile, then pick between
RESULTS.md's two options. Honest gap: large tool fan-outs vs the ~20-block lookback (unmeasured).
Still open: #16 engine auto-sleep/wake live pass · D22 member-tiers (multi-user stack).

### DISCUSSION PILE (owner, no build)

☰ **CONFIG-RAIL RIFF (owner, 08-02, explicitly "just riffing" — no build):** presets/tags/
world-info/regex are COLLECTIONS of editable objects getting modal treatment while characters get
library treatment — a CONFIGURATION rail glyph (list = the collections + maybe the settings
categories as singleton-anchor rows; content pane = real per-object editors, no popups) applies
the library pattern to config objects; one rich glyph beats three anemic ones. COMPOSES with
in-flight work: SET-SEAMS S6 makes sections portable (relocation = door-assembly edit, not
migration); S5 mints tag/regex as contributions; projection grammar handles mixed-kind lists.
BOUNDARY to keep: user-tier config vs room-tier overrides stay distinct surfaces. Sibling of the
characters+chats rail-merge fork below — same instinct (fewer, richer rail sections). Owner also
re-stated: "still not set on presets being their own thing." Rule by feel post-SET-SEAMS-seal.

☰ **AGENT-1 — agent-sdk FIRST-CLASS for rpg-lite (owner interest 08-02; scoped, NOT dispatched —
new scope beyond the databank mandate).** Plumbing is ~complete (terminal tools · stateful tools ·
session resume w/ seed-frames+divergence · compaction envs · firewall · catalog). Remaining arms:
(1) knob HONESTY — SDK wire ignores most sampling knobs; EFF-3 applies/ignored rows per preset
knob · (2) REASONING visibility parity — OWNER FACT (08-02): the model reasons at native depth on BOTH
arms; max-pro-sub delivers it as ENCRYPTED deltas (hidden by provider), the OR skin delivers it
readable. So: OR-skin arm = capture into our reasoning channel + strip belts; sub arm = handle
encrypted deltas HONESTLY (an explicit "reasoning hidden by provider" surface, never an empty/
broken pane; preserve blocks only as the SDK's own session needs) + a thinking-budget knob where
the wire honors one · (3) usage/context accounting parity (per-turn DELTA
semantics; PREV bars must not lie on SDK chats) · (4) THE LIVE DRIVE — full rpg-lite loop on the
SDK wire scored (beats, extraction parity vs the reachability surfaces, resume hit-rate,
multi-call terminal capture) · (5) mixed-mode turns only if a need lands. Order: 2→3→1→4.

☰ **AGENT-DOC LAYERING (owner musing 08-02 night, "simplify or not idk"):** constitution
(AGENTS.md) + doctrine (.claude/agent-doctrine.md) + per-agent defs + skills. Orchestrator
assessment: the layering is sound; the REAL redundancy is dispatch-brief boilerplate (§L lane
discipline · back-channel · receipts) repeated per brief — fold that invariant block into
agent-doctrine.md ONCE (mandatory read-in-full beats an optional skill load for floors; skills
stay for deep per-role content à la side-eye). Cheap small; do on a quiet slot, not mid-wave.

☰ **UNSENT-DRAFT RELOAD PERSISTENCE** (from the home side-eye's "temp draft data loss" — NOT a
bug: nav round-trips keep everything, proven by a composed CT; only a PAGE RELOAD loses an unsent
draft because the active-chat handle + composer text are deliberately unpersisted while
activeSection persists). Fork: should an unsent draft (seed + typed composer text) survive a
reload? Persistence-design call, not a fix — the current behavior is by design.

☰ **LIST-PANE PROJECTION — RATIFIED (owner, 08-01 late): Arm A + Arm B approved, C rejected;
the MOCKS' look is the approved target** (`docs/design/list-pane-projection-proposal.md` + mocks;
remaining D2-D10 stand as recommended). Stickler resumed for §11 primitives inventory (the
fugly-prevention list — what @orb/ui needs before building) + §12 row-action grammar (owner:
"I REALLY hate having to click the three dots in list view" — inline/hover actions per row type,
D62 touch-floor math, one grammar for ALL list panes, kebab keeps destructive/rare only). Build
lanes L0-L4 dispatch after the primitives pass lands. **HOME RULED (owner, 08-01 late, on seeing the mock): "landing goes to home"** — H1 = home is
the BORN DEFAULT + the chat landing SLIMS (the coupled pair, ruled together); H2-H11 stand as
recommended. Home build (H0-H4 per `docs/design/home-section-spec.md`) queues BEHIND the
projection build (shared door files) — dispatch on its merge. GM-tab game-macros editor = small
follow-up (read end + write arm landed `cad777f9`). [superseded fork below:] Confirmed: `shell-store.ts:89` defaults
`activeSection:"chats"` (home = chats tab + the chat-owned landing surface). Fork: resume-first
(keep chats-home; Arm B makes it a real mixed launcher) vs face-first (flip default to characters;
Arm A's launcher pane is the canonical entry — a one-line change) vs the HOME section (spec in
flight) as default. **PLUS the owner's held-back option, kept alive: MERGE characters+chats into
ONE rail glyph** — he considered it, went with A+B; note that A+B CONVERGES toward it (the two
sections become behavioral mirrors), so post-landing the merge is a cheap rail-level edit
(one glyph, one section, both flows), not a redesign — composes with home (rail: Home ·
Library&Chats · rest). Rule by feel after A+B + home land, not before. Deeper samey diagnosis
(owner): every rail entry unrolls the IDENTICAL tri-pane anatomy — home is the first mold-breaker. [superseded musing below:] the stickler audit
fixed row CONTENT (scent — landed); the pane's per-screen EXISTENCE is an open IA call. Arms
sketched: (1) auto-collapse to a slim glyph rail once a chat is open (cheap, reclaims ~280px) ·
(2) live-instrument rows (activity/streaming indicators; snippet landed) · (3) contextual content
per screen (in-chat = that chat's forks/branches/bookmarks tree). GUARDRAIL (D18 rationale rider,
recorded same night): "chats with this character" surfaces must be filtered PROJECTIONS of
first-class chats — never re-derive the ST launcher coupling. Same family as HUD-HOME; consider
one IA focus session for both. · Snippet SEARCH (filter-chats matches title+names only — include
message content?) is a cheap adjacent call.

☰ **RV-13 second half — branch-and-save game modes**: the ruling (freeform demoted, d20-in-lite is
the direction) is doctrine, but the BUILD — "branch off + save your own game mode derived from the
prebuilt d20" — was never queued. **SEQUENCING (owner, 2026-08-01): deliberately AFTER the
hardcoded-constants-become-user-slots work** (PROSE-1 + knob editors + tracker-def editors) — a mode
fork is only as useful as what's overridable in it; build the slots first, then the fork model has
real payload (tracker defs, teaches, steering prose, extraction knobs). Spec then. · chat-options placement (D111 clause OPEN, breaks nothing) · persona=character design pass
([[persona-pin-prompt-resolution]]) · Meteocons artwork fork (~8 icons, MIT) · grimstone theme
(parked) · flakes/facelift micro-ledgers.

## ═══ STANDING FACTS + POSTURE ═══

- **LAUNCH-PREP CHECKLIST — h3/QUIC (five minutes, deployment-level; the multiplex already did
  the app-side prep):** verify Caddy h3 enabled (default since 2.6) + **UDP 443 open** (the classic
  silent miss — browsers fall back to h2 via Alt-Svc and never tell you) · the 15s SSE ping
  already keeps QUIC NAT bindings alive · 0-RTT stays off non-idempotent (Caddy default) · do NOT
  add TCP-era tricks (sharding, server push — dead; 103 Early Hints if ever needed). Dev stays
  h1.1 deliberately (a STRICTER transport test — the starvation class was only visible there).
  Optional: a local Caddy h2/h3 profile for occasional prod-transport feel.

- **OVERNIGHT FULL-AUTO: ACTIVE (owner, 2026-08-01 late).** Proceed through THE QUEUE in ruled
  order without blocking; stuck = the escalation ladder (stickler → ast/code → docs → judgment),
  log the reasoning here. Blocking questions ONLY for destructive/irreversible, owner-sacred
  (persona pin), ORIGIN PUSHES (still need the per-push word — do NOT push overnight), genuine
  scope pivots. Stack/engines pre-authorized. In flight at activation: 8 lanes (F3 swap · GM-tab
  wave · ChatSummary scent · MU-picks · preset-skeleton diagnosis [holds the snap stage] · smalls
  batch 3 · guided-sampling kill · injections/authors-note collapse). After they drain: SSE
  MULTIPLEX S0→S1 (→S2 with its stickler pass) per the ruled queue; stage-needing smalls
  (VERIFY-BURST · ✨-PERSPECTIVE · BUS-FLAP/BOOT-4X observation) serialize on the stage after the
  preset lane frees it.

- **NEVER push to origin** without an explicit per-push owner word. Origin @ `24989143`; everything
  after is local. Commit cadence relaxed ([[commit-cadence-relaxed]]).
- **`pnpm check` = STATIC only** (~90-220s, runs in the pre-commit hook); battery (`pnpm test`) is
  separate (~10 min: vitest ~8500 + CT ~1660); `verify:push` = check + tests:node + e2e-smoke
  (~10 min, needs the stack; runs even on deletion pushes). READ `reports/` instead of re-running.
- **Stack:** `pnpm stack restart` now defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines: `pnpm engines:{wake,sleep,status}`; truth = `GET /is_sleeping` (`/health`
  AND `/v1/models` both LIE while asleep); hold marker = refuse-auto-wake. Wake-on-demand is built
  into the server's vllm request seam (single-flight, fail-loud).
- **Worktree lanes:** auto-hook creates wt/<name> from local HEAD + pnpm install (2s/48MiB);
  NEVER `enableGlobalVirtualStore`. ONE committer on main; lanes commit with PATHSPEC
  (`git commit -m … -- <paths>`); orchestrator never commits while a lane edits main; lane cwd
  RESETS across notification boundaries (`git -C` everything); a failed orchestrator merge can tear
  down a lane's worktree while its branch survives (recreate + continue). Semantic conflicts on a
  lane's own files → abort and send the LANE to merge main into its branch.
- **NEVER bare `sqlite3` on the live db** — probe COPIES (this session's live in the scratchpad) or
  `/api/_debug/*`. Wire capture: `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token: dbg`).
- **Orchestration:** delegate volume, keep judgment; fresh-context verifier/side-eye before
  non-trivial "done"; diff an executor's self-flagged "deliberate deviation" against the SPEC TEXT
  before minting law ([[spec-completeness-no-improvisation]]); mine probe artifacts before
  implementing a doc's proposed grammar.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` — `run-coverage.mjs` (env-driven),
  `steer-probe-real.ts` (read half through the real reminder), `local-8b-vehicles.ts` (three-arm 8B,
  `SPIKE_ARMS` resumable), `card-teach-probe.ts` (`CARD_DRY=1` free, `CARD_SCORE=<file>` re-scores).
  Score against OPPORTUNITIES (§4b) and through the PRODUCTION tokenizer (emitted ≠ rendered).
- **Resume read order:** this block → THE QUEUE → `git log --oneline -20` → `MEMORY.md`
  (auto-loads) → `docs/architecture/core/AGENTS.md` for architecture work.

## ═══ LANDED — the 2026-08-01 ledger (compressed; git log has detail) ═══

**Overnight (pushed @ `24989143`):** R4b steering proven live · R5a/R5 · OR-1…4 · R1 fold + D112 ·
EXT audits · EFF-2 · e2e 30/30 · weather enum · Waystone fix rounds · D71 drift fix · D111.

**Day wave 1 (pushed):** TRK stage 1 (`ea99b0e3`, D113) + stage 2 (`98ee6da2` — Sheet dissolved,
takeover view, RV-8 primitives, per-carrier ceilings amendment) · PREV rebuild + per-member budget +
200k/windowEstimated honesty + fill-vs-headroom bar · preset capability staleness + placeholders ·
tool-coverage audit (`docs/reviews/misc/2026-08-01-tool-coverage-audit.md`) · EXT-4 robustness +
folded born-default · decision stacks recorded (D114) · mood/journal wrap · hints→hover · pin
one-click · band vocabulary.

**Afternoon (LOCAL, awaiting push):** anchor-slots investigation (count 8→4, tail selectors,
`notStateAnchor()`) · reroll-supersede + idempotent resync + full swipe-flip state (VER-1a) ·
swipe-reminder read-base twin (read base == write base, ONE resolver) · empty-generation engine guard
(VER-1b closed) · reasoning render + one-seam strip belt (the display found two deep bugs same-day) ·
Connections: lost-autosave root cause + live-vs-draft honesty + echo seam + clear-persists +
coherent api/source pairs · previewSection host-gate (latent) · wake-on-demand + adopt-only default ·
invalidation burst dedupe + Preview freshness rows · zombie-subscription + loud impersonate failures ·
query-freshness-coverage GATE (+3 frozen surfaces fixed incl. the GM veiled ledger) · class sweeps
(registry-as-truth CLOSED; composites; SSE work order) · §4g 8B measurement (R3 overturned) +
local-engine fold guard · §4h card probe (F2 resolved) + F2a fence leniency + F2b example · REC-1
teach copy · file-dropzone drag fix (EVERY dropzone) + honest import toasts · embedded-image
display-only rule · draft macro-context fix · preset fork-once + activate · smalls batch (protocol
pair, stray-drop guard, revealHidden cadence, tool-rounds label, resolved-fallback display) ·
QUOTE-1 dialogue tinting + distinct per-theme hues (D71 pipeline) · theme wiring audit (dialogue was
the ONLY dead switch) · ST impersonate anatomy recon · PNG drop + CSP trust toggle (3 policies).

**Pre-retro pushed history:** see `git log` — D22 member viewer, impersonate/guided saga,
crunchy-cluster, parity-plus (D109/D110).
