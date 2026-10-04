// CT: the select seal — explicit Positioner/Popup anatomy portals a real popup (popover token,
// overlay z), pointer + keyboard select, controlled value surfaces in the trigger.
import { Field } from "@orb/ui/field";
import { Select } from "@orb/ui/select";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { pixelContrast } from "../../../support/browser/pixel-contrast.ts";
import { LinkedLabelStory, RenderValueStory } from "./select.fixtures.tsx";

const NON_EMPTY = /.+/u;

const ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

test("aria-label names the combobox trigger", async ({ mount, page }) => {
  // Root renders no element; a labelless Select must be nameable via the trigger.
  await mount(<Select aria-label="Model picker" items={ITEMS} placeholder="Pick one" />);
  await expect(page.getByRole("combobox", { name: "Model picker" })).toBeVisible();
});

test("opens on click, selects an option, and closes", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox");
  await expect(trigger).toContainText("Pick one");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});

// `layout="inline"` is the IDENTITY-LINE trigger (the rpg subject switcher): the NAME is the affordance,
// so the trigger drops the field box entirely — content width, text-height, transparent. It replaces a
// call-site `!h-auto !w-auto !px-field` bang string, so the receipt is the two arms' PAINTED difference.
test("layout=inline drops the field box: content width, text-height, transparent", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 320 }}>
      <Select aria-label="field arm" items={ITEMS} layout="field" value="alpha" />
      <Select aria-label="inline arm" items={ITEMS} layout="inline" value="alpha" />
    </div>,
  );
  const read = (name: string): Promise<{ width: number; height: number; background: string; borderColor: string; clear: string }> =>
    page.getByRole("combobox", { name }).evaluate((el) => {
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // The browser's own serialization of `transparent`, read off a probe rather than spelled here — a
      // literal colour in a CT is both a gate violation and an assertion about our authoring, not the pixels.
      const probe = document.createElement("div");
      probe.style.backgroundColor = "transparent";
      el.ownerDocument.body.append(probe);
      const clear = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { width: box.width, height: box.height, background: s.backgroundColor, borderColor: s.borderTopColor, clear };
    });
  const [field, inline] = await Promise.all([read("field arm"), read("inline arm")]);
  // The field arm fills its container and stands at the control height; the inline arm hugs its own text.
  expect(field.width).toBeCloseTo(320, 0);
  expect(inline.width).toBeLessThan(field.width);
  expect(inline.height).toBeLessThan(field.height);
  // Chrome-free: no input fill, no visible border — both resolve to the same colour as `transparent`.
  expect(inline.background).not.toBe(field.background);
  expect(inline.background).toBe(inline.clear);
  expect(inline.borderColor).toBe(inline.clear);
  await expect(page.getByRole("combobox", { name: "field arm" })).toHaveCSS("background-color", TOKENS["color.input"].value);
});

test("popup wears the popover token and the popover z-index", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const popup = page.locator('[data-slot="select-popup"]');
  await expect(popup).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(popup).toHaveCSS("z-index", TOKENS["z.popover"].value);
});

test("keyboard: opens with ArrowDown, arrows to an option, Enter selects", async ({ mount, page }) => {
  await mount(<Select defaultValue="alpha" items={ITEMS} />);
  const trigger = page.getByRole("combobox");
  await trigger.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  // Wait for the popup to take keyboard ownership — focus (not just highlight) must land on the
  // selected item before arrow keys route to the list instead of the trigger.
  await expect(page.getByRole("option", { name: "Alpha" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Beta" })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});

test("multiple: accumulates values and keeps the popup open", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} multiple={true} placeholder="Pick some" />);
  const trigger = page.getByRole("combobox");
  await trigger.click();
  await page.getByRole("option", { name: "Alpha" }).click();
  // Multiple mode does not close on select — the list stays open to accumulate.
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Gamma" }).click();
  await expect(page.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Beta" })).toHaveAttribute("aria-selected", "false");
  // Value comma-joins the selected labels.
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Alpha");
  await expect(trigger).toContainText("Gamma");
});

test("multiple: reports the selected values as an array through onValueChange", async ({ mount, page }) => {
  const seen: string[][] = [];
  await mount(
    <Select
      items={ITEMS}
      multiple={true}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      placeholder="Pick some"
    />,
  );
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Alpha" }).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toEqual(["alpha", "beta"]);
});

const GROUPED = [
  {
    label: "Warm",
    items: [
      { label: "Ember", value: "ember" },
      { label: "Amber", value: "amber" },
    ],
  },
  {
    label: "Cool",
    items: [{ label: "Slate", value: "slate" }],
  },
];

test("grouped: renders group labels and selects a grouped option", async ({ mount, page }) => {
  await mount(<Select items={GROUPED} placeholder="Pick a shade" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "Warm" })).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "Cool" })).toBeVisible();
  await page.getByRole("option", { name: "Slate" }).click();
  await expect(page.getByRole("combobox")).toContainText("Slate");
});

