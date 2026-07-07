# FINAL — Persona build-out + the Moonlit-Echoes steal-and-improve list (immersive chat visuals)

```
kind: build-spec   status: authoritative capture (2026-07-07)   author: design session synthesis
scope: (A) the persona system + its UI home · (B) the message-row/avatar/immersive-mode visual system
       distilled from SillyTavern "Moonlit Echoes" (reference/upstream/moonlit-echoes) + the neo mockup.
companion: FINAL-Character-Library-and-Editor-UX.md (character side) · docs …/UI-Theming-and-Content.md §12.
```

> Cold-read capture written under low context to preserve a long design session. Everything below is a
> DECIDED direction unless marked "open". Moonlit's *implementations* are hacky (SillyTavern-extension debt);
> we steal the **concepts** and rebuild clean in our token-driven / compose-only system — which removes every
> one of their blockers (see §B.6).

---

## THE KEYSTONE DEPENDENCY (read first): #67 — the client asset-URL resolver + upload flow

Nothing in the app renders an **uploaded image** yet — character avatars, persona avatars, and the theme
`background` asset arm ALL fall back (initials / seeded / external URL) because there's no client asset-URL
resolver/upload flow. This is **#67 / PD-131**, and it's the single highest-leverage piece: it unblocks
avatars, persona images, AND background images at once. Everything visual below that involves a user-uploaded
image is gated on it. Build it first.

---

## PART A — Persona build-out

