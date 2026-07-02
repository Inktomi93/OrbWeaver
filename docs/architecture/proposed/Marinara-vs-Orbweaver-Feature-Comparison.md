# Marinara vs Orbweaver — Feature Comparison (best-of-both)

> **Purpose.** For each ST-derived feature Orbweaver has scoped, compare marinara's shipped
> implementation against Orbweaver's planned (ST-grounded) port, and decide: **marinara better**,
> **Orbweaver better**, **hybrid (borrow X)**, or **ignore marinara**. Verified against
> `references/marinara-engine` source and the committed Orbweaver domain docs.
>
> **The headline.** Two clean halves:
> - **Generative/visual features** (sprites, imagery, backgrounds): marinara has real *generation*
>   capability Orbweaver's plans lack — genuine best-of-both borrows.
> - **Scripting/automation layer** (macros, variables, regex, slash, extensions): marinara is a
>   faithful **ST port that inherits ST's bugs and ST's security model**; Orbweaver's plans deliberately
>   improve *on ST*, so they sit above both. Little to borrow; a lot to avoid.

---

## Scorecard

| Feature | Marinara approach | Orbweaver plan | Winner | Borrow from marinara |
| --- | --- | --- | --- | --- |
| Expressions/sprites | **AI-generates** sprite sheets, slices, bg-removes | Curate + per-turn **classify** (ST/GoEmotions) | **Hybrid** | The sheet **generator** → feeds Orbweaver's `character_sprites` |
| Imagery / backgrounds | Two-step extract→generate, inline in route | `domain/imagery` leaf, in-chat block, hosted-only | **Orbweaver** (arch) | Asset-manifest **pick-before-generate**; avatar-ref conditioning |
| Gallery (emoji/sticker/gif) | Loose files + fs; gif via external API | Content-addressed `assets` + `listOwned` | **Orbweaver** | Gif-search external proxy (tiny, unscoped) |
| Bot-browsers | SSRF-guarded remote-hub proxies | **Unscoped** (import=reader only) | **Gap** | The whole feature + `safeFetch`/`isAllowedImageBuffer` guards |
| Macros | Shared engine + client dup | `kit/macro` (isomorphic, injected clock/PRNG/DoS) | **Orbweaver** | — |
| Variables | **Mutable bag** (`variableValues`) — ST #3263 bug | Per-variant **delta fold** along swipe pointer | **Orbweaver** (decisively) | — (avoid the bag) |
| Regex scripts | ST-parity + `isPatternSafe` heuristic | 5 placements + **`node:vm` watchdog** + 3-source authority | **Orbweaver** | — (heuristic is a subset) |
| Slash commands | 17 fixed named-arg commands | Declarative automation rules + `/imagine` as action | **Orbweaver** | — |
| Extensions/plugins | **Raw client JS/CSS injection** (`getContext` model) | **QuickJS-WASM sandbox**, capability-gated | **Orbweaver** (decisively) | — (marinara's is the anti-pattern) |
| Group / multi-participant | `characterIds.length > 1` + `if(isGroup)` branches; single-human; 2 modes | Participant **roster** + membership/authority; multi-human; 2×2 gen matrix + LLM speaker arbitration | **Orbweaver** (decisively) | `character_groups` saved-roster convenience (minor) |

---

## Part A — Generative / visual features (marinara has real borrows)

### A1. Expressions / Sprites / Emotion — **Hybrid; the killer borrow**

**The fundamental divergence:** ST and Orbweaver *curate* (an artist/user provides a folder of labelled
sprites; per turn a classifier picks the matching emotion and swaps the PNG). Marinara *generates* them:
`sprites.routes.ts` (1,999 LOC) `/generate-sheet` compiles a sprite-sheet prompt, calls `generateImage`
for a grid of expression cells (`cols × rows`, up to `MAX_INDIVIDUAL_SPRITE_EXPRESSIONS = 8`), then uses
`sharp` to slice the sheet into per-expression cells and `tryRemoveBackgroundWithBackgroundRemover` to
matte each one.

- **Orbweaver wins on architecture:** [`expressions.md`](../domains/expressions.md) is born-compliant —
  `character_sprites(characterId, label, assetId)`, per-turn classify as a chat-role shaper, `ChatEvent
  { kind:"expression" }`, GoEmotions label tuple in contracts. Marinara's is a 1,999-line God-route.
- **Marinara wins on capability:** it can *produce a sprite set from nothing*. Orbweaver's plan assumes
  sprites already exist (its open Q3 even early-outs when a character has no sprite set). That's a real
  capability gap — most users won't hand-draw 28 emotions.

> **BEST OF BOTH (recommended):** add a `generateSpriteSet` verb to `domain/imagery` (or an
> `expressions` verb that injects imagery) that produces the sheet, slices it, and **writes N
> `character_sprites` rows** — then the committed classify-and-swap path selects from them per turn.
> Marinara's generation *feeds* Orbweaver's curation model. Neither doc currently connects these two;
> this is the single most valuable cross-pollination in the whole comparison.

### A2. Imagery / Backgrounds — **Orbweaver arch wins; borrow two mechanisms**

Both do the ST two-step (quiet LLM prompt-extraction → generate). [`imagery.md`](../domains/imagery.md)
is a clean injected leaf (modes as a typed union, result is a `MessageContentBlock`, hosted-only per
D39, no DB table). Marinara's `game-asset-generation.ts` (1,012 LOC) does the same shape but wired
**inline and out-of-band** in the route, with local-SD support.

Borrow-worthy marinara mechanisms **not** in the Orbweaver plan:
1. **Asset-manifest "pick-before-generate"** (`asset-manifest.service.ts`) — the model first picks an
   existing tagged background/asset by tag; it only generates when nothing fits. A real cost/latency
   saver worth adding to `domain/imagery` (or as an automation predicate).
2. **Avatar-reference conditioning** (`gameImageUseAvatarReferences` / `readAvatarBase64`) — feed an
   existing character avatar as an img2img reference so generated art stays on-model. Maps directly onto
   imagery's `edit`/`ImageEditInput` seam (§4.3) — a concrete use for it.

Ignore: marinara's local-SD path (D39 killed local), its out-of-band UI coupling (D47 in-chat block wins).

### A3. Gallery (emoji / sticker / gif) — **Orbweaver wins; one tiny borrow**

Marinara: emojis/stickers = multipart upload → **loose files on disk** (no dedup, no CAS); gifs =
`/search` proxy to an external provider (Tenor/Giphy-style) via `getGifApiKey`. [`gallery.md`](../domains/gallery.md)
is content-addressed `assets` + `listOwned` + a curated `gallery_items` table — strictly better storage
(dedup, per-user CAS, typed).

- Emoji/sticker: **ignore marinara** — they're just `assets` in Orbweaver's model.
- **Borrow:** the **gif external-search proxy** is a small feature Orbweaver hasn't scoped. If wanted,
  it's a thin `assets`/`gallery` read verb hitting an external gif API — trivial, and marinara's is a
  clean `fetch` with zero generative coupling.

### A4. Bot-browsers — **a genuine unscoped gap**

Six SSRF-guarded proxies (`bot-browser*.routes.ts`, 1,647 LOC total) that browse/search **remote card
hubs** (Chub, Janitor/Janny, Pygmalion, Wyvern, Datacat, Chartavern): list catalogs by
`sort=download_count`, download `chara_card_v2.png`, proxy avatars — all through `safeFetch` +
`isAllowedImageBuffer`.

Orbweaver coverage: [`import.md`](../domains/import.md) owns the *reader* (parse a Chub/Pygmalion card
once you have the bytes) and [`discovery.md`](../domains/discovery.md) owns *local* browse. **Neither
covers browsing/searching a remote hub and pulling cards from it.** This is a real capability gap.

> **Decision needed (product):** is "browse external card hubs in-app" a wanted feature? If yes, it's a
> small `domain/discovery` (or a dedicated `sync`/`hub` leaf) that reuses the import reader. The
> borrow-worthy part is marinara's **security posture** — `safeFetch` (SSRF allowlist) +
> `isAllowedImageBuffer` (content-type/size validation on remote images) — which any remote-fetch
> feature needs and which Orbweaver would have to build regardless.

---

## Part B — The scripting/automation layer (Orbweaver's plans are above ST *and* marinara)

This is the "other thing": the ST feature set Orbweaver picked up — macros, variables, regex, slash
commands, extensions. **Marinara ports ST fairly literally, inheriting ST's known bugs and ST's security
model.** Orbweaver's [`automation.md`](../domains/automation.md) rethought each from first principles to
sit *above* ST. So for this whole layer, marinara is mostly a **cautionary reference**, not a source of
borrows.

### B1. Variables — **Orbweaver wins decisively (the ST #3263 fix)**

Marinara ships ST's **mutable variable bag**: `variableValues` (16 refs), `setvar`/`getvar`/`incvar`/
`decvar`, `ChoiceBlock`, `randomPick`. That model has a known correctness bug (ST #3263): a `{{setvar}}`
inside a generated message mutates shared state; **swiping** that message doesn't rewind the variable, so
re-running the setter clobbers/compounds it. ST ships it as a bug; neo/marinara declared it out-of-scope.

Orbweaver ([`automation.md`](../domains/automation.md) §1.2, DECIDED 2026-06-28): each `message_variant`
records its **variable delta**; current state = a **deterministic fold** of deltas along
`selectedVariantId` (the swipe pointer), with a materialized cache. **Swipe and fork correctness come for
free; #3263 cannot occur.** It explicitly records the mutable bag as the REJECTED alternative.

→ **Ignore marinara's variable model entirely — it's the thing Orbweaver's design exists to beat.**

### B2. Macros — **Orbweaver wins**

Marinara: a shared `macro-engine.ts` + a **duplicated** client `chat-macros.ts` (see the client-leak
finding in [`rpg/08`](rpg/08-validation-gap-and-client-leak.md)). Orbweaver: `kit/macro` is isomorphic
(one home, client+server) and already above ST on correctness (injected clock + PRNG + DoS budget), with
a committed DX layer (per-macro metadata, arg-type validation, parse diagnostics with spans,
autocomplete API) and **CEL** as the safe expression layer. → **Orbweaver; nothing to borrow.**

### B3. Regex scripts — **Orbweaver wins**

Marinara has a faithful ST regex port (`findRegex`/`replaceString`/`trimStrings`/`placement`/`promptOnly`,
macro-in-pattern resolution) plus one nice safety touch: `isPatternSafe` (a pre-compile ReDoS heuristic).

Orbweaver (D53, [`Core-Laws-and-Precedents.md`](../core/Core-Laws-and-Precedents.md)): the engine is
already built (`@orb/kit/regex`, all 5 placements, captures, `applyReplace` seam, the same pre-compile
heuristic **as defense-in-depth only**) — plus the real guarantee marinara lacks: a **`node:vm`-sandboxed
`applyReplace` with a hard per-call timeout** homed in `@orb/server/kit` (a runaway pattern throws
instead of hanging the event loop). Plus a **three-source joint-attachment model** (per-character /
preset-embedded / global) and a **host-authority vs per-user-display** precedence split for group-chat
correctness. → **Orbweaver; marinara's `isPatternSafe` is a strict subset of Orbweaver's watchdog.**

### B4. Slash commands — **Orbweaver wins (different model)**

Marinara did **not** port STscript. It has **17 fixed commands** with a simple `parseNamedArgs` (no
pipes, no closures, no `/if`/`/while`, no macro-in-command). Orbweaver doesn't port STscript-the-language
either — it replaces the imperative scripting with **declarative automation rules**
(`on trigger where predicate(CEL) do action`) and makes commands like `/imagine` **automation actions**
(D46), one path. Orbweaver's model is more principled and safer; marinara's is just a hardcoded menu. →
**Orbweaver; nothing to borrow** (and note: neither adopted STscript-the-language, correctly).

### B5. Extensions / plugins — **Orbweaver wins decisively (security)**

**This is the sharpest contrast in the whole comparison.** Marinara's `installed_extensions` table stores
raw **`css` and `js` columns injected into the client** — ST's unsandboxed extension model, full page
access. Its custom-tools add an `executionType: "script"` whose `scriptBody` is "a JS expression
evaluated server-side in a sandbox" (the actual isolation strength is unverified and, given no
QuickJS/isolated-vm dependency, likely weak).

Orbweaver ([`automation.md`](../domains/automation.md) §3, COMMITTED): a **QuickJS-ng WASM sandbox**
(`infra/plugin-host`), capability-gated via `can(principal, action, resource)`, a frozen versioned
membrane (`PluginHostV1`) that is explicitly "the antithesis of ST's `getContext()`", determinism via
injected clock/PRNG, dual-mode (installed plugins + inline snippets). It names and rejects the exact
models marinara uses (raw JS injection / ambient access).

→ **Ignore marinara's extension model — it *is* the anti-pattern Orbweaver's plugin architecture was
designed to replace.** The only thing worth noting is marinara's **custom-tool taxonomy**
(`webhook` / `static` / `script`) as a reasonable shape for user-defined tools — but Orbweaver's
`domain/tool-use` + plugin host already covers it better and more safely.

---

## Part C — Group chat / multi-participant (Orbweaver is a different universe — and it's BUILT)

The user flagged this as cross-cutting; it is. Marinara's group system and Orbweaver's are not the same
kind of thing — marinara has *multi-character solo chat*; Orbweaver has a *multi-participant room*.

> **Verified against real Orbweaver code**, not docs: `packages/db/src/schema/chat.ts` (10 chat tables),
> `packages/contracts/src/chat/index.ts` (`GroupConfig`, arbitration policies), and the fully-built
> `packages/server/src/domain/chat/` domain (roster verbs, the arbitration engine, the assembly
> pipeline). This is shipped code — in several places it beats **ST itself**, not just marinara.

### C1. What a "group" even IS

- **Marinara:** a group is `chats.characterIds` — a **JSON array of character ids** on the chat row.
  `isGroup` is literally `characterIds.length > 1`. **No participant table, no membership, no principals.**
  A separate `character_groups` table stores reusable *rosters*, but a chat's group-ness is just array
  length. Turn logic is **inline in the 11,227-line `generate.routes.ts`** as scattered `if (isGroup)`
  branches (lines 2011, 2570, 2891, 3066, 3271, 4473, …).
- **Orbweaver:** a chat is a **roster of participants** — the real `chat_participants` table
  (`schema/chat.ts`): `kind (human|character|observer-reserved)`, an **actor XOR** (`userId` XOR
  `characterId`, a CHECK constraint), `role (host|member)`, `activePersonaId`, `talkativeness`,
  `disabled`, and `joinSeq`/`leftSeq` membership horizons. **No `chats.ownerId` (D18)** — authority is
  the host participant; "list my chats" is pure membership. **Group-ness is DATA, never a branch** —
  solo = a roster of 1, byte-identical path (the `no-if(isGroup)` rule). The exact opposite of marinara.

### C2. Single-human vs multi-human

- **Marinara: single-human, full stop.** No multi-user concept in the chat schema (verified — no
  participant/member/invite columns). "Group" = 1 user + N AI characters.
- **Orbweaver: multi-human native, built.** Active persona is **per-participant**
  (`chat_participants.activePersonaId`) so each human's lines render under their own persona. Real
  membership lifecycle in `domain/chat/verbs/roster.ts` + `verbs/invites.ts` +
  `persistence/{roster,participant,invites}.ts`: `addCharacterToChat`, **`kick`**, self-leave,
  **`nominateHostHandoff`/`acceptHostHandoff`** (the accept is an un-spoofable SELF-action), all gated
  through the capability seam (`requireHost`/`requireParticipant` → `ctx.can`, in `substrate/auth/`).
  Re-join is an `ON CONFLICT(chatId,userId) DO UPDATE`. `chat_invites` is a real table.

### C3. Turn-taking / who speaks — the gap is enormous

- **Marinara: two modes.** `groupChatMode ∈ {merged, individual}` (default merged). merged = all reply
  together with speaker labels; individual = one at a time. No talkativeness, no arbitration. (ST's own
  talkativeness weighting was dropped.)
- **Orbweaver: a discriminated `GroupConfig` + a real arbitration engine.** Generation axis
  `output: narrator | per-speaker`; per-speaker carries `cardScope: merged | scoped`. Arbitration
  **`policy: natural | list | pooled | manual | smart`** (`engine/select-speakers.ts`, 163 lines, PURE +
  injected PRNG per D46):
  - **`natural`** = talkativeness-weighted sample-without-replacement via the **Efraimidis-Spirakis**
    algorithm (`key = u^(1/weight)`), explicitly *"NOT ST's independent per-member coin-flip"* — a
    documented improvement over ST.
  - **`smart`** = a **side-LLM turn director** (`engine/smart-arbitrate.ts`): a model reads recent
    history + the roster and names the next speaker, with a `natural` fallback on refusal/garble.
  - `list` (roster order), `pooled` (round-robin, ban-last), `manual` (forced only); `@mention`/forced is
    a **hard override applied before policy**.
  - **Auto-mode** (`engine/auto-mode.ts`): opt-in AI→AI chaining that **re-arbitrates every turn —
    explicitly "fixing ST's 'deaf round'"** — with a dual bound (`max-turns`/`interrupt`/`no-eligible`/
    `locked`), injected clock, and D19 identity (turns `triggeredBy` the chain-starter).

### C4. The merged-stream pain (the decisive architectural split)

- **Marinara** (and ST) render merged mode as **one assistant stream containing N characters**, then must
  stamp/strip/fence/truncate names — the "names at start of message" pain (name-stamping twice,
  `authorName` smuggling, foreign-label truncation). A persistent band-aid.
- **Orbweaver deletes it by construction:** **per-participant egocentric isolation**, and it's real code.
  `engine/round.ts` drives a group round **sequentially — "canon advances between speakers: speaker k+1
  witnesses speaker k's committed row"**; each speaker's history is folded to its own view. Presence is a
  pure predicate (`memory/build/substrate/witnessing.ts`): a character **cannot recall a scene it wasn't
  present for, including across kick→re-add (multiple join/leave intervals)**. There is no merged stream
  to un-merge, so the whole stamping/truncation quartet doesn't exist.

### C5. Per-agent model, shared memory, room config

- **Per-agent connection:** each agent can run on a different model (character on GPT, buddy "always
  cheap") — a per-agent routing axis in `domain/connection`. Marinara: all characters share the chat's
  one connection.
- **Group-as-character memory:** Orbweaver's `synthetic` group character (`groupCharacterId` in
  `GroupConfig`) — a hidden agent identity that authors narrator turns and is the room's shared-memory
  bucket. Marinara: none.
- **Room overrides + member-card privacy:** `RoomOverrides` + `memberCardVisibility` (D22, host-set,
  default `sheet`) are first-class contracts. Marinara: scattered `chatMeta` flags (`groupChatMode`,
  `groupSpeakerColors`).

### C6. Verdict

**Orbweaver wins decisively on every axis, in shipped code**, and it isn't "marinara did it worse" — it's
a categorically bigger system that in multiple places **out-designs ST** (Efraimidis-Spirakis sampling vs
ST's coin-flip; auto-mode's per-turn re-arbitration vs ST's "deaf round"; per-participant egocentric
witnessing vs the merged-stream name-stamp). Marinara implements **ST-parity multi-character solo chat**
(an array + mode flags + inline `if(isGroup)` branches in a god-route); Orbweaver implements a **built
multi-human participant room** (roster + membership + host authority + a 5-policy arbitration engine +
per-agent isolation) where solo is the degenerate roster-of-1. Marinara's approach *is* the pain set
Orbweaver's design dissolves.

**Borrow from marinara:** nothing architectural. The one minor convenience is `character_groups` — a
**saved, reusable roster** (a named party you can drop into a new chat), orthogonal to the per-chat
`chat_participants` model; if wanted it's a tiny "roster preset" store, not a change to the group model.
Ignore the rest.

> **Correction to an earlier caveat:** I previously hedged that "Orbweaver's side is planning docs, not
> built code." That was wrong — `domain/chat` is fully built and tested. The group comparison above is
> code-vs-code (marinara shipped vs Orbweaver shipped), not shipped-vs-planned.

---

## Net recommendation

- **Borrow from marinara (generative capability it actually has):**
  1. **Sprite-sheet generation → feed `character_sprites`** (A1) — the top pick; connects two Orbweaver
     docs that don't currently talk.
  2. **Asset-manifest pick-before-generate** + **avatar-reference img2img conditioning** (A2).
  3. **Gif external-search proxy** (A3) and **remote card-hub browsing + its SSRF guards** (A4) — *if*
     those features are wanted; both are currently unscoped gaps, not planned work.

- **Ignore marinara / keep Orbweaver's plan (the entire scripting layer):** variables, macros, regex,
  slash commands, extensions. Marinara is an ST port that carries ST's swipe bug (#3263), ST's
  duplicated client logic, and ST's unsandboxed-JS extension model. Orbweaver's committed designs
  (delta-fold variables, isomorphic `kit/macro`, `node:vm` regex watchdog + authority split, declarative
  automation, QuickJS plugin sandbox) are strictly better and were written specifically to beat these.

- **Ignore marinara / keep Orbweaver's plan (the group/multi-participant system, Part C):** marinara's
  group is a single-human character-array with `if(isGroup)` branches in the god-route; Orbweaver's is a
  multi-human participant room (roster + membership + host authority + speaker arbitration + per-agent
  isolated views) where solo is a roster-of-1. Marinara's model *is* the pain Orbweaver dissolves. Only
  minor borrow: `character_groups` as a "saved roster preset" UX convenience.

**One-line summary:** borrow marinara's *generators*, ignore marinara's *scripting* — Orbweaver already
out-designed ST there, and marinara only re-implemented ST.
