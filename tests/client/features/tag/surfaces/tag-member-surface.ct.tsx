// CT: the tag MEMBER EDITOR — the CONTENT half of the F-11 split. It drives the same production tag-domain
// flow the retired settings row did (rename → updateTag name patch, colour → updateTag tri-state null,
// folder → updateTag folderType, hide → updateTag isHiddenOnCard, merge → mergeTags), so the migration is
// provably behaviour-preserving: every EDITING control that left the row is asserted here, against the same
// WIRE inputs, by the same accessible names.
//
// DELETE IS NO LONGER HERE — it converged onto the ROW's kebab (config-delete #271); its wire proof lives in
// `tag-collection-rows.ct.tsx`. Merge is the editor's one destructive verb now.
//
// The mutations are busDriven — the stubbed responses don't refetch — so the check is the CALL, exactly as
// the pane-era CT did it.
//
// It also carries the TAP-TARGET geometry guard the retired `tag-row-tap-targets.suite.ct.tsx` owned: every
// interactive control must clear the 32px hard floor at the default fine pointer (two side-eye passes once
// caught these at 28px). Measuring the REAL boundingBox is what makes a token regression fail.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { measureContentColumn } from "../../../../support/browser/measure-content-column.ts";
import { proseRow, readProseMeasure } from "../../../../support/browser/prose-measure.ts";
import { readSwitchRowOrientation } from "../../../../support/browser/settings-geometry.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { TagMemberContentColumnStory, TagMemberStory } from "../_ct-stories.tsx";

const TAP_FAIL_PX = 32;

const TAGS = [
  {
    id: "tag_adventure",
    name: "adventure",
    color: "#3355ff",
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 5, chats: 1, worldBooks: 1, personas: 0, presets: 0, total: 7 },
  },
  {
    id: "tag_orphan",
    name: "orphan",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: true,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => TAGS,
    "tag.updateTag": () => TAGS[0],
    "tag.mergeTags": () => undefined,
  });
}

test("the editor names the tag and shows its usage census", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  await expect(editor.getByRole("heading", { name: "adventure" })).toBeVisible();
  await expect(editor.getByText("7 uses")).toBeVisible();
});

test("renaming commits an updateTag name patch on blur", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<TagMemberStory />);
  const nameField = editor.getByRole("textbox", { name: "Name" });
  await nameField.fill("quest");
  await nameField.blur();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { name: "quest" } });
});

test("clearing a colour sends the updateTag tri-state null (clear to theme default)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagMemberStory />);
  // "adventure" has a set background (#3355ff): open its ColorField and Reset to default. The `""`
  // clear maps to `color: null` — the updateTag tri-state that clears the column, never an empty string.
  await page.getByRole("button", { name: "Background" }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { color: null } });
});

// THE READOUT MUST BE ON THE CONTROL, not merely near it (side-eye 2026-08-08 P2). A 32×32 swatch button
// has no text of its own, so "what colour is this?" is answerable only through its accessible DESCRIPTION —
// and a loose `<Text>` sibling inside the Field is not one. Asserted through the a11y tree (the affordance a
// screen-reader user actually gets), and driven across BOTH arms of the tri-state in one mount: "adventure"
// carries a set background and an unset text colour.
test("each colour picker ANNOUNCES the value it holds, and both arms of the tri-state say their own word", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  await expect(editor.getByRole("button", { name: "Background" })).toHaveAccessibleDescription("#3355ff");
  await expect(editor.getByRole("button", { name: "Text" })).toHaveAccessibleDescription("Not set — uses the theme default");
});

// …AND EACH ARM SPEAKS IN ITS OWN VOICE (side-eye 2026-08-08 P3). Both arms rode `voice="datum"` — the MONO
// tabular VALUE voice — which is right for `#3355ff` and wrong for "Not set — uses the theme default": prose
// set in tabular mono reads as machine output, i.e. the one voice that says "this string is data" applied to
// the one string that is explanation. Pinned on the resolved FONT FAMILY, the rendered fact, against the two
// house tokens rather than a hard-coded family name — and both arms are present in this one mount, so the
// assertion is a CONTRAST and cannot pass by having flattened both to the same voice.
test("the colour readout's voice follows what it says — mono for the hex, sans for the unset sentence", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);

  const hex = editor.getByText("#3355ff", { exact: true });
  const sentence = editor.getByText("Not set — uses the theme default");
  await expect(hex).toBeVisible();
  await expect(sentence).toBeVisible();

  const families = await hex.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (token: string): string => {
      probe.style.fontFamily = `var(${token})`;
      return getComputedStyle(probe).fontFamily;
    };
    const tokens = { mono: resolve("--font-mono"), sans: resolve("--font-sans") };
    probe.remove();
    return tokens;
  });
  // Guard the vacuous case where a theme happens to point both families at one stack.
  await expect
    .poll(
      async () =>
        (
          await hex.evaluate(() => {
            const probe = document.createElement("div");
            document.body.append(probe);
            const resolve = (token: string): string => {
              probe.style.fontFamily = `var(${token})`;
              return getComputedStyle(probe).fontFamily;
            };
            const tokens = { mono: resolve("--font-mono"), sans: resolve("--font-sans") };
            probe.remove();
            return tokens;
          })
        ).mono,
    )
    .not.toBe(families.sans);
  expect(await hex.evaluate((el) => getComputedStyle(el).fontFamily), "a hex IS a value — mono").toBe(families.mono);
  expect(await sentence.evaluate((el) => getComputedStyle(el).fontFamily), "an explanation is prose — sans").toBe(families.sans);
});

