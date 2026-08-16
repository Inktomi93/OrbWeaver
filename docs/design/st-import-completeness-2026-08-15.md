---
kind: design
status: archived
updated: 2026-08-16
---

# ST import completeness — the silent-gap sweep, orphan chats, and the not-mapped re-judgment (import-forge, 2026-08-15)

Issue #74, forge-tier, owner-redirected mid-flight: **no text-completion template mapper** (owner:
"we are never running text-complete") — Part 1 became the SILENT-GAP SWEEP ("things like regex and etc
still need mapped so they come in proper … databank to databank, character gallery to gallery … there's
lots of bits"). Ground truth is the REAL corpus (`/home/inktomi/inktomi-stack/development/neo-tavern/st-data`,
both profile dirs), measured by scratch harnesses driving orbweaver's OWN modules
(`readCardChunk`, `regexScriptCardSchema`) — never ST docs from memory. The verification pattern is the
2026-08-08 fidelity audit's per-boundary hop drive (`docs/reviews/misc/2026-08-08-import-fidelity-audit.md`).

## 0. The headline finding — where the regex data actually is, and why it never arrived

The owner's tell ("the import report has NO regex section at all") decomposes into THREE distinct
defects, each with a corpus receipt:

1. **The preset files carry the real payload, and the preset mapper silently ignores it.**
   `OpenAI Settings/Marinara's Spaghetti Recipe.json` (default-user) carries **15 genuine ST regex
   scripts** under `extensions.regex_scripts`; the live `settings.json#oai_settings.extensions` carries
   the same 15. `importStChatCompletionPreset` never looks at `extensions`, and the field is not even in
   its `dropped` list — the one class of drop the report structurally could not see. Orb's counterpart
   is exact: the D121-E script library + the `preset_regex_scripts` junction
   (`packages/db/src/schema/regex.ts:124`).
2. **The card-wire schema cannot parse the genuine ST dialect.** `regexScriptCardSchema`
   (`packages/contracts/src/regex/index.ts`) requires `name` + STRING placements; real ST writes
   `scriptName` (SillyTavern `public/scripts/extensions/regex/index.js:850`) and NUMERIC placements
   (`engine.js:281` — `{MD_DISPLAY:0, USER_INPUT:1, AI_OUTPUT:2, SLASH_COMMAND:3, WORLD_INFO:5,
   REASONING:6}`). Every genuine ST script fails `safeParse` and `parseRegexScripts`
   (`packages/server/src/kit/serde/card/index.ts:164`) drops it SILENTLY. The schema's own header claims
   "the ST CARD-WIRE shape" — today it parses only orbweaver's export dialect.
3. **The profile-dir path never wired the lift.** The composition SUPPLIES `importCardScripts`
   (`entry/compose/portability-runner.ts:140`, spread into the call at `:192`), but
   `ProfileDirImportDeps` never declared the field and `runProfileDirImport`'s `buildImportContext`
   call (`entry/import/run-profile-dir-import.ts:565-583`) never forwards it — so
   `importCharacter`'s optional-op guard (`verbs/import-character.ts:106`) no-ops. The upload door
   (`entry/compose/portability.ts:81`) wires it; the bulk path is a classic stale compose stub.

Corpus regex counts, per plane: **cards 0/313** (scanned via orb's codec — the per-card plane is empty
HERE, so defects 2+3 are zero-payoff today and full-payoff on the next imported card) · **settings-global
0** in both profiles (`extension_settings.regex` = `[]`) · **preset-scoped 15** (the whole live payload).

## 1. The class inventory (corpus class · importer reads it? · orb counterpart · disposition)

Measured 2026-08-15 over both profile dirs; "reads" is TODAY's tree pre-lane.

