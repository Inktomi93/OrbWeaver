---
kind: law
status: active
updated: 2026-07-05
---

# UI-Theming-and-Content

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: a deleted `client.md`). Decision records: D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`. §-map + reading order: `UI-Architecture-and-Layout.md` header.

## 12. User theming & rich message content (ledger D44)

**Why this was specced early.** SillyTavern's expressive surface — custom CSS (global + per-character), rich HTML "cards", inline images — is a real product need, redesigned to orbweaver rigor. The chat message-content model, composer, and assembly all *depend* on these decisions; left unspecced, the chat phase would have reinvented them ad hoc (and copied ST's bypassable approach). Read with §11.6 (the Streamdown two-policy security spec) — this section is its content-side companion. **Build state:** the `@orb/ui` primitives (`ThemeScope` · `sandbox-frame` · `MessageMedia` · lightbox · the markdown policies · `code-editor`) are BUILT (`packages/ui/src/content/`, `markdown/`, `code-editor/`); the contracts blocks, the server `themes` slice, the CSP headers, and the chat wiring are pending (§12.8).

### 12.0 The governing principle — two trust tiers, isolation by PHYSICS not string-munging

Every user-supplied rendering input is exactly one trust level, and that determines the mechanism:

- **TRUSTED** = authored by the box owner / this user (global theme CSS, own persona theme, own uploaded images). Risk is self-inflicted + design-system integrity, not security.
- **UNTRUSTED** = from an imported character card, another participant, or the LLM (per-character CSS, card HTML, external image URLs, message markdown). Risk is D21 "no leaks ever" — CSS exfiltration, clickjacking, tracking pixels, mutation-XSS.

**Rule:** untrusted content is contained by a *browser-enforced boundary* (sandboxed iframe · CSP · token-validation), NEVER by ST's regex-sanitize-and-scope (verified from ST source: bypassable string-munging — `.custom-` class renaming, `://` stripping). ST is prior art to learn from, not copy.

### 12.1 Theming — the CSS story (decided: scopes = Global owner + Per-character)

