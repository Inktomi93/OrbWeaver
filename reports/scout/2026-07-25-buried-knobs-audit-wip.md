# Buried-knobs audit — working ledger (WIP, consolidation pending)

> Owner charge: "find anywhere we're putting things in code that should be a surfaced setting or
> inherit from user settings." Rubric: (a) new surfaced setting · (b) inherits an EXISTING field the
> code ignores · (c) admin/AppSetting · (d) fine-as-code (not recorded). Two quality tiers below:
> **VERIFIED** = full-file-read bar (admissible) · **GREP-ERA** = location data only, every claim
> requires full-read re-verification by wave 2 before it becomes a finding (owner: "grep is a no-no").

## ═══ STAR FINDINGS (verified) ═══

1. **DEAD ADMIN SURFACE — `AppSettings.rateLimits` enforced NOWHERE** (entry/rate-limit-gate.ts:25-32,
   class b, SECURITY-ADJACENT): the schema + resolver + env floors + effective-config resolution all
   exist (layer.ts:91), and the gate reads `env.RATE_LIMIT_*` directly; `rateLimits.general`/`aiTurn`
   are resolved-and-consumed-by-nothing. Admin edits change nothing. Fix = gate reads
   `getEffectiveConfig().rateLimits`; route through security-executor. The dead-ended-pair class.
2. **IGNORED SETTING — `userSettings.workloads.dupThreshold`** (workloads runners/find-duplicates.ts,
   class b): the setting exists; the runner never reads it and the env interface has no slot; sibling
   compute-themes does the param→setting→floor chain correctly. Discovery-side half in wave-2 scope.
3. **BYTE-CAP FRAGMENTATION** (cross-cutting, class b/c): server truth `ASSET_UPLOAD_MAX_MIB=64`
   (upload.ts:37) is served nowhere; client invents 20 MB (composer.tsx:132), 20 MB
   (avatar-upload-field.tsx:19), 30 MB (background-upload-field.tsx:20); import caps 256 MiB + 64 MiB
   each duplicated across 3 server files + a hand-kept client mirror (import-library-section.tsx:19);
   admin-tunable `maxImageBytes` (5 MB default) governs only server-side fetches, NOT uploads. Fix
   shape: one cap concept per family, declared once, SERVED to the client, admin-tunable.
4. **SMOOTH-STREAM DRIFT — `REASONING_CPS=40`** (reasoning-block.tsx:20, class b): pipes into the
   exact `useSmoothText` primitive `chat.smoothStream`/`smoothStreamCps` govern; the sibling
   ghost-message row honors both; reasoning ignores both directions.
5. **10th SAMPLING SITE (missed by the posture inventory)**: `CARD_DEFAULT_PRESENCE_PENALTY=1.5`
   (vllm/surfaces/chat.ts:28,112) — Qwen-card-specific, applies even after the admin swaps genModel.
   Home = the admin engineLaunch tier (genRepetitionPenalty precedent), NOT the user ladder.

## ═══ VERIFIED SECTIONS (full-read bar) ═══

### infra + foundation
- image/index.ts:89-90 `DEFAULT_FORMAT="webp"`, `DEFAULT_QUALITY=80` — every re-encode; no caller can
  move it. Weak (c): `AppSettings.imageVariantQuality` beside maxImageBytes; CAVEAT variant cache key
  must incorporate quality or retune serves stale variants.
- agent-runner.ts:28 `DEFAULT_AGENT_MAX_OUTPUT_TOKENS=4096` — diverges from preset contract's 2048;
  dormant (buddy purged). (b): rebuilt caller feeds preset maxOutputTokens.
- agent-runner.ts:27 `DEFAULT_AGENT_MAX_TURNS=8` — (c)-at-most; header: the maxTurns 1-vs-8 asymmetry
  "IS the firewall" — security-review-gated, flag only.
- agent-sdk/summarize.ts:20 `SUMMARIZE_CONCURRENCY=4` — flag-and-confirm (possible deliberate
  ban-risk bound on hosted sub, D17); owner ruling needed before surfacing.