### A.1 The home (DECIDED — Nate's call)
The persona lives in the **rail-foot avatar/account chip** (bottom-left), NOT a rail section, NOT buried in
settings. The chip shows **the current user + who they're playing as (active persona)** with a **quick-swap**;
clicking **expands** to do more (manage/create personas). This is the neo-mockup concept Nate likes —
*minus* the mockup's separate left-rail persona panel, which he explicitly rejected. So:
- **Rail-foot chip (rest):** current persona avatar + name ("playing as <persona>").
- **Click → quick-swap popover:** list of the user's personas → pick one = set active persona (immediate).
- **"Manage personas" →** the persona editor (a `createSavedEntityForm` entity editor — name, description,
  avatar, the persona's own theme override if wanted). Home it as a settings category OR a modal off the chip;
  do NOT make it a rail section.

### A.2 Current state (verified this session)
- **Server persona domain is BUILT** (`domain/persona/`: verbs/persistence/service/substrate). The `personas`
  table has a **nullable avatar-asset pointer** (`packages/db/src/schema/persona.ts`).
- **Client `features/persona/` is a bare `.gitkeep` stub** — no picker/menu/editor yet. THIS is the net-new UI.
- **The message row ALREADY resolves user attribution symmetrically** — `resolveRowAttribution`
  (`chat/lib/attribution.ts`) resolves USER rows via `message.personaId` → `personaNamesById`, falling back to
  `activePersonaId`, then "You". Same `Avatar` slot as the character side ("one avatar box, two data sources").
  So user name/avatar *holders* exist; the **only** gap is the avatar `src` (initials until **#67**).
- **Persona images reuse the SAME pipeline as character avatars** — route the `personas` avatar-asset pointer
  through the identical `domain/assets` CAS + sharp variant policy. Do NOT build a parallel persona-image path.

### A.3 Build checklist
1. #67 (asset resolver) — prerequisite for any persona/character avatar image.
2. `features/persona/` client slice: the rail-foot switcher (quick-swap) + the persona editor
   (`createSavedEntityForm`). Reuse the character-editor patterns.
3. Wire the message-row `Avatar` `src` (once #67 lands) for both character and persona rows.
4. (Later/optional) per-persona theme override + mirrored-right user-message layout (see §B.3).

---

## PART B — The Moonlit steal-and-improve list (message row + avatars + immersive modes)

### B.1 Message-row redesign (DECIDED — ST/Discord-standard, verified against real ST + Moonlit)
- **Avatar-LEFT**, a sibling flex item *outside* the bubble (intrinsic width) + a content column (`flex:1`).
  Never nest name/actions inside the avatar column.
- **Name + per-message actions on ONE row** at the top of the content column: `justify-content: space-between`
  — name-group left (name + optional timestamp, `align-items:baseline`), actions right. Reuse for bubble+flat.
- **Avatars-off is trivially clean:** because name+actions live in the content column (not the avatar column),
  hiding the avatar is a one-line `display:none` with ZERO reflow. (This is Nate's work-safe case + the
  existing `showInChatAvatars` pref, which already exists in the appearance schema + settings UI.)
- **Actions: dim-always → brighten-on-hover** (`opacity ~0.4 → 1` on hover/focus), NOT `display:none`-until-hover
  (avoids layout shift, more discoverable) + a **`drop-shadow` on the icons** so they stay legible over glass /
  a background photo. ← this is the fix for "actions invisible over glass."
- **Mirror your own messages right** — we ALREADY do this (`alignFor(role)`: user→`items-end`). With avatar-left,
  the character's avatar sits left of their (left) bubble, YOUR avatar sits right of your (right) bubble.

### B.2 chatStyle skins — expand from bubble/flat/document to include immersive modes (DONE CLEAN)
`chatStyle` is an exhaustive `Record<ChatStyle, RowSkin>` (`chat/lib/message-row-variants.ts`) — adding a mode
= a skin entry + one union member (`tsc`-forced). Immersive + clean modes COEXIST as user picks. For an RP app
pre-launch, immersive presence modes are the vibe, not a nice-to-have.

| Mode (Moonlit) | Concept | Clean orbweaver build | Verdict |
| - | - | - | - |
| **Echo** | character portrait **bled into the bubble edge** as faded background art | avatar URL as an inline CSS var on the bubble at render (we control render — NO MutationObserver needed) + `background-size:cover` + a token-driven `mask-image` edge-feather. Legible via our scrim. | **BUILD** |
| **Ripple** | **VN sticky tall portrait** — `position:sticky;top:0` avatar, 2:3 aspect, stays pinned while a long gen scrolls | `position:sticky` avatar + the portrait aspect variant (§B.4). Add `object-fit:cover` (Moonlit forgets this and *stretches* — we're better). Documented shape-override: VN portrait ignores the global round/square pref. NOT the D49-cut `waifuMode` (that's full-screen expression sprites — different, still out). | **BUILD** |
| **Whisper** | faded avatar **banner** across the top + accent stripe | Echo variant; low priority | adapt later |
| **Hush** | flat + a theme-color accent stripe as the speaker indicator | a "flat but color-coded" option | adapt (minor) |
| **Tide** | per-`<p>` bubble "trains" (iMessage) | real render change; long RP prose stacks messily | **cautious / opt-in only** |

### B.3 Avatar versatility (add these to make ours a real system)
Today: `avatarSize` sm/md/lg + `avatarShape` round/square (appearance prefs). ADD:
- **Shape:** + `rounded` (rounded-rect).
- **Aspect:** + **`portrait` (2:3)** — the presence lever the immersive modes need.
- **Border/ring:** a border on/off + an **accent-ring** painted from the character's theme color (reuse for a
  persona picker / active-speaker highlight; Moonlit's `is_fav`/`selected` accent `drop-shadow`).
- **Per-chatStyle avatar behavior** (sticky / bled / banner / hidden) lives in the SKIN, not a user pref.

### B.4 The sharp image pipeline (the "coordinate with sharp" answer — concrete)
Current: `infra/image` is **width-only** (`resize({width, withoutEnlargement})` over `BLOB_WIDTHS =
[48,64,96,128,240,400]`, `domain/assets/substrate/variant-policy.ts`) — no crop, preserves source aspect.
- **KEEP** the width ladder for round/square icons AND for the Echo bled-portrait (CSS `background-size:cover`
  handles any source aspect for free — zero pipeline burden).
- **ADD a 2:3 portrait smart-cropped variant** for the fixed-box `<img>` modes (Ripple/VN): `sharp().resize({
  width, height, fit:'cover', position:'attention' })` — **smart/entropy crop, NOT center** (avatars are
  face-centric; naive center-crop DECAPITATES). ~400×600. Standardize on **2:3**. Add it as a variant *kind*,
  don't replace the square ladder. This is strictly better than Moonlit (which just stretches / requires users
  to pre-upload 864×1280 portraits). Two-tier delivery: thumb for small icons, original/portrait-variant for
  big portraits.

### B.5 NEW config concepts mined from the Moonlit theme presets (the JSON, not just CSS)
Cross-referenced: most Moonlit knobs already have orbweaver equivalents (metadata chips, prose colors —
dialogue/narration/body, chatWidth, fontScale, hideChatAvatars, expand-actions, reduced-motion, shadows,
per-role bubble tints, tags-as-folders, hot-swap favorites). The **genuine deltas to add**:
1. **Background-image BLUR** (`customCSS-bg-blur`) — SEPARATE from the scrim/`backgroundDim`. Blur the *photo
   itself* for a soft, atmospheric, non-distracting backdrop. Add a `backgroundBlur` appearance axis (blur +
   dim compose). **Steal.**
2. **The "last-in-context" boundary marker** (`customlastInContext`) — a subtle accent line marking the last
   message INSIDE the AI's context window (you can *see* where the model's memory cuts off). Genuinely great
   RP/LLM-native concept. **Steal** — a quiet divider at the context boundary in the thread.
3. **Per-mode avatar sizing** — each immersive mode carries its own avatar geometry (Echo 20%×300px, Whisper
   50%+align, Ripple 180/100px). Our immersive skins each define their avatar dims (tokens/defaults, maybe
   per-mode adjustable).
4. **Granular message typography** — Moonlit exposes per-message `line-height`, `letter-spacing`, paragraph
   spacing (top/bottom), and name/body font sizes (`charNameFontSize`/`messageTextFontSize`/`messageLineHeight`/
   `messageTextLetterSpacing`/`mesParagraphSpacing*`). We only have global `fontScale` — add a **reading-typography**
   set; RP reading comfort is worth it. **Steal.**
5. Minor: `compact_input_area` (denser composer), `zoomed_avatar_magnification` (click-avatar-to-enlarge),
   `enableThemeColorization` (tint the whole UI from the accent), blur-strength as a user knob, and a batch of
   Moonlit **mobile-fine knobs** (inline metadata on mobile, separate mobile blur strength, mobile input spacing) —
   mostly covered by our adaptive shell, but "inline metadata on mobile" is a real consideration. (Full knob
   inventory verified against `reference/upstream/moonlit-echoes/src/config/theme-settings.js` — nothing else new.)

### B.5b Polish worth stealing (portable, token-clean)
- **Chat-list edge fade** via `mask-image` gradient (`#chat { mask-image: linear-gradient(...) }`) — softly
  dissolves the top/bottom of the scroll under the header/composer instead of hard-clipping. Pairs great with
  glass. **Steal.**
- **Composer escalation** — quiet-at-rest → hover → focus progressively prominent. Do it with a **border/ring +
  bg-alpha step, NOT `opacity`** (opacity dims the text/placeholder contrast too). **Adapt.**
- **Hairline avatar border (~1.25px, theme-tinted)** — keeps avatars from dissolving into a blurred/photo
  background (auto-on when a background image is active). **Steal.**
- Data point: Moonlit's "polished" feel is 100% state-transition timing (`transition`), **zero `@keyframes`** —
  consistent with our token/compose philosophy.

### B.6 What NOT to port (Moonlit's blockers — all vanish in our architecture)
- **JS `MutationObserver` injecting `--mes-avatar-url` per DOM node** → we render each row ourselves; put the
  URL in an inline CSS var at render time. Gone.
- **`!important` sprawl** → we own 100% of our CSS, nothing to fight. Gone.
- **Hardcoded px/% magic numbers, per-mode duplicated overrides** → tokens, parameterized once. Gone.
- Plus we get theme-awareness, contrast-safe foregrounds, the scrim/reading-surface, and mobile-adaptivity
  for free — so the same effects render legible over any background, which Moonlit's don't.

---

## PART C — Dependency order (highest leverage first)
1. **#67 — asset-URL resolver + upload** (unblocks ALL images: character avatars, persona avatars, backgrounds).
2. **Sharp 2:3 portrait smart-crop variant** (for VN/portrait avatar modes).
3. **Persona client slice** (rail-foot switcher + editor).
4. Then: the message-row redesign (avatar-left + name/actions row + dim-brighten+drop-shadow actions), the
   immersive chatStyle skins (Echo, Ripple), the avatar versatility prefs, the background-blur axis, the
   context-boundary marker, the polish (edge fade, composer escalation, hairline border).

## PART D — Session state (context for whoever picks this up)
- **DONE + verified live:** background-image → appearance move (D63); the specificity fix (`:where()` on the
  elevation-ramp rules so glass + bg-transparent win — the "nothing renders" bug); glass now works on
  panels/context/composer/bubbles over a background photo; topbar stays opaque chrome; a legibility halo for
  text floating over the photo; the dropdown z-fix (`--z-popover` above `--z-modal`).
- **DONE:** the cascade-contract computed-style test suite — PROVEN to catch the elevation-vs-glass regression
  (hand-reverted the fix → the two flagship tests went red → restored). `pnpm check` green.
- **IN FLIGHT (agent):** updating 3 primitive CT z-index assertions (`select`/`autocomplete`/`combobox`) from
  `40`→`65` (the z-popover rename consequence).
- **Character side captured in:** `FINAL-Character-Library-and-Editor-UX.md` (elevatorPitch/distill blurb,
  dual-purpose chat button, branch-aware Activity tab, cursor gotchas, EXTEND-don't-rebuild the 236-line
  surface).
- **Open threads not yet built:** settings search (#5), Presets→settings IA (#6, needs a ledger amendment),
  the character-editor lane, the immersive/persona work in this doc.
