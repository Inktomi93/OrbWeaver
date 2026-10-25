// The primitive props the feature className drain moves paint onto. Each arm is read as a computed value
// against a probe painted from the same token, so a token retune never breaks the test and a dead arm always does.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type {
  CardShapeStory,
  InputStory,
  LinkStory,
  PointerVisibilityStory,
  RevealStory,
  TextModifierStory,
  ToneStory,
  TouchFloorStory,
} from "./_classname-drain-stories.tsx";

const STORIES = "tests/ui/primitives/_classname-drain-stories";
const TONES = ["info", "accolade", "speaker", "dialogue", "narration"] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test("each meaning tone paints Text and Icon in its own token", async ({ mount }) => {
  const component = await mount<typeof ToneStory>(`${STORIES}/ToneStory`, {});
  for (const tone of TONES) {
    const row = component.locator(`[data-tone-case="${tone}"]`);
    const expected = await style(row.locator(`[data-probe="${tone}"]`), "color");
    expect(await style(row.locator('[data-slot="text"]'), "color"), tone).toBe(expected);
    expect(await style(row.locator("svg"), "color"), tone).toBe(expected);
  }
});

test("the Icon shadow arm lifts the glyph with a drop shadow", async ({ mount }) => {
  const component = await mount<typeof ToneStory>(`${STORIES}/ToneStory`, {});
  expect(await style(component.getByRole("img", { name: "shadowed icon", exact: true }), "filter")).toContain("drop-shadow");
  expect(await style(component.getByRole("img", { name: "plain icon", exact: true }), "filter")).toBe("none");
});

test("strike draws a line-through, numeric sets tabular figures, and code is the mono face in the foreground ink", async ({ mount }) => {
  const component = await mount<typeof TextModifierStory>(`${STORIES}/TextModifierStory`, {});
  expect(await style(component.getByText("struck", { exact: true }), "text-decoration-line")).toBe("line-through");
  expect(await style(component.getByText("plain", { exact: true }), "text-decoration-line")).toBe("none");
  expect(await style(component.getByText("1234", { exact: true }), "font-variant-numeric")).toBe("tabular-nums");
  expect(await style(component.getByText("plain", { exact: true }), "font-variant-numeric")).toBe("normal");
  const code = component.getByText("id_01hx", { exact: true });
  const probe = component.locator('[data-probe="code"]');
  expect(await style(code, "font-family")).toBe(await style(probe, "font-family"));
  expect(await style(code, "color")).toBe(await style(probe, "color"));
});

test("the link intent is an underlined run in the primary ink with no fill", async ({ mount }) => {
  const component = await mount<typeof LinkStory>(`${STORIES}/LinkStory`, {});
  const link = component.getByRole("button", { name: "Show more", exact: true });
  const probe = component.locator('[data-probe="primary"]');
  // The pointer starts over the story's first element; park it on the probe so the link reads at rest.
  await probe.hover();
  expect(await style(link, "text-decoration-line")).toBe("underline");
  expect(await style(link, "background-color")).toBe(await style(probe, "background-color"));
  expect(await style(link, "color")).toBe(await style(probe, "color"));
});

function srOnly(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return computed.position === "absolute" && computed.width === "1px" && computed.height === "1px";
  });
}

