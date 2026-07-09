---
kind: history
status: superseded
updated: 2026-07-09
---

# Discord UX recon → Orbweaver (design-direction, 2026-07-06)

> **SUPERSEDED — ARCHIVED 2026-07-09 (owner call: "the discord ux can be tossed, we have what we
> want").** Owner-flagged UNRELIABLE — the recon analyzed the wrong reference; treat every
> conclusion below as suspect. Everything actionable was absorbed into the D62 program and its law
> folds: the elevation ramp became the `appearance.elevation` user pref (D44 §12.1;
> `shell.css [data-elevation=ramp]` + the `--color-panel` token), and the spacing/width/mobile items
> went through `core/UI-Architecture-and-Layout.md` §4.1–§4.3 + `ui-polish-punchlist.md` /
> `ux-flow-revamp.md`. The un-absorbed residue (unread/activity grammar · density toggle ·
> right-click menus) was reviewed and DROPPED by the owner 2026-07-09 — do not re-mine this doc.
> Read the law docs, not this file.

> **Source:** a 3-agent web recon of Discord's desktop app (structure/spacing/layering ·
> interactions · settings/full-bleed), each cross-checked against Orbweaver's actual client code and
> mapped to the `RAIL | LIST | CONTENT | CONTEXT` shell. Orbweaver is deliberately Discord-esque
> (§4.2 already calls the shell "Discord's anatomy with different nouns"). This doc is the actionable
> synthesis: **what's already right, what's the real gap, prioritized.** Reference palette + screens
> live in `reference/design/` (the design system).
>
> **Honest caveat (from the agents):** Discord publishes no design rationale; most structural claims
> are pattern-recall + community sources (BetterDiscord/Comfy-Themes token dumps, support docs), not
> official specs. Values are approximate. Verify against the `reference/design/` screenshots.

## TL;DR — the good news is it's a gap analysis, not a redesign

Orbweaver's **interactions and settings are already \~90% Discord-correct** (the architecture is sound).
The "looks like ass" is concentrated in a few visual/layout gaps, in priority order:

