---
kind: law
status: active
updated: 2026-07-13
---

# UI-Theming-and-Content

> **The UI law — part of the nine-doc set split from the D42 spec.** Decision records: D42–D44, D52, D54, D63 in `Core-Laws-and-Precedents.md`. §-map + reading order: `UI-Architecture-and-Layout.md` header. The code-verified theming PIPELINE (emit surface, derived-ramp invariants, the 8 appearance skins) lives in `../proposed/ui-cohesion-north-star.md` §2b/§2c/§8 — this doc owns the trust-tier MODEL and the WHY; it points there for the live token mechanics.

## 12. User theming & rich message content (ledger D44)

SillyTavern's expressive surface — custom CSS (global + per-character), rich HTML "cards", inline media — redesigned to orbweaver rigor: **two trust tiers, isolation by browser physics not string-munging.** Read with §11.6 (the Streamdown two-policy security spec) — this § is its content-side companion. Build state is the §12.5 table. Why this predates chat + the ST reverse-engineering that sized the safe subset: `../history/ui-theming-archaeology-record.md`.

### 12.0 The governing principle — two trust tiers, isolation by PHYSICS not string-munging

Every user-supplied rendering input is exactly one trust level, and that determines the mechanism:

- **TRUSTED** = authored by the box owner / this user (global theme CSS, own persona theme, own uploaded images). Risk is self-inflicted + design-system integrity, not security.
- **UNTRUSTED** = from an imported character card, another participant, or the LLM (per-character CSS, card HTML, external image URLs, message markdown). Risk is D21 "no leaks ever" — CSS exfiltration, clickjacking, tracking pixels, mutation-XSS.

**Rule:** untrusted content is contained by a *browser-enforced boundary* (sandboxed iframe · CSP · token-validation), NEVER by ST-style regex-sanitize-and-scope (verified bypassable string-munging — archaeology record).

### 12.1 Theming — the CSS story (scopes = Global owner + Per-character)

- **Tier A (default): a curated, Zod-validated TOKEN-OVERRIDE API — not raw CSS.** A fixed subset of DTCG tokens applied as **scoped CSS custom properties** via the `@orb/ui` `<ThemeScope>` (`content/theme-scope/`, clamp in `clamp.ts`). The subset is sized to ST parity: `accent` · per-role bubbles `userBubble`/`aiBubble` (+ optional `systemBubble`) · `name` color · the RP prose semantics `dialogueColor`/`narrationColor`/`bodyColor` · `font` (allowlist) · `radius` · `background` (the surface COLOR — the decorative background IMAGE re-homed to the `appearance` namespace per D63, no longer a theme token) · `borderColor` · `density`. **`chatStyle` is NOT in the subset** (TD/O-4): the message-row anatomy is the viewer's own `appearance.chatStyle` setting — the theme axis wrote a field no selector ever read. `density` stays on the schema but is VIEWER-SACRED from a card: see the card-embeddable partition (`CARD_EMBEDDABLE_THEME_KEYS`/`cardEmbeddableSubset`, `@orb/contracts/theme`), the ONE projection every card-sourced read runs. Custom-property *values* can't select/execute/exfiltrate; they are parsed+clamped at the boundary (a color must parse as a color — reject `url()`/`expression()`; dims snap to the token scale). Covers \~90% of per-character styling with **zero injection surface**. **Resolution is character > global > default**, so a per-character theme recolors THAT character's `aiBubble`/`narration`.
  - **The clamp DERIVES the whole chrome from the ONE user-picked `background`** (browser relative-color-syntax off the one base surface — never hand-picked): every neutral surface, foreground, hairline, and field-fill is a polarity-correct derived tone, so no region reads "unthemed" beside a recolored one. The authoritative live emit surface is **`THEME_SCOPE_EMIT_VARS` in `clamp.ts`** (drift-gated by `tests/ui/content/theme-scope/emit-surface.suite.test.ts`; AA gated by `palette-contrast.suite.test.ts`; the `--color-*` partition pinned by `tests/ui/tokens/theme-emit-pairing.suite.test.ts`) — the code is the truth, not a prose list. The invariants a NEW-chrome task must hold live in `../proposed/ui-cohesion-north-star.md` §2c; the journey by which the emit surface widened past the strict ST subset is `../history/ui-theming-archaeology-record.md`. Never extend the emit surface without its emit-surface + pairing tests. An explicit `borderColor` still overrides the derived border scopes (ST parity).
