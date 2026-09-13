---
kind: review
status: active
updated: 2026-08-29
---

# side-eye scored review — Plugins settings pane rework

**Target:** commit `0789a0718` (branch `wt/agent-a5a6a106b70beb64c`), driven live on the isolated
stage `http://localhost:5273` / server `:8888` (stage `0789a07184d3`). Confirmed on the rework by the
bordered plugin cards + checkbox-leading capability rows before scoring. Fixture: `plugin.list` = 9
rows, **all nine reconsent-pending** (see limitation below).

## VERDICT: SHIP (owner can merge)

This is a real, substantial fix of the owner's "fugly, no hierarchy or order" complaint — not a
reskin. Every one of the 7 prior findings is confirmed fixed with a receipt, the new inert hint is
present and CT-pinned, a11y is a clean 100 on both device arms, all text (badges + ghost callout
included) passes AA, and the full keyboard walk is focus-visible at every stop with clean accessible
names. Residuals are P2/P3 polish, none blocking. Fix them in a follow-up if you like; they do not
gate merge.

---

## Scores

### design-audit (deterministic scanner)

| Arm | P0 | P1 (raw) | P1 (ground-truth) | P2 | P3 |
| - | - | - | - | - | - |
| Desktop (`pointer=fine`, 1280×800) | 0 | 2 | **0** | 2 | 55 |
| Desktop tall (1280×2200, discriminator) | 0 | 41 | **0** | 2 | 55 |
| Mobile (`pointer=coarse`, 430×932) | 0 | 7 | **0** | 2 | 11 |

- **Every P1 is `tap-target` on the 18×18 capability checkbox box — all PHANTOM.** Ground truth: the
  interactive grant rows are `<label htmlFor={boxId}>` wrapping name+consequence, and that `for`
  resolves to Base UI's hidden native `input[type=checkbox]` (measured: label **668×54px**, target
  `INPUT[type=checkbox]`). So the whole 668×54 row toggles the box — WCAG 2.5.8's equivalent-control
  exception is satisfied; the 18px is a secondary precise target, not the only one. The tall-viewport
  re-run yielding p1=41 (not the p1=0 the brief predicted) is because MORE checkboxes scroll into view,
  not because the finding is real — each checkbox is flagged once visible. **Reported clean on the
  ground-truth basis.**