- **Tier A (default): a curated, Zod-validated TOKEN-OVERRIDE API — not raw CSS.** A fixed subset of DTCG tokens applied as **scoped CSS custom properties** via the `@orb/ui` `<ThemeScope>` (BUILT — `content/theme-scope/`, with the Zod clamp in `clamp.ts`). **The subset is sized to ST parity** (verified against ST's `--SmartTheme*` vars): `accent` · per-role bubbles `userBubble {bg,fg}` / `aiBubble {bg,fg}` (+ optional `systemBubble`) · `name` color · the RP prose semantics `dialogueColor` (quoted speech) / `narrationColor` (italics/em) / `bodyColor` · `font` (allowlist) · `radius` · `background` (the surface COLOR — the decorative background IMAGE re-homed to the `appearance` user-settings namespace per D63, no longer a theme token) · `chatStyle: bubble | flat` + density/avatar-size toggles. Custom-property *values* can't select/execute/exfiltrate; values are parsed+clamped at the boundary (a color must parse as a color — reject `url()`/`expression()`; dims snap to the token scale). Covers the *vibe* (\~90% of per-character styling) with **zero injection surface**, inside the token system. **Resolution is character > global > default**, so a per-character theme recolors THAT character's `aiBubble`/`narration` — the "each character's AI parts look different" RP case, native + safe. Anything past this subset drops to Tier B / global CSS.
- **Tier B (opt-in trust): raw CSS only inside the sandboxed-iframe card (§12.2)** — never injected into the app document.
- **Global owner CSS** (trusted): a settings field → one scoped `<style>` under a known app root, run through the same validator (warn-on-`@import`; reject shell-breaking `position:fixed` on chrome). **The custom-CSS field uses `@orb/ui/code-editor` (CodeMirror 6, token-themed, diagnostics layer — BUILT), NOT a bare `<textarea>`.** The same sealed editor serves the Tier-B card CSS/HTML and D46 script authoring.
- **Resolution order:** character > global > default. (Per-persona / per-chat scopes deliberately deferred — the order accepts them later without rework.)
- **Built-in palettes + the theme selector.** A **theme is purely a token value-set** (a color palette + optional density) — there is NO structural mode (the seed's Loom "work mode" is cut, §4.1). The owner picks a built-in palette (Hearth = warm-dark default · Mocha cool option · Light deferred — seeded from the §3 DTCG tokens) OR a self-authored theme, in one selector (the rail's Theme button). The seed's `--secondary`/`--card`/`--speaker`/`--narration` names are elevated to the named override tokens above so the safe override API can address them per-role; they default to the seed's ramp values.
- **The settings SHELL that hosts these (D62):** a full-bleed overlay with a left category nav — the IA (USER/APP groups, category list, one `setting-row` column per pane) is law at `UI-Architecture-and-Layout.md` §4.2 (the region map's settings row); this § owns only the appearance/theme CONTENT. Interim theme picker (pre-editor): Hearth active · Mocha/Light disabled-with-tooltip — the §12.1 set, never the seed mockup's names.
- **APPEARANCE settings — the NON-color surface (ST parity; a separate layer from the color theme).** Two layers in one settings surface: the color **palette** (above) and **appearance settings** applied as root `data-*` attrs / CSS vars, read by the shell + the message render. The ST-parity knob set (sizing: chat width / font scale / avatar size+shape / density · message style `bubble|flat|document` · per-message metadata visibility toggles: timestamps, generation timer, token count, message-id, model icon, in-chat avatars, expanded-vs-hover actions · effects: blur/shadow default OFF, manual reduced-motion) — the committed zod shape is `proposed/themes-design.md` §3.4. **OUT (deliberately):** `movingUI` free-form dragging, `waifuMode` VN-fullscreen (VN cut, D49). **Also OUT — homed elsewhere:** ST's content-processing knobs (trim/collapse/regex post-processing) live on the **PRESET** (they mutate text — generation territory, D53); sampling/instruct on preset/connection. Appearance settings are **display-only** (never touch stored content); they're user/AppSettings-level, not per-character; a per-character *color* theme layers on top via the resolution order.
- **PERSISTENCE — the server `UserSettings` blob, NOT localStorage.** Theme + appearance prefs live server-side in the existing `user_settings` blob via the settings-domain CRUD (`updateUserSettingsSection` — section-scoped writes). Two additive namespaces: **`theme`** (holds ONLY `selectedThemeId` — the user's override values live on the selected `themes` ROW, never inline in the blob; one-home) and **`appearance`**. **localStorage / Zustand-`persist` is reserved for DEVICE-LOCAL transient state ONLY** (panel dock/collapse · focus toggle · drafts) — prefs that follow the user across devices go in the synced blob. Per-character themes ride the character row (§12.5). **Custom themes are a first-class single-owned `themes` ENTITY with CRUD** (a user theme library; the preset pattern: `ownerId` + `fetchOwned`; built-in palettes are ownerless non-deletable seed rows, duplicate-to-customize). The theme editor is an entity-editor feature (`createSavedEntityForm`, §13.4 — token-override controls + the code-editor CSS field + a live `<ThemeScope>` preview). **The full server/contracts/db design (table DDL, verbs, seeding, the `theme`/`appearance` schemas): `proposed/themes-design.md` — UNBUILT.**

### 12.2 Rich message content — the HTML story (two tiers; Tier B = sandboxed iframe, NOT Shadow DOM)

Settled by research (§ research note below): **Shadow DOM is encapsulation, not a security boundary**; a **sandboxed `<iframe>` IS the boundary** (separate realm, `sandbox` minus `allow-same-origin`, per-frame CSP) — the proven industry standard for untrusted LLM HTML (Claude Artifacts, CodePen, JSFiddle).

- **Tier A (default, main DOM): a tight INERT sanitized allowlist via Streamdown** — BUILT as the untrusted policy in `packages/ui/src/markdown/policy.ts` (`TIER_A_ELEMENTS`: structural + text formatting + tables + `details/summary` + gated links; icons map to **lucide**, never raw FontAwesome classes). **Forbidden in Tier A:** `<script>` · `on*` handlers · `<style>` · inline `style=` · `<iframe>/<object>/<embed>/<form>/<input>` — forbidden by omission from the allowlist. The untrusted policy additionally drops `img` entirely (the preload-exfil finding — §11.6); untrusted images route through `MessageMedia` (§12.3). Covers \~90% of "cards" (structured/styled text + icons).
- **Tier B (opt-in per-character trust): elaborate self-contained HTML+CSS mini-UI → `@orb/ui/sandbox-frame`** — BUILT (`content/sandbox-frame/`; the per-frame CSP lives in `srcdoc.ts`, the ONE file that owns the `sandbox`/CSP attributes): sandboxed iframe minus `allow-same-origin`, `connect-src 'none'`, gated `img-src`, **render-on-complete** (hold until the block closes; skeleton during stream), the validated theme-token subset injected so the card's `var(--accent)` tracks the active theme, origin-checked postMessage auto-height, lazy-mounted + a stable key. **NB (2026-07-04c): the `message-list` seal has NO keep-mounted path yet (PD-119)** — it is pure windowed virtualization, so a Tier-B iframe row reloads when scrolled out+back. Before Tier-B cards ship in chat, either the keep-mounted capability lands (PD-119) or the card's row state is hoisted to an external store keyed by message id. This is the Claude-Artifacts model.
- **Explicit NON-GOALS v1:** card JS / event handlers · action-buttons wired to app commands (ST's QR/STscript surface) · forms · card-spawned iframes · inline `style`. **Doored, not walled:** because Tier B is already an iframe, interactivity later = flip `allow-scripts` for a *trusted* card — a gate change, not a re-architecture.
- **Two sandboxes, orthogonal — do NOT conflate:** this iframe isolates untrusted **display** (card HTML/CSS/UI); the QuickJS-WASM sandbox (scripting proposal §7) isolates untrusted **logic** (automation/plugins). A card's future interactivity flips THIS iframe's `allow-scripts` — it does NOT route through QuickJS.

### 12.3 Images AND native media in chat — also two trust tiers

Covers `<img>` **and native `<audio controls>` / `<video controls>`** — verified from ST source as the mechanism behind "a card generated an inline music player" (raw HTML with a native `<audio controls>`: interactive with ZERO card JS). Native media is the one HTML class that's interactive *declaratively*, so it sidesteps the no-JS rule — and carries the external-load risk plus autoplay (tracking beacon + noise) and bandwidth.

- **TRUSTED = own uploads / assets → render freely from our store.** Composer attach → the `assets` domain with variants/thumbnails from `infra/image` sharp → referenced as `asset://<id>` → served from our origin. The same stored asset also feeds the multimodal send (§12.4).
- **UNTRUSTED = external URLs** (LLM markdown `![](url)`, untrusted card media) → gated, defaulting to SAFE:
  - **`forbidExternalMedia: true` by default** (mirrors ST + D21): external media does NOT auto-load — the *load itself* is the exfil/tracking-pixel. Render a click-to-load "external media — load from `<host>`?" placeholder.
  - **`autoplay` FORCED OFF and `controls` REQUIRED on untrusted audio/video, always** — non-overridable.
  - When permitted (per-character `override ?? global`, extending the D21 `forbidExternalMedia` tri-state): only `allowedMediaPrefixes` hosts load · no data-URI images · CSP `img-src`/`media-src` as the network backstop.
  - A bare image-URL link auto-embeds only if allowlisted+allowed, else renders as a plain link.
- **`@orb/ui` `<MessageMedia>` — BUILT** (`content/message-media/`; covers image + native a/v): asset-ref vs external-gated dispatch · lazy-load · intrinsic size/aspect reservation (no layout shift) · autoplay-off + controls-on for untrusted A/V · broken-media fallback · click-to-zoom **lightbox** (sealed viewer over Dialog + MessageMedia — BUILT). Inside a Tier-B frame, media is additionally governed by the frame's own CSP (defense-in-depth).
- **A JS-driven custom player** (custom seek logic) is the one case that needs Tier B + `allow-scripts`; the native-element path covers the common "card music player" declaratively.

### 12.4 The message-content model (`@orb/contracts` — born-compliant, pre-chat)

A stored message body is a **string** (D26 one content home; D51 — content stays a string everywhere upstream). The render model is a **typed block sequence PARSED FROM that string at render** (not stored):

```ts
MessageContentBlock =
  | { kind: "markdown"; md: string }
  | { kind: "media"; media: "image" | "audio" | "video"; src: AssetRef | ExternalUrl; alt: string; dims?: {w;h} }
  | { kind: "html-card"; html: string; css?: string; trust: "tierA" | "tierB" }
```

The block model makes the trust-tier × render-tier dispatch type-safe. The composer embeds image refs; markdown stays markdown; card HTML carries its own trust level. `forbidExternalMedia` + per-character `cardTrust` resolve at chat **assembly** (`override ?? global`, extending D21).

**Per-speaker color in merged/narrator mode — BUILT (kit + assembly side), do NOT re-invent:** merged-narrator messages carry inline `<speaker>NAME</speaker>` markers IN the content string (`@orb/kit/speaker-label` — `SPEAKER_TAG_PAIR`; kept in stored canon *specifically so the renderer can color them*, stripped to `Name:` for prompt history via `speakerTagsToPlain`). The client narrator render splits the body on those markers and wraps each span in its own `<ThemeScope theme={resolve(name)}>` → each character's `dialogue`/`narration` colors apply *within the one merged bubble*. A torn `<speaker…` mid-stream is held by `holdTornSpeaker` (`@orb/kit/fix-markdown` — the §6.3.1 hold-back). Solo/per-speaker is the no-op case (byte-identical, no markers). Per-speaker theming is **content-string + inline markers + a render-time parse**, NOT a stored segment array. Bubble background is message-level; speaker semantics are span-level.

**Scope: pictures in chat = DISPLAY (the committed feature). Model-vision = separate.** Send a picture (own upload), receive and display it, display an online image by URL — that is *entirely the render model* (a `media` block rendered by `MessageMedia`, `forbidExternalMedia` gating externals). The model is NOT involved.

The **provider-send model** — what is transmitted *to the model as input* — is called out only so it isn't conflated with display:

| | Render model | Provider-send model |
| - | - | - |
| Contract | `MessageContentBlock` (this §) | `ChatHistoryMessage.content` (`@orb/contracts/chat`) |
| Direction | stored message → client display | assembled turn → the model |
| Shape | block union (markdown / media / html-card) | content-part array (text / image parts) |
| Gated by | trust-tier × render-tier (§12.2) | `ModelCapability.vision` — image parts only to vision-capable models |

**Model-vision is ALSO committed — ledger D45** (server-side; NOT a client-doc concern). Authoritative homes: `domain/connection` (the `ModelCapability.vision` axis) + `core/Tier-3b-Providers.md` (translators map image parts to each wire) + `@orb/contracts/chat` (message DTOs); this § only records the render↔send distinction. One uploaded image is stored once (`assets`) and used both as a render `media` block AND an `image` send-part.

**Born-compliant for DISPLAY:** the `MessageContentBlock` union + `forbidExternalMedia` land in the `@orb/contracts` pass before chat assembles content (`MessageMedia` is already built). Cheap and additive; does not touch the send wire.

### 12.5 Where each piece lives (the cake)

| Concern | Home | State |
| - | - | - |
| `ThemeOverride` schema (token subset) · `MessageContentBlock` union | `@orb/contracts` (`/theme` per `proposed/themes-design.md` §3.1) | unbuilt |
| `<ThemeScope>` · `sandbox-frame` · `<MessageMedia>` + lightbox · code-editor | `@orb/ui` | BUILT |
| Tier-A HTML sanitize allowlist + url gate (Streamdown config) | `@orb/ui/markdown` (`policy.ts`) | BUILT |
| asset storage + thumbnails/variants | `assets` domain + `infra/image` sharp | built (server) |
| composer image attach · multimodal send · `forbidExternalMedia`/`cardTrust` resolution | chat domain (extends D21) | Phase 5/6 |
| CSP headers (`img-src` · `connect-src` · `style-src`) | `entry/http` (reference policy: `proposed/client-tooling-setup.md` §7.5) | unbuilt |

**One-home note (deliberate, recorded):** the `ThemeOverride` Zod clamp exists twice by design — the WIRE schema in `@orb/contracts/theme` and the ui-local RENDER clamp in `<ThemeScope>` (`@orb/ui` cannot import contracts — the cake). The structural pairing is asserted by a client-phase type test (tests may import both packages; the packages never import each other). Same discipline as the server's injected-op contract types.

### 12.6 New gates (machine-enforceable — the rigor)

- **`no-untrusted-html-in-main-dom`** — a raw/untrusted HTML string may reach ONLY `@orb/ui/sandbox-frame`; never `dangerouslySetInnerHTML` or main-DOM injection.
- **`no-external-media-without-gate`** — any `<img>`/`<audio>`/`<video>` with an external `src` must route through `MessageMedia`.
- **`theme-override-only-via-scope`** — a `ThemeOverride` applies only via `<ThemeScope>` (validated), never spread as raw `style`.
- **CSP-headers-present** test (the headers exist + are tight).
- Extend the `no-raw-value` / no-inline-`style` gates to message-render code.

State: the `@orb/ui` halves ship as CT containment tests (LIVE — the sandbox/CSP attrs are string-asserted, hostile ThemeScope values are rejected); the lint/route halves activate with message-render + `entry/http` code (§8 PARKED).

### 12.7 Streaming interplay (ties to §6.3.1)

- **HTML-card blocks render-on-complete** (hold until the block closes) — the `sandbox-frame` enforces this; skeleton/plain text during stream.
- **Images reserve space from known dims** (asset images known-size; externals a fixed placeholder box) so mid-stream arrival doesn't shift layout.

### 12.8 Sequencing (born-compliant — non-negotiable)

The `@orb/ui` primitives are BUILT. Still pending, and required **before Phase 5/6 wires chat content**: the `@orb/contracts` `MessageContentBlock`/`ThemeOverride`, the CSP wiring (`entry/http`), and the §12.6 lint halves — same rule as §11.7. A chat agent assembles messages against this spec; it does not get to invent the content model or copy ST's string-blob.

> **Research note (2026-06, why Tier B is an iframe):** Shadow DOM is *composability*, not isolation — JS in a shadow tree has full page access, custom props pierce it, and there's a 2026 CSS sandbox-escape CVE. A sandboxed iframe is a separate realm, the decade-proven primitive for untrusted rendered HTML/CSS/JS. No all-in-one library does parse+sanitize+isolate — and none is needed: sanitize is NATIVE in Streamdown (its bundled `rehype-sanitize`+`rehype-harden`, §11.6 — NOT DOMPurify, which would be a redundant second pass outside the pipeline), plus the small OWNED `sandbox-frame` (we own the exact `sandbox`/CSP attributes; the iframe IS the boundary — don't depend on a generic lib for the security boundary). `react-shadow` exists but is for own-design-system encapsulation, the wrong tool for untrusted content.
