// @subject packages/client/src/features/persona/components/persona-crown.tsx
// @subject packages/ui/src/lib/hover-reveal.ts
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { PersonaListStory } from "./_persona-list-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-list-stories/PersonaListStory";
// Enough Tab presses to cross the list band and reach the first crown.
const TAB_LIMIT = 40;
const PERSONA_PROCEDURES = ["persona.list", "sessions.me", "settings.getUserSettings"] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The product of the opacities from `element` up to the document, as the browser resolves them. */
function opacityProduct(element: Locator): Promise<number> {
  return element.evaluate((node) => {
    let product = 1;
    for (let current: Element | null = node; current !== null; current = current.parentElement) {
      product *= Number(getComputedStyle(current).opacity);
    }
    return product;
  });
}

test("a keyboard-focused crown shows at full strength, though its faint reveal sits on the wrapper", async ({ mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  // The crown's reveal only applies to a persona that is not the default, so the list needs a second one.
  await caller.persona.create({ input: { name: "Second persona", description: "" } });
  await routeTrpc(page, serveCorpusProcedures(caller, PERSONA_PROCEDURES));
  await mount<typeof PersonaListStory>(STORY, {});

  const crown = page.locator('[data-slot="persona-crown"]').first();
  await expect(crown).toBeAttached();
  await page.mouse.move(0, 0);
  // Positive control: at rest the crown is faint, so a full-strength reading after Tab is the focus restoring it.
  await expect.poll(() => opacityProduct(crown)).toBeLessThan(1);
  for (let tabs = 0; tabs < TAB_LIMIT && !(await crown.evaluate((node) => node === document.activeElement)); tabs += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(crown).toBeFocused();
  await expect.poll(() => opacityProduct(crown)).toBe(1);
});
