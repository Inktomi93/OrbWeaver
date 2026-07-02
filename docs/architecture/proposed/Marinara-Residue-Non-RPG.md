# Marinara Residue — the NON-RPG survivors (each needs its own ledger call)

> **Status: PROPOSED.** The RPG system — marinara's largest feature — is COMMITTED and designed
> (D58, [`rpg-design/`](rpg-design/README.md)); its research corpus is in git history (the
> "archive the marinara research corpus" commit, 2026-07-01). This doc is everything from the
> marinara mining that is NOT rpg and still awaits a decision, folded from the five retired analysis
> docs (`Marinara-RPG-Architecture-Consolidated` · `Marinara-Agent-System-Analysis` ·
> `Marinara-Agent-Port-Map` · `Marinara-Feature-Slot-Map` · `Marinara-vs-Orbweaver-Feature-Comparison`
> — full text in git history at the same commit). Every line here is something a future agent needs
> that exists nowhere else; when a row is decided, record it in the ledger and delete it here.
>
> **The three apps (do not conflate):** marinara-engine = an external reference app
> (`neo-tavern/references/marinara-engine`); neo-tavern = orbweaver's legacy predecessor;
> SillyTavern = the ancestor D47/D49 adjudicated. D49 closed only the ST inventory — each marinara
> row below needs its OWN ledger decision.

---

## 1. Proposed borrows (verified capability orbweaver lacks — smallest/safest first)