- VERIFIED HEALTHY: image-guard←maxImageBytes; vllmConcurrency; the whole engineLaunch tier (env
  floor ⊕ AppSettings, per-spawn); local-light DEFAULT_* models = genuine fallbacks behind
  routing.roleDefaults (checked both ends); env RATE_LIMIT_*/LOG_LEVEL etc. duplicate AppSettings
  BY DESIGN (documented tiers) — except finding #1 above where the consumer half is missing.

### entry + transport
- Finding #1 (rateLimits) + the import-cap triplication (#3).
- compose/chat.ts:80,778 `MEMBER_BUDGET_WINDOW_MS=24h` — (c): the budget COUNT is a live AppSetting,
  its WINDOW is a buried literal; add the sibling field or document per-day explicitly.
- upload.ts:43 `DATABANK_UPLOAD_MAX_MIB=20` — (c): design-cited but no admin recourse for a big PDF.
- catalog-refresh-scheduler.ts:23,25 refresh 1d / retry 1h — (c) low.
- auth-routes.ts:52-53 login throttle 10/min — (c) low, security-adjacent; a `rateLimits.login` field
  is the consistent home IF #1 is fixed. Never loosen by default.
- presence-registry.ts:14 `GRACE_MS=15s` — (c) borderline (anti-flicker design constant).
- Class-d notables: TRPC body 1 MiB (latent: a monster preset save could 413 — no evidence it bites).

### client + ui
- Findings #3 (client half) + #4. Everything else judged (d) after full reads — the earlier grep
  flags (pagination, debounces, MRU caps, toasts) were REFUTED by header rationale. No search
  debounce literals exist (useDeferredValue); drafts are hash-gated not time-gated.

## ═══ GREP-ERA SECTIONS (locations only — wave 2 must re-verify EVERY row) ═══

### transport-jobs (partial overlap with verified entry+transport)
catalog refresh cadences (verified above) · workloads-worker polls 2000/200/60000 (claimed plumbing)
· oidc-gc 1h (claimed plumbing) · rate-limit.ts zero-consts (claimed; consistent with verified gate).

### stats
rollups DEFAULT_LIMIT=50/MAX_LIMIT=200 · momentum DEFAULT_MOMENTUM_LIMIT=10 · wrapped limit:1 ·
MIGRATION_GAP_DAYS=30 (freshness classification) · percentiles P50/P90 · heatmap axes (claimed d) ·
rebuild CHUNK=5000 (claimed d).

### assets
variant-policy width ladders BLOB[48..400]/PORTRAIT[200,400]/BANNER[480,800] + aspect ratios ·
collect-garbage DEFAULT_GRACE_MS=1h · backfill CONCURRENCY=8 · CARD_MIME=png · mime/signature
tables (claimed d) · StoreParams.maxBytes caller-supplied (check who omits).

### workloads
finding #2 (verified-adjacent) · LIST_HARD_CAP=500 · QUEUE_HEAD_WINDOW=10 · heartbeat/cancel-poll
5000 · reaper 15000 · progress bus 256/60000 (all claimed c/d; deploy-seam-overridable).

### sessions
SESSION_TTL_DAYS=30 + SLIDE_THROTTLE=5min · OIDC_TX_TTL=10min · RANDOM_TOKEN_BYTES=32 (d, security)
· UNBOUNDED session list (no pagination at all — flag class) · role-policy env parsing (d).

### admin + import
import MAX_DIR_ENTRIES=100k · MAX_JSONL_BYTES=64MB — proposed AppSettings; admin domain clean.

### notifications + search + tool-use
notifications list 50/100 · search substrate: OWNER_OVERFETCH=4 · RERANK_POOL_FACTOR=3 ·
SCOPED_POOL_K=200 · DISCOVER_* factors/caps · DISCOVER_SEGMENTS_PER_CHAR=3 · MIN_TERM_LEN=3 ·
DEFAULT_DOCUMENT_K=5/MIN_SCORE=0.25 · field-index cache 5min/32 owners. NOTE: scout's classifications
skewed eager (pool factors smell engineering); its "inherit from rateLimits" for pagination is
wrong-home. All rows need re-judgment.