- **P2 ×2 `caveat-outweighed`** (real, minor): a caveat sentence renders ~1.23× smaller than the claim
  it qualifies (`card-root` #4's alert). Typographic polish; `prose` on the caveat closes it.
- **P3 histogram (pane):** `nested-card` ×9 (the reconsent callout border inside the card border —
  box-in-box, see UGLY §), `line-length` ×45 (reading text at 90–93ch, see P3-A). `all-caps-body` ×1
  is the HOME shell behind the modal ("Example — The Ashen Spire" game card), **not the pane —
  excluded.**

### Lighthouse (pane, snapshot mode — the modal is client state, so navigation mode is void)

| Arm | Accessibility | Best-practices | SEO | Agentic |
| - | - | - | - | - |
| Desktop | **100** | **100** | **100** | 100 |
| Mobile | **100** | **100** | **100** | 100 |

37 audits passed, 0 failed, both arms. Performance score is not separable for a client-state modal
(navigation reloads to Home); pane perf from its own receipts is healthy: `region:content` render
churn count=21 / max 17ms / avg 2ms (mount settle, no hotspot), no slow commits post-mount. The boot
LoAF (145ms / 95ms blocking) and dropped frames belong to the Home shell's Orbweaver logo weave-veil
animation, not the pane.

### Nielsen + aesthetic (pane, 0–40) — **35/40 (good/excellent)**

| # | Heuristic | Score | Note |
| - | - | - | - |
| 1 | System status | 4 | Per-plugin status badge (On/Off/On-nothing-granted/reconsent/errored), skeleton loads, reconsent says *why* it's off, update verdicts. |
| 2 | Match real world | 4 | Plain-English capability copy + consequences; no wire jargon. |
| 3 | Control & freedom | 3.5 | Esc closes; reconsent = allow/remove + granular subset; Remove behind confirm. |
| 4 | Consistency | 4 | "Remove" verb unified (P2-7); badge intents consistent (New=info, Costs=warning, Reaches=danger); one copy home. |
| 5 | Error prevention | 4 | Reconsent gate, remove-confirm, granular grant, netHosts echo guard. |
| 6 | Recognition | 3.5 | Consequences + labeled badges; minor — the clickable label shows `cursor:default`, no click affordance. |
| 7 | Flexibility | 3 | No cross-plugin bulk; per-plugin subset granting is efficient for the surface. |
| 8 | Aesthetic/minimalist | 3 | Big jump, clear hierarchy — held back by the box-in-box callout, the repeated bold headline wall, and the wide reading measure. |
| 9 | Error recovery | 3.5 | `lastError` shown, update failures toast, reconsent explains + recovers. |
| 10 | Help/docs | 3.5 | Consequence lines are self-teaching contextual help. |

### Hierarchy / order (the owner's exact complaint) — **8/10, up from ~3/10 old (Δ +5)**

Justification below.

---

## Hierarchy / order judgment vs the old layout (`reports/snaps/plug-pane.png`)

The old layout earned the "fugly, no hierarchy or order" call:

- **No plugin boundary** — content bled onto the pane behind one faint hairline; stacked plugins would
  read as a continuous wall.
- **The reconsent headline floated in bare prose** with no set-apart container.
- **The capability checkbox was stranded ~400px to the far right** of its own label (the P2-2 "18px
  aim" defect), disconnected from the words it grants.
- **"(new in this update)" was baked into the visible label** AND repeated by the "New" badge 8px away.

The rework fixes all four:

- **Bordered Card per plugin** = a real edge saying where one plugin's consent story ends.
- **Header block** (identity left, controls right) closed by a **hairline** = the acts read as chrome
  OF the plugin.
- **Reconsent = a set-apart callout** with a bold headline.
- **Checkbox LEADS the row**, adjacent to its words, whole 668×54 row is the target — the far-right gap
  is gone.
- **Attention-first ordering** (reconsent/errored sort first; toggling never reorders).
- Visible label de-duped (the "New" badge alone carries "new").

This is genuinely designed now, not a wall. The −2 on the 10-scale:

1. the callout is a **bordered box inside a bordered card** (box-in-box), and
2. when many reconsent cards stack, the **verbatim-repeated bold headline** re-creates a wall of its
   own (amplified to the extreme by this 9/9-reconsent fixture).

---

## Per-finding verification (7 prior + the inert hint)

| # | Prior finding | Status | Receipt |
| - | - | - | - |
| P2-1 | Mobile header collision (long badge) | **FIXED** | Mobile 430px screenshot: name on its own line, "Off — asked for more than you allowed" wraps to its own line, controls drop below — no overlap. CT `plugins-settings-surface.ct.tsx:690` asserts badge box disjoint from switch AND Update AND inside the 390px pane. |
| P2-2 | Consent-checkbox hit area (~400px far-right gap, 18px aim) | **FIXED** | Checkbox now LEADS; `<label htmlFor>` → hidden `input[type=checkbox]`, label measured **668×54px** = the row toggles. Old far-right column gone (old vs new screenshots). |
| P2-3 | Disclosure button height (was 746×16, sub-24px) | **FIXED** | Live: `size="control"` disclosure = **32px** (desktop/fine) / **44px** (mobile/coarse). CT pins ≥44 on coarse. |
| P3-4 | WCAG label-in-name (disclosure) | **FIXED** | aria-label `"What it's allowed to do — Affinity Tracker"` contains the visible "What it's allowed to do" as a prefix; plugin name after the em-dash disambiguates. Confirmed in `--map` + keyboard walk. |
| P3-5 | Run-on SR names | **FIXED** | Keyboard walk read `checkbox "Read this room's messages (new in this update)"` — badge pills excluded from the accessible name (aria-label wins), visible label stays a prefix. |
| P3-6 | Extensions double empty-state | **FIXED** | `extensions-page-surface.tsx` zero-pages arm reuses the LIST's `EXTENSIONS_EMPTY_*` constants (one home). CT `extensions-section.ct.tsx:154-157` asserts "No extension pages yet" visible + "Pick an extension page" count 0. (Not live-reproducible — fixture has 0 plugin surfaces.) |
| P2-7 | Doubled "Card Atlas" title | **FIXED** | `extensions-switcher-surface.tsx` omits `subtitle`+`titleQualifier` when `pluginName === title`. CT asserts `plugin-page-attribution` count 0 + `·` count 0 for the equal-title case. |
| — | New "On — nothing granted yet" hint | **PRESENT** | `statusCopy` returns it for `status==="enabled" && grantedCount===0` (warning intent, deliberately no dead "tick below" affordance). CT `plugins-settings-surface.ct.tsx:729-733` mounts enabled+0-grants and asserts the exact text visible + "On" (exact) count 0. **Not live-reproducible** — all 9 fixture plugins are reconsent-pending, so none can be enabled to 0-grants. |

---

## Residual issues (confirmed only, ranked)

- **\[P2] Reading text exceeds the 65–75ch measure (line-length ×45, 90–93ch).** The reconsent callout
  explanation and capability consequence lines run to ~93ch in the wide content column — beyond the
  reading measure (skill §2). **Fix (`layout`/`typeset`):** cap the callout body + consequence text with
  the measure token (`max-w-prose`). Receipt: design-audit `line-length` 45→0.
- **\[P3 · UGLY] Box-in-box: bordered callout inside bordered card (nested-card ×9).** Because the amber
  fill was correctly removed to protect badge AA, the callout is set apart by a hairline border ONLY —
  a border-in-border that reads as mild nesting, most visible on mobile where the two borders sit tight.
  Defensible (the callout is a distinct `role="alert"` affordance), but it's the one thing keeping the
  pane from feeling fully resolved. **Consider (`quieter`):** drop the callout's own border and set it
  apart with a leading accent rule + the bold headline + spacing, or a warning tint low enough to keep
  badges ≥4.5:1. Receipt: before/after shots + `--contrast` on the badges still PASS.
- **\[P3] Repeated verbatim bold headline stacks into a wall.** All 9 fixture cards show the identical
  "This update asks for N permissions you hadn't allowed, so it stayed off. Check what it wants below."
  A realistic pane (1–2 reconsent) reads fine, but the design should not let a run of reconsent cards
  re-create the wall the rework removed. Low priority; watch it.
- **\[P3] Clickable grant-row label shows `cursor: default`, not `pointer`.** No mouse affordance that
  the whole row toggles. Standard for checkbox labels, but a `cursor-pointer` on the interactive label
  would advertise the large target the rework built.
- **\[P2, minor/typographic] `caveat-outweighed` ×2** — a caveat renders 1.23× smaller than its claim;
  `prose` on the caveat closes it.

**Retraction / correction:** the brief's hazard note said the compositor probe would show the checkbox
"owns a full 44×44 ring" and the tall-viewport re-run would yield p1=0. Measured live, neither held:
the checkbox `::after` is `content:none` and its `::before` touch pseudo (`size-touch-target`, 44px) is
occluded by the adjacent text column, and the tall re-run yielded p1=41. The tap-targets are still
non-blocking — but the reason is the **`htmlFor` label equivalent target (668×54)**, not a 44px ring on
the box. Corrected here so a future pass doesn't chase a ring that isn't there.

## What's genuinely working (don't touch)

- **The whole consent information architecture.** Plain-English capability copy with consequence lines,
  spend/risk badges as second signals (never color alone), the reconsent callout that says *why* a
  plugin is off and offers a granular allow/remove — this is a genuinely excellent security surface.
- **Accessibility.** Lighthouse a11y 100 both arms, every control keyboard-reachable with `:focus-visible`
  true at every stop, clean de-run-on'd accessible names, label-in-name satisfied.
- **The checkbox-leading grant rows.** The single best fix — the ~400px far-right gap is gone and the
  whole row is the target.

## The single biggest opportunity

Cap the reading measure (P2 line-length) and quiet the callout's own border (P3 box-in-box) together —
that's the last step from "clearly better" to "fully designed," and both are one-token changes.

---

## Instrument coverage table

| Instrument | Status |
| - | - |
| `snap --map` (pane structure) | RAN — `reports/snaps/plugins-rework-desktop.png` (map=146) |
| `snap` screenshots (desktop / tall / mobile / disclosure-open) | RAN — `plugins-rework-desktop`, `-tall`, `-vtall`, `-mobile`, `plugins-disclosure-open` |
| `snap --contrast` (badges + callout + body + name) | RAN — warning 6.86:1, info 5.45:1, destructive 5.07:1, callout title 15.73:1, callout body 7.75:1 — all PASS |
| `snap --eval` (switch states, badge CS, hit-tests, label htmlFor, motion, renders, perf) | RAN |
| `snap --expect-no-overflow` (mobile) | RAN — 13×0 pseudo overhang, escapes=0, no visible scroll (benign) |
| Keyboard walk (`--key Tab` + `:focus-visible`) | RAN — fv=true at every stop incl. content controls |
| `design-audit` desktop + `--mobile` + tall discriminator | RAN — `reports/design-audit/plugins-da-{desktop,mobile,tall}.json` |
| Lighthouse desktop + mobile (snapshot) | RAN — 100/100/100 both arms |
| `__orb.motion()` / CLS | RAN — CLS 0.236 attributed to Home-shell boot settle behind the modal (What's coming / nav Primary movers), NOT the pane |
| `__orb.renders()` / `.perf()` | RAN — no churn hotspot |
| Console / network triage | RAN — 0 errors / 0 page-errors / 0 failed-req across all runs; warnings = Home-shell boot animation |
| Extensions surfaces live drive | SKIPPED — fixture has 0 plugin surfaces (`plugin.listSurfaces` = 0); verified via diff + CT instead |
| `motion-audit` / `perf-meter` / `record` | SKIPPED — pane is near-static (one collapsible); frame + render receipts cover it; noted the boot-animation frames belong to the Home shell |
