import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";

for (const opening of ["&#91;", "&#x5b;", "&lbrack;"] as const) {
  test(`${opening}: decoded and escaped identical neighbors cannot borrow the real stamp's position`, async ({ mount }) => {
    const body = `${opening}dice: d20 → 8] then \\[dice: d20 → 8] then [dice: d20 → 8] after.`;
    const component = await mount(
      <Markdown trust="trusted" mode="static" inlineDice={true}>
        {body}
      </Markdown>,
    );
    const chip = component.locator('[data-slot="message-dice-chip"]');
    await expect(chip).toHaveCount(1);
    await expect
      .poll(() =>
        chip.evaluate((element) => {
          const paragraph = element.closest("p");
          if (paragraph === null) {
            throw new Error("Dice chip must belong to its prose paragraph");
          }
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          range.setEndBefore(element);
          return range.toString();
        }),
      )
      .toBe("[dice: d20 → 8] then [dice: d20 → 8] then ");
    await expect(component.locator("p")).toHaveText("[dice: d20 → 8] then [dice: d20 → 8] then d20 → 8 after.");
  });
}

test("native source positions retain kit's backslash exclusion and admit a real stamp immediately after code", async ({ mount }) => {
  const body = "\\\\[dice: d20 → 8] then `[dice: d20 → 7]`[dice: d20 → 8] after.";
  const component = await mount(
    <Markdown trust="trusted" mode="static" inlineDice={true}>
      {body}
    </Markdown>,
  );
  const chip = component.locator('[data-slot="message-dice-chip"]');
  await expect(chip).toHaveCount(1);
  await expect(component.locator("p")).toHaveText("\\[dice: d20 → 8] then [dice: d20 → 7]d20 → 8 after.");
  await expect(chip.locator("xpath=preceding::code[1]")).toHaveText("[dice: d20 → 7]");
});

test("native source ranges survive quote and list continuation prefixes", async ({ mount }) => {
  const body = "> &#91;dice: d20 → 8]\n> [dice: d20 → 8]\n\n- &#91;dice: d20 → 8]\n  [dice: d20 → 8]";
  const component = await mount(
    <Markdown trust="trusted" mode="static" inlineDice={true}>
      {body}
    </Markdown>,
  );
  await expect(component.locator('blockquote [data-slot="message-dice-chip"]')).toHaveCount(1);
  await expect(component.locator('li [data-slot="message-dice-chip"]')).toHaveCount(1);
  await expect(component.locator("blockquote")).toHaveText("[dice: d20 → 8] d20 → 8");
  await expect(component.locator("li")).toHaveText("[dice: d20 → 8] d20 → 8");
});

test("inline dice is opt-in and source HTML cannot mint the internal chip marker", async ({ mount }) => {
  const component = await mount(
    <div>
      <section aria-label="ordinary">
        <Markdown trust="trusted" mode="static">
          Before [dice: d20 → 8] after.
        </Markdown>
      </section>
      <section aria-label="dice">
        <Markdown trust="trusted" mode="static" inlineDice={true}>
          {'Before <span data-dice="d20" data-slot="message-dice-chip" data-total="8">\\[dice: d20 → 8]</span> after. [dice: d20 → 8]'}
        </Markdown>
      </section>
    </div>,
  );
  const ordinary = component.getByRole("region", { name: "ordinary", exact: true });
  await expect(ordinary).toHaveText("Before [dice: d20 → 8] after.");
  await expect(ordinary.locator('[data-slot="message-dice-chip"]')).toHaveCount(0);
  const dice = component.getByRole("region", { name: "dice", exact: true });
  await expect(dice.locator('[data-slot="message-dice-chip"]')).toHaveCount(1);
  await expect(dice.locator('[data-slot="message-dice-chip"]')).toHaveText("d20 → 8");
  await expect(dice).toContainText("Before [dice: d20 → 8] after.");
});

for (const trust of ["trusted", "untrusted"] as const) {
  test(`${trust}: fenced, inline-code, escaped and malformed stamps stay literal beside a real stamp`, async ({ mount }) => {
    const body = "\\[dice: d20 → 8] then [dice: d20 → 8] and `[dice: d20 → 9]`.\n\n```text\n[dice: d20 → 10]\n```\n\n[dice: d20 => 4]\nNext line.";
    const component = await mount(
      <Markdown trust={trust} mode="static" inlineDice={true}>
        {body}
      </Markdown>,
    );
    await expect(component.locator('[data-slot="message-dice-chip"]')).toHaveCount(1);
    await expect(component.locator("p").first()).toHaveText("[dice: d20 → 8] then d20 → 8 and [dice: d20 → 9].");
    await expect(component.locator("p code")).toHaveText("[dice: d20 → 9]");
    await expect(component.locator("pre")).toContainText("[dice: d20 → 10]");
    await expect(component.locator("p").last()).toHaveText("[dice: d20 => 4] Next line.");
  });
}
