# UI-Theming-and-Content

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: the former `client.md`; these nine carry the D43/D44/D52/D54/D58 corrections and WIN on any conflict with the archive). The ledger entries (D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`) are the decision records; these docs are the expansion.
>
> **Reading order:** UI-Architecture-and-Layout (§0–§6) → UI-Gates-and-Lessons (§7–§11) → UI-Theming-and-Content (§12) → UI-Primitives-and-Reuse (§13) → the five lib companions (`UI-Lib-TanStack-{Query,Form,Router,Virtual}` · `UI-Lib-Zustand` — evidence/provenance mines; distilled verdicts already live in the spec sections).
>
> **§-map (cross-doc `§N` references resolve here):** §0–§6.3.1 → `UI-Architecture-and-Layout.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.6 → `UI-Primitives-and-Reuse.md`.

## Table of Contents

- [12. User theming & rich message content (ledger D44) — specced BEFORE Phase 5](#34cc5f82)
  - [12.0 The governing principle — two trust tiers, isolation by PHYSICS not string-munging](#4740e3d4)
  - [12.1 Theming — the CSS story (decided: scopes = Global owner + Per-character)](#7b345617)
  - [12.2 Rich message content — the HTML story (two tiers; Tier B = sandboxed iframe, NOT Shadow DOM)](#af6acaa4)
  - [12.3 Images AND native media in chat — also two trust tiers (the new dimension)](#ea50edc8)
  - [12.4 The message-content model (Phase-5 touchpoint — `@orb/contracts`, born-compliant)](#57368866)
  - [12.5 Where each piece lives (the cake)](#0059431c)
  - [12.6 New gates (machine-enforceable — the rigor)](#fc04512b)
  - [12.7 Streaming interplay (ties to §6.3.1)](#4a9ca9b4)
  - [12.8 Sequencing (born-compliant — non-negotiable)](#fdc0d8ca)

---

<!-- Source: client.md -->

<a id='34cc5f82'></a>

## 12. User theming & rich message content (ledger D44) — specced BEFORE Phase 5

**Why here, why now.** SillyTavern's expressive surface — custom CSS (global + per-character), rich HTML
"cards" (stat-blocks / styled mini-UIs), and inline images — is a real product need, redesigned to orbweaver
rigor. It is specced **before Phase 5** because the chat message-content model, composer, and assembly all
_depend_ on these decisions; left unspecced, the chat phase would reinvent them ad hoc (and almost certainly
copy ST's bypassable approach). Read with §11.6 (the Streamdown two-policy security spec) — this section is
its content-side companion.

<!-- Source: client.md -->

<a id='4740e3d4'></a>

### 12.0 The governing principle — two trust tiers, isolation by PHYSICS not string-munging

Every user-supplied rendering input is exactly one trust level, and that determines the mechanism:

- **TRUSTED** = authored by the box owner / this user (global theme CSS, own persona theme, own uploaded
  images). Risk is self-inflicted + design-system integrity, not security.
- **UNTRUSTED** = from an imported character card, another participant, or the LLM (per-character CSS, card
  HTML, external image URLs, message markdown). Risk is D21 "no leaks ever" — CSS exfiltration, clickjacking,
  tracking pixels, mutation-XSS.
  **Rule:** untrusted content is contained by a _browser-enforced boundary_ (sandboxed iframe · CSP ·
  token-validation), NEVER by ST's regex-sanitize-and-scope (which the research + ST's own source show is
  bypassable string-munging — `.custom-` class renaming, `://` stripping). How ST does it (verified from
  `chats.js`/`power-user.js`) is prior art to learn from, not copy.

<!-- Source: client.md -->

<a id='7b345617'></a>

### 12.1 Theming — the CSS story (decided: scopes = Global owner + Per-character)

- **Tier A (default): a curated, Zod-validated TOKEN-OVERRIDE API — not raw CSS.** Expose a fixed subset of
  DTCG tokens applied as **scoped CSS custom properties** via an `@orb/ui` `<ThemeScope>` on the target subtree.
  **The subset is sized to ST parity** (it's what RP users actually theme — verified against ST's `--SmartTheme*`
  vars): `accent` · **per-role message bubbles `userBubble {bg, fg}` · `aiBubble {bg, fg}`** (+ optional
  `systemBubble`; ST's `UserMesBlurTint`/`BotMesBlurTint` split — colors user vs AI parts differently) · `name`
  color · **the RP prose semantics: `dialogueColor` (quoted speech) · `narrationColor` (italics/em — ST's
  `EmColor`) · `bodyColor`** · `font` (allowlist) · `radius` · `background` (asset/allowlisted-URL) · a
  **`chatStyle: bubble | flat`** + `density`/avatar-size toggles (ST's `bubblechat`/body-class prefs → our
  settings + density axis). Custom-property _values_ can't select/execute/exfiltrate; values are parsed+clamped
  at the boundary (a color must parse as a color — reject `url()`/`expression()`; dims snap to the token scale).
  Covers the _vibe_ (~90% of per-character styling) with **zero injection surface**, stays inside the token
  system (container model + `no-raw-value` gates still hold). **Because resolution is character > global >
  default, a per-character theme recolors THAT character's `aiBubble`/`narration` — the "each character's AI
  parts look different" RP case, native + safe.** ST has no safe tier like this (it ships raw CSS vars). Anything
  past this subset (per-role narration, per-part fonts) drops to Tier B / global CSS.
- **Tier B (opt-in trust): raw CSS only inside the sandboxed-iframe card (12.2)** — never injected into the
  app document.
- **Global owner CSS** (trusted): a settings field → one scoped `<style>` under a known app root, run through
  the same validator (warn-on-`@import` like ST; reject shell-breaking `position:fixed` on chrome). Trusted,
  but still fenced from accidentally wrecking the shell. **The custom-CSS field uses `@orb/ui/code-editor`
  (CodeMirror 6, token-themed) — syntax highlighting + the validator inline — NOT a bare `<textarea>`.** Same
  editor serves the Tier-B card CSS/HTML and the D46 script authoring (one sealed code editor, three consumers).
- **Resolution order:** character > global > default. (Per-persona / per-chat scopes are deliberately
  deferred — the order is built to accept them later without rework.)
- **Built-in palettes + the theme selector (the "modes" reconciliation).** A **theme is purely a token
  value-set** (a color palette + optional density) — there is NO structural mode (the seed's Loom "work mode"
  is cut, §4.1). The owner picks from **built-in palettes** (Hearth = warm-dark default · a cool/Mocha option ·
  Light deferred — seeded from the §3 DTCG tokens / the DESIGN.md OKLCH ramp + Ember) **OR a self-authored theme**
  (the same Tier-A token-override / Tier-B custom CSS), in **one selector** in user settings (the rail's Theme
  button). So the design's "three faces" is just **three rows in the theme picker**, not a mode system.
  _Token-name reconciliation with the seed:_ the seed reuses `--secondary`/`--card` for user/AI bubbles and
  `--speaker`/`--narration` for prose + a rationed `--glow` Ember focus; orbweaver elevates these to the named
  override tokens above (`userBubble`/`aiBubble`/`dialogueColor`/`narrationColor`) so the safe override API can
  address them per-role — they DEFAULT to the seed's ramp values.
- **APPEARANCE settings — the NON-color surface (ST parity; a separate layer from the color theme).** ST's
  "theme" panel conflates color with a pile of layout/display knobs; we keep them as **two layers in one settings
  surface**: the color **palette** (above) and **appearance settings** applied as **root `data-*` attrs / CSS vars**
  (ST's body-class model), read by the shell + the **message render**. The ST-parity set:
  - **Sizing:** chat/center **width** (already the §11.1 `chatWidthPct` clamp — `--sheldWidth` equivalent) · **font
    scale** (global text size) · **avatar size + shape** (round/square) · **density** (the §4 `data-density` axis).
  - **Message style:** `chatStyle` = **bubble / flat / document** (ST `chatDisplay`, 3 modes).
  - **Per-message metadata visibility (THE gap ST has and we lacked):** show/hide **timestamps · generation
    timer · token count · message-id · model icon · in-chat avatars · expanded-vs-hover message actions.** Each a
    user toggle → a root `data-*` the message render reads. RP users rely on these to declutter.
  - **Effects:** blur/shadow toggles (default OFF per the no-glass seed) · a manual `reduced-motion` (beyond the OS
    pref, §4a).
  - **OUT (deliberately):** `movingUI` free-form panel dragging (we have the fixed rail + the §4.1 3-state panels)
    and `waifuMode` VN-fullscreen (VN cut, D49). **Also OUT — homed elsewhere, do NOT re-import from ST's
    power-user panel:** ST's settings panel is a grab-bag orbweaver DECONSTRUCTED — the **content-processing**
    knobs (trim whitespace · collapse newlines · trim-incomplete-sentences · regex/macro post-processing) live on
    the **PRESET** (they mutate text — generation territory, D53), and sampling/instruct on preset/connection.
    Appearance settings are **display-only** (never touch stored content).
    These are **user/AppSettings**-level (not part of a per-character theme), homed in user settings + the message
    render; a per-character _color_ theme still layers on top via §12.1 resolution.
- **PERSISTENCE — the server `UserSettings` blob, NOT localStorage (it's already built + CRUD'd).** Theme +
  appearance prefs live server-side in the **`user_settings` table** (`config: UserSettings` JSON, per-user,
  `schema_version`-tracked) via the **existing settings-domain CRUD** (`getUserSettings` read · `updateUserSettings`
  / **`updateUserSettingsSection`** write — section-scoped, so writing the `theme` section is one call). The blob
  is **additive-namespaced** (each section `.prefault({})` → reads its default with NO version bump), so we just
  add **`theme`** (selected palette id + the user's `ThemeOverride`) _[SUPERSEDED in part by the entity
  commitment below — the blob holds ONLY `selectedThemeId`; the user's override values live on the selected
  `themes` ROW, never inline in the blob (one-home) — `proposed/themes-design.md` §3.3]_ and **`appearance`**
  (the display knobs above) as two new `userSettingsSchema` namespaces — zero migration. The client reads on load via tRPC `settings.getUserSettings`
  and writes via `settings.updateUserSettingsSection`. **localStorage / Zustand-`persist` is reserved for
  DEVICE-LOCAL transient state ONLY** (panel dock/collapse · the focus toggle · drafts) — **prefs that should
  follow the user across devices go in the synced blob, never localStorage.** Per-character themes ride the
  character row (D44 §12.5). **Custom themes are a first-class single-owned `themes` ENTITY with CRUD** (a user
  theme LIBRARY — create/name/edit/delete/duplicate; the preset pattern: `ownerId` + `fetchOwned`); each row =
  `{ name, ThemeOverride, css? }`. The **selected** theme is `UserSettings.theme.selectedThemeId`; built-in
  palettes (Hearth/Mocha/Light) are non-deletable seeds (duplicate-to-customize). The **theme editor** is an
  entity-editor feature (`createSavedEntityForm`, §13.4 — the token-override controls + the `@orb/ui/code-editor`
  custom-CSS field + a live `<ThemeScope>` preview). Server home: a small `themes` table + CRUD verbs _[DECIDED:
  inside `domain/settings`, not its own leaf — `proposed/themes-design.md` §1]_ — the contracts pass adds the
  `Theme` entity + `UserSettings.theme.selectedThemeId`.

<!-- Source: client.md -->

<a id='af6acaa4'></a>

### 12.2 Rich message content — the HTML story (two tiers; Tier B = sandboxed iframe, NOT Shadow DOM)

The isolation-primitive choice is settled by research (§ research note below): **Shadow DOM is encapsulation,
not a security boundary** (JS gets full page access, `position:fixed` escapes, CSS `url()` still exfils,
custom props pierce the boundary); a **sandboxed `<iframe>` IS the boundary** (separate realm, `sandbox` minus
`allow-same-origin`, per-frame CSP) — the proven industry standard for untrusted LLM HTML (Claude Artifacts,
CodePen, JSFiddle). ChatGPT Canvas refuses to render HTML inline at all; the sandboxed iframe is the only
safe-inline-render pattern anyone ships.

- **Tier A (default, main DOM): a tight INERT sanitized allowlist via Streamdown** (its `rehype-raw` →
  `rehype-sanitize` → `rehype-harden` pipeline, configured to OUR explicit allowlist, not its permissive
  default): structural (`div/span/details/summary/table`-family/`blockquote`/`hr`) · text formatting · icons
  (mapped to **lucide**, not raw FontAwesome classes) · links (`rel=noopener` + prefix-allowlist) · images
  (via `MessageMedia`, 12.3). **Forbidden in Tier A:** `<script>` · `on*` handlers · `<style>` · inline
  `style=` · `<iframe>/<object>/<embed>/<form>/<input>`. Covers ~90% of "cards" (structured/styled text + icons).
- **Tier B (opt-in per-character trust): elaborate self-contained HTML+CSS mini-UI → `@orb/ui/sandbox-frame`**
  = sandboxed iframe + per-frame CSP (`connect-src 'none'`, `img-src` allowlist), **render-on-complete** (hold
  the block until close — the iframe enforces this naturally; skeleton during stream), the validated
  theme-token subset injected so the card's `var(--accent)` tracks the active theme, postMessage auto-height,
  **lazy-mounted + virtualized** in the message list (the one real cost — a realm per card — bounded to opt-in
  rich cards only; **verify-at-build:** a recycled virtual row remounts its iframe → reload + flicker + lost
  frame state, so Tier-B cards need a stable key + likely a no-recycle / over-scan window in
  `@orb/ui/virtual-list`). This is the Claude-Artifacts model.
- **Explicit NON-GOALS v1** (the dangerous ST features deliberately not carried): card JS / event handlers ·
  **action-buttons wired to app commands** (ST's QR/STscript surface) · forms · card-spawned iframes · inline
  `style`. **Doored, not walled:** because Tier B is already an iframe, interactivity later = flip
  `allow-scripts` for a _trusted_ card (the Artifacts experience) — no re-architecture, just a gate change.
- **Two sandboxes, orthogonal — do NOT conflate:** this iframe isolates untrusted **display** (card
  HTML/CSS/UI); the **QuickJS-WASM** sandbox in `proposals/scripting-automation-extensibility.md` §7
  isolates untrusted **logic** (automation rules / plugins). Different threat models, different primitives.
  A card's future interactivity flips THIS iframe's `allow-scripts` (the Artifacts model) — it does NOT
  route through QuickJS.

<!-- Source: client.md -->

<a id='ea50edc8'></a>

### 12.3 Images AND native media in chat — also two trust tiers (the new dimension)

Covers `<img>` **and native `<audio controls>` / `<video controls>`** — verified from ST source as the
mechanism behind "a card generated an inline music player": it was **raw HTML+CSS, a native `<audio controls>`
element** (browser-native play/seek controls = interactive with ZERO card JS; ST allows audio/video/source/
track in sanitized message HTML and gates the external `src`). Native media is the one HTML class that's
interactive _declaratively_, so it sidesteps the no-JS rule — and it carries the same external-load risk as
images plus two extras (autoplay = tracking beacon + annoyance, and bandwidth).

- **TRUSTED = own uploads / assets → render freely from our store.** The "supporting pictures/media in
  messages" case: the user attaches in the composer → stored via the **`assets` domain (4c)** with
  variants/thumbnails from the **`infra/image` sharp adapter (4b)** → referenced as `asset://<id>` → served
  from our own origin. The same stored asset also feeds the **multimodal send** — the image as model
  _input_ to a vision-capable model, via the _send-side_ content-part model (distinct from the render
  model; see §12.4).
- **UNTRUSTED = external URLs** (LLM markdown `![](url)`, untrusted card `<img>`/`<audio>`/`<video>`) → gated,
  defaulting to SAFE:
  - **`forbidExternalMedia: true` by default** (mirrors ST + D21): external media does NOT auto-load — the
    _load itself_ is the exfil/tracking-pixel (the remote server sees IP + timing). Render a click-to-load
    "external media — load from `<host>`?" placeholder.
  - **`autoplay` is FORCED OFF and `controls` REQUIRED on untrusted audio/video, always** (even when media is
    allowed) — an untrusted autoplaying `<audio>` is a tracking beacon + a hostile-noise vector; ST forces
    `autoplay=false; pause()` and we harden that into a non-overridable rule for untrusted media.
  - When permitted (per-character `override ?? global`, extending the D21 `forbidExternalMedia` tri-state, or
    owner opt-in): only `allowedMediaPrefixes` hosts load · `allowDataImages:false` (no base64 tracking
    pixels) · **CSP `img-src` + `media-src` `'self' <allowlist>` is the network backstop** (§11.6).
  - A bare image-URL link auto-embeds only if allowlisted+allowed, else renders as a plain link.
- **Primitive `@orb/ui/MessageMedia`** (covers image + native audio/video): dispatches asset-ref vs
  external-gated · lazy-load · intrinsic size/aspect reservation (no layout shift, container-model max-width)
  · `autoplay`-off + `controls`-on for untrusted A/V · broken-media fallback · click-to-zoom **lightbox**
  (sealed `@orb/ui` viewer) for images/video. Inside a Tier-B `sandbox-frame`, media is additionally governed
  by the frame's own `img-src`/`media-src` CSP (defense-in-depth).
- **A JS-driven custom player** (custom seek logic, not native controls) is the one case that needs Tier B's
  sandboxed iframe + `allow-scripts` — the native-element path (Tier A) covers the common "card music player"
  declaratively, no iframe needed.

<!-- Source: client.md -->

<a id='57368866'></a>

### 12.4 The message-content model (Phase-5 touchpoint — `@orb/contracts`, born-compliant)

A stored message body is a **string** (D26 one content home; D51 — content stays a string everywhere upstream).
The render model is a **typed block sequence PARSED FROM that string at render** (not stored):

```
MessageContentBlock =
  | { kind: "markdown"; md: string }
  | { kind: "media"; media: "image" | "audio" | "video"; src: AssetRef | ExternalUrl; alt: string; dims?: {w;h} }
  | { kind: "html-card"; html: string; css?: string; trust: "tierA" | "tierB" }
```

The block model makes the trust-tier × render-tier dispatch type-safe. The composer (P5) embeds image refs;
markdown stays markdown; card HTML carries its own trust level. `forbidExternalMedia` + per-character `cardTrust`
resolve at chat **assembly** (`override ?? global`, extending D21).

**Per-speaker color in merged/narrator mode — ALREADY BUILT (Phase 5), do NOT re-invent:** merged-narrator
messages carry **inline `<speaker>NAME</speaker>` markers IN the content string** (`@orb/kit/speaker-label` —
`SPEAKER_TAG_PAIR`; the markers are kept in stored canon _specifically so the renderer can color them_, and
stripped to `Name:` for prompt history via `speakerTagsToPlain`). The client narrator render **`parseSpeakerSpans`**
splits the body on those markers and wraps each span in its own **`<ThemeScope theme={resolve(name)}>`** → each
character's name/`dialogue`/`narration` colors apply _within the one merged bubble_. Streaming a torn `<speaker…`
mid-frame is held by **`holdTornSpeaker`** (`@orb/kit/fix-markdown`; the §6.3.1 hold-back). Solo/per-speaker is the
no-op case (`hasMultipleCharacters` gate in `assembly/speaker-stamp.ts` → byte-identical, no markers). So
per-speaker theming is **content-string + inline markers + a render-time parse**, NOT a stored segment array —
the client just resolves the per-character `<ThemeScope>` off the parsed span name. **Bubble background**
(`userBubble`/`aiBubble`) is message-level; the **speaker semantics** are span-level.

**Scope: pictures in chat = DISPLAY (this is the feature). Model-vision = separate + optional.** The actual
want is plain: **send a picture (your own upload), receive and display it, and display an online image by
URL.** That is _entirely the render model_ — a `media` block (`src: AssetRef` for an upload, `ExternalUrl`
for a link), rendered by `MessageMedia`, with `forbidExternalMedia` gating external URLs (§12.3). The model
is NOT involved; nothing beyond the block union + the asset path is needed. **This is the committed
feature.**

The **provider-send model** — what is transmitted _to the model as input_ — is called out ONLY so it isn't
conflated with display. Sending an image _to_ the model (true multimodal vision) is a different contract
running the other direction:

|           | Render model                               | Provider-send model                                                           |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Contract  | `MessageContentBlock` (this §)             | `ChatHistoryMessage.content` (`@orb/contracts/chat`)                          |
| Direction | stored message → client display            | assembled turn → the model                                                    |
| Shape     | block union (markdown / media / html-card) | content-part array (text / image parts)                                       |
| Gated by  | trust-tier × render-tier (§12.2)           | `ModelCapability.vision` — image parts are sent ONLY to vision-capable models |

**Model-vision is ALSO committed — ledger D45 (sending an image TO the model).** Separate from display:
this is the **provider-send** reshape — `ChatHistoryMessage.content`: `string` → content-part array (`text`
| `image` parts), gated by a new `ModelCapability.vision` axis. It is **server-side**, so it is NOT a
client-doc concern to spec — the authoritative homes are **`domains/connection.md`** (the
`ModelCapability.vision` axis — the gate) + **`core/Tier-3b-Providers.md`** (the sealed translators map image parts
to each backend's wire) + **`@orb/contracts/chat`** (the message DTOs); this § only records the render↔send
distinction. **Born-compliant before Phase 5:** that `content:string` field is consumed by all three sealed
translators + the assembly seam, so widening it after chat is built whole is the cross-cutting retrofit
we're avoiding. A text-only turn is a one-element `[{ type:"text" }]` array — no `if(hasImage)` branch — and
a non-vision model drops image parts at assembly with a `warning` ChatEvent (D41). **One uploaded image is
stored once** (`assets`) and used both as a render `media` block (display, above) AND an `image` send-part
(D45).

**Born-compliant for DISPLAY (the part that IS required before Phase 5):** the `MessageContentBlock` union
itself (so a message is text + image, not a bare string) + `MessageMedia` + `forbidExternalMedia` land in
the `@orb/contracts` + `@orb/ui` passes before chat assembles content. That's the picture-in-chat feature;
it's cheap and additive, and it does not touch the send wire.

<!-- Source: client.md -->

<a id='0059431c'></a>

### 12.5 Where each piece lives (the cake)

| Concern                                                                                                                                | Home                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `ThemeOverride` schema (token subset, Zod-validated) · `MessageContentBlock` union                                                     | `@orb/contracts`                                |
| `<ThemeScope>` (validated tokens → scoped custom props) · `@orb/ui/sandbox-frame` · `@orb/ui/MessageMedia` (img+native a/v) + lightbox | `@orb/ui`                                       |
| Tier-A HTML+media sanitize allowlist (Streamdown config)                                                                               | `@orb/ui/markdown`                              |
| asset storage + thumbnails/variants                                                                                                    | `assets` domain (4c) + `infra/image` sharp (4b) |
| composer image attach · multimodal send · `forbidExternalMedia`/`cardTrust` resolution                                                 | chat domain (Phase 5; extends D21)              |
| CSP headers (`img-src` · `connect-src` · `style-src`)                                                                                  | `entry/http`                                    |

<!-- Source: client.md -->

<a id='fc04512b'></a>

### 12.6 New gates (machine-enforceable — the rigor)

- **`no-untrusted-html-in-main-dom`** — a raw/untrusted HTML string may reach ONLY `@orb/ui/sandbox-frame`;
  never `dangerouslySetInnerHTML`, a `<head>` `<style>`, or main-DOM injection.
- **`no-external-media-without-gate`** — any `<img>`/`<audio>`/`<video>` with an external `src` must route
  through `MessageMedia` (the `forbidExternalMedia` gate + forced `autoplay`-off for untrusted A/V); no raw
  external `<img>/<audio>/<video>`.
- **`theme-override-only-via-scope`** — a `ThemeOverride` applies only via `<ThemeScope>` (validated), never
  spread as raw `style`.
- **CSP-headers-present** test (the `img-src`/`connect-src`/`style-src` headers exist + are tight).
- Extend the existing `no-raw-value` / no-inline-`style` gates to message-render code.

<!-- Source: client.md -->

<a id='4a9ca9b4'></a>

### 12.7 Streaming interplay (ties to §6.3.1)

- **HTML-card blocks render-on-complete** (hold until the block closes) — the `sandbox-frame` enforces this;
  show skeleton/plain text during stream (avoids the half-rendered-`<div>` flash, worse than the code-fence one).
- **Images reserve space from known dims** (asset images known-size; external use a fixed placeholder box) so
  mid-stream image arrival doesn't shift layout.

<!-- Source: client.md -->

<a id='fdc0d8ca'></a>

### 12.8 Sequencing (born-compliant — non-negotiable)

The `@orb/ui` primitives (`ThemeScope`, `sandbox-frame`, `MessageMedia`), the `@orb/contracts`
`MessageContentBlock`/`ThemeOverride`, the CSP wiring, and the 12.6 gates ship in the \*\*foundation/`@orb/ui`

- contracts passes, BEFORE Phase 5 wires chat content\*\* — same rule as §11.7. `assets` (4c) + `infra/image`
  (4b) are prerequisites already in the plan. A Phase-5 agent assembles messages against this spec; it does not
  get to invent the content model or copy ST's string-blob.

> **Research note (2026-06, why Tier B is an iframe):** Shadow DOM is _composability_, not isolation —
> "prevent accidental interference, not enforce separation"; JS in a shadow tree has full page access, custom
> props pierce it, and there's a 2026 CSS sandbox-escape CVE. A sandboxed iframe is a separate realm and the
> decade-proven primitive CodePen/JSFiddle/**Claude Artifacts** use for untrusted rendered HTML/CSS/JS. No
> all-in-one library does parse+sanitize+isolate for inline content — but we don't need one: **sanitize is
> NATIVE in Streamdown** (its bundled `rehype-sanitize` + `rehype-harden`, §11.6 — the unified/rehype-ecosystem
> standard, living _inside_ our markdown pipeline; this is the modern stack-aligned sanitizer, **NOT DOMPurify** —
> DOMPurify is a DOM-string-level second pass _outside_ the pipeline and would be redundant), plus a small OWNED
> `sandbox-frame` for untrusted HTML (we own the exact `sandbox`/CSP attributes — the iframe IS the boundary, so
> untrusted HTML is never sanitized-into-main-DOM; don't depend on a generic lib for the security boundary).
> `react-shadow`/`react-shadow-root` exist but are for our OWN design-system encapsulation, the wrong tool for
> untrusted content.

---