- **Tier B (opt-in trust): raw CSS only inside the sandboxed-iframe card (§12.2)** — never injected into the app document.
- **Global owner CSS** (trusted): a settings field → one unlayered scoped `<style>` at the end of `<head>` (`app-shell/components/custom-theme-style.tsx`), run through `validateThemeCss` (`@orb/kit/css-validate`): **WARN on `@import`; REJECT `position: fixed`/`sticky`** (containment breaks). The byte cap is the contracts schema (`THEME_CSS_MAX` 64KiB, `@orb/contracts/theme`), not the validator. Unlayered so it WINS — `data-slot` values and `.shell-*` class names are the stable API it targets. The custom-CSS field is `@orb/ui/code-editor` (CodeMirror 6, token-themed, diagnostics layer), NOT a bare `<textarea>`; the same sealed editor serves Tier-B card CSS/HTML and D46 script authoring.
- **Built-in palettes + the theme selector (D71).** A **theme is purely a token value-set** (a color palette + optional density) — there is NO structural mode (the seed's Loom "work mode" is cut, §4.1). The shipped set is **Hearth · Mocha · Light** (D62 — never the seed mockup's Catppuccin/Loom names). Hearth IS the base `@theme`; Mocha/Light are DTCG value-sets at `ui/src/tokens/themes/*.json`, GENERATED into `theme.css` `[data-theme]` blocks by `tokens.build.ts` (build-validated to exactly the `THEME_SCOPE_EMIT_VARS` colors + scrim; never hand-author a block — `css-structure` + the freshness gate are the enforcers). Seeded as ownerless non-deletable rows (`server/domain/settings/seed-themes.ts`), duplicate-to-customize — but a SELECTED seed **renders from its generated block only** (`app-shell/lib/resolve-theme-scope-tokens.ts` passes an empty override for `isSeed`; the row's `ThemeOverride` is solely the duplicate template, pinned byte-identical to the ui authority by `tests/server/domain/settings/seed-theme-pairing.suite.test.ts`). Intent/status hues are ONE static token with `light-dark()` arms, AA-swept per palette + polarity (`palette-contrast`); the clamp derives `color-scheme` from the picked `background`'s polarity so user-authored light themes resolve the light arms and native controls follow. **The theme editor is BUILT** — a first-class entity-editor (`settings/components/theme-editor.tsx`, §13.4): token-override pickers + the code-editor CSS field with live `validateThemeCss` diagnostics + a scoped live `<ThemeScope>` preview + non-blocking WCAG-AA badges on picked text colors. The picker (`theme-picker-surface.tsx`) drives the full lifecycle: select · new · duplicate-a-seed · edit/delete owned · reset-to-Hearth.
- **The settings SHELL that hosts these (D62):** a full-bleed overlay with a left category nav; the IA is law at `UI-Architecture-and-Layout.md` §4.2. This § owns only the appearance/theme CONTENT.
- **APPEARANCE settings — the NON-color surface (ST parity; a separate layer from the color theme).** Applied as root `data-*` attrs / CSS vars (`app-shell/hooks/use-appearance-root-effects.ts`), read by the shell + message render. The live axis set (8 chat skins, avatars, surfaces/glass, background image, message chrome/metadata toggles, sizing/motion/density) is owned by `../proposed/ui-cohesion-north-star.md` §2b; the committed zod shape is `../history/themes-design.md` §3.4. **OUT (deliberately):** `movingUI` free-form dragging, `waifuMode` VN-fullscreen (VN cut, D49). **Also OUT — homed elsewhere:** ST's content-processing knobs (trim/collapse/regex post-processing) live on the **PRESET** (they mutate text — generation territory, D53). Appearance settings are **display-only** (never touch stored content); they're user/AppSettings-level, not per-character — the card-carriable plane is the two CARRIED TWINS (`ThemeOverride`, `ThemeBackground`), partitioned by `CARD_EMBEDDABLE_THEME_KEYS` (identity/atmosphere rides a card; ergonomics/accessibility/cost/treatment stay the viewer's).
- **PERSISTENCE — the server `UserSettings` blob, NOT localStorage.** Theme + appearance prefs live server-side in the `user_settings` blob via `updateUserSettingsSection` (section-scoped writes). Two additive namespaces: **`theme`** (holds ONLY `selectedThemeId` — override values live on the selected `themes` ROW, never inline; one-home) and **`appearance`**. **localStorage / Zustand-`persist` is reserved for DEVICE-LOCAL transient state ONLY** (panel dock/collapse · focus toggle · drafts) — prefs that follow the user across devices go in the synced blob (enforced by the `persistence-boundary` gate). Custom themes are a first-class single-owned `themes` ENTITY with CRUD (the preset pattern: `ownerId` + `fetchOwned`). Per-character themes ride the character row (§12.5). **The full server/contracts/db design: `../history/themes-design.md` — IMPLEMENTED.**

### 12.2 Rich message content — the HTML story (two tiers; Tier B = sandboxed iframe, NOT Shadow DOM)

**Shadow DOM is encapsulation, not a security boundary; a sandboxed `<iframe>` IS the boundary** (separate realm, `sandbox` minus `allow-same-origin`, per-frame CSP) — the industry standard for untrusted LLM HTML (Claude Artifacts, CodePen, JSFiddle). Full rationale: `../history/ui-theming-archaeology-record.md`.

- **Tier A (default, main DOM): a tight INERT sanitized allowlist via Streamdown** — the untrusted policy in `packages/ui/src/markdown/policy.ts` (`TIER_A_ELEMENTS`: structural + text formatting + tables + `details/summary` + gated links; icons map to **lucide**). **Forbidden in Tier A:** `<script>` · `on*` handlers · `<style>` · inline `style=` · `<iframe>/<object>/<embed>/<form>/<input>` — by omission from the allowlist. The policy additionally drops `img` entirely (the preload-exfil finding — §11.6); untrusted images route through `MessageMedia` (§12.3).
- **Tier B (opt-in per-character trust): elaborate self-contained HTML+CSS mini-UI → `@orb/ui/sandbox-frame`** (`content/sandbox-frame/`; the per-frame CSP lives in `srcdoc.ts`, the ONE file that owns the `sandbox`/CSP attributes): sandboxed iframe minus `allow-same-origin`, `connect-src 'none'`, gated `img-src`, **render-on-complete** (hold until the block closes; skeleton during stream), the validated theme-token subset injected so the card's `var(--accent)` tracks the active theme, origin-checked postMessage auto-height, lazy-mounted + a stable key. **The `message-list` seal HAS a keep-mounted path (PD-119, shipped):** the `keepMounted?: (item: T) => boolean` predicate forces matched rows' indices into the rendered range so a live Tier-B iframe row stays a mounted DOM node off-screen and does not reload. Before Tier-B cards ship in chat, pass `keepMounted` for the live-iframe rows (cap the set) rather than hoisting row state to an external store.
- **Explicit NON-GOALS v1:** card JS / event handlers · action-buttons wired to app commands (ST's QR/STscript surface) · forms · card-spawned iframes · inline `style`. **Doored, not walled:** interactivity later = flip `allow-scripts` for a *trusted* card — a gate change, not a re-architecture.
- **Two sandboxes, orthogonal — do NOT conflate:** this iframe isolates untrusted **display** (card HTML/CSS/UI); the QuickJS-WASM sandbox (scripting proposal §7) isolates untrusted **logic**. A card's future interactivity flips THIS iframe's `allow-scripts` — it does NOT route through QuickJS.

### 12.3 Images AND native media in chat — also two trust tiers

Covers `<img>` **and native `<audio controls>` / `<video controls>`** — native media is the one HTML class that's interactive *declaratively*, so it sidesteps the no-JS rule (the ST "card music player" case) and carries the external-load risk plus autoplay (tracking + noise) and bandwidth.

- **TRUSTED = own uploads / assets → render freely from our store.** Composer attach → the `assets` domain with variants/thumbnails from `infra/image` sharp → referenced as `asset://<id>` → served from our origin. The same stored asset also feeds the multimodal send (§12.4).
- **UNTRUSTED = external URLs** (LLM markdown `![](url)`, untrusted card media) → gated, defaulting to SAFE:
  - **`forbidExternalMedia: true` by default** (mirrors ST + D21): external media does NOT auto-load — the *load itself* is the exfil/tracking-pixel. Render a click-to-load "external media — load from `<host>`?" placeholder.
  - **`autoplay` FORCED OFF and `controls` REQUIRED on untrusted audio/video, always** — non-overridable.
  - When permitted (per-character `override ?? global`, extending the D21 `forbidExternalMedia` tri-state): only `allowedMediaPrefixes` hosts load · no data-URI images · CSP `img-src`/`media-src` as the network backstop.
- **`@orb/ui` `<MessageMedia>`** (`content/message-media/`; image + native a/v): asset-ref vs external-gated dispatch · lazy-load · intrinsic size/aspect reservation (no layout shift) · autoplay-off + controls-on for untrusted A/V · broken-media fallback · click-to-zoom **lightbox** (sealed viewer over Dialog + MessageMedia). Inside a Tier-B frame, media is additionally governed by the frame's own CSP (defense-in-depth).
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

**Per-speaker color in merged/narrator mode — BUILT (kit + assembly side), do NOT re-invent:** merged-narrator messages carry inline `<speaker>NAME</speaker>` markers IN the content string (`@orb/kit/speaker-label` — `SPEAKER_TAG_PAIR`; kept in stored canon *specifically so the renderer can color them*, stripped to `Name:` for prompt history via `speakerTagsToPlain`). The client narrator render splits the body on those markers and wraps each span in its own `<ThemeScope theme={resolve(name)}>` → each character's `dialogue`/`narration` colors apply *within the one merged bubble*. A torn `<speaker…` mid-stream is held by `holdTornSpeaker` (`@orb/kit/fix-markdown`). Solo/per-speaker is the no-op case (byte-identical, no markers). Per-speaker theming is **content-string + inline markers + a render-time parse**, NOT a stored segment array.

**Scope: pictures in chat = DISPLAY (the committed feature). Model-vision = separate.** Send a picture (own upload), receive and display it, display an online image by URL — that is *entirely the render model* (a `media` block rendered by `MessageMedia`, `forbidExternalMedia` gating externals). The model is NOT involved.

The **provider-send model** — what is transmitted *to the model as input* — is called out only so it isn't conflated with display:

| | Render model | Provider-send model |
| - | - | - |
| Contract | `MessageContentBlock` (this §) | `ChatHistoryMessage.content` (`@orb/contracts/chat`) |
| Direction | stored message → client display | assembled turn → the model |
| Shape | block union (markdown / media / html-card) | content-part array (text / image parts) |
| Gated by | trust-tier × render-tier (§12.2) | `ModelCapability.vision` — image parts only to vision-capable models |

**Model-vision is ALSO committed — ledger D45** (server-side; NOT a client-doc concern). Authoritative homes: `domain/connection` (the `ModelCapability.vision` axis) + `core/Tier-3b-Providers.md` (translators map image parts to each wire) + `@orb/contracts/chat` (message DTOs); this § only records the render↔send distinction. One uploaded image is stored once (`assets`) and used both as a render `media` block AND an `image` send-part.

### 12.5 Where each piece lives (the cake)

| Concern | Home | State |
| - | - | - |
| `ThemeOverride` schema (token subset) · `MessageContentBlock` union | `@orb/contracts` (`/theme` per `../history/themes-design.md` §3.1) | BUILT |
| `<ThemeScope>` · `sandbox-frame` · `<MessageMedia>` + lightbox · code-editor | `@orb/ui` | BUILT |
| Tier-A HTML sanitize allowlist + url gate (Streamdown config) | `@orb/ui/markdown` (`policy.ts`) | BUILT |
| asset storage + thumbnails/variants | `assets` domain + `infra/image` sharp | BUILT (server) |
| `themes` entity CRUD · seed palettes · `theme`/`appearance` settings sections · theme editor + picker | `server/domain/settings` + `client/features/settings` | BUILT |
| CSP headers (`img-src` · `connect-src` · `style-src`) | `entry/http/security-headers.ts` | BUILT |
| composer image attach · multimodal send · `forbidExternalMedia`/`cardTrust` resolution | chat domain (extends D21) | Phase 5/6 |

**One-home note (deliberate, recorded):** the `ThemeOverride` Zod clamp exists twice by design — the WIRE schema in `@orb/contracts/theme` (`override.ts`) and the ui-local RENDER clamp in `<ThemeScope>` (`clamp.ts`; `@orb/ui` cannot import contracts — the cake). The structural pairing is asserted by `tests/contracts/theme/pairing.suite.test.ts` (identical field-key sets + enums; the packages never import each other).

### 12.6 Gates (machine-enforceable — the rigor)

- **`no-untrusted-html-in-main-dom`** (`scripts/check/gates/`) — a raw/untrusted HTML string may reach ONLY `@orb/ui/sandbox-frame`; never `dangerouslySetInnerHTML` or main-DOM injection.
- **`no-external-media-without-gate`** (`scripts/check/gates/`) — any raw `<img>`/`<audio>`/`<video>` in a feature must route through `MessageMedia`.
- **`theme-override-only-via-scope`** (`scripts/check/gates/`) — a `--color-*` override applies only via `<ThemeScope>` (values clamped at the boundary), never spread as a raw `style` prop.
- **`persistence-boundary`** — synced prefs go in the `user_settings` blob, not raw browser storage (§12.1 PERSISTENCE).
- **CSP-headers-present** — the app-document CSP exists + is tight (`security-headers.ts`); enforced as a TEST (`tests/server/entry/http/security-headers.test.ts`, per-directive pins), not a `scripts/check/gates/` gate.

The `@orb/ui` halves ship as CT containment tests (the sandbox/CSP attrs are string-asserted, hostile `ThemeScope` values rejected). The lint/route halves that need message-render code activate with the Phase-5/6 chat wiring.

### 12.7 Streaming interplay (ties to §6.3.1)

- **HTML-card blocks render-on-complete** (hold until the block closes) — the `sandbox-frame` enforces this; skeleton/plain text during stream.
- **Images reserve space from known dims** (asset images known-size; externals a fixed placeholder box) so mid-stream arrival doesn't shift layout.

### 12.8 Sequencing (born-compliant)

The `@orb/ui` primitives, the `@orb/contracts` `MessageContentBlock`/`ThemeOverride` blocks, the `themes` server slice, and the app-document CSP (`entry/http/security-headers.ts`) are BUILT. Still pending, and required **before Phase 5/6 wires chat content**: the §12.6 lint halves that need message-render code + the composer/`cardTrust` assembly resolution (same rule as §11.7). A chat agent assembles messages against this spec; it does not get to invent the content model or copy ST's string-blob.
