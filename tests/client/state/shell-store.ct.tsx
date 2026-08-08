// shell-store CT — drives the hook-backed shell layout store through its module actions and asserts the
// read hooks reflect each transition: section switch, the PER-SECTION panel override memory (§4.2 rule 2
// — switching away and back restores the section's own override, and a sibling section is unaffected),
// `useListDocked` (the narrow #state projection chats-section.tsx reads instead of `useShellLayout`), the
// settings deep-link (`openSettingsTo`), the CONTEXT tab request (`setContextTab`), and the dual-write
// `revealContextPanel` (writes contextTab + openOverlayPanel + the CONTEXT panel dock together). The resolve
// (override ?? the section registry's panelDefaults) + toggle/focus derivations live in the app-shell
// feature hook and are covered by app-shell.ct.tsx — here the store's raw overrides read `none` until
// explicitly set.

import { expect, test } from "@playwright/experimental-ct-react";
import { ShellStoreProbe } from "./_ct-stories.tsx";

// The BORN default is `home` (owner decision H1 = D-1) — a fresh install lands on the section that HAS a
// launcher, not on "nothing selected".
const DEFAULT_STATE =
  "section=home list=none context=none modal=none docked=true settingsTarget=none contextTab=none openOverlayPanel=none narrowViewport=false focus=false";

test("panel overrides are PER-SECTION: set on one section, remembered, not leaked to another", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Fresh page → default (home active, no overrides set).
  await expect(state).toHaveText(DEFAULT_STATE);

  // Land on chats first — home is the born default now, and this test is about PER-SECTION memory.
  await probe.getByRole("button", { name: "go chats" }).click();
  // Set the chats list override.
  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("section=chats list=collapsed");

  // Switch to corpus — its own (unset) override reads `none`, NOT chats' collapsed (no leak).
  await probe.getByRole("button", { name: "go corpus" }).click();
  await expect(state).toHaveText(
    "section=corpus list=none context=none modal=none docked=true settingsTarget=none contextTab=none openOverlayPanel=none narrowViewport=false focus=false",
  );

  // Switch back to chats — the override is REMEMBERED (§4.2 rule 2).
  await probe.getByRole("button", { name: "go chats" }).click();
  await expect(state).toContainText("section=chats list=collapsed");

  // The other panel is independent — docking context leaves list untouched.
  await probe.getByRole("button", { name: "dock context" }).click();
  await expect(state).toContainText("list=collapsed context=docked");
});

test("openModal / closeModal drive the open-modal read", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("modal=none");

  await probe.getByRole("button", { name: "open settings", exact: true }).click();
  await expect(state).toContainText("modal=settings");

  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
});

test("openSettingsTo opens the settings modal AND targets the deep-link category", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("modal=none");
  await expect(state).toContainText("settingsTarget=none");

  await probe.getByRole("button", { name: "open settings to personas" }).click();
  await expect(state).toContainText("modal=settings");
  await expect(state).toContainText("settingsTarget=personas");

  // closeModal clears BOTH the modal and the deep-link target (no stale category on reopen).
  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
  await expect(state).toContainText("settingsTarget=none");
});

test("setContextTab sets the opaque CONTEXT tab request", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("contextTab=none");

  await probe.getByRole("button", { name: "set context tab" }).click();
  await expect(state).toContainText("contextTab=members");
});

test("revealContextPanel dual-writes: contextTab + openOverlayPanel + the CONTEXT panel dock", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("context=none");
  await expect(state).toContainText("contextTab=none openOverlayPanel=none");

  await probe.getByRole("button", { name: "reveal context panel" }).click();
  await expect(state).toContainText("context=docked");
  await expect(state).toContainText("contextTab=field openOverlayPanel=context");
});

