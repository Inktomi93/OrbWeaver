# Agent-Navigability Plan — making the URL-less shell legible & drivable by headless agents

> **Status: research-derived proposal for a SEPARATE lane** (not part of the theme wave). Web-research
> synthesis (2026 best practices) tailored to orbweaver's single-route/URL-less React shell. This doc is
> the cold-read brief for whoever picks this up. Nothing here is built yet — it's an ADOPT + ENFORCE plan.

## Why this matters (the framing)

A large share of the people driving this app are **agents** (Claude Code via `pnpm snap` / `window.__orb`
/ Playwright, plus MCP browser tools). And orbweaver is **single-route**: the URL stays `/`, so there's no
address bar to encode or observe "where am I." That flips the model:

> **In a URL-less app, the accessibility (AX) tree + DOM-reflected state IS the agent's URL bar.**

MCP browser servers (including Playwright MCP) hand the model the **accessibility tree, not pixels** —
faster, works with non-vision models. So the AX tree an agent sees is *literally the same artifact* our
Playwright ARIA-snapshot goldens assert. The through-line: **agent-legible ≈ accessibility-excellent**,
plus the URL-less twist of exposing navigation *state* as observable ARIA/DOM. A 2026 UC-Berkeley/Michigan
study found agent task success dropped **78% → 42%** when the AX tree was degraded — a11y gaps *are* agent
reliability gaps, empirically.

The one qualification: accessibility gives agents *discovery* (what exists, its role/state) but not
*execution contracts* (what an action needs, its effects) — that's the gap the emerging **WebMCP** targets.
Good ARIA now is a down payment on it, no rework later.

## Principles

1. **The AX tree, not the DOM, is the contract.** Playwright's own guidance ranks locators
   `getByRole(name)` > `getByLabel`/`getByText` > `getByTestId`, steering off CSS/XPath (brittle to markup
   churn). A Material-UI-style app can be ~2000 DOM nodes vs ~200 AX nodes — a 10:1 signal win agents exploit.
2. **State must be synchronized into ARIA, not just rendered visually.** A control that's visually "active"
   but has no `aria-pressed`/`aria-current`/`aria-selected` update is invisible to screen readers AND agents.
3. **Readiness beats racing.** Interacting before hydration is a documented flakiness class; the fix is an
   explicit ready signal the harness waits on — which `data-app-ready` already provides.
4. **Stable, human-readable identifiers over generated ones** (`checkout.submit_order`, not a hashed class) —
   the justification for a typed test-id registry as fallback, not an afterthought.

## The orb gap-map (what's already good vs what to actually do)

| Have today | Covers | Verdict / action |
|---|---|---|
| ARIA landmarks (`main`/`nav`/`complementary`) | landmark structure | Good foundation — **verify accessible-name UNIQUENESS** across the two `complementary` regions (LIST vs CONTEXT); same-role landmarks need distinct names (WCAG ARIA11). |
| Typed `testId(...)` registry | stable fallback ids | Right shape per 2026 convention — keep it as the *fallback* locator layer, not primary. |
| Playwright ARIA-snapshot goldens (`toMatchAriaSnapshot`) | structure | **Highest-leverage lever already in place** — the gap is COVERAGE: extend to every `data-panel-mode`/`data-active-section`/modal-open permutation AND assert the `aria-current`/`aria-expanded`/`aria-selected` VALUES, not just structure. |
| Playwright CT + e2e | harness | Infra's there; the gaps are *what gets asserted*, not the runner. |
| `window.__orb` (snap/bus/queries/shell/perf/renders) | setup/wait back-channel | Sanctioned pattern (the Cypress `window.store` equivalent) — keep for SETUP/WAIT, **not** as the primary assertion surface (asserting against `__orb` re-couples tests to internals; assert on AX tree/behavior). |
| `data-app-ready` signal | hydration-race fix | Genuinely ahead of most SPAs — keep. |

**Real gaps (not covered by anything above):**
1. **No live-region route-announcement.** Because the URL never changes, screen readers (and agents relying
   on AX events) get no "new page" signal on section/panel transitions.
2. **Unclear ARIA-state ↔ `data-*` sync.** It's unconfirmed whether `aria-current`/`expanded`/`selected`/
   `pressed` are consistently wired to the state store, or whether `data-*` carries the state ALONE. An agent
   reading pure AX tree (MCP `browser_snapshot`) sees ARIA/role/name, **not** `data-*` — both channels must agree.
3. **No virtualized-list AX contract.** Off-screen rows genuinely aren't in the DOM/AX tree, so
   `locator('row').count()` lies. Need `aria-rowcount`/`aria-setsize`/`aria-posinset` (the AG-Grid pattern) OR a
   `window.__orb` jump-to-item method so agents don't scroll-and-poll.
4. **jsx-a11y / axe CI status unconfirmed** — check whether `eslint-plugin-jsx-a11y` runs at `strict` (vs
   `recommended`) and whether axe runs in CI at all.

## ADOPT checklist (priority order)

1. **Audit accessible-name coverage on every interactive element** — buttons, icon-only controls, panel
   toggles across RAIL/LIST/CONTENT/CONTEXT + modals. This is what makes `getByRole(role,{name})` and agent
   AX queries work at all.
2. **Make navigation STATE legible in ARIA, not just `data-*`:** `aria-current="page"` on the active RAIL
   item; `aria-expanded` on collapsible panels; `aria-selected` on the active LIST item; `aria-pressed` on
   toggle buttons; `role="dialog"` + `aria-modal="true"` on open modals. Keep `data-*` as the machine-precise
   mirror for Playwright/`__orb`, but ensure ARIA agrees (MCP agents only see ARIA).
