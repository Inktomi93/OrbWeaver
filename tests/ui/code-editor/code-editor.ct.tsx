import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../support/ct/resolved-token-color.ts";
import { CompletionsEditor, ControlledEditor, DiagnosticsEditor, ReadOnlyEditor, TabbableEditor } from "./code-editor.fixtures.tsx";

const INITIAL_CSS = "body { color: red; }";

// Multi-line so the error and warning diagnostics land on DIFFERENT lines — the lint gutter
// groups markers per line (worst severity wins), so same-line diagnostics would collapse to one
// marker and hide the shape-difference assertions below.
const DIAGNOSTICS_CSS = "body {\n  color: red;\n}\n.a { color: blue; }\n";
const ERROR_DIAGNOSTIC: CodeEditorDiagnostic = {
  severity: "error",
  from: DIAGNOSTICS_CSS.indexOf("red"),
  to: DIAGNOSTICS_CSS.indexOf("red") + "red".length,
  message: "Unknown color keyword",
};
const WARNING_DIAGNOSTIC: CodeEditorDiagnostic = {
  severity: "warning",
  from: DIAGNOSTICS_CSS.indexOf("blue"),
  to: DIAGNOSTICS_CSS.indexOf("blue") + "blue".length,
  message: "Prefer a hex value over a named color",
};

test("mounts with the controlled value", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  await expect(component.locator(".cm-content")).toContainText("color: red");
});

test("typing flows out through onChange", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("abc");
  await expect(component.getByRole("status")).toContainText("abc");
  // The controlled round-trip (onChange → value prop → no-op dispatch) must not clobber the doc.
  await expect(content).toContainText("color: red");
});

test("readOnly blocks edits", async ({ mount }) => {
  const component = await mount(<ReadOnlyEditor value="locked" />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("x");
  await expect(content).toHaveText("locked");
});

// Both directions of the read-only contract (ui-primitive-contract §13 R2): `EditorView.editable`
// only toggles `contenteditable` (blocks native DOM TYPING, the test above); a REAL OS-clipboard
// paste (Ctrl/Cmd+V, granted permissions + a seeded clipboard — not a synthetic dispatched event,
// which Chromium doesn't route through the same paste pipeline) bypasses that entirely — CM6's
// own paste handler checks `state.readOnly`, a SEPARATE facet. If only `editable` were set (the
// pre-fix shape), this paste would still land a change.
test("readOnly ALSO blocks a real clipboard paste (EditorState.readOnly, not just the editable facet)", async ({ mount, page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("INJECTED"));
  const component = await mount(<ReadOnlyEditor value="locked" />);
  const content = component.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(content).toHaveText("locked");
});

// The positive counterpart — proves the paste mechanism itself actually reaches CM6's change
// pipeline, so the blocked-paste assertion above is a real gate and not a dead paste path.
test("a non-readOnly editor accepts the same real clipboard paste", async ({ mount, page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("PASTED"));
  const component = await mount(<ControlledEditor initialValue="" />);
  const content = component.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(content).toContainText("PASTED");
});

test("the token theme is applied (background resolves the design token)", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  await expect(component.locator(".cm-editor")).toHaveCSS("background-color", TOKENS["color.background"].value);
});

test("no `diagnostics` prop means no lint gutter at all", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  await expect(component.locator(".cm-gutter-lint")).toHaveCount(0);
});

test("diagnostics render as an inline mark under the span AND a gutter marker per line", async ({ mount }) => {
  const component = await mount(
    <DiagnosticsEditor
      initialValue={DIAGNOSTICS_CSS}
      initialDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
      nextDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
    />,
  );
  await expect(component.locator(".cm-lintRange-error")).toHaveText("red");
  await expect(component.locator(".cm-lintRange-warning")).toHaveText("blue");
  // One gutter marker per flagged LINE (the error and warning diagnostics sit on different lines).
  await expect(component.locator(".cm-lint-marker")).toHaveCount(2);
  await expect(component.locator(".cm-lint-marker-error")).toHaveCount(1);
  await expect(component.locator(".cm-lint-marker-warning")).toHaveCount(1);
});

test("diagnostics re-render on prop change without remounting or losing the cursor", async ({ mount }) => {
  const component = await mount(
    <DiagnosticsEditor initialValue={DIAGNOSTICS_CSS} initialDiagnostics={[ERROR_DIAGNOSTIC]} nextDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]} />,
  );
  const content = component.locator(".cm-content");
  await expect(component.locator(".cm-lint-marker")).toHaveCount(1);

  // Move to a known, deterministic caret position (document end) and type — a remount would
  // reset the fresh view's cursor to position 0, so the NEXT keystroke would land at the start
  // instead of continuing the doc, which the final `output` text below would catch.
  await content.click();
  await content.press("ControlOrMeta+End");
  await content.pressSequentially("A");

  // A freshly-derived array (not the same reference) — the real "parent re-renders with a
  // filtered/mapped array" consumer shape.
  await component.getByRole("button", { name: "Update diagnostics" }).click();
  await expect(component.locator(".cm-lint-marker")).toHaveCount(2);

  await content.pressSequentially("B");
  await expect(component.getByRole("status")).toHaveText(`${DIAGNOSTICS_CSS}AB`);
});

