// CT: the option-strip seal — the INLINE (never-popover) listbox whose rows are role="option" buttons that
// a SEPARATE control drives via aria-activedescendant. The load-bearing contract: the container is a
// role="listbox" with a name, each row is a role="option" carrying its id + aria-selected, a highlighted row
// is aria-selected, a disabled row is aria-disabled (hoverable, title surfaces) with activation refused, and
// the rows are NOT tab stops (tabIndex=-1) — the driving control owns the one tab stop.

import type { OptionStripItem } from "@orb/ui/option-strip";
import { OptionStrip } from "@orb/ui/option-strip";
import { expect, test } from "@playwright/experimental-ct-react";

const STRIP_ID = "my-strip";
const ITEMS: readonly OptionStripItem[] = [
  { id: "opt-a", label: "/alpha", description: "the first", highlighted: true },
  { id: "opt-b", label: "/beta", description: "the second" },
  { id: "opt-c", label: "/gamma", description: "unavailable here", disabled: true, title: "Locked — unlock it first." },
];

const ALPHA = /alpha/u;
const BETA = /beta/u;
const GAMMA = /gamma/u;
// Matches any attribute value — asserts the NATIVE `disabled` attribute is ABSENT (the row is aria-disabled).
const ANY_VALUE = /.*/u;

test("the container is a named role='listbox' with the given id; each item is a role='option' with its id", async ({ mount, page }) => {
  await mount(<OptionStrip aria-label="Offers" id={STRIP_ID} items={ITEMS} onSelect={(): void => undefined} />);
  const listbox = page.getByRole("listbox", { name: "Offers" });
  await expect(listbox).toHaveAttribute("id", STRIP_ID);
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: ALPHA })).toHaveAttribute("id", "opt-a");
});

test("the highlighted item is aria-selected='true'; the others are 'false'", async ({ mount, page }) => {
  await mount(<OptionStrip aria-label="Offers" id={STRIP_ID} items={ITEMS} onSelect={(): void => undefined} />);
  await expect(page.getByRole("option", { name: ALPHA })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: BETA })).toHaveAttribute("aria-selected", "false");
});

test("a click on an available row fires onSelect with that item; the rows are NOT tab stops (tabIndex=-1)", async ({ mount, page }) => {
  const picked: string[] = [];
  await mount(<OptionStrip aria-label="Offers" id={STRIP_ID} items={ITEMS} onSelect={(item): void => void picked.push(item.id)} />);
  const beta = page.getByRole("option", { name: BETA });
  await expect(beta).toHaveAttribute("tabindex", "-1");
  await beta.click();
  await expect.poll(() => picked, { intervals: [20, 50, 100] }).toEqual(["opt-b"]);
});

test("a disabled row is aria-disabled (hoverable, its title surfaces) not native-disabled, and refuses activation", async ({ mount, page }) => {
  const picked: string[] = [];
  await mount(<OptionStrip aria-label="Offers" id={STRIP_ID} items={ITEMS} onSelect={(item): void => void picked.push(item.id)} />);
  const gamma = page.getByRole("option", { name: GAMMA });
  // aria-disabled (Playwright treats it as disabled) but NOT the native attribute — so it stays hoverable and
  // its `title` reason surfaces, matching the disabled-affordance law.
  await expect(gamma).toBeDisabled();
  await expect(gamma).toHaveAttribute("aria-disabled", "true");
  await expect(gamma).not.toHaveAttribute("disabled", ANY_VALUE);
  await expect(gamma).toHaveAttribute("title", "Locked — unlock it first.");
  // A forced click on the disabled row does not fire onSelect (activation prevented).
  await gamma.click({ force: true });
  await expect.poll(() => picked, { intervals: [20, 50, 100] }).toEqual([]);
});