// …AND IT COSTS ONE LINE AT THE PANE'S REAL WIDTH (the same finding's P3). The readout used to lead with the
// slot's own key — "Background: not set — uses the theme default" — which is the Field label repeated 20px
// lower, and it is exactly what tipped the sentence onto a second line in a 430px editor pane. Measured as
// the description BOX against its own resolved line-height, not as a character count.
const NARROW_EDITOR_PX = 430;
/** One wrapped line of slack — a box taller than 1.5 line-heights is a SECOND line, which is the defect. */
const ONE_LINE_TOLERANCE = 1.5;

test("the readout spends ONE line at the editor pane's real width, and the pair stays a pair", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory width={NARROW_EDITOR_PX} />);

  const readout = editor.getByText("Not set — uses the theme default");
  const [box, lineHeight] = await Promise.all([readout.boundingBox(), readout.evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight))]);
  expect(box?.height ?? 0, "the readout is one line, not two").toBeLessThanOrEqual(lineHeight * ONE_LINE_TOLERANCE);

  // …and the two swatches still share a line: the descriptions must not have widened the intrinsic Fields
  // into a wrap (`*:w-auto` is what keeps the pair a pair).
  const [background, text] = await Promise.all([
    editor.getByRole("button", { name: "Background" }).boundingBox(),
    editor.getByRole("button", { name: "Text" }).boundingBox(),
  ]);
  expect(background?.y).toBe(text?.y);
});

test("the hide-on-card switch patches isHiddenOnCard", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<TagMemberStory />);
  await editor.getByRole("switch", { name: "Hide chip on cards" }).click();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { isHiddenOnCard: true } });
});

// ── #980 F22 · THE ONE INVERTED ROW ON THE SURFACE, TURNED ROUND ─────────────────────────────────────
// RED-FIRST against the unmodified editor, which drew `<Row><Switch/><Text voice="gloss"/></Row>`:
// measured 2026-09-06 at switch x=561 / label x=615 — the CONTROL left and the sentence right, 40px under
// a `Field` whose label sits ABOVE its control, i.e. three control orientations in one 720px form. The
// gloss was also a `<Text>`, not a `<label>`, so clicking the sentence did nothing.
// The expectations are the SHARED helper's, asserted identically in `tests/client/components/
// setting-switch-row.ct.tsx` (the reference row) and in `regex-context-body.ct.tsx` — one definition of
// "the same orientation as an Appearance settings row", so the three surfaces cannot drift apart again.
test("#980 F22: the hide-on-card row faces the house direction", async ({ mount, page }) => {
  await stub(page);
  await mount(<TagMemberStory />);
  // Barrier on the SETTLED editor: it hangs off a suspense read, so a geometry read taken at mount
  // measures a pane that is not there yet.
  await expect(page.getByRole("switch", { name: "Hide chip on cards" })).toBeVisible();

  expect(await readSwitchRowOrientation(page, "Hide chip on cards")).toEqual({
    label: "Hide chip on cards",
    labelLeadsControl: true,
    onOneLine: true,
    labelIsLabel: true,
  });
});

test("a deleted member says so instead of rendering a dead form", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory memberId="tag_gone" />);
  await expect(editor.getByText("Tag not found")).toBeVisible();
});

test("every control clears the 32px tap-target floor", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  const controls = [
    editor.getByRole("textbox", { name: "Name" }),
    editor.getByRole("button", { name: "Background" }),
    editor.getByRole("switch", { name: "Hide chip on cards" }),
    editor.getByRole("button", { name: "Merge into…" }),
  ];
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (const box of boxes) {
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TAP_FAIL_PX);
  }
});