| # | Corpus class (where) | Corpus count | Reads? | Orb counterpart | Disposition |
| - | - | - | - | - | - |
| 1 | preset `extensions.regex_scripts` (files + live oai) | 15 + 15 (same set) | NO — silent | regex library + `preset_regex_scripts` | **MAP** (this lane) |
| 2 | card `data.extensions.regex_scripts` / V2 root | 0 / 313 | parse yes, lift dead + dialect-blind | `character_regex_scripts` lift (built) | **FIX** (dialect + wiring) |
| 3 | `extension_settings.regex` (global scripts) | 0 + 0 | NO | `global_regex_scripts` | **MAP** (read + lift + count; 0 today) |
| 4 | `extension_settings.regex_presets` | 1 collection, 0 scripts | NO | none (no script-collection concept) | REPORT-LINE |
| 5 | `character_allowed_regex` / `preset_allowed_regex` | `[]` both | NO | n/a (ST per-scope enable UI; orb models attachment directly) | REPORT-LINE |
| 6 | card `extensions.world` name-link | 35 cards name one; 2 names resolve on-disk (4 cards) | NO (worlds import UNATTACHED; "future name-link" comment `loader/collect.ts`) | `WORLD_BOOK_ROLES` + book-character junction (`linkCarriedBooks` machinery) | **MAP** (attach by exact name; dangling name → report line) |
| 7 | `world_info.charLore` (settings) | 1 binding (Test Character → Test World Lore 2) | NO | same junction, role `auxiliary` | **MAP** (with #6) |
| 8 | `chat_metadata.script_injects` | 5 chats / 6 non-empty injections | parsed → thrown away (audit §5.7) | `chat_injections` via the §5.5 converter maps | **MAP** |
| 9 | card `extensions.fav` | 1 true / 312 false | preserved in residue only | `characters.starred` (schema:51; create input has it) | **MAP** (promote + emit back; residue drops the key like `depth_prompt`) |
| 10 | ST Data Bank (`extension_settings.attachments`/`character_attachments` + `user/files/`) | ALL EMPTY (0 entries, 0 files) | NO | `domain/databank` (upload / create-from-text) | **WALK + COUNT + report line**; write-wave deferred (zero real data — fork sent, default deferral) |
| 11 | ST char gallery (`user/images/<char>/`) | EMPTY both | NO | assets gallery verbs (`add-to-gallery`) | **WALK + COUNT + report line**; same deferral |
| 12 | `user/workflows/` | 2 stock ComfyUI JSONs ×2 | NO | none (no ComfyUI store on tree) | REPORT-LINE |
| 13 | `extensions.talkativeness` | 274×0.5 (ST default), 6 non-default | residue (lossless) | none (orb arbitration has no weight) | preserved in residue; inventory row only |
| 14 | `chub`/`agnai`/`risuai` provenance | 241/14/1 | YES (residue, lossless) | — | ✓ already correct |
| 15 | `extension_settings.note` defaults | defaults only, `chara: []` | NO | per-chat notes already convert (§5.5) | REPORT-LINE (UI defaults, not canon) |
| 16 | `extension_settings.variables.global` | `{}` | NO | none (orb variables are per-chat config) | REPORT-LINE |
| 17 | `QuickReplies/` | stock Default set (3 stock STscript buttons) | NO (line exists) | none (STscript has no orb executor; orb automation is CEL) | line stands, reason sharpened |
| 18 | `extension_settings.sd` (87 keys) | present | NO | `domain/imagery` exists but ST sd config is box-local backend config | REPORT-LINE (under extension\_settings) |
| 19 | `power_user.custom_css` + `_css/user.css` | empty (len 0) both | NO | theme `css` column exists | nothing to import; inventory row only |
| 20 | `context/` `instruct/` `sysprompt/` `reasoning/` dirs + oai `context`/`instruct`/`sysprompt` | stock ST template libraries | NO | **out of product scope** (owner: never text-completion; active `reasoning` prefix/suffix ALREADY folds onto the live preset via `stReasoningParse`) | REWORD lines — no longer "separate epic" |
| 21 | backgrounds / themes landing | 23 + 5 imported | YES | `appearance.backgroundLibrary` (client reads: `features/app-shell/components/appearance-background-section.tsx` + pickers) · `themes` table via `createImportTheme` (D71 pipeline, `themesChanged` fan) | **RIGHT PLACE — verified**, no change |

## 2. Design decisions (alternatives weighed)

### 2.1 The ST regex dialect lands IN `regexScriptCardSchema` (one schema, two dialects)

**Chosen:** a normalizing preprocess on the existing card-wire schema: accept `scriptName` as the name
key (ours wins when both present — the exact `enabled`/`disabled` polarity precedent already in that
schema), and accept NUMERIC placement members mapped `0→DISPLAY · 1→USER_INPUT · 2→AI_OUTPUT ·
5→WORLD_INFO · 6→REASONING`, with `3` (SLASH\_COMMAND) and `4` (legacy sendAs) joining the existing
accept-and-drop heal. `substituteRegex` is already numeric-compatible; `minDepth`/`maxDepth` keep the
standing deliberate drop (contracts header ruling — NOT re-decided here). ST's authored
`markdownOnly`/`promptOnly`/`runOnEdit`/`trimStrings` flow through verbatim — the existing card lift
already accepts authored flags (the built D121-E precedent), so no new derive policy is minted.

**Rejected — a separate `regexScriptStSchema` beside the card schema:** two parallel IN-shapes for one
wire is the exact "parallel lossy shape" the serde-core law bans (`Spine-Config-and-Serialization.md`
§7.3), and every consumer (card lift, preset lift, global lift) would have to pick one.
**Rejected — normalizing in each caller (serde card / preset substrate / collector):** three copies of
the ST numeric map = three chances to diverge; the polarity heal already proves the schema is the one
home for ST-wire vocabulary.

### 2.2 Preset-scoped scripts: lift into the library + `preset_regex_scripts`, reported per preset

`ParsedStPreset` gains `regexScripts` (parsed at `stPresetFromJson` from `raw.extensions.regex_scripts`
through the one schema; an invalid candidate joins the preset's `unmapped` note — never silent).
`PresetImportOutcome` gains optional `presetId` (the verb knows its row; structurally compatible with
the delivery-core outcome). A new regex portability factory `createImportPresetScripts` (the
`createImportCardScripts` twin over the SAME pure `planCardLift` planner, `carried = []`, writing the
`preset_regex_scripts` junction in plan order) is injected as an optional profile op; `importPresets`
calls it after a successful preset write; unwired ⇒ counted skip with reason, per the `importPreset`
optionality precedent. The report's preset section gains per-preset script accounting.

**Rejected — embedding scripts in the orb preset FILE:** the preset file is generation config; scripts
are owner-library rows (D121-E killed embed-by-value carriers). **Rejected — resolving presetId by an
(ownerId, name) lookup op:** the verb already knows the row id; a second read is a second answer.

### 2.3 Global scripts: same planner, `global_regex_scripts` junction

Collector parses `extension_settings.regex` (count into the result either way); the driver lifts via a
new `createImportStGlobalScripts` factory (dedup against the library via the shared rule, insert only
genuinely-new, assert the global junction — the `createImportRegexScript` posture minus the portable
envelope). Zero rows on this corpus; the report prints the zero so the plane is never silent again.

### 2.4 World name-link: attach by EXACT name through the owning domain

New world-info op `attachOwnedBooksByName` (persistence factory beside `createLinkCarriedBooks`):
resolves the owner's books by the SAME exact-name key `importStandaloneLorebook` dedups on
(`persistence/import-write.ts:119`), attaches via the existing junction write, returns
`{linked, missing}` — a missing name is a report line, never a near-match (the §5.7 pinned-persona
posture). Driver runs it AFTER the character wave (worlds imported first — the ordering the collector
comment promised for exactly this). Card `extensions.world` → role `primary` when the card attached no
embedded book, else `auxiliary`; `charLore.extraBooks` → `auxiliary` (ST's own vocabulary: the world
field IS the primary, charLore is "extra books").

**Rejected — fuzzy/stem matching of the 28 dangling names:** inventing a link the author didn't record;
the dangling names get report lines.

### 2.5 `script_injects` ride the §5.5 converter unchanged

The serde parses `chat_metadata.script_injects` into typed entries; `chat-input.ts` converts each with
the SAME `ST_NOTE_POSITIONS`/`ST_NOTE_ROLES` maps the author's note already uses (they are the same ST
`extension_prompt_types`/`extension_prompt_roles` enums, source-pinned). `scan` (WI-scan flag, 1 true
in corpus) and `filter` (null on all 6) have no orb seat — documented drops at the converter, exactly
like `note_interval`. Injection order: the note first, then injects in key order.

### 2.6 Orphan chats: mint a placeholder character from PROVEN evidence only

Corpus receipts: 5 of 7 dirs are HEADER-ONLY (zero messages); Bonnie\_Cow has 2, Sala 16; header
`character_name` is the `"unused"` sentinel on 6/8 files, `"Diana"` on one, absent on Sala. So the mint
carries: `name` = the majority non-sentinel header name, else the dir name (underscores → spaces);
`description` = `""` (NEVER invented prose); provenance `importedFrom = "chats/<dir>"`; idempotency via
a SYNTHETIC importHash (`sha256("orb-orphan-chat-dir:" + handle)` — the existing byte-hash oracle reused
with a namespaced key, documented at the mint site) so a re-run resolves the same row even if the owner
renamed it; a `orphan import` tag (source `manual`, status `accepted` — the library-tag posture, attached
by the driver) so the owner can FIND every husk and flesh it out. Then the EXISTING `importChats` verb
imports the transcripts (titles, persona attribution, dedup all ride free). Header-only chats import as
empty rooms with their true creation dates — they are ST canon; refusals (if the write op declines) are
per-orphan isolated + reported. The chat-side `husk` machinery (`chat/verbs/chat-lifecycle.ts`) is an
UNSTARTED-ROOM reaper concept and does NOT fit here — checked, not assumed.

**Rejected — skip-with-report (status quo):** the owner dispatched this precisely to end it.
**Rejected — dir-name-only naming:** Diana's real header name exists; evidence beats the fallback.
**Rejected — a card field flag instead of a tag:** `importedFrom` already carries provenance, but it is
not a browsable affordance; the tag is (proposed-status was considered — `accepted` chosen because this
is importer-authored fact, not a card-shipped suggestion awaiting review).

### 2.7 fav → starred (promote out of residue, both halves)

The serde promotes `data.extensions.fav` → `CharacterCard.starred`, drops the key from residue (the
`depth_prompt`/`regex_scripts` promotion pattern), and the OUT-emitter writes it back — round-trip
stays byte-faithful (ST always writes the key; 313/313 corpus cards carry it).

### 2.8 Report honesty rework

- The three oai template fields + the four template dirs: reworded to "text-completion … — out of
  product scope (owner ruling, reaffirmed 2026-08-15)" — deferral language ("separate epic") deleted.
- `extension_settings`: reason now states what IS read from it (regex) and that the rest is extension
  state, out of scope.
- `user/`: reason now states files/images are WALKED with counts (Data Bank / gallery planes), and
  workflows have no orb counterpart.
- `world_info_settings`: reason now states `charLore` bindings ARE read; the activation knobs stand.
- NEW summary + section lines: per-preset regex lift counts, global regex count, world links + dangling
  names, orphan mints, Data Bank / gallery file counts.

## 3. Coupled-site inventory (expected blast)

`ProfileDirImportDeps` + `buildImportContext` + `portability-runner` (wiring) · `contracts/regex`
(schema + tests + any client save-boundary readers) · `contracts/preset` (`PresetImportOutcome`,
dropped-list rewording — coupled to the CLIENT single-file import dialog via
`importStChatCompletionPreset`) · `kit/serde/card` (starred + hash-mirror determinism tests) ·
`kit/serde/chat` (script\_injects parse + build half) · `domain/import` contract/views + collect +
substrate/preset + substrate/chat-input + verbs (presets, chats, character, NEW orphan verb) ·
`domain/regex` portability-write + contract/portability · `domain/world-info` (new attach-by-name op +
front door) · `domain/preset` verbs/import (presetId) · `entry/import/import-report` (sections +
UNHANDLED\_REASONS) · central test mirrors for every touched file (`tests/server/...`,
`tests/contracts/...`) · the report-literal sweep across `tests/**` for reworded reason strings.

## 4. Test plan

Red-first at every seam (each new spec run against `git show HEAD:` copies of the touched source):
verbatim Marinara scripts vs today's schema (fails: `name` missing / placement numeric) · preset lift
vs today's verb (no junction rows) · profile-dir card lift vs today's driver (no regex rows despite the
op being supplied) · script\_injects vs today's serde (sourceMetadata only) · orphan mint vs today's
driver (dirs only reported) · world link vs today's tree (books unattached). Planted positive controls
for every count line (a fixture profile whose plane is NON-empty must move the count). Corpus drive
(hops 1–3, real modules, scratch harness): preset scripts 15+15 parsed, global 0, cards 0/313, orphan
7 dirs → 7 mints predicted, world links 4 cards + 1 charLore resolved / 28 dangling reported,
script\_injects 6/6 converted. The behavioral tier: the import domain's vitest mirrors + the
`st-chat-fidelity` int suite pattern (real verbs, real :memory: db). The live db is never touched; the
real re-import stays owner-run.

## 5. Corpus-drive receipts (hops 1–3, real modules, post-build)

**OWNER-CRITICAL STAGING FINDING:** the staged `.st-data` (the `import-st` workload default root) contains
ONE profile dir — `default-user` — while the real corpus at `neo-tavern/st-data` has TWO: `default-user`
AND `nate-work` (plus non-profile server dirs `_cache/_storage/_uploads/_css/_errors`, correctly ignored).
The entire **nate-work profile sat out of the 2026-08-15 import**: 3 cards (default\_Assistant, Ruby,
Ruby1), **208 chat transcripts** (Ruby/Ruby1/default\_Assistant/default\_Seraphina), 2 chat-completion
preset files, 1 world, 5 themes, 23 backgrounds, and its settings.json personas. Re-staging with both
profile dirs before the owner's re-import is the fix; every wave is idempotent, so the already-imported
default-user content dedups.

Driven through the BUILT collector + chat-input mapper over BOTH real profile dirs (the staged snapshot's
single dir is why the 2026-08-15 report saw 7 orphans — the full corpus has 8):

- **Preset regex scripts:** `Marinara's Spaghetti Recipe (OpenAI)` 15 · `OpenAI (active)` 15 (default-user);
  0 on every other collected preset — exactly the raw-jq census.
- **Global regex:** found 0, malformed 0 (both profiles) — read-and-empty, now printed.
- **World name-links:** 35 cards name a world; resolvable NOW: Seraphina ×2 → Eldoria, Eva → Eldoria,
  Test Character → Test World Lore 1 (all `primary`) + charLore Test Character → Test World Lore 2
  (`auxiliary`); **28 dangling names** → per-character report rows.
- **User planes:** databank 0 files · gallery 0 files (counted every run).
- **Orphan bundles: 8** — the report's 7 (default-user: Aestel 2 chats · Ana 1 · Bonnie\_Cow 1 · Diana 2 ·
  Mako 1 · Misery 1 · Sala 1) **plus nate-work `default_Seraphina` (1 chat, header name "Seraphina")**,
  invisible to the owner's run because the staged snapshot lacks nate-work.
