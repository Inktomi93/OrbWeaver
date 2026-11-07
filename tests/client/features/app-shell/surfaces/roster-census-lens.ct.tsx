// @subject packages/client/src/lib/filtered-census.ts
// Every roster band prints `k of N` once its search narrows the list, where k is what the rows show and N the whole
// roster. The expected numbers come from the server's own reads, never from the rows the page happens to render.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { DATABANK_SEARCH_NAME } from "#client/features/databank/lib/databank-names.ts";
import { REFINERY_SEARCH_SESSIONS_NAME } from "#client/features/refinery/lib/refinery-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [...SECTION_PROCEDURES, "databank.bankHealth", "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;
const PRESET_SEARCH_NAME = "Search presets";
const DOCUMENTS = ["Lantern notes", "Harbour notes", "Orchard notes"] as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("the Databank band names the filtered total beside the bank's size", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of DOCUMENTS) {
    await caller.databank.createFromText({ name, text: `${name} body.` });
  }
  const total = (await caller.databank.bankHealth()).total;
  const shown = (await caller.databank.list({ search: "Harbour" })).totalCount;
  expect(shown).toBeLessThan(total);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READS) });
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("textbox", { name: DATABANK_SEARCH_NAME, exact: true }).fill("Harbour");
  await expect(page.getByText(`${shown} of ${total}`, { exact: true }).first()).toBeVisible();
});

test("the Presets band names the filtered total beside the library's size", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const presets = await caller.preset.list();
  const needle = presets[0]?.name.slice(0, 4).toLowerCase() ?? "";
  const shown = presets.filter((preset) => preset.name.toLowerCase().includes(needle)).length;
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(presets.length);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READS) });
  await seedShellState(page, { activeSection: "presets" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("textbox", { name: PRESET_SEARCH_NAME, exact: true }).fill(needle);
  await expect(page.getByText(`${shown} of ${presets.length}`, { exact: true }).first()).toBeVisible();
});

test("the Refinery band names the filtered total beside the roster's size", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const witness = await caller.character.create({
    input: { handle: "census-lens-witness", name: "Census lens witness", description: "A keeper of copper observatory records." },
  });
  await caller.refinery.startSession({ characterId: witness.id });
  const sessions = await caller.refinery.listSessions();
  const shown = sessions.filter((session) => session.characterName === witness.name).length;
  expect(shown).toBeLessThan(sessions.length);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READS) });
  await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("textbox", { name: REFINERY_SEARCH_SESSIONS_NAME, exact: true }).fill(witness.name);
  await expect(page.getByText(`${shown} of ${sessions.length}`, { exact: true }).first()).toBeVisible();
});