// ── #1664 — THE CONTENT COLUMN TAKES ITS TOKEN'S WHOLE STATED CONSUMPTION ────────────────────────────
// `--width-content-col`'s `$description` says the column is CENTERED and BREATHES to
// `--width-content-col-wide` once its container clears `@5xl`; this editor spelled the bare cap, so it
// hard-clamped at 720px, left-pinned, inside panes measured live on the shell at 869px (list-only),
// 1176px (focus @1280) and 1816px (focus @1920) — the 1096px-of-dead-void defect the breathe step was
// minted for. Asserted through the TOKENS, resolved by a probe inside the query container, so a token
// move carries the expectation with it and no px literal is written down. ONE mount, BOTH ends of the
// range plus the crossover: a point measurement cannot prove a range property.

test("the editor column is CENTERED, capped, and BREATHES past @5xl (#1664)", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberContentColumnStory />);
  await expect(editor.getByRole("heading", { name: "adventure" })).toBeVisible();

  const column = page.locator('[data-slot="tag-member-editor"]');
  const narrow = await measureContentColumn(column);
  // BELOW `@5xl`: the cap binds, and the leftover is split evenly instead of all landing on the right.
  expect(narrow.containerWidth).toBeGreaterThan(narrow.capPx);
  expect(narrow.maxWidthPx).toBeCloseTo(narrow.capPx, 0);
  expect(narrow.columnWidth).toBeCloseTo(narrow.capPx, 0);
  expect(Math.abs(narrow.leftGutter - narrow.rightGutter)).toBeLessThanOrEqual(1);
  expect(narrow.leftGutter).toBeGreaterThan(1);

  await page.getByRole("button", { name: "widen the pane" }).click();
  // SETTLED, never same-tick: the widen is a React commit and the layout it causes is the thing measured.
  await expect.poll(async () => (await measureContentColumn(column)).containerWidth, { intervals: [20, 50, 100] }).toBeGreaterThan(narrow.containerWidth);

  const wide = await measureContentColumn(column);
  // PAST `@5xl`: the breathe engages, and it is a real step (the two tokens differ) — a column that
  // simply stretched, or one still clamped at the cap, both fail here.
  expect(wide.widePx).toBeGreaterThan(wide.capPx);
  expect(wide.maxWidthPx).toBeCloseTo(wide.widePx, 0);
  expect(wide.columnWidth).toBeCloseTo(wide.widePx, 0);
  expect(Math.abs(wide.leftGutter - wide.rightGutter)).toBeLessThanOrEqual(1);
});

// ── #1653 — a `<Field>` DESCRIPTION is teaching prose, and the default Field never capped it ────────────
// The prose measure lives on the Field primitive's `description` slot, but ONLY inside the
// `align:"track" + orientation:"horizontal"` COMPOUND variant (`packages/ui/src/primitives/field/
// variants.ts`). The BASE slot is `text-label leading-label text-muted-foreground` — no measure at all — so
// every DEFAULT `<Field description=…>` in the app renders `max-width: none`. This editor's folder-type
// description is the longest of them: measured pre-fix at 720px = 124.6 average glyph advances per line,
// against the design law's 65-75 band. That is worse than the 90.0 that opened #1653.
//
// THE FIX IS IN THE PRIMITIVE, WHICH IS WHY THIS PIN LIVES AT A CONSUMER. `Field` exposes no per-site
// className for the description slot, so there IS no site-local spelling of the cap — the alternatives were
// a new API knob re-spelled at each call site (the "third un-derived width" #1175 was filed about, and it
// would leave every unvisited Field uncapped) or the base slot. The base slot is the one home. These
// consumer pins are the proof that it reaches a real surface, at that surface's real mount width.
const PROSE_WIDTHS = [1280, 1440, 1920] as const;
/** `.claude/skills/side-eye-design-review/SKILL.md` §2, in the law's own unit — never a px, never a token. */
const LAW_CHARACTERS_PER_LINE = 75;
/** The folder-type description's own opening — enough to find it, not the whole string, so the pin is about
 *  the MEASURE rather than about the wording. */
const FOLDER_TYPE_DESCRIPTION = "In the library's grouped view";

test("#1653 the folder-type description reads inside the prose measure at every desktop width", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  // SETTLED: the editor has painted its own heading before anything is measured.
  await expect(editor.getByRole("heading", { level: 2, name: "adventure" })).toBeVisible();
  await expect(editor.getByText(FOLDER_TYPE_DESCRIPTION, { exact: false })).toBeVisible();

  const rows: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Barrier on a SETTLED box — a read on the same tick as the viewport change is the pre-reflow one.
    await expect.poll(async () => Math.round((await readProseMeasure(page, FOLDER_TYPE_DESCRIPTION)).widthPx)).toBeGreaterThan(0);
    const reading = await readProseMeasure(page, FOLDER_TYPE_DESCRIPTION);
    rows.push(proseRow(width, reading));
    // ON the token, not merely under some width: the description must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1653 tag at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.lawCharacters, `#1653 tag at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  expect(rows).toHaveLength(PROSE_WIDTHS.length);
});