test("grouped: renders a Separator between adjacent groups (not before the first)", async ({ mount, page }) => {
  await mount(<Select items={GROUPED} placeholder="Pick a shade" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  // Two groups → exactly one between-group Separator (Base UI Select.Separator).
  await expect(page.locator('[data-slot="select-separator"]')).toHaveCount(1);
});

test("backdrop: the opt-in scrim renders behind the popup", async ({ mount, page }) => {
  await mount(<Select backdrop={true} items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const backdrop = page.locator('[data-slot="select-backdrop"]');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.backdrop"].value);
});

const LONG = Array.from({ length: 40 }, (_unused, i) => ({
  label: `Option ${i + 1}`,
  value: `opt-${i + 1}`,
}));

test("disabled: the trigger is inert and cannot be opened", async ({ mount, page }) => {
  await mount(<Select disabled={true} items={ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox");
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("data-disabled", "");
});

test("inside a <Field>, the label associates with the trigger and aria-describedby is wired", async ({ mount, page }) => {
  await mount(
    <Field description="Used for new chats" label="Model">
      <Select items={ITEMS} placeholder="Pick one" />
    </Field>,
  );
  // getByLabel resolves only if the Field's label associates with the trigger's combobox role — the
  // R7 shape (Select.Trigger extends FieldRootState and auto-registers under Field.Root).
  const trigger = page.getByLabel("Model");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("label: Select.Label renders and names the trigger without a wrapping <Field>", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} label="Country" placeholder="Pick one" />);
  await expect(page.locator('[data-slot="select-label"]')).toHaveText("Country");
  await expect(page.getByRole("combobox", { name: "Country" })).toBeVisible();
});

test("renderValue: formats the trigger's selected-value text", async ({ mount, page }) => {
  await mount(<RenderValueStory />);
  await expect(page.getByRole("combobox")).toContainText("Selected: beta");
});

test("arrow: renders inside the popup when enabled", async ({ mount, page }) => {
  await mount(<Select arrow={true} items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.locator('[data-slot="select-arrow"]')).toBeVisible();
});

test("side: overrides the Positioner's requested placement", async ({ mount, page }) => {
  // Generous room above and below so the requested side isn't flipped by a collision.
  await mount(
    <div style={{ paddingBottom: 300, paddingTop: 300 }}>
      <Select items={ITEMS} placeholder="Pick one" side="top" />
    </div>,
  );
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.locator('[data-slot="select-positioner"]')).toHaveAttribute("data-side", "top");
});

test("scrollArrows: the down arrow mounts on an overflowing list", async ({ mount, page }) => {
  // A spacer keeps the trigger away from the viewport edge so Base UI stays in align-item mode
  // (the mode the scroll arrows drive off); at the edge it falls back to a plain dropdown.
  await mount(
    <div style={{ paddingTop: 240 }}>
      <Select items={LONG} placeholder="Pick one" scrollArrows={true} />
    </div>,
  );
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  // The popup overflows 40 items → the hover-to-scroll down arrow is mounted (mouse input).
  await expect(page.locator('[data-slot="select-scroll-down-arrow"]')).toBeVisible();
});

// `SelectOption.description` — a per-option gloss, for lists whose options need explaining at the moment
// of choosing (a legend on the Field is occluded by this very popup). Three things have to hold at once:
// the gloss PAINTS in the row, it stays OFF the trigger (`Select.Value` mirrors `ItemText`, and the
// trigger is single-line by convention), and it stays OUT of the option's accessible name while still
// reaching AT as a description.
const GLOSSED = [
  { label: "Alpha", value: "alpha", description: "The first one." },
  { label: "Beta", value: "beta", description: "The second one." },
  { label: "Gamma", value: "gamma" },
] as const;

test("option description: paints in the row, stays off the trigger, and is a description not a name", async ({ mount, page }) => {
  await mount(<Select aria-label="Glossed" items={GLOSSED} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox", { name: "Glossed" });
  await trigger.click();

  // Name unchanged: `exact` only resolves because the gloss is hidden from the accname subtree.
  const beta = page.getByRole("option", { name: "Beta", exact: true });
  const gloss = beta.locator('[data-slot="select-item-description"]');
  await expect(gloss).toHaveText("The second one.");
  await expect(gloss).toHaveAttribute("aria-hidden", "true");
  const glossId = await gloss.getAttribute("id");
  await expect(beta).toHaveAttribute("aria-describedby", glossId ?? "");
  // Rendered, not merely present, and BELOW the label rather than beside it.
  const geo = await beta.evaluate((el) => {
    const label = el.querySelector('[data-slot="select-item-body"] > *:first-child');
    const desc = el.querySelector('[data-slot="select-item-description"]');
    const l = label?.getBoundingClientRect();
    const d = desc?.getBoundingClientRect();
    return { labelBottom: l?.bottom ?? 0, descTop: d?.top ?? 0, descHeight: d?.height ?? 0 };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(geo.descHeight).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(geo.descTop).toBeGreaterThanOrEqual(geo.labelBottom - 1);

  // An option with no `description` renders no gloss node — the slot is opt-in, not an empty row.
  await expect(page.getByRole("option", { name: "Gamma", exact: true }).locator('[data-slot="select-item-description"]')).toHaveCount(0);

  await beta.click();
  await expect(trigger).toHaveText("Beta");
});

const EXPLAINED = [
  {
    label: "Sharper semantic recall",
    value: "sharp",
    description:
      "Re-sorts related scenes with the rerank model for sharper recall. Costs an extra model call; if reranking is unavailable, vector order is used.",
  },
  { label: "Smart", value: "smart", disabled: true, description: "Needs a rerank model; pick one in Model roles to turn this on." },
];

/** Most lines any one description may take: the reasons above run about 150 characters, which reads in four
 *  lines at the popup floor. A description laid out at its label's width ran one or two words per line. */
const MAX_DESCRIPTION_LINES = 5;

// A glossed popup is never narrower than its trigger or the popup floor, never wider than the reading cap, and
// its descriptions wrap across that width rather than sizing it: narrow, mid and wide triggers alike.
for (const triggerPx of [120, 240, 367]) {
  test(`a glossed popup under a ${String(triggerPx)}px trigger stays readable: floored, capped, descriptions wrap short`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(
      <div style={{ width: triggerPx }}>
        <Select aria-label="Explained modes" items={EXPLAINED} />
      </div>,
    );
    const trigger = page.getByRole("combobox", { name: "Explained modes" });
    await trigger.click();
    const popup = page.locator('[data-slot="select-popup"]');
    // The open transition scales the popup up from 95%; measure its settled box.
    await expect(popup).toHaveCSS("opacity", "1");

    const triggerWidth = (await trigger.boundingBox())?.width ?? 0;
    const geometry = await popup.evaluate((element) => {
      const probe = (value: string): number => {
        const node = document.createElement("div");
        node.style.width = value;
        element.append(node);
        const width = node.getBoundingClientRect().width;
        node.remove();
        return width;
      };
      const descriptions = [...element.querySelectorAll('[data-slot="select-item-description"]')];
      return {
        width: element.getBoundingClientRect().width,
        floor: probe("var(--width-popup-floor)"),
        cap: probe("var(--reading-measure)"),
        overflow: element.scrollWidth - element.clientWidth,
        clipped: descriptions.filter((desc) => desc.scrollWidth > desc.clientWidth + 1).length,
        lines: descriptions.map((desc) => Math.round(desc.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(desc).lineHeight))),
      };
    });
    expect(geometry.floor, "the floor token resolves").toBeGreaterThan(0);
    expect(geometry.width, "never narrower than the trigger or the floor").toBeGreaterThanOrEqual(Math.max(triggerWidth, geometry.floor) - 1);
    expect(geometry.width, "a description never widens it past the larger of the two").toBeLessThanOrEqual(Math.max(triggerWidth, geometry.floor) + 1);
    expect(geometry.width, "and never past the reading cap").toBeLessThanOrEqual(geometry.cap + 1);
    expect(geometry.overflow, "nothing scrolls sideways").toBeLessThanOrEqual(0);
    expect(geometry.clipped, "no description is clipped").toBe(0);
    expect(Math.max(...geometry.lines), JSON.stringify(geometry.lines)).toBeLessThanOrEqual(MAX_DESCRIPTION_LINES);
    expect(geometry.lines[0], "the long description wraps").toBeGreaterThan(1);
  });
}

// An option label wider than the control column, and no descriptions: only the alignment decides where the popup ends.
const DOCKED_ITEMS = [
  { label: "Recall every stored scene, the sharpest first", value: "sharp" },
  { label: "Off", value: "off" },
];

// A settings row docks its control at the row's END; the popup opens end-aligned so it grows back into the pane
// instead of overhanging its right edge.
test("a select docked at the end of a horizontal Field opens its popup end-aligned, inside the pane", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(
    <div data-testid="pane" style={{ width: 640, overflow: "hidden" }}>
      <Field label="Recall mode" orientation="horizontal">
        <Select aria-label="Recall mode" items={DOCKED_ITEMS} />
      </Field>
    </div>,
  );
  const trigger = page.getByRole("combobox", { name: "Recall mode" });
  await trigger.click();
  const popup = page.locator('[data-slot="select-popup"]');
  await expect(popup).toHaveCSS("opacity", "1");
  const [triggerBox, popupBox, paneBox] = await Promise.all([trigger.boundingBox(), popup.boundingBox(), page.getByTestId("pane").boundingBox()]);
  const right = (box: { x: number; width: number } | null): number => (box === null ? Number.NaN : box.x + box.width);
  expect(Math.abs(right(popupBox) - right(triggerBox)), "the popup's end meets the trigger's end").toBeLessThanOrEqual(1);
  expect(right(popupBox), "the popup stays inside the pane").toBeLessThanOrEqual(right(paneBox) + 1);
});

// A content-width trigger (the library sort: `w-auto`, showing only the selected label) is narrower than its
// other options. The popup grows to the longest label, so no option name wraps.
const SORTS = [
  { label: "Recent", value: "recent" },
  { label: "Name (A–Z)", value: "name" },
  { label: "Most chatted with recently", value: "chatted" },
  { label: "Recently imported", value: "imported" },
];

test("a content-width trigger's popup grows to its longest label, one line each", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(
    <div style={{ display: "flex" }}>
      <Select aria-label="Sort" className="w-auto" items={SORTS} value="recent" />
    </div>,
  );
  const trigger = page.getByRole("combobox", { name: "Sort" });
  await trigger.click();
  const popup = page.locator('[data-slot="select-popup"]');
  await expect(popup).toHaveCSS("opacity", "1");
  const triggerWidth = (await trigger.boundingBox())?.width ?? 0;
  const geometry = await popup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    wrapped: [...element.querySelectorAll('[data-slot="select-item-label"]')]
      .filter((label) => label.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(label).lineHeight) * 1.5)
      .map((label) => label.textContent),
  }));
  expect(geometry.width, "the popup is never narrower than its trigger").toBeGreaterThanOrEqual(triggerWidth - 1);
  expect(geometry.width, "the longest label widens the popup past the content-width trigger").toBeGreaterThan(triggerWidth + 1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the popup's open transition settled (opacity 1) before this one atomic geometry snapshot.
  expect(geometry.wrapped).toEqual([]);
});

