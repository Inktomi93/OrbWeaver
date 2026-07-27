import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../support/ct/resolved-token-color";
import { CompletionsEditor, ControlledEditor, DiagnosticsEditor, ReadOnlyEditor } from "./code-editor.fixtures";

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

test("accepting a completion inserts the FULL themeable var name into the document", async ({ mount }) => {
  const component = await mount(<CompletionsEditor initialValue="" completions={THEME_VAR_COMPLETIONS} />);
  const content = component.locator(".cm-content");
  const tooltip = component.locator(".cm-tooltip-autocomplete");
  await content.click();
  await content.pressSequentially("--color-p");
  await expect(tooltip).toBeVisible();
  // CM6's acceptCompletion no-ops if Enter lands within ~75ms of the tooltip opening (CM6
  // internal readiness, not our code) — re-press while the tooltip is still open until the
  // completion actually lands. Re-pressing after acceptance is a no-op guard: it only re-fires
  // while the doc doesn't yet contain the full var name, so an already-accepted completion never
  // gets a stray newline. Intervals stay >=100ms so each re-press clears the 75ms readiness
  // window even under heavy parallel-worker CPU contention (a tighter poll can keep landing
  // inside a freshly-reset window and starve).
  await expect
    .poll(
      async () => {
        if (!(await content.textContent())?.includes("--color-primary")) {
          await content.press("Enter");
        }
        return content.textContent();
      },
      { intervals: [100, 150, 250], timeout: 15_000 },
    )
    .toBe("--color-primary");
});