test("diagnostics are exposed via aria-describedby + an aria-live region, not just visually", async ({ mount }) => {
  const component = await mount(
    <DiagnosticsEditor
      initialValue={DIAGNOSTICS_CSS}
      initialDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
      nextDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
    />,
  );
  const content = component.locator(".cm-content");
  const describedBy = await content.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  const liveRegion = component.locator(`#${describedBy}`);
  await expect(liveRegion).toHaveAttribute("aria-live", "polite");
  await expect(liveRegion).toContainText("Error: Unknown color keyword");
  await expect(liveRegion).toContainText("Warning: Prefer a hex value over a named color");
});

test("severity is signaled beyond color — underline style + gutter marker shape differ", async ({ mount }) => {
  const component = await mount(
    <DiagnosticsEditor
      initialValue={DIAGNOSTICS_CSS}
      initialDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
      nextDiagnostics={[ERROR_DIAGNOSTIC, WARNING_DIAGNOSTIC]}
    />,
  );
  const errorMark = component.locator(".cm-lintRange-error");
  const warningMark = component.locator(".cm-lintRange-warning");
  // Non-color signal #1: the underline STYLE differs (wavy vs dotted), not just its color.
  await expect(errorMark).toHaveCSS("text-decoration-style", "wavy");
  await expect(warningMark).toHaveCSS("text-decoration-style", "dotted");
  await expect(errorMark).toHaveCSS("text-decoration-color", resolvedTokenColor("color.destructive"));
  await expect(warningMark).toHaveCSS("text-decoration-color", resolvedTokenColor("color.warning"));

  const errorMarker = component.locator(".cm-lint-marker-error");
  const warningMarker = component.locator(".cm-lint-marker-warning");
  // Non-color signal #2: the gutter marker SHAPE differs (circle vs triangle), not just its color.
  await expect(errorMarker).toHaveCSS("border-radius", "9999px");
  await expect(warningMarker).toHaveCSS("border-radius", "0px");
  await expect(errorMarker).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
  await expect(warningMarker).toHaveCSS("background-color", resolvedTokenColor("color.warning"));
});

// WS3 — the `completions` prop (real inline autocomplete via @codemirror/autocomplete, replacing the
// theme editor's old static reference-list-only UX).
const THEME_VAR_COMPLETIONS = ["--color-primary", "--color-accent", "--radius-card"];

test("no `completions` prop means no autocomplete tooltip on typing", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue="" />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("--color-p");
  await expect(component.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
});