// A disabled option's description is the only place that says WHY it is disabled, so only the label dims;
// the reason keeps the muted-foreground ink at full opacity and clears the WCAG text floor in every seed.
test("a disabled option dims its label only; its reason stays readable in dark and light", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(
    <div style={{ width: 367 }}>
      <Select aria-label="Explained modes" items={EXPLAINED} />
    </div>,
  );
  const trigger = page.getByRole("combobox", { name: "Explained modes" });
  const backdrops = new Set<string>();
  for (const theme of ["hearth", "light"] as const) {
    await page.evaluate((seed) => {
      // `hearth` IS the base `@theme` at `:root`; only light emits a `[data-theme]` block.
      if (seed === "hearth") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", seed);
      }
    }, theme);
    await trigger.click();
    const smart = page.getByRole("option", { name: "Smart", exact: true });
    await expect(smart).toHaveAttribute("data-disabled", "");
    const reason = smart.locator('[data-slot="select-item-description"]');
    const painted = (el: Element): number => {
      let opacity = 1;
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        opacity *= Number.parseFloat(getComputedStyle(node).opacity);
      }
      return opacity;
    };
    // Polled: the open transition fades the popup in, so the product settles a beat after the option mounts.
    await expect.poll(() => reason.evaluate(painted), { message: `[${theme}] the reason paints at full opacity` }).toBe(1);
    await expect.poll(() => smart.locator('[data-slot="select-item-label"]').evaluate(painted), { message: `[${theme}] the label dims` }).toBe(0.5);
    const contrast = await pixelContrast(page, reason);
    expect(contrast.ratio, `[${theme}] disabled reason vs popup — ${contrast.describe}`).toBeGreaterThanOrEqual(4.5);
    backdrops.add(contrast.describe);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
  }
  // Guards the loop: a light seed that never applied would measure the dark arm twice.
  expect(backdrops.size).toBe(2);
});