// THE MOBILE FOLD (side-eye 2026-08-06 P1). `revealContextPanelBesideContent` is the same intent for a
// drill whose BODY is already in CONTENT — a character-card facet, where the tap that opens the field also
// swaps CONTENT to that field's editor. On a phone the overlay request above would land a 100dvw sheet OVER
// that editor with the content column inert; the mock rules "the CONTEXT arm folds into CONTENT on mobile —
// no third pane on a phone". The TAB and the wide dock are still written, so nothing about the desktop
// behaviour or the phone's own detail-panel toggle changes.
test("revealContextPanelBesideContent writes the tab + the dock, and the overlay request ONLY off mobile", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "enter mobile viewport" }).click();
  await probe.getByRole("button", { name: "reveal context beside content" }).click();
  // The tab is requested and the WIDE dock is recorded…
  await expect(state).toContainText("context=docked");
  // …but nothing floats over the editor the tap just opened.
  await expect(state).toContainText("contextTab=field openOverlayPanel=none");

  // Off a phone the pane is a track beside CONTENT, not over it — so the reveal opens it, as before.
  await probe.getByRole("button", { name: "enter desktop viewport" }).click();
  await probe.getByRole("button", { name: "reveal context beside content" }).click();
  await expect(state).toContainText("contextTab=field openOverlayPanel=context");
});

test("useListDocked resolves override-over-default, per section, live", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // No override yet → the probe's literal "docked" default wins.
  await expect(state).toContainText("docked=true");

  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("docked=false");

  await probe.getByRole("button", { name: "dock list" }).click();
  await expect(state).toContainText("docked=true");
});

test("useListDocked forces `false` on mobile viewport regardless of override/default", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Desktop + docked default → docked=true (the pre-existing algebra, unaffected).
  await expect(state).toContainText("docked=true");

  // Mobile: the real panel is never "docked" (a transient sheet) — docked reads false even though the
  // section's own default is "docked" and no override is set (the regression: mobile ChatContent's
  // `showRecents={!listDocked}` must stay true so "Recent chats" renders).
  await probe.getByRole("button", { name: "enter mobile viewport" }).click();
  await expect(state).toContainText("docked=false");

  // Back to desktop — the desktop algebra resumes unchanged.
  await probe.getByRole("button", { name: "enter desktop viewport" }).click();
  await expect(state).toContainText("docked=true");
});

test("setNarrowViewport publishes the shell-narrow regime read", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("narrowViewport=false");

  await probe.getByRole("button", { name: "enter narrow viewport" }).click();
  await expect(state).toContainText("narrowViewport=true");

  await probe.getByRole("button", { name: "enter wide viewport" }).click();
  await expect(state).toContainText("narrowViewport=false");
});

test("useListDocked resolves `false` in the narrow-desktop regime too (the M10 correction bug — a hand-copied mirror read only mobileViewport and disagreed with resolvePanel in 48-64rem)", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("docked=true");

  // Narrow-desktop: a docked DEFAULT auto-downgrades to a CLOSED slide-over — never "docked" — exactly
  // like mobile, so `useListDocked` must read false here too (chats-landing's `showRecents`).
  await probe.getByRole("button", { name: "enter narrow viewport" }).click();
  await expect(state).toContainText("docked=false");

  await probe.getByRole("button", { name: "enter wide viewport" }).click();
  await expect(state).toContainText("docked=true");
});

// ── Focus mode is ONE flag that never writes panel state (item 20) ──────────────────────────────────
// The measured live desync: the narrow-viewport auto-collapse wrote/read the same "both collapsed"
// signal focus mode used as its truth, so the flag, the button label and the stored panel modes could
// disagree. The store-tier guarantee under test: entering focus leaves `panelOverrides` BYTE-IDENTICAL —
// there is no separate saved snapshot to corrupt, and a narrow round-trip while focused cannot touch it.

test("entering focus writes NO panel override, and exiting restores the section's own saved modes", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "go chats" }).click();

  // A deliberate pre-focus layout: list collapsed by hand, context docked.
  await probe.getByRole("button", { name: "collapse list" }).click();
  await probe.getByRole("button", { name: "dock context" }).click();
  await expect(state).toContainText("list=collapsed context=docked");
  await expect(state).toContainText("focus=false");

  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  // The flag flips; the overrides are untouched (the OLD implementation overwrote BOTH with "collapsed",
  // which is how exiting focus later re-docked a pane the user had collapsed on purpose).
  await expect(state).toContainText("list=collapsed context=docked");
  await expect(state).toContainText("focus=true");

  await probe.getByRole("button", { name: "exit focus", exact: true }).click();
  await expect(state).toContainText("list=collapsed context=docked");
  await expect(state).toContainText("focus=false");
});

