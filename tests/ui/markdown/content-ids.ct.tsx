// Markup an author writes into a message renders in the main document, so an `id` or a `name` it carries must not name
// a global, a document member or an element the app looks up. The seal's sanitize schema prefixes both, and the
// fragment links that point at them, so an anchor the author wrote and a footnote still land on their targets.
// @subject packages/ui/src/markdown/policy.ts
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ContentIdsStory } from "./_content-ids-stories.tsx";

const STORY = "tests/ui/markdown/_content-ids-stories/ContentIdsStory";
const PROBE_ID = "orbProbe";
const PROBE_TEXT = "The probe line.";
const NOTE_TEXT = "The note body.";
const JUMP = "Jump to the probe";
// An anchor the author wrote, a footnote with its reference and its way back, and the element the anchor names.
const LINKED = [`[${JUMP}](#${PROBE_ID})`, "A line with a note.[^1]", `<p id="${PROBE_ID}">${PROBE_TEXT}</p>`, `[^1]: ${NOTE_TEXT}`].join("\n\n");

test("an author's id on an untrusted row names no element and no global of the page", async ({ mount, page }) => {
  const component = await mount<typeof ContentIdsStory>(STORY, { trust: "untrusted", mode: "static", children: `<span id="${PROBE_ID}">${PROBE_TEXT}</span>` });
  // Positive control: the element drew, so the missing name is the schema's doing.
  await expect(component.getByText(PROBE_TEXT, { exact: true })).toBeVisible();
  expect(await page.evaluate((id) => [document.getElementById(id) === null, id in globalThis], PROBE_ID)).toEqual([true, false]);
});

test("an image named after a document method on a trusted row leaves the method in place", async ({ mount, page }) => {
  const component = await mount<typeof ContentIdsStory>(STORY, {
    trust: "trusted",
    mode: "static",
    children: `<img name="createElement" alt="probe" src="/probe.png">\n\n${PROBE_TEXT}`,
  });
  await expect(component.getByText(PROBE_TEXT, { exact: true })).toBeVisible();
  // Positive control: the own-origin image drew, so its name reached the schema.
  await expect(component.locator("img[alt='probe']")).toHaveCount(1);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reads the property to prove a named image left it in place; the deprecated overload is never called.
  expect(await page.evaluate(() => typeof document.createElement)).toBe("function");
});

for (const trust of ["trusted", "untrusted"] as const) {
  test(`on a ${trust} row every in-message link names an element the message drew`, async ({ mount, page }) => {
    const component = await mount<typeof ContentIdsStory>(STORY, { trust, mode: "static", children: LINKED });
    await expect(component.getByText(NOTE_TEXT)).toBeVisible();
    // The author's anchor and the footnote reference. The seal hands every link to its confirm, which prints the address
    // the link would open. The footnote's way back is left out: the vendor draws the reference as a button without the
    // id it points at, with or without the prefix.
    const links = [JUMP, "1"] as const;
    const targets: (string | null)[] = [];
    for (const name of links) {
      // A dispatched click: the vendor's footnote button inside `sup` reads as zero-sized to the actionability check.
      await component.getByRole("button", { name, exact: true }).dispatchEvent("click");
      const address = page.getByText(/^#\S+$/u);
      const hash = (await address.textContent()) ?? "";
      targets.push(await page.evaluate((fragment) => document.getElementById(decodeURIComponent(fragment.slice(1)))?.textContent.trim() ?? null, hash));
      await page.keyboard.press("Escape");
      await expect(address).toHaveCount(0);
    }
    expect(targets).toEqual([PROBE_TEXT, expect.stringContaining(NOTE_TEXT)]);
    expect(await page.evaluate((id) => document.getElementById(id), PROBE_ID)).toBeNull();
  });
}