for (const mode of ["field", "label", "aria", "linked"] as const) {
  test(`opened listbox carries its ${mode} field name, not its selected option`, async ({ mount, page }) => {
    const stories = {
      field: (
        <Field label="Model">
          <Select aria-label="Wrong name" items={ITEMS} defaultValue="alpha" />
        </Field>
      ),
      label: <Select label="Country" items={ITEMS} defaultValue="alpha" />,
      aria: <Select aria-label="Model picker" items={ITEMS} defaultValue="alpha" />,
      linked: <LinkedLabelStory />,
    };
    await mount(stories[mode]);
    const name = { field: "Model", label: "Country", aria: "Model picker", linked: "Region" }[mode];
    const trigger = page.getByRole("combobox", { name, exact: true });
    await trigger.press("ArrowDown");
    await expect(page.getByRole("listbox")).toHaveAccessibleName(name);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await trigger.click();
    await expect(page.getByRole("listbox")).toHaveAccessibleName(name);
    await page.getByRole("option", { name: "Beta", exact: true }).click();
    await expect(trigger).toContainText("Beta");
  });
}

test("default-open listbox tracks a live author name change without changing its value", async ({ mount, page }) => {
  const component = await mount(<Select aria-label="First model" items={ITEMS} defaultValue="alpha" defaultOpen={true} />);
  await expect(page.getByRole("listbox")).toHaveAccessibleName("First model");
  await component.update(<Select aria-label="Second model" items={ITEMS} defaultValue="alpha" defaultOpen={true} />);
  await expect(page.getByRole("listbox")).toHaveAccessibleName("Second model");
  await expect(page.getByRole("combobox", { name: "Second model", exact: true })).toContainText("Alpha");
});

test("independent Selects with shared option values keep their own popup names", async ({ mount, page }) => {
  await mount(
    <>
      <Select aria-label="Primary model" items={ITEMS} value="alpha" />
      <Select aria-label="Secondary model" items={ITEMS} value="alpha" />
    </>,
  );
  for (const name of ["Primary model", "Secondary model"]) {
    await page.getByRole("combobox", { name, exact: true }).click();
    await expect(page.getByRole("listbox")).toHaveAccessibleName(name);
    await expect(page.getByRole("option", { name: "Alpha", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
  }
});