3. **Route-change announcement + focus move.** Add an `aria-live="polite"` status region that announces
   section/panel transitions, and move focus to the new section's heading on navigation (focus-loss is the
   other half of the SPA-routing a11y bug class).
4. **One stable landmark per region, each with a distinguishing accessible name** where roles repeat
   (LIST + CONTEXT are both `complementary`).
5. **Virtualized-list contract** — expose full-list metadata (`aria-rowcount` + `aria-setsize`/`aria-posinset`
   per visible row) so "row 40 of 500" is reasoned-about with 20 mounted; and/or a `window.__orb`
   scroll-to-item method for deterministic agent navigation.
6. **Portals: verify, don't assume.** `getByRole('dialog',{name})` finds portal-rendered modals regardless
   of DOM placement — add a golden that opens a modal-from-CONTEXT-panel and asserts it's reachable/nameable.
7. **Keep `window.__orb` documented as the sanctioned back-channel** (setup/wait), not a DOM-scrape workaround
   or an assertion surface.

## Enforcement (ranked by leverage)

1. **ARIA-snapshot golden tests on every region × panel-mode/modal-state** — broadest surface for least
   maintenance; extend existing goldens to assert `aria-current`/`expanded`/`selected` VALUES, not just structure.
2. **`eslint-plugin-jsx-a11y` at `strict` in CI (hard gate)** — static, pre-render, near-free; catches
   missing names/roles before the component renders.
3. **`@axe-core/playwright` run against each panel-mode/modal-open STATE in CI** — catches dynamic ARIA-state
   issues static analysis can't. A FLOOR not a ceiling (axe catches ~30-40% of real violations) — regression
   smoke, not compliance proof.
4. **A dedicated "no interactive element without an accessible name" assertion** run globally per state
   snapshot (query all role-bearing elements, assert `accessibleName !== ''`) — exercises the actual rendered,
   stateful, portal-inclusive tree.
5. **Typed test-id registry (have) + a lint rule forbidding raw `data-testid` literals** outside it.
6. **Landmark-uniqueness test** — assert ≤1 `main`, and all same-role landmarks have distinct names.
7. **CI gate on `data-app-ready` usage** — e2e specs must `waitFor` the ready signal, never sleep/race raw
   `querySelector`.

## 2026 tooling / patterns worth knowing

- **MCP browser tools consume the AX tree directly** (`browser_snapshot`, CDP `queryAXTree`) — our ARIA-snapshot
  investment IS the agent's view. No separate "agent mode" needed if the AX tree is correct.
- **Google's 2026 agent-friendly-site checklist** (web.dev): semantic elements over styled divs; `cursor:pointer`
  on actionables; ≥8px² targets; no ghost/transparent overlays; **layout stability across state transitions** so
  an agent's spatial memory isn't invalidated on every panel flip.
- **WebMCP** — emerging protocol deriving typed, invokable agent *actions* from existing HTML/ARIA metadata:
  "if we'd done a good job with accessibility, we get this for free." Not urgent; good ARIA now de-risks it.
- **Fuzzy/hierarchical AX-scoped selection** rewards apps with *few, well-named, uniquely-scoped* interactive
  elements per region — pairs with the virtualized-list `aria-posinset`/`setsize` fix.

## Sources

Playwright: [Locators](https://playwright.dev/docs/locators) · [Best Practices](https://playwright.dev/docs/best-practices) · [ARIA Snapshots](https://playwright.dev/docs/aria-snapshots) · [hydration flakiness #27759](https://github.com/microsoft/playwright/issues/27759).
Agents ⇄ a11y: [InfoWorld — Accessibility is the first-class interface for AI agents](https://www.infoworld.com/article/4193332/accessibility-is-the-first-class-interface-for-ai-agents.html) · [Webyes — Accessibility Tree & AI Agents](https://www.webyes.com/blogs/accessibility-tree-ai-agents/) · [ModelPiper — AX-tree native testing](https://modelpiper.com/blog/accessibility-native-testing-ax-selectors) · [Webfuse — MCP browser servers 2026](https://www.webfuse.com/blog/the-top-5-best-mcp-servers-for-ai-agent-browser-automation) · [web.dev — Build agent-friendly websites](https://web.dev/articles/ai-agent-site-ux).
ARIA/WCAG: [W3C APG — Accessible Names](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/) · [W3C ARIA11 — aria-current](https://w3c.github.io/wcag/techniques/aria/ARIA11) · [W3C — Landmark Regions](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/) · [UXPin — Accessible Modals](https://www.uxpin.com/studio/blog/how-to-build-accessible-modals-with-focus-traps/) · [Testparty — SPA Accessibility](https://testparty.ai/blog/spa-accessibility).
SPA/React specifics: [patterns.dev — Virtual Lists](https://www.patterns.dev/vanilla/virtual-lists/) · [AG Grid — React Grid Accessibility](https://www.ag-grid.com/react-data-grid/accessibility/) · [Autonoma — React Playwright](https://getautonoma.com/blog/react-playwright-testing-guide) · [Cypress — conditional testing / `window` back-channel](https://docs.cypress.io/app/guides/conditional-testing).
Enforcement: [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/README.md) · [David Mello — what axe/Lighthouse miss](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations) · [rishikc — a11y CI integration](https://rishikc.com/articles/accessibility-testing-ci-integration/) · [Test-ID best practices 2025](https://dev.to/rahucode/test-id-best-practices-guide-react-typescript-nextjs-pfm).