### kit
Candidates the scout called (a) that are likely (d) SECURITY/DoS FLOORS (re-judge): CEL 2KiB ·
macro MAX_DEPTH=64/MAX_OUTPUT_BYTES=1MB · ROLL_MAX=10k · MAX_INJECTION_DEPTH=100k · regex len 2048 ·
MAX_LIFT_DEPTH=32 · JPEG_SCAN_LIMIT=64k. GENUINE candidates: guided DEFAULT_PERSON="first" ·
persona inject depth=2/role="system" (preset/settings citizens) · time RELATIVE_HORIZON_DAYS=7 ·
replay-buffer DEFAULT_TTL=5s. Claimed (d) accepted pending spot-check: CHARS_PER_TOKEN=4 etc.

### contracts (raw inventory — judgment pass pending)
131 `.default()` sites + 24 `DEFAULT_*` catalogs mapped (see task output a20e08). The judgment
question per row: SEED (user edits after mint — healthy) vs LIVE-READ with no override path
(buried). Known-healthy: settings schema defaults (the settings UI edits them). Suspects to judge:
DEFAULT_MAX_OUTPUT_TOKENS=2048 · DEFAULT_COMPACT_INSTRUCTIONS · DEFAULT_MARKER_TEMPLATES ·
DEFAULT_FORMAT_STRINGS · autoMode defaults (6 turns/1500ms) · talkativeness 0.5 ·
databank chunking/retrieval defaults (does the editor exist?) · imagery template defaults ·
DEFAULT_CHAT_MODEL_ID/DEFAULT_OR_CHAT_MODEL_ID.

## ═══ VERIFIED: chat domain (full-read bar) ═══
Class (b) inheritance breaks: **`formatStrings.continueNudge` has ZERO consumers** — the preset
field exists, is editable, ST-importable (importer maps continue_nudge_prompt into it) and
turn.ts:115 hardcodes a DIFFERENT string · **`chatMetadata.toolRecurseLimit` resolver has zero
callers + NO write path** (every chat pinned to 5; "the funder tunes it" is fiction) ·
**`AppSettings.memorySummarizer` resolved, read by nothing** (digests.ts calls summarize with no
opts; OUTPUT_RESERVE_TOKENS=1024 should mirror it per the history-budget one-home rule).
Class (a): MANAGED_VERBATIM_TAIL=8 (→ compaction.verbatimTail, the missing 4th field) ·
DATABANK_SLOT_TOKEN_BUDGET=4096 (comment admits interim) · RECENT_TRANSCRIPT/RECENT_WINDOW=10
(side-gen context-window knob, ladder-adjacent) · TEMPORARY_CHAT_REAP_TTL=24h (user pref) ·
IMPERSONATE_NUDGE (new formatStrings slot — ALSO fixes the ST importer's documented drop of
impersonation_prompt) · AUTO_CONTINUE/SWIPE_MAX=1 (loops already await the knob).
Class (c): PROMPT_TRANSFORM_DEADLINE_MS=250 (small-hardware posture argues admin knob).
Healthy: memory/constants under memoryDefaults · auto-mode fully groupConfig-driven · WI
scanDepth/tokenBudget properly threaded via ForeignInputs · smart-arbitrate no-deadline (ruling).

## ═══ VERIFIED: kit + contracts buried-defaults judgment (full-read bar) ═══
**#1 FINDING OF THE AUDIT — `memory.enabled` .default(false) is LIVE-READ EVERY TURN
(compose/chat.ts:469) and NO client write path exists for the "memory" section: MEMORY IS
PERMANENTLY OFF for every user unless raw-API-patched.**
Also: worldInfo.scanDepth/tokenBudget live-read via ForeignInputs, ZERO UI (ST surfaces both
prominently) · the ENTIRE databankSettingsSchema (chunk/retrieval tuning) live-read but
`getDatabankSettings` at compose/databank.ts:64 is a STUB returning schema defaults (ignores
ownerId; the compose-stub-goes-stale pattern, live) · `settings.groupDefaults` is DEAD (server
resolves metadata.group ?? DEFAULT_GROUP_CONFIG directly — two sources of truth, one dead) ·
guidedActions.sampling schema landed (ladder lane) but the preset card edits prompt/role only —
CHECK the ladder lane's editor half at landing · memoryDefaults (11 knobs) + memorySummarizer +
rateLimits are the ONLY AppSettings without UI halves (siblings all have editors) ·
workloads.dupThreshold/computeThemesK: pane exists, knobs unbound · params.stop NOT a duplicate
(merges with customStoppingStrings, both surfaced); logitBias/advanced.* = "Advanced" disclosure
candidates. Verified-(d) list on record incl. CEL cap, macro caps, marker templates (editor
ghosts them), compaction trio (full tab), DEFAULT_GUIDED_ACTIONS (healthy seed).
Coverage shortfall (honest): ~25 protocol-constant kit modules const-grepped only — assigned to
wave 2.