- **script\_injects:** 5 chats / 6 injection rows convert through the mapper (0 note-only injections
  elsewhere — the corpus carries no note text, audit §5.5).

## 6. Part 3 — the not-mapped re-judgment (every remaining line, one verdict each)

| Line (2026-08-15 report) | Verdict | Receipt |
| - | - | - |
| `group_nudge_prompt` | STANDS (owner law: room-owned) | not relitigated |
| `new_chat_prompt` (was dropped silently pre-report) | **MAPPED** → `formatStrings.newChatMarker` | the seat EXISTS now: `assembly/context.ts` `newChatMarkerCandidate` (G9) reads it — the drop row's "no new-chat injection slot" was stale law; red-first spec in `tests/contracts/preset` |
| `new_group_chat_prompt` | STANDS, reason TRUTH-REPAIRED | ST fires it group-only; orb's one boundary key is room-agnostic — mapping it would inject group framing into every solo chat. Corpus: meaningful only on `Default.json` |
| `new_example_chat_prompt` | STANDS | orb reads `exampleMessages` off the card with no separator/injection slot (`assembly/context.ts:273`); corpus value is the ST macro `{{trim}}` |
| `bias_preset_selected` | STANDS (owner: no logit-bias presets) | not relitigated |
| `token_padding` | STANDS (owner reason: provider-usage budgeting) | law |
| `tokenizer` | STANDS (D49) | law |
| `custom_stopping_strings_macro` | STANDS | orb's stop list is literal params; no macro pass runs over `params.stop` (the strings themselves import) |
| `auto_continue` | STANDS | orb has manual `continueNudge` only; no auto-continue-until-length loop exists |
| `context` / `instruct` / `sysprompt` (oai) + `context/` `instruct/` `sysprompt/` `reasoning/` dirs | REWORDED (owner 2026-08-15) | "text-completion is out of product scope" — deferral language deleted from `contracts/preset` + `import-report.ts` |
| theme lines (13–17 per theme) | STAND (D71 / TD O-4 / viewer-ergonomics rulings) | law; not relitigated |
| `movingUI/`, `secrets.json`, `stats.json`, `content.log`, `vectors/` | STAND | reasons accurate on today's tree |
| `assets/` | STANDS, reason sharpened | expressions design set parked; corpus dir carries 0 files |
| `QuickReplies/` | STANDS, reason sharpened | corpus holds only ST's stock Default set (3 STscript buttons); orb has no STscript executor (automation is CEL, D46) |
| `extensions/` | STANDS, reason sharpened | extension INSTALLS (code); state lives in `extension_settings` |
| `user/` | REWORDED + counted | files/images now walked (Data Bank / gallery counts); workflows = ST's stock ComfyUI pair, no orb ComfyUI store on the tree |
| `image-metadata.json` | STANDS, reason sharpened | ST thumbnail metadata for the stock backgrounds; orb derives its own at CAS time |
| `extension_settings` | REWORDED | regex now READ out of it (global scripts); `regex_presets` (1 empty collection) / `character_allowed_regex` (`[]`) have no orb counterpart |
| `world_info_settings` | REWORDED | `charLore` bindings now READ (1 in corpus); the activation knobs still have no orb home |
| session/selection/legacy lines (`firstRun` … `swipes`, `background`, `proxies`, `selected_proxy`, `horde_settings`, the three text-completion twins, `amount_gen`, `max_context`, `main_api`) | STAND | reasons accurate; not canon |

## 7. Deferred (named, with receipts)

- **Data Bank + gallery write-waves** — planes are EMPTY in the real corpus (0 files, 0 entries, 0
  images; receipts in §1 rows 10–11). This lane lands the WALK + counts + report lines so the gap can
  never be silent; the write-waves (databank `upload` / assets `add-to-gallery` per file) are a named
  follow-up for a corpus that actually carries data — tracked as [#84](https://github.com/Inktomi93/orbweaver/issues/84)
  (parked; wakes when a re-staged corpus carries Data Bank/gallery data).
- **`chat_metadata.persona` (avatar-filename vocabulary, 4 chats)** — already an open follow-up in the
  fidelity audit §5.7; unchanged by this lane.
- **Message-media CAS (audit §5.3)** — the 167 references DANGLE: `user/images/` is empty on this
  corpus, so there are no bytes to CAS. The walk + count line covers the honesty half.