for (const pointer of [
  { hasTouch: true, name: "coarse" },
  { hasTouch: false, name: "fine" },
] as const) {
  test.describe(`at a ${pointer.name} pointer`, () => {
    test.use({ hasTouch: pointer.hasTouch });
    const coarse = pointer.hasTouch;

    test("hiddenAt drops the element only at its pointer class, and srOnlyAt keeps it announced", async ({ mount }) => {
      const component = await mount<typeof PointerVisibilityStory>(`${STORIES}/PointerVisibilityStory`, {});
      const display = (locator: Locator): Promise<string> => style(locator, "display");
      expect((await display(component.getByText("text hidden at coarse", { exact: true }))) === "none").toBe(coarse);
      expect((await display(component.getByText("text hidden at fine", { exact: true }))) === "none").toBe(!coarse);
      expect((await display(component.locator('[data-case="row-hidden-coarse"]'))) === "none").toBe(coarse);
      expect((await display(component.locator('[data-case="stack-hidden-fine"]'))) === "none").toBe(!coarse);
      expect((await display(component.getByText("button hidden at coarse", { exact: true }))) === "none").toBe(coarse);
      for (const sr of [
        component.getByText("text announced only at coarse", { exact: true }),
        component.locator('[data-case="row-sr-coarse"]'),
        component.locator('[data-case="stack-sr-coarse"]'),
      ]) {
        expect(await srOnly(sr)).toBe(coarse);
        expect(await display(sr)).not.toBe("none");
      }
    });

    test("touchFloor lifts each box to the touch target only at a coarse pointer", async ({ mount }) => {
      const component = await mount<typeof TouchFloorStory>(`${STORIES}/TouchFloorStory`, {});
      const touch = await style(component.locator('[data-probe="touch"]'), "block-size");
      const floored = async (locator: Locator, property: string): Promise<boolean> => (await style(locator, property)) === touch;
      expect(await floored(component.locator('[data-case="row-block"]'), "min-block-size")).toBe(coarse);
      expect(await floored(component.locator('[data-case="stack-block"]'), "min-block-size")).toBe(coarse);
      expect(await floored(component.getByRole("button", { name: "glyph chip", exact: true }), "min-inline-size")).toBe(coarse);
      expect(await floored(component.locator('[data-slot="badge"]'), "min-block-size")).toBe(coarse);
      expect(await floored(component.getByRole("button", { name: "Tool calls", exact: true }), "min-block-size")).toBe(coarse);
      const blockGap = await style(component.locator('[data-probe="block-gap"]'), "inline-size");
      expect((await style(component.locator('[data-case="row-gap"]'), "column-gap")) === blockGap).toBe(coarse);
    });

    test("a revealed cluster rests hidden and shows on its group's hover, and a coarse pointer keeps it shown", async ({ mount }) => {
      const component = await mount<typeof RevealStory>(`${STORIES}/RevealStory`, {});
      const hover = component.locator('[data-case="row-hover"]');
      const faint = component.locator('[data-case="row-faint"]');
      const actions = component.locator('[data-slot="list-row-actions"]');
      const opacity = (locator: Locator): Promise<string> => style(locator, "opacity");
      await component.locator('[data-case="away"]').hover();
      await expect.poll(() => opacity(hover)).toBe(coarse ? "1" : "0");
      expect(await opacity(faint)).toBe(coarse ? "0.4" : "0");
      await expect.poll(() => opacity(actions)).toBe(coarse ? "1" : "0");
    });
  });
}

test("at a fine pointer the group's hover reveals the cluster: full for an action, faint for secondary chrome", async ({ mount }) => {
  const component = await mount<typeof RevealStory>(`${STORIES}/RevealStory`, {});
  const opacity = (locator: Locator): Promise<string> => style(locator, "opacity");
  // Over the action row, so the faint row reads its group's hover and not its own.
  await component.locator('[data-case="row-hover"]').hover();
  await expect.poll(() => opacity(component.locator('[data-case="row-hover"]'))).toBe("1");
  await expect.poll(() => opacity(component.locator('[data-case="row-faint"]'))).toBe("0.6");
  await component.locator('[data-slot="list-row-root"]').hover();
  await expect.poll(() => opacity(component.locator('[data-slot="list-row-actions"]'))).toBe("1");
});

test("the row and well shapes take the control radius in and out of a tier, the well drops its border for a muted fill", async ({ mount }) => {
  const component = await mount<typeof CardShapeStory>(`${STORIES}/CardShapeStory`, {});
  const card = (name: string): Locator => component.locator(`[data-case="${name}"]`);
  const control = await style(component.locator('[data-probe="control"]'), "border-start-start-radius");
  expect(await style(card("row"), "border-start-start-radius")).toBe(control);
  expect(await style(card("tier-row"), "border-start-start-radius")).toBe(control);
  expect(await style(card("island"), "border-start-start-radius")).not.toBe(control);
  expect(await style(card("row"), "border-block-start-width")).toBe("1px");
  expect(await style(card("well"), "border-block-start-width")).toBe("0px");
  expect(await style(card("well"), "background-color")).toBe(await style(component.locator('[data-probe="muted"]'), "background-color"));
  expect(await style(card("accent-well"), "background-color")).toBe(await style(component.locator('[data-probe="accent"]'), "background-color"));
  expect(await style(card("clear"), "background-color")).toBe(await style(component.locator('[data-probe="clear"]'), "background-color"));
  expect(await style(card("clear"), "border-block-start-width")).toBe("1px");
});

test("an Input width step reaches the element and numeric sets tabular figures", async ({ mount }) => {
  const component = await mount<typeof InputStory>(`${STORIES}/InputStory`, {});
  const sized = component.getByRole("textbox", { name: "avatar-md", exact: true });
  expect(await style(sized, "inline-size")).toBe(await style(component.locator('[data-probe="avatar-md"]'), "inline-size"));
  expect(await style(sized, "font-variant-numeric")).toBe("tabular-nums");
  expect(await style(component.getByRole("textbox", { name: "full", exact: true }), "font-variant-numeric")).toBe("normal");
});