| # | Borrow | Lands in | Evidence (verified against marinara source) |
|---|---|---|---|
| B1 | **Sprite-sheet GENERATION → feed `character_sprites`** — generate a full expression set from a prompt, slice the grid with sharp, background-remove each cell, write N sprite rows; the committed classify-and-swap (expressions.md) then selects from them | `domain/imagery` verb (or an expressions verb injecting imagery) | marinara `sprites.routes.ts` (1,999 LOC): `/generate-sheet` compiles a sheet prompt (`compileSpritePrompt`, cells `cols×rows`, `MAX_INDIVIDUAL_SPRITE_EXPRESSIONS = 8`), calls `generateImage`, sharp-slices, `tryRemoveBackgroundWithBackgroundRemover` mattes cells. **The top cross-pollination**: orbweaver's expressions plan assumes sprites exist; most users won't hand-draw 28 emotions |
| B2 | **Asset-manifest "pick-before-generate"** — catalog existing tagged assets; the model picks by tag; generate only when nothing fits (cost/latency saver) | `domain/imagery` (generic; the rpg-design/08 identity-hash reuse is the GAME-side cousin, already committed) | marinara `asset-manifest.service.ts`: startup-scanned `manifest.json` mapping tags (`backgrounds:fantasy:dark-forest`) → files; the model receives the condensed tag list and references by tag |
| B3 | **Avatar-reference img2img conditioning** — feed existing character avatars as references so generated art stays on-model | `domain/imagery` (a concrete consumer for the D49 `edit`/`ImageEditInput` seam) | marinara `readAvatarBase64` + `gameImageUseAvatarReferences`; adopted for GAME art in rpg-design/08 §2 — this row is the generic (non-game) imagery enhancement |
| B4 | **Gif external-search proxy** — a thin read verb hitting an external gif API (Tenor/Giphy-style) | an `assets`/`gallery` read verb | marinara `gifs.routes.ts` `/search` proxy via `getGifApiKey`; clean fetch, zero generative coupling |
| B5 | **Remote card-hub browsing (bot-browsers) — a genuine unscoped GAP** — browse/search external card hubs in-app, list catalogs by `download_count`, pull `chara_card_v2.png`, proxy avatars. Neither `import.md` (reader-only) nor `discovery.md` (local browse) covers it | a small leaf (or `discovery` verbs) reusing the import reader | marinara has SIX SSRF-guarded proxies (`bot-browser*.routes.ts`, 1,647 LOC: wyvern/pygmalion/janny/datacat/chartavern + base). **The borrow-worthy part even if the feature is declined: the security posture** — `safeFetch` (SSRF allowlist) + `isAllowedImageBuffer` (content-type/size validation on remote images) — any remote-fetch feature needs both |
| B6 | **`character_groups` saved-roster preset** — a named party droppable into a new chat; a UX convenience, orthogonal to `chat_participants` | a tiny "roster preset" store consumed by chat's roster verbs | marinara `character_groups` table; the ONE group-system borrow (see §4) |
| B7 | **DECIDED (D59, 2026-07-01) — COMMITTED in full.** The plain-chat upkeep pair is designed and scheduled: `crew-lorebook-keeper` (keyed entries via the D58 `worldInfo.upsertEntries` op; direct-write, capped, hand-edit-safe) + `crew-card-evolution` (propose-don't-dispose; proposals in a `character`-owned table, owner accepts with an automatic pre-evolution snapshot). **Authoritative design: [`chat-crew-design/`](chat-crew-design/README.md)** (docs 02–03); the ledger D59 entry is the decision record | `domain/crew` (WorkloadKinds + scheduler + config) writing through `world-info`/`character` injected ops | evidence anchors preserved in `chat-crew-design/01` §2 (`Marinara-Agent-System-Analysis.md` at `7debe31`) |
| B8 | **DECIDED (D59, 2026-07-01) — two BUILD (shaped), one SUBSUMED BY BUDDY.** `crew-director` (secret arc/twists in `crew_plots`; ONE host-ring `audience:"host"` injection; no clocks/posts/tools — the director-state call argued in `chat-crew-design/02` §1; committed as designed with a mandatory pre-build playtest on CW4) + `crew-prose-audit` (ONE post-turn async kind for prose + local continuity; variant-keyed proposals → accept via `chat.editMessage`; on-demand-first ratified; D53 honored — no turn ever blocks). **`echo-chamber` is SUBSUMED BY BUDDY (ratified, Nate 2026-07-01)**: the capability is wanted and its home is buddy's observer/reaction engine (PD-45/64) — ambient-reaction richness grows there via additive `BuddySignalKind` members, never a crew member (`chat-crew-design/01` §4; recorded as has-a-home, not a rejection). **Authoritative design: [`chat-crew-design/`](chat-crew-design/README.md)**; ledger D59 | `domain/crew` (see B7); D46 Phase-8 adds triggers + one reserved action arm, never owns the crew | evidence anchors in `chat-crew-design/01` §2 |

**Recommended out (record a decision only if someone asks):** `spotify` + `haptic` (media/hardware
agents — adjacent to the ST by-design-out set), turn-games (an Uno-only seat-based framework; its one
good idea — pure engine + engine-authored legality + tool-call moves — is already absorbed as the
rpg encounter-engine template, rpg-design/07 §1).

## 2. The scripting layer — cautionary evidence (backs D46's rejected alternatives; do not re-litigate)

Marinara ports SillyTavern's scripting layer faithfully and thereby inherits ST's bugs and security
model. Kept as one-line evidence anchors for the D46 decisions:

- **Variables:** marinara ships ST's mutable `variableValues` bag (`setvar`/`incvar`…) — the known
  swipe-clobber bug (ST #3263): swiping doesn't rewind a `{{setvar}}`. This is the REJECTED
  alternative D46's per-variant delta-fold exists to beat.
- **Extensions:** marinara's `installed_extensions` stores raw `css`/`js` columns injected into the
  client (ST's unsandboxed `getContext()` model, full page access); its custom-tool `script` kind
  evaluates a JS expression server-side with unverified isolation. This is the anti-pattern the D46
  QuickJS-WASM membrane replaces. (Its custom-tool taxonomy `webhook|static|script` is a reasonable
  shape — `domain/tool-use` + the plugin host already cover it better.)
- **Regex:** ST-parity port + an `isPatternSafe` pre-compile heuristic — a strict subset of the D53
  `node:vm` watchdog. Nothing to borrow.
- **Slash:** 17 fixed named-arg commands; marinara did NOT port STscript-the-language (validation
  that nobody should — D46 uses declarative rules instead).
- **Macros:** a shared engine + a duplicated client `chat-macros.ts` (two engines that can drift);
  `kit/macro` is one isomorphic home with injected clock/PRNG/DoS budget — already above both.

## 3. The agent-pipeline post-mortem (why orbweaver never builds one — the residue of two retired docs)

Marinara ran ~21 agent types through a functional 3-phase pipeline (`pre_generation → parallel →
post_processing`) orchestrated inline in the 11,227-line `generate.routes.ts` god-route; agents
returned a custom `AgentResult` applied by a ~1,400-line `switch(result.type)`; five agent types
bypassed the pipeline entirely with hand-rolled route code (director's stateful secret-plot
double-loop, knowledge-retrieval/router, lorebook-keeper, the text-rewrite editor). The port verdict
(now enacted by D58's crew + buddy.md's agent-as-pattern law): **dismantle, don't port** — pre-gen
agents become GATHER-phase verbs, ambient/post-gen agents become Workloads, structured side-effects
become D48 tool calls, and each agent dissolves into the domain that owns its data
("domain-of-affect"). Two details worth remembering if agent features grow:

- **The custom-agent capability gate was marinara's one real trust boundary** —
  `customAgentCanApplyResult`: built-in agents' results apply freely; a USER-authored agent needs the
  matching capability flag or its result is silently dropped. Orbweaver's equivalent is `can()` on
  the tool registry (D48) — keep it that way.
- **Batching by `(provider, model)` caused cross-agent JSON bleed** that forced defensive
  carry-forward parsing at the consumption layer — a warning against batching heterogeneous
  structured completions.

Full verified analysis (contracts, call graph, phase-forcing quirks, the retry route): git history,
`Marinara-Agent-System-Analysis.md` + `Marinara-Agent-Port-Map.md`.

## 4. Group system — validation record, no borrows

Marinara's "group" is `chats.characterIds.length > 1` + scattered `if(isGroup)` branches in the
god-route: single-human, two modes, no membership, no arbitration. Orbweaver's built roster system
(chat.md Part III) is categorically bigger and in places out-designs ST itself
(Efraimidis-Spirakis arbitration vs coin-flip; per-turn re-arbitration vs the "deaf round";
egocentric witnessing vs merged-stream name-stamping). Recorded so nobody mines marinara for group
ideas: the ONLY borrow is B6 (saved rosters).
