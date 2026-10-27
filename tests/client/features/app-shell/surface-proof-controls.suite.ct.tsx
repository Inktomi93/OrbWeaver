// The census must read the production subject, not quiet loading chrome or invented request captures.
import { auditSurface, settledBox } from "@orb/testkit/browser/spec";
import { holdServed } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { modalScenario, sectionScenario } from "./_surface-scenarios.ts";
import type { ModalShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";

test("a quiet held subject cannot complete the census, and the loaded subject exposes a missing label", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const held = holdServed();
  await routeSurfaceReads(page, corpus, root, { hold: { path: "preset.list", gate: held } });
  await mount<typeof SectionShellStory>(STORY, { section: "presets" });
  await held.requested;
  let accepted = false;
  const gate = auditSurface({ ...sectionScenario(page, "presets"), checks: ["names"] }).then((report) => {
    accepted = true;
    return report;
  });
  try {
    await settledBox(page.getByRole("textbox", { name: "Search presets", exact: true }));
    expect(accepted).toBe(false);
  } finally {
    held.release();
  }
  const healthy = await gate;
  expect(healthy.names).toEqual([]);
  expect(Object.keys(healthy)).toEqual(["names"]);
  expect(Object.hasOwn(healthy, "forms")).toBe(false);
  expect(Object.hasOwn(healthy, "density")).toBe(false);
  const preset = (await caller.preset.list())[0];
  if (preset === undefined) {
    throw new Error("The corpus has no preset row to audit");
  }
  const radio = page.getByRole("radio", { name: `Activate ${preset.name} for generation`, exact: true });
  await expect(radio).toBeVisible();
  await radio.evaluate((node) => {
    node.removeAttribute("aria-label");
    node.removeAttribute("aria-labelledby");
  });
  const defective = await auditSurface({ ...sectionScenario(page, "presets"), checks: ["names"] });
  expect(defective.names.some((finding) => finding.rule === "nameless-control")).toBe(true);
  await page.getByRole("radiogroup", { name: "Active preset for generation", exact: true }).evaluate((node) => node.remove());
  await expect(auditSurface({ ...sectionScenario(page, "presets"), checks: ["names"] })).rejects.toThrow("required loaded content must render");
});

test("an explicitly empty production modal supplies its own state witness", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await routeSurfaceReads(page, corpus, root);
  await mount<typeof ModalShellStory>("tests/client/features/app-shell/_surface-stories/ModalShellStory", { modal: "imageDetail" });
  const report = await auditSurface({ ...modalScenario(page, "imageDetail"), checks: ["names", "forms", "density"] });
  expect(report).toEqual({ names: [], forms: [], density: [] });
});

test("an intentional read failure requires the actual error and recovery control", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const held = holdServed();
  await routeSurfaceReads(page, corpus, root, { hold: { path: "preset.list", gate: held } });
  await mount<typeof SectionShellStory>(STORY, { section: "presets" });
  await held.requested;
  held.fail();
  const failure = page.getByRole("region", { name: "Presets list", exact: true });
  const report = await auditSurface({
    name: "failed preset list",
    scope: failure,
    state: "error",
    witnesses: [failure.getByText("Couldn't load your presets.", { exact: true }), failure.getByRole("button", { name: "Retry", exact: true })],
    checks: ["names", "forms", "density"],
  });
  expect(report).toEqual({ names: [], forms: [], density: [] });
});

for (const input of [
  { starred: true, limit: 24, archived: false },
  { archived: false, limit: 5, sort: "recent" },
] as const) {
  test(`${"starred" in input ? "starred-only" : "limited"} character requests return their actual production cohort`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const all = await caller.character.list({ limit: 100 });
    expect(all.items.length).toBeGreaterThan(input.limit);
    expect(all.items.every((character) => !character.starred)).toBe(true);
    await routeSurfaceReads(page, corpus, root);
    await mount<typeof SectionShellStory>(STORY, { section: "home" });
    const expected = await caller.character.list(input);
    const response = await page.evaluate(async (query) => {
      const result = await fetch(`/api/trpc/character.list?input=${encodeURIComponent(JSON.stringify(query))}`);
      return await result.json();
    }, input);
    expect(response).toEqual({ result: { data: JSON.parse(JSON.stringify(expected)) } });
  });
}