test("typing a matching prefix opens the autocomplete tooltip listing the completions vocabulary", async ({ mount }) => {
  const component = await mount(<CompletionsEditor initialValue="" completions={THEME_VAR_COMPLETIONS} />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("--color-p");
  const tooltip = component.locator(".cm-tooltip-autocomplete");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("--color-primary");
  // Non-matching vocabulary entries (a different prefix) are filtered out, not just present-somewhere.
  await expect(tooltip).not.toContainText("--radius-card");
});

// CM6's `acceptCompletion` refuses while the dialog is younger than `interactionDelay` — it compares
// the wall clock against `open.timestamp`
// (@codemirror/autocomplete 6.20.3 `dist/index.js:1096-1102`; the facet default is 75ms, ibid. :393).
// It is a real-user guard — it stops a fast typist committing a suggestion they never saw — not a
// bug, and NOT something the component may lower just to make a test convenient.
const CM6_INTERACTION_DELAY_MS = 75;

/*
 * THE FLAKE THIS TEST WAS (audit UI-RENDERING-01, traced 2026-08-14) — read before "simplifying" the
 * barrier below.
 *
 * SIGNATURE: `Expected "--color-primary" / Received "--color-p"`, after a 15s poll. 4/20 at
 * `--repeat-each=20`.
 *
 * MECHANISM (measured, not inferred — instrumented copy of this test, 30 repeats):
 *   1. `pressSequentially` finishes; @codemirror/autocomplete debounces the query by
 *      `activateOnTypingDelay` (100ms, `dist/index.js:379`), so the dialog opens — and stamps its
 *      `timestamp` — at roughly lastKeystroke+105ms.
 *   2. Playwright's `expect(...).toBeVisible()` polls on a ~100ms grid, so it resolves in one of two
 *      cohorts: ~105ms after the last keystroke (it caught the dialog on the first tick it existed)
 *      or ~190ms (it missed that tick). Measured split: every observation in the 103-133ms cohort
 *      pressed Enter 119-202ms after the last keystroke — i.e. INSIDE the dialog's 75ms window — and
 *      failed; every 187-220ms observation passed. That grid quantization IS the coin flip.
 *   3. A refused `acceptCompletion` returns false, so Enter falls through the keymap to
 *      `insertNewlineAndIndent`. The doc becomes `--color-p\n`, which closes the dialog, and
 *      `completeFromList` never reopens it (no word before the cursor on the fresh empty line).
 *   4. The old fix re-pressed Enter until the doc contained the full name. That retry is DESTRUCTIVE
 *      and unrecoverable: each re-press adds another newline, and `.cm-content` renders lines as
 *      sibling divs so `textContent` reports a bare `--color-p` no matter how many landed. The retry
 *      could only ever burn the 15s budget. Its comment blamed a re-arming readiness window; the
 *      timestamp is in fact CARRIED FORWARD across dialog rebuilds (`dist/index.js:872`), so there
 *      was never anything to starve on — the first Enter decided the run.
 *
 * THE BARRIER: hold until the tooltip has been OBSERVED for longer than `interactionDelay`, then
 * press Enter exactly ONCE. Sound by construction rather than by luck: the tooltip's DOM cannot
 * predate the dialog that built it, so "≥N ms since WE saw it" implies "≥N ms since `timestamp`".
 * With the precondition satisfied a fall-through is a real regression and must RED, not be retried
 * away.
 *
 * A SLEEP-FREE BARRIER WAS TRIED AND IT DOES NOT WORK — do not re-attempt it. Staging the prefix
 * (`--color-`, await the list, then `p`, await the narrowed list) looks like it should age the dialog
 * on rendered state alone, because `timestamp` really is carried forward across rebuilds
 * (`dist/index.js:872`). It fails 2/30: `completeFromList` sets `validFor`, so narrowing an existing
 * result REFILTERS SYNCHRONOUSLY on the keystroke (`:904` — the change touches the result range, so
 * the dialog is rebuilt immediately with no second debounce). The narrowed list therefore renders
 * within a few ms of the original open, and the same 100ms poll grid puts Enter back inside the
 * window. There is no DOM event at `timestamp + 75ms`: the precondition is purely wall-clock, which
 * is exactly the case the lint rule below does not cover.
 */
test("accepting a completion inserts the FULL themeable var name into the document", async ({ mount, page }) => {
  const component = await mount(<CompletionsEditor initialValue="" completions={THEME_VAR_COMPLETIONS} />);
  const content = component.locator(".cm-content");
  const tooltip = component.locator(".cm-tooltip-autocomplete");
  await content.click();
  await content.pressSequentially("--color-p");
  await expect(tooltip).toBeVisible();
  // Waiting the full delay from HERE (rather than netting off however long the assertion above took)
  // keeps the arithmetic clock-free — `test-determinism` bans an ambient wall-clock read in a test,
  // and overshooting by a few ms costs nothing: the dialog does not close on its own.
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: inverted premise — this wait is what REMOVES the flake (4/20 red without it, 0/40 with it), and CM6 exposes no state to wait FOR at `timestamp + interactionDelay`; see the block comment above.
  await page.waitForTimeout(2 * CM6_INTERACTION_DELAY_MS);
  await content.press("Enter");

  await expect(content).toHaveText("--color-primary");
  // The fall-through inserts a NEWLINE, and `textContent` cannot see it (CM6 renders each line as its
  // own div, so `--color-p\n` reads as `--color-p`). Assert on the line count so the next regression
  // names itself instead of arriving as a cryptic truncated string.
  await expect(content.locator(".cm-line")).toHaveCount(1);
});

// THE KEYBOARD USER MUST SEE THEY ARRIVED (side-eye X-4, WCAG 2.4.7). CodeMirror's editable surface is a
// real tab stop and does match `:focus-visible`, but the token theme sets `&.cm-focused { outline: none }`
// and nothing painted the house ring in its place: measured under a real Tab, every ancestor up to the
// framed wrapper computed `outline-style: none` + `box-shadow: none`, on the ONE field in the regex editor
// that swallows most keys. Driven with a REAL `press("Tab")` — a scripted `.focus()` never promotes to
// `:focus-visible`, so it cannot prove this either way.
test("Tabbing into the editor paints the house focus ring on its frame", async ({ mount, page }) => {
  const component = await mount(<TabbableEditor initialValue="body { color: red; }" />);
  // The FRAME is by construction the parent of `.cm-editor` (the host div CM6 mounts into) — located
  // structurally rather than by class, so this reds on a missing ring and never on a missing selector.
  const editor = component.locator(".cm-editor");
  await expect(editor).toBeVisible();
  const frameShadow = (): Promise<string> => editor.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).boxShadow);

  expect(await frameShadow()).toBe("none");

  await component.getByRole("button", { name: "before" }).focus();
  await page.keyboard.press("Tab");

  // The editable surface really is the stop that took focus, and really is KEYBOARD-focused — the state
  // the ring keys on, and the reason this cannot be driven with `.focus()`.
  await expect.poll(() => component.locator(".cm-content:focus-visible").count(), { intervals: [50, 100, 250] }).toBe(1);

  const focused = await frameShadow();
  expect(focused).not.toBe("none");
  // The RING token, not some incidental shadow — reds if anyone re-hues `--color-ring` to "fix" this.
  expect(focused).toContain(resolvedTokenColor("color.ring"));
});