1. **The 3-tier elevation ramp is collapsed** → the flat, unlayered look. *(the #1 fix)*
2. **CONTENT column too narrow + CONTEXT never fills** → the floaty-gutter look.
3. **Spacing tokens drifted from the design system** (missing `gutter`/`tight`, `section` 24 vs 16).
4. **No unread/activity grammar** → nothing tells you what changed (real domain gap).
5. Cheap polish: composer float, right-click menus, settings pane cap, density toggle.

---

## 1. Elevation — the flat look (HIGHEST)

Discord builds depth from **3 background shades, no borders** — each region a \~2-4% luminance step:
rail (darkest) → channel sidebar → chat (lightest, where you read for hours) → floating/modals (darkest again).

**Orbweaver today (verified in `shell.css` + `theme.css`):**

- RAIL = `--color-sidebar` 0.132 (darkest) ✓
- **LIST + CONTEXT panels = `--color-sidebar` 0.132 — identical to the rail** ✗
- CONTENT + topbar = `--color-background` 0.158 — only 0.026 lighter than the panels ✗

→ The 3 tiers collapsed to \~1.5. **Fix:** make RAIL→LIST→CONTENT a real ramp — RAIL darkest,
LIST/CONTEXT a distinct *middle* shade, CONTENT the *lightest* (it hosts the reading surface, wants
the most text contrast). Keep it border-free; depth = value steps only. This is the single highest-value
change. Concretely: give the `.shell-panel` (LIST/CONTEXT) its own token between `sidebar` and
`background`, and lift CONTENT toward `card` (0.205)-ish so the step off the panels is perceptible.

## 2. Content width + CONTEXT filling — the floaty look

- **Do NOT copy Discord's uncapped full-bleed chat.** Discord stretches chat edge-to-edge and its own
  users complain on wide monitors (BetterDiscord max-width mods exist). Orbweaver's long-form RP prose
  suffers *more* from full-bleed. **Cap the reading column** — the design system already specifies
  `--width-shell-content: 1100px` (center caps + centers; empty gutters when panels closed are
  intentional, "ST does the same"). The app currently caps the thread at `max-w-cq-lg` (768px) — too
  narrow; move toward \~1100.
- **CONTEXT must dock on an active chat** (§4.1, currently a deferred/unwired gap — see the UI-audit
  notes). Discord's members panel fills the right side; when Orbweaver's CONTEXT is collapsed, the
  leftover is dead space and the thread floats. Docking it makes the 3-pane read balanced.

## 3. Spacing — reconcile to the design system

The app's `tokens.json` drifted from `reference/design/src/styles/globals.css`:

- **missing `--spacing-gutter` (0.75rem / 12px)** — the design system's *dedicated surface-horizontal-padding
  token*. Its absence is exactly why every surface improvises padding. Adopt it as the one surface pad.
- **missing `--spacing-tight` (0.25rem / 4px)** — chip/icon-cluster padding.
- **`--spacing-section` is 24px; should be 16px** (1rem) — vertical rhythm is 50% too loose.
- Base grid: **8px-dominant** (Discord isn't strict-4px; 4px is the half-step for icon gaps/badges).
- **Density toggle** (Discord ships Spacious/Default/Compact as first-class UI): one CSS scale-factor on
  the `--spacing-*` ramp + control heights. Cheap, proven; wire it as a real `data-density` preference.

## 4. Unread / activity grammar (real domain gap)

Discord's 3-tier signal: plain **dot** = unread · red **numbered badge** = mentions (cascades rail→app
icon) · in-chat **"NEW" divider line** at the last-read point. **Orbweaver has none** — but the SSE bus
already *knows* when a chat changed (it drives invalidation); only the visual grammar is missing. Needs a
`last-read` marker concept (single-user → session-local is fine, no cross-device sync). Scope as its own
task: LIST-row unread dot + RAIL activity pip + a one-time CONTENT "unread starts here" divider.

## 5. Interactions — mostly BUILT (Orbweaver is strong here)

| pattern | status | note |
| - | - | - |
| message hover toolbar + `:focus-within` + coarse-pointer fallback | **BUILT** | matches Discord best practice |
| CONTEXT follows CONTENT (props-only, no ambient read) | **BUILT** | *stricter* than Discord — keep it |
| composer pill · grow-then-scroll · Enter/Shift+Enter · Send⇄Stop morph · edit-in-place | **BUILT** | edit-in-place uses an external draft store (survives list virtualization — smarter than Discord needs) |
| ⌘K quick-switcher (cmdk) · tooltips (Base UI) | **BUILT** | verify tooltip open-delay isn't 0ms (Discord \~500ms, avoids rail-transit flicker) |
| motion restraint via `--motion-*` tokens + `ease-out-expo` | **BUILT** | token-driven; verify a central `prefers-reduced-motion` gate |
| **right-click context menus** (messages, list rows) | **GAP** | cheap — reuse the existing `@orb/ui/Menu`; surface the *rare* actions (copy id/link, jump) not the hover-bar's frequent ones |
| streaming ghost row (vs Discord "typing…") | **BUILT+** | better than Discord post-stream; consider a "queued/thinking" affordance for the pre-first-token gap |
| reactions · reply-quote chip | absent | reactions likely out-of-scope (single-user); reply-quote *maybe* for busy group RP |
| Fork (= Discord "thread") | **BUILT, heavier** | clones the full timeline — correct for RP "try a different path", a different tool than a threaded side-chat |

## 6. Settings & full-bleed — mostly Discord-correct

- **Full-bleed takeover** via `ModalDef.size="full"` + `modal-host` flex-column (header pins, body scrolls)
  — matches Discord's "becomes the app" settings. ✓
- **USER/APP grouped nav + live search-filter** (`settings-nav.ts` + `settings-shell-surface`) — matches
  Discord's grouped micro-caps categories + search. ✓
- **Row grammar** (label + one-line muted description + right-aligned control) + **instant-autosave for
  prefs** — the correct Discord call for a preferences page. ✓
- **Full-bleed-vs-modal rule** (full-bleed = has its own sub-nav; centered card = single form/decision) —
  already encoded in `ModalDef.size`. ✓
- **GAP (worth fixing):** the settings content pane likely stretches full-width on wide monitors. Discord
  **caps it \~640–740px and left-aligns** (doesn't center or stretch) so descriptions don't run 1400px wide.
- **Future:** reserve an "unsaved changes" save-bar for *networked/interdependent* categories
  (`connections`/credentials) — do NOT autosave-per-keystroke an API-key field. Instant-toggle for pure
  display prefs, explicit save-bar for anything with a network cost. Don't build it speculatively.

## 7. Also worth stealing (cheap, high-legibility)

- **Composer as an inset floating card**, not edge-to-edge (Discord's most copy-worthy detail; Orbweaver's
  composer is already a centered pill — just ensure it's inset with a `surface`-tone chip, not flush).
- **Collapsible LIST categories + 11px micro-caps headers** (if/when LIST rows group, e.g. Active vs Archived).
- **Distinct active-row vs hover-row** treatments in LIST (pill bg + full-opacity text for active; subtle
  tint for hover) — not one shared "selected" class.

---

## Prioritized punch-list

1. **3-tier elevation ramp** (RAIL darkest → LIST/CONTEXT middle → CONTENT lightest), border-free. *(the flat-look fix)*
2. **Token reconcile to `reference/design/globals.css`** — add `gutter`+`tight`, `section`→16px; adopt `gutter` as the one surface pad. *(the padding-inconsistency fix)*
3. **CONTEXT auto-dock on active chat** + **content column → \~1100px**. *(the floaty-gutter fix)*
4. **Unread/activity grammar** (last-read marker → dot/pip/divider). *(scoped domain task)*
5. Polish: settings pane max-width cap · right-click menus · density toggle · composer inset · tooltip delay/reduced-motion sanity checks.