test("the narrow-viewport auto-collapse during focus cannot corrupt the saved pre-focus modes", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "go chats" }).click();
  await probe.getByRole("button", { name: "dock list" }).click();
  await probe.getByRole("button", { name: "dock context" }).click();

  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  // Cross into the narrow regime and back WHILE focused — the auto-overlay derivation runs over both
  // panels in both directions. It is a derivation, so nothing may be written.
  await probe.getByRole("button", { name: "enter narrow viewport" }).click();
  await expect(state).toContainText("list=docked context=docked");
  await expect(state).toContainText("narrowViewport=true focus=true");
  await probe.getByRole("button", { name: "enter wide viewport" }).click();

  await probe.getByRole("button", { name: "exit focus", exact: true }).click();
  await expect(state).toContainText("list=docked context=docked");
  await expect(state).toContainText("narrowViewport=false focus=false");
  // …and the live projection agrees: the list is docked again, exactly as before focus.
  await expect(state).toContainText("docked=true");
});

test("useListDocked reads FALSE while focused (focus outranks the section's own docked preference), and true again on exit", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("docked=true");

  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  await expect(state).toContainText("docked=false");

  await probe.getByRole("button", { name: "exit focus", exact: true }).click();
  await expect(state).toContainText("docked=true");
});

test("a REVEALING write leaves focus; a HIDING write does not (the manual-toggle-while-focused ruling)", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "go chats" }).click();

  // Docking a panel by hand is a reveal: focus must end, or the panel would show while the button still
  // read "Exit focus mode" — the multi-truth this rework deletes.
  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  await probe.getByRole("button", { name: "dock context" }).click();
  await expect(state).toContainText("context=docked");
  await expect(state).toContainText("focus=false");

  // Collapsing one agrees with what focus is already showing — the flag stands.
  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("list=collapsed");
  await expect(state).toContainText("focus=true");

  // Same split on the ephemeral channel: OPENING a slide-over leaves focus…
  await probe.getByRole("button", { name: "open context overlay" }).click();
  await expect(state).toContainText("openOverlayPanel=context");
  await expect(state).toContainText("focus=false");
  // …and entering focus closes whatever slide-over was open (one truth: nothing is showing).
  await probe.getByRole("button", { name: "open context overlay" }).click();
  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  await expect(state).toContainText("openOverlayPanel=none");
  await expect(state).toContainText("focus=true");
});

test("a rail-section switch leaves focus mode — a tap lands on the new section's own layout", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "go chats" }).click();
  await probe.getByRole("button", { name: "enter focus", exact: true }).click();
  await expect(state).toContainText("focus=true");

  await probe.getByRole("button", { name: "go corpus" }).click();
  await expect(state).toContainText("section=corpus");
  await expect(state).toContainText("focus=false");
});

// The RETIRED-SECTION HEAL (R2, the §6a step-2 sanitizer): a user whose device still remembers
// `activeSection:"worldInfo"` — the id the World Info rail section carried until its library became a
// Configuration collection — must land on `config`, the same shelf under a new roof, not silently teleport
// to the born default. The persisted blob is seeded BEFORE the page's JS runs (`addInitScript`), because the
// store rehydrates at module init: writing localStorage after mount would prove nothing.
test("a persisted activeSection naming a RETIRED section heals to its successor, not to the born default", async ({ mount, page }) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      "orb:shell",
      JSON.stringify({ state: { activeSection: "worldInfo", panelOverrides: { worldInfo: { list: "collapsed" } } }, version: 2 }),
    );
  });
  // CT's page is ALREADY loaded when the test body runs, so the init script only takes effect on the next
  // navigation — without this reload the store rehydrates from an empty localStorage and the test proves
  // nothing (it passes on the born default, which is the wrong answer).
  await page.reload();

  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("section=config");
  // The retired section's panel overrides do NOT ride along — `config` keeps its own declared defaults.
  await expect(state).toContainText("list=none");
});