## ═══ VERIFIED: character/persona/preset/connection/credentials/automation/plugin/tag/export (full-read bar) ═══
**CLEAN — the disciplined region.** One weak (a): character/verbs/list.ts:12-13 DEFAULT_LIMIT=50/
MAX_LIMIT=100 (candidate UserSettings.library.pageSize; low priority, not a bug). ZERO
ignored-setting instances — connection/resolve-role.ts and automation checkBudget both consult
their settings before code fallbacks; connection/catalog constants = model-published physics.
Demoted floors on record: credentials health throttle/strikes (security — never expose) ·
plugin crash/KV/bundle caps · automation fire/cooldown ceilings atop already-exposed knobs ·
model-cache TTLs (manual-refresh escape exists). NOTE: agent's sandbox grep was SILENTLY BROKEN
(the sandbox-grep-silent-fail class) — sweep was 100% Read-based by file tree; preset/index.ts
paged to :1074 (serde tail unread, not a knobs surface).

## ═══ VERIFIED: discovery/embeddings/databank/imagery/world-info (full-read bar, 139 files) ═══
**dupThreshold bug = TWO ARMS** (class b): duplicates/generate.ts:32 DEFAULT_DUP_THRESHOLD=0.92
(chars) + :140 DEFAULT_CHAT_JACCARD=0.5 (chats) — one unwired runner starves both;
compute-themes.ts:13 is the correct param→setting→floor pattern to mirror; fix threads
settings.workloads.dupThreshold through find-duplicates + runner-env (post-workloads-migration:
the contribution factory). **Databank dead-end = THREE LAYERS** (class b): no UserSettings.databank
section exists + compose/databank.ts:64 stub returns schema defaults ignoring ownerId +
gather-retrieval.ts never passes k/minScore/rerank into searchDocuments (rerank structurally
unreachable for chat retrieval). Class a: cooccurrence maxPairs=10k + hubFraction=0.5 (options
exist at API, no settings thread). WEAK-a DESIGN FORK (owner call): imagery PROMPT_TEMPLATES /
CAPTION_INSTRUCTIONS are structurally the guided-actions shape (user-editable prompts) with zero
override path — extending that pattern is a deliberate design lift, flagged not proposed.
Rejected-with-rationale list on record (hub-math test levers · gpt-image-1 published buckets ·
internal analytics prompts code-everywhere pattern · live-query pagination defaults already
API-overridable · DoS floors). Coverage: all 5 domains 100% full-read; preset/index.ts serde tail
(1075-1493) unread (flagged, not knobs surface).

## ═══ WAVE-2 VERIFIED: stats/sessions/admin/tag/export (102/102 files, empty shortfall) ═══
**ZERO a/b/c findings.** All grep-era stats candidates REFUTED→(d): DEFAULT_LIMIT/MAX_LIMIT/
momentum-10/wrapped-1 are caller-overridable defaults (opts.limit pattern, 6 instances);
P50/P90 definitional; CHUNK/MIGRATION_GAP engineering. Sessions constants CONFIRMED as security
floors (TTL 30d · slide 5min · OIDC 10min · 32 token bytes) = (d) by rubric. admin CONFIRMED
clean; tag/export first-ever full read: clean (DEFAULT_ATTACH_STATUS caller-overridable;
MAX_SLUG_LENGTH cosmetic). **NEW FLAG (outside a/b/c — code-quality chip): sessions
listForUser/verbs/list.ts is UNBOUNDED (no LIMIT) — an admin viewing a many-sessioned user pulls
every row.** Cross-check grep post-read: zero misses.

