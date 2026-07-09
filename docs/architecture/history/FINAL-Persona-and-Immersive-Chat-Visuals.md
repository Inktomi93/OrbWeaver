# FINAL — Persona system (SHIPPED) + Immersive chat visuals (Phase 3–4 spec)

```
kind: build-spec + as-built record
status: PART A (persona) = SHIPPED (2026-07-08, 1d8fc88 + panel rebuild 98d54b0). PART B (immersive) = SHIPPED
        (2026-07-08, Phase 3 02a49f1 · 4a 73b2ca4 · 4b 7fecfc3). Both halves built; aesthetic tuning owed (Part C).
scope: (A) the persona system — model + one bottom-left panel — as built · (B) the message-row / avatar /
       immersive-mode visual system distilled from SillyTavern "Moonlit Echoes" + the neo mockup, for Phase 3–4.
companion: FINAL-Character-Library-and-Editor-UX.md (character side) · docs …/UI-Theming-and-Content.md §12.
```

> **Two halves, two modes.** PART A is a *reference for how the shipped persona system works* — do not rebuild
> it; read it to understand the model before touching anything that resolves `{{user}}`. PART B is the
> *unbuilt spec* for the immersive chat visuals (Phase 3 = message-row + avatars, Phase 4 = modes + config +
> polish). Moonlit's implementations are hacky ST-extension debt; we steal the concepts and rebuild clean in
> our token-driven / compose-only system (§B.6).

---

## PART A — The Persona system  ·  SHIPPED

> **READ THIS SECTION before touching any code that resolves `{{user}}`.** It is the one area agents (and
> humans) reliably get wrong: treating the four persona pointers as one "current persona", or the three
> `{{user}}` resolution contexts as one. The terms below are LAW — use these exact names, never invent
> synonyms like "selected persona" or "the persona" unqualified. All of this is BUILT; the model is guarded by
> `tests/server/domain/chat/persona-resolution.suite.int.test.ts` (6 load-bearing guards proven red-on-break).

### A.0 The four persona pointers (memorize; every persona bug is a confusion between two rows)

A user has MANY personas (name + description + avatar). At any moment **four independent pointers** select
*which* persona applies *where* — four different stores, four different meanings:

| # | Name (use this term) | What it means, in one sentence | Scope | Orb column |
| - | - | - | - | - |
| 1 | **Default persona** | Your "home" identity — the star. A pure SEED for new chats; drives nothing live. | Global, per-user | `seeds.defaultPersonaId` |
| 2 | **Current persona** | Who you're playing as *right now, globally*. CAN be any persona — not necessarily your Default. Seeds new chats; changing it never touches an open chat. | Global, per-user, live | `seeds.currentPersonaId` |
| 3 | **Chat persona** | The live `{{user}}` for *this human's lines in THIS chat*. An explicit per-chat override. | Per-chat participant | `chat_participants.activePersonaId` |
| 4 | **Anchor persona** (the "pin") | The persona that **character-card text** resolves `{{user}}` against — frozen to who opened the chat. | Per-chat | `chats.anchorPersonaId` |

(Plus a per-*message* stamp, `messages.personaId` — records who authored each past user line so history stays
correct after a swap. A *consequence*, not a control you set.)

### A.1 THE CENTRAL LAW — `{{user}}` resolves in THREE SEPARATE CONTEXTS

`{{user}}` does **not** have one value. It resolves by **which kind of text** it's in:

- **CARD `{{user}}`** (character-authored fields — description, personality, scenario, greetings, examples,
  char lorebook) → the **Anchor persona (#4)**. "Who the *character* thinks you are." Frozen at chat-open.
- **PROMPT `{{user}}`** (live generation — your current turn, gen config, system prompt, injected instructions)
  → the **Chat persona (#3)**. "Who's *speaking right now*."
- **HISTORY `{{user}}`** (every message ALREADY in the log — plus its name+avatar attribution) → **that row's
  own `messages.personaId` stamp**, not your current persona. A line authored as Nate stays Nate's forever.

> **One-line test:** *"Where is this `{{user}}`?"* → character-author's text = Anchor (#4); the live turn =
> Chat persona (#3); a message already in the log = its own `personaId` stamp.

**How it's wired (all correct — do not rebuild):**

- Card vs Prompt: `AssembleContext` carries both `pinnedPersona` (= Anchor) and `activePersona` (= Chat
  persona) (`contracts/chat/index.ts`); `assemble.ts` feeds card-derived sections `pinnedPersona`, user-authored
  sections `activePersona` (`assembly/context.ts`).
- **BOTH `{{user}}` AND `{{persona}}` ride the SAME routed persona object** (`macroOptionsFor` maps
  `persona.name → {{user}}`, `persona.description → {{persona}}`, `assembly/macros.ts`). So card `{{persona}}`
  resolves the ANCHOR's *description* too — orb pins the whole persona object, not just a name. (PersonaPin only
  string-replaced `{{user}}`; base ST has no pin at all. Orb is strictly ahead.)
- History: **storage is RAW, resolved at consumption** (`kit/macro/row-macros.ts` §0). `resolveRowMacros`
  resolves each row against its OWN stamp (row wins; current persona is only the null-stamp fallback); the SAME
  atom runs server-assemble AND client-display, so what you see == what the model gets.
- Canon writes: send stamps `messages.personaId` = explicit ?? the acting participant's active persona
  (PD-100); avatars on old rows follow the frozen stamp too. **Swapping current/anchor never rewrites history.**
  The only deliberate history-restamp is `reattributePersona` (author-or-host per-row) — the escape hatch.

### A.2 The canonical worked example (the acceptance test — guarded in the suite)

> Default (#1) = **Nate**. Open a chat with **Mary**, whose card says *"`{{user}}` is my brother."* You start as
> Nate → Anchor (#4) = Nate, Chat persona (#3) = Nate. Card `{{user}}` = Nate, Prompt `{{user}}` = Nate.
>
> Mid-story you kill Nate and swap to **Steve** (Current #2 → Steve, this chat's Chat persona #3 → Steve). Now:
> Mary's CARD `{{user}}` is **STILL Nate** (the established "brother" — Mary isn't told "Steve is my brother");
> PROMPT `{{user}}` = **Steve**; **Nate is still your Default**; past Nate messages stay Nate.
>
> **Brown-hair corollary:** Nate's persona description ("my hair is brown") lives only in a live injection, never
> stored. Naive active-only injection would drop it on the swap → Mary forgets her brother's hair. The
> both-personas rule (A.1) keeps the ANCHOR's description injected as card-context, so Mary retains it. Re-pin
> the anchor to Steve → the relationship *transfers* ("Steve is my brother") and Nate's context drops.

### A.3 Precedence — a SEED chain resolved ONCE at chat-open (not a live fallback)

`Anchor (#4) / Chat persona (#3) at chat-open = explicit choice ?? character-connected persona ?? Current (#2)
?? Default (#1)` (`start-chat.ts`). After chat-open the chat holds its own concrete ids — which is why changing
global Current/Default later never disturbs an open chat. Per-chat changes (set Chat persona #3, re-pin Anchor
\#4) happen inside that chat and affect only it.

### A.4 The traps — "these are NOT the same thing"

- **Current (#2) ≠ Default (#1).** Play as Steve while Nate stays your home/star.
- **Current (#2, global) ≠ Chat persona (#3, per-chat).** The panel's global swap does not silently mutate an
  open chat; the "This chat:" control does.
- **Anchor (#4) ≠ Chat persona (#3).** Anchor drives CARD `{{user}}` (frozen); Chat persona drives PROMPT
  `{{user}}` (live). A mid-chat swap changes Chat persona, leaves Anchor alone.
- **Anchor is orb's invention** (from Nate's `SillyTavern-PersonaPin`; base ST has no card-vs-prompt split). Do
  NOT "simplify" orb to match ST. And do NOT copy PersonaPin's DOM-hack mechanism — orb owns assembly and
  resolves card `{{user}}` → Anchor cleanly, mutating nothing.
- **Both-personas on a swap:** when Anchor ≠ active, BOTH descriptions inject — active in its prompt slot (its
  own `descriptionPosition`), anchor as a framed card-context block — each macro-resolved against ITS OWN
  persona (no `{{user}}` cross-contamination). `anchor == active` → one block, byte-identical (regression-tested).

### A.5 The UI — ONE bottom-left account + persona panel (as built)

Everything persona-manage lives in **one panel** off the rail-foot chip (`features/persona/`, route-injected
into a new app-shell rail-foot slot — the mock-neo bottom-left profile concept, finished). No separate
Settings→Personas pane, no in-chat picker, no `whoami`, no dual home.

- **Account strip:** current identity + a working **Log out** (`POST /api/auth/logout`). *(The identity
  *display* — username/avatar — is the one deferred bit → auth #50; log-out already works.)*
- **"Playing as" header + ＋New persona.**
- **Persona list — identity edited IN the row (autosave; NO Save/Edit buttons):** click the **avatar** to
  change the picture (file picker → `uploadAsset`, partial patch), click the **name** to rename inline; the
  **row body** sets **Current (#2)**. At rest the row shows only glanceable status (gold Crown = Default #1,
  red Heart = favorite `starred`); **hover/focus reveals the action cluster** — ♥ favorite · ★ set-Default ·
  🗑 delete — so the name keeps full width. A **⌄ chevron** (a disclosure, not an edit button) expands DETAILS.
- **DETAILS = expand-in-row, fully autosaving** (`createAutosaveEntityForm`): `title` (never prompt-injected)
  · `description` (macro-aware + token count, help as a ⓘ hover tip) · a single **Placement** dropdown
  (`descriptionPosition`) that reveals a compact `inject.depth`/`role` ONLY when `at_depth` (assistant\@0 guard
  kept) · a **single-select** connected-lore-book dropdown · the provenance chip · duplicate / export. Identity
  (avatar/name/favorite) is ROW-owned — not repeated here. NO Save button, NO dirty pill. (Field help is a
  ⓘ hover tip via the shared `Field` primitive's new `hint` prop, not inline description text.)
- **"This chat:" section** (renders only when a chat is active — reads `state/active-chat-store`): set the
  per-chat persona (#3), host re-pin the anchor (#4), reattribute. Backed by two small server touches:
  `setActivePersona.targetUserId` optional (defaults to caller) + `ChatDetail.viewerActivePersonaId` /
  `viewerIsHost` / `viewerUserId`.
- **One panel scroll** — the whole popup caps to the Base UI positioner's `--available-height`; no nested peephole.
- **Persona settings moved OUT of the panel → Settings → USER → Personas** (`features/settings`, route-composed):
  the `showNotifications` (persona-switch toast) pref + restore-from-backup (`persona.import`). The panel is now
  purely the switcher + editor; peripheral prefs live in Settings.

**Model parity note:** this is ST's persona-panel-does-per-chat pattern (their Default / Character / Chat
connection scopes, toggled from the panel), minus ST's `this_chid` ambient coupling (we read the shared store),
plus the anchor. ST's **Character** lock (connect a persona to a character — `connectToCharacter`, the
`character_personas` junction) is the one scope not yet surfaced in the panel; add it to the panel or the
character editor when wanted.

### A.6 What shipped (Phase 2, commit 1d8fc88) — do NOT rebuild

- **Server/contracts:** `seeds.currentPersonaId` (#2) + the extended seed chain; `setChatAnchorPersona`
  (host-gated re-pin); `setActivePersona` self-default; viewer-scoped `ChatDetail` fields; the persona
  **description-placement wiring** into the existing `assembly/injections.ts` system (`at_depth` → a
  `ChatInjection`, `in_prompt` → `{{persona}}`, `none` → skip); the **both-personas card/prompt injection**
  (+ the `personaMarkerActive` double-emit fix it caught); `persona.duplicate`/`export`/`import`; the
  `showNotifications` setting. (`reattributePersona`, `connectToCharacter`, persona↔worldbook link, the two
  `{{user}}` contexts, and `PersonaDetail.avatarHash` were already built pre-Phase-2.)
- **Client:** the whole `features/persona/` slice (panel surface + `persona-panel-row` + `persona-editor` +
  `persona-this-chat-section` + `persona-world-books-section`, hooks, lib) + `forms/bound-fields/macro-field.tsx`
  - the app-shell `railFoot` slot + `home-page` wiring. Route-composed; zero feature→feature imports.
- **Guard:** `persona-resolution.suite.int.test.ts` (the 4 worked examples + card-`{{persona}}`→anchor +
  canon-freeze; 6 guards proven red-on-break).

### A.7 Deferred / follow-ups (tracked)

- **Account identity display + OIDC + session management** → auth feature #50 (task #19). `viewerUserId` is on
  the wire now (kept — a benign own-id passthrough) so reattribute can filter your own messages.
- **CSRF on `POST /api/assets/upload`** (task #16) — auth-gated only today; low severity.
- **Cast-producer unification** (task #17, §A.8) — lands WITH agent-principal (D60).
- ST's **Character** persona-lock scope in the panel (above). `reattribute` currently scopes to the recent 100
  messages (no server bulk resolver) — widen with a server-side "restamp mine" mode if wanted.

### A.8 The avatar/name producer "smell" — fix lands WITH agent-principal (D60)

Message-row NAMES come from producers (`characterNamesById`/`personaNamesById`) while AVATARS are split
(personas via a stamped-id producer with full history coverage; characters inline off the roster `ParticipantView.avatarHash`,
which leaves a documented "since-left character avatar on an old row" gap). The name/avatar split is CORRECT
(names are macro subjects needed by server+client; avatars are client-only chrome — merging drags chrome
through the macro path). "Just read the roster" fails: the roster is current-only, but historical fidelity
needs old rows to show the frozen persona/character (name AND avatar). **The real smell is the character
asymmetry**; the clean fix is a per-kind **cast producer** (`characterCastById`/`personaCastById` over active ∪
stamped ids, macro-resolution projecting name/description). **DECISION: land it WITH agent-principal (D60)** —
that committed lane adds the 4th kind `agent` + reworks this exact cast/name-set/attribution surface, so the
cast becomes kind-polymorphic (character | persona | agent) there; unifying now = design for 2 kinds then
rework for the 3rd. **Implication for Phase 3: build avatar/name resolution KIND-READY so the agent third axis
is a one-arm add, not a rework.** (Consistency-checked against D60/D61: personas stay per-human; a
`roster_preset` sets `anchorPersonaId` at start; attribution derives from the roster map, never body-parse.)

---

## PART B — Immersive chat visuals  ·  PHASE 3–4, TO BUILD

The Moonlit steal-and-improve list (message row + avatars + immersive modes), rebuilt clean.

### B.1 Message-row redesign (Phase 3 — DECIDED; ST/Discord-standard)

Today the row is vertically stacked (`[avatar+name] / [bubble] / [metadata] / [actions] / [swipes]`,
`chat/components/message-row.tsx`); `RowSkin` is only two class-producers (`outer`/`inner`) and avatar/name/action
placement is hardcoded, style-independent. The redesign is a real JSX restructure:

- **Avatar-LEFT**, a sibling flex item *outside* the bubble (intrinsic width) + a content column (`flex:1`).
  Never nest name/actions inside the avatar column.
- **Name + per-message actions on ONE row** atop the content column, `justify-content: space-between` (name-group
  left with optional timestamp `align-items:baseline`, actions right). Reuse for bubble+flat.
- **Avatars-off is trivially clean** — name+actions live in the content column, so hiding the avatar
  (`showInChatAvatars`, already in the appearance schema) is a one-line `display:none`, zero reflow. (Nate's
  work-safe case.)
- **Actions: dim-at-rest → brighten-on-hover** (`opacity ~0.4 → 1`, already opacity-based in
  `message-actions-reveal.ts` — a small tweak) + a **`drop-shadow` on the icons** so they stay legible over glass /
  a background photo. (The fix for "actions invisible over glass.")
- **Mirror your own messages right** — already done (`alignFor(role)`: user→`items-end`). Character avatar sits
  left of their (left) bubble; YOUR avatar sits right of your (right) bubble.
- **BUILD KIND-READY (§A.8):** the avatar/name resolution the row consumes must be shaped so the coming `agent`
  participant kind (D60) is a one-arm add, not a rework — resolve by a `kind`-aware seam, don't hardcode
  character-vs-persona.

### B.2 chatStyle immersive modes (Phase 4)

`chatStyle` is an exhaustive `Record<ChatStyle, RowSkin>` (`chat/lib/message-row-variants.ts`); a new mode = a
`RowSkin` entry + one literal added to BOTH tuples (`clamp.ts` + `contracts/theme/override.ts` — the pairing
test enforces it). **`RowSkin` currently can't express a different DOM shape (avatar-bleed / sticky portrait) —
EXTEND `RowSkin`** (stay in the tsc-forced Record) rather than branch JSX on `chatStyle`.

| Mode (Moonlit) | Concept | Clean orbweaver build | Verdict |
| - | - | - | - |
| **Echo** | character portrait bled into the bubble edge as faded background art | avatar URL as an inline CSS var on the bubble at render (we control render — NO MutationObserver) + `background-size:cover` + a token-driven `mask-image` edge-feather; legible via our scrim | **BUILD** |
| **Ripple** | VN sticky tall portrait — `position:sticky;top:0`, 2:3, pinned while a long gen scrolls | `position:sticky` avatar + the 2:3 portrait variant (§B.4, DONE) + `object-fit:cover` (Moonlit forgets this and stretches — we're better); VN portrait ignores the global round/square pref. NOT the D49-cut `waifuMode` | **BUILD** |
| **Whisper** | faded avatar banner across the top + accent stripe | Echo-family `RowSkin` (banner mask + accent stripe painted from the character's theme color) | **BUILD** |
| **Hush** | flat + a theme-color accent stripe as the speaker indicator | "flat but color-coded" — a `RowSkin` that adds the accent stripe to the flat shape | **BUILD** |
| **Tide** | per-`<p>` bubble "trains" (iMessage) | a real render change — split prose into per-paragraph bubbles; guard long-RP stacking with sane spacing | **BUILD** |

> **OWNER DIRECTIVE (2026-07-08): build ALL FIVE modes now, properly, once — no "adapt later."** Echo · Whisper ·
> Hush · Ripple · Tide all ship as first-class `RowSkin` entries in Phase 4, done clean in our token/compose
> system, coexisting with bubble/flat/document as user picks. Do it right the first time even if it's more work
> (constitution: committed → full cold-read bar, no thin/partial). Per-mode geometry lives in the SKIN, not a
> user pref. Also build the immersive-mode **hide-user-portrait** default (Moonlit `hideEchoUserIllustration`/
> `hideRippleUserAvatar`): bleed the CHARACTER's art, never your own — the user's own bubble stays clean.

### B.3 Avatar versatility (Phase 3 — appearance prefs + the Avatar primitive)

Today: `avatarSize` sm/md/lg + `avatarShape` round/square. The `@orb/ui/avatar` primitive has round/square only —
**no aspect, no ring** (both net-new; add as `tv` variants). ADD:

- **Shape:** + `rounded` (rounded-rect).
- **Aspect:** + **`portrait` (2:3)** — the presence lever the immersive modes need.
- **Ring:** border on/off + an **accent-ring** from the character's theme color (reuse for active-speaker
  highlight; Moonlit's `is_fav`/`selected` glow).
- New appearance fields (inline enums per `no-inline-union-redecl`) thread via `useMessageAppearance` →
  `MessageRow` → `<Avatar>` (a prop chain, NOT a DOM stamp). **Per-chatStyle avatar behavior** (sticky/bled/
  banner/hidden) lives in the SKIN, not a user pref.

### B.4 The sharp 2:3 portrait variant  ·  DONE (Phase 1)

The 2:3 smart-crop portrait variant is BUILT: `infra/image` gained `fit:'cover', position:'attention'` (smart/
entropy crop — face-safe, not center); `variant-policy` a portrait ladder; `resolve-variant` a kind-keyed cache;
`blob.ts` a `?v=portrait&w=` selector; contracts a portrait `blobUrl` helper. The width-only icon ladder is
unchanged. **Phase 4 CONSUMES it** for Ripple/VN `<img>` modes (thumb for icons, portrait variant for big
portraits). Nothing to build here — just call the portrait helper.

### B.5 New config concepts (Phase 4 — mined from the Moonlit JSON, not just CSS)

Genuine deltas to add:

1. **Background-image BLUR** — separate from the scrim/`backgroundDim`. Blur the *photo itself* via `filter:
   blur()` on the photo div in `theme-background-layer.tsx` (NOT `backdrop-filter`; keep the scrim crisp). Add a
   `backgroundBlur` appearance axis (composes with dim). **Steal.**
2. **The "last-in-context" boundary marker** — a subtle accent divider marking the last message INSIDE the AI's
   context window (you can *see* where the model's memory cuts off). Needs a per-message "last in context" flag
   from assembly; if absent it's a small server field. Render it mirroring the `[data-shadow]` bubble pattern.
   **Steal.**
3. **Per-mode avatar sizing** — each immersive mode carries its own avatar geometry (Echo 20%×300px, Ripple
   180/100px). The immersive skins define their avatar dims (tokens/defaults).
4. **Granular reading-typography** — Moonlit exposes per-message line-height, letter-spacing, paragraph spacing,
   name/body font sizes, **and a justify-body-text toggle** (`justifyParagraphText`). We only have global
   `fontScale`. Add a **reading-typography** set (incl. the justify toggle) → root vars via
   `useAppearanceRootEffects` (reaches portals, font-scale precedent), consumed on `[data-slot="message-bubble"]`.
   New tokens → `tokens.json` → `tokens:build` (freshness-tested). **Steal.**
5. Minor: denser composer, click-avatar-to-enlarge, accent-tint-the-UI (`enableThemeColorization`), user-tunable
   blur strength, **LLM-icon in the reasoning block** (`showLLMReasoningIcon` — a reasoning-block metadata chip),
   mobile-fine knobs (inline metadata on mobile is the one real consideration). **Full 59-knob inventory
   cross-checked** against `moonlit-echoes/src/config/theme-settings.js` + both theme JSONs — every genuine
   visual concept maps to something orb already has (theme engine / avatar prefs / metadata chips / dim /
   reduced-motion), a §B.5/§B.5b steal, or ST-specific cruft correctly skipped (menu-height locks, favorite-symbol
   customization, QRs-bar, lorebook-topbar). Nothing else new.

### B.5b Polish worth stealing (portable, token-clean)

- **Chat-list edge fade** — `mask-image` gradient on the scroll container (softly dissolves top/bottom under the
  header/composer). Pairs great with glass. **Steal.**
- **Composer escalation** — quiet→hover→focus, via a **border/ring + bg-alpha step, NOT `opacity`** (opacity dims
  the text/placeholder). **Adapt.**
- **Hairline avatar border (\~1.25px, theme-tinted)** — keeps avatars from dissolving into a blurred/photo bg
  (auto-on when a background image is active). **Steal.**
- Moonlit's "polished" feel is 100% `transition` timing, zero `@keyframes` — consistent with our token/compose
  philosophy.

### B.6 What NOT to port (Moonlit's blockers — all vanish in our architecture)

- **JS `MutationObserver` injecting `--mes-avatar-url` per DOM node** → we render each row; put the URL in an
  inline CSS var at render. Gone.
- **`!important` sprawl** → we own 100% of our CSS. Gone.
- **Hardcoded px/% magic numbers, per-mode duplicated overrides** → tokens, parameterized once. Gone.
- We also get theme-awareness, contrast-safe foregrounds, the scrim/reading-surface, and mobile-adaptivity for
  free — so the same effects render legible over any background, which Moonlit's don't.

---

## PART C — Where things stand (2026-07-08)

**DONE + committed — the whole persona + immersive lane is SHIPPED:**

- **Phase 1 — images foundation (#67)** (`36b9842`): asset-URL resolver + upload + the client `uploadAsset` +
  `avatar-upload-field`; the 2:3 smart-crop portrait variant (§B.4); avatarHash joined onto roster/message views
  - the PD-28 co-participant persona-avatar reference-check.
- **Phase 2 — the persona system** (`1d8fc88`): all of PART A. Gate green, guarded by the invariant suite.
- **Persona panel rebuild** (`98d54b0`): the §A.5 as-built panel — edit-in-row (click avatar→picker, click
  name→rename), autosave (no Save/Edit button), chevron discloses details, one-dropdown injection, single-select
  lore book, ⓘ hint tooltips, notify/backup → Settings. Hover-reveal row actions (name keeps full width).
- **Phase 3** (`02a49f1`): avatar-left message row + name/actions on one row + avatar versatility (rounded shape,
  2:3 portrait aspect, accent ring) — KIND-READY (`RowAttribution.kind` seam). Also fixed a pre-existing
  self-referential `--radius-card` bug that was square-cornering every `rounded-card` element app-wide.
- **Phase 4a** (`73b2ca4`): all five immersive modes (Echo/Whisper/Hush/Ripple/Tide) as first-class `RowSkin`
  entries (avatarTreatment/bubbleDecoration/bubbleLayout — data, not `switch(chatStyle)`); hide-user-portrait
  baked in; per-mode geometry tokenized.
- **Phase 4b** (`7fecfc3`): config axes (bg-blur, reading-typography, accent-tint, blur-strength, reasoning-icon)
  - the last-in-context boundary marker (`context_boundary_message_id` threaded through assembly) + polish
    (edge-fade, composer escalation, hairline border) + the two gap-fixes (portrait-icon collapse, streaming-row
    decoration). Guarded: 678 chat-domain tests green (persona-resolution + byte-identical suites intact).
- (Earlier this session: the theme engine WS0–WS3, D63 background→appearance, the cascade-contract suite.)

> **Aesthetic pass still owed a human eye:** the five immersive modes + the new config axes were verified for
> MECHANICS (computed-style receipts) + correctness (gates + the invariant suites), but not fully eyeballed
> live — flip `chatStyle` in Appearance and tune to taste.

**Other tracked lanes:** #5 settings search · #13 character library+editor BUILD (design in the companion doc) ·
\#16 upload CSRF · #17 cast-producer unify (with D60) · #19 account section (with auth #50).

## PART D — Notes for whoever builds Phase 3–4

- The immersive work is **client-heavy** (message-row, avatar primitive, appearance schema, tokens, the bg-layer)
  - a couple of small server touches (the context-boundary "last in context" flag, if assembly doesn't expose it).
- Respect the client-structure law (buckets-as-roles, surface purity, `@container` not layout-props, `state/` for
  stores, form factories) — see `UI-Architecture-and-Layout.md` §2.1/§4/§4.3/§5/§5.1/§6.1, and the persona lane
  (`features/persona/`) as the freshest worked example.
- `done ≠ rendered`: verify immersive modes LIVE in the browser (they're pure visual) — and run the visual pass
  BEFORE the full `pnpm test` gate, since `lifecycle.int` binds `:8788` and will knock out a live dev server.
- Backgrounds shipped with ST/Unsplash placeholder images (TEMP — swap for CC0/original before ship; see the
  `public/backgrounds/` README).