## ═══ WAVE-2 VERIFIED: workloads + transport/jobs + kit tail (86/86 files, zero shortfall) ═══
**dupThreshold bug SHARPENED — dead from the schema down**: (1) PARAMS_SCHEMAS["find-duplicates"]
= noParams (no per-run override even at the contract layer); (2) the runner never calls
loadUserSettings (exactly 1 of 18 runners does — compute-themes, the healthy control); (3) the
WorkloadDiscoveryEnv.findDuplicates op signature carries no threshold. dupThreshold has ZERO
references outside its own zod definition. Fix = the full chain, and post-workloads-migration it
lands in the domain contribution factory. Grep-era (a) claims REFUTED→(d) with receipts:
replay-buffer TTL 5s + RELATIVE_HORIZON_DAYS=7 (no corresponding settings field ever existed).
Catalog scheduler = THREE constants not two (poll 1h · success 1d · retry 1h). Soft borderliner:
listSchedules lacks a LIST_HARD_CAP twin (config-scale rows, likely fine — maintainer's eyes).
All engine/worker timings confirmed (d), deploy-seam-overridable.

**OWNER RULING (2026-07-25): databank settings machinery is DORMANT-BY-DESIGN, NOT ROT — "we
still want it, obviously."** Remediation = WIRE IT (UserSettings.databank section + real compose
binding + gather-retrieval k/minScore/rerank pass-through); never cull; the gate stickler must
encode the dormant-vs-dead distinction so this isn't re-litigated.

## ═══ WAVE-2 VERIFIED: assets/notifications/search/tool-use/import (111/111, zero shortfall) ═══
ALL prior (a)-leaning grep claims REFUTED with header quotes: variant ladders = anti-DoS keyspace
bounds ("attacker walking ?w=1..10000 can't mint unbounded variants") · search pool factors =
recall-vs-latency internals per their own header · import caps = hostile-input ceilings (rubric
(d)-always) · GC grace already param-overridable · StoreParams.maxBytes omissions = trusted
re-store paths, deliberate. notifications 50/100 = ordinary pagination default, prior
"inherit rateLimits" wrong on both counts (wrong home + wrong shape). tool-use CONFIRMED clean.
BORDERLINER RESOLVED BY CROSS-REFERENCE: search DEFAULT_DOCUMENT_K=5/MIN_SCORE=0.25's comment
("the real caller passes settings values") is ASPIRATIONAL — the retrieval+media audit proved
gatherRetrieval passes nothing and the feeding settings are the databank dead-end. These two
constants JOIN the databank wire-it-up item (class b).

## ═══ AUDIT COMPLETE — both waves, all sections, zero unaccounted files ═══
Final tallies: ~440+ files full-read across 2 waves. The disease concentrates in EXACTLY two
shapes: (1) SURFACES MISSING THEIR OTHER HALF — memory.enabled (no client write path) ·
worldInfo scanDepth/tokenBudget (no UI) · memoryDefaults/memorySummarizer/rateLimits (only
UI-less AppSettings) · databank settings (section+stub+passthrough, owner: WIRE IT, dormant not
rot) · guidedActions.sampling (editor half — check ladder lane) · toolRecurseLimit (no write
verb) · dupThreshold (dead from schema down, both dedup arms); (2) DEAD/DIVERGED CONSUMERS —
rateLimits gate reads env not effectiveConfig · continueNudge hardcodes a different string than
the editable field · groupDefaults never read (two truths) · agent-runner 4096 vs preset 2048.
Everything else that LOOKED like a knob was a floor with its rationale in the header.
NEXT: the Fable 5 stickler gate-design pass (owner-ruled) + the remediation program
(settings-wiring, pairs with the visual-polish phase).

## Process record
First wave over-fanned into rogue sub-scouts (leaf doctrine violation) → API rate-limit kill wave;
survivors' tables kept as GREP-ERA locations. Standing rules for all subsequent passes: leaf-only ·
read-every-file-in-full BEFORE any grep · per-file accounting · honest coverage shortfall list.
