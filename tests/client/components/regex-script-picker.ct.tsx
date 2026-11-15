// @subject packages/client/src/components/regex-script-picker.tsx
// Each picker row's attach switch keeps one stable name, `<setting>: <script>`; `aria-checked` alone carries the state.
import { ITEM_ATTACH_SETTING, itemSwitchName } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RegexScriptPickerStory } from "./_regex-script-picker-stories.tsx";

const STORY = "tests/client/components/_regex-script-picker-stories/RegexScriptPickerStory";
const PROCEDURES = ["sessions.me", "settings.getUserSettings", "regex.listScripts", "regex.listForChat", "regex.attachToChat", "regex.detachFromChat"] as const;

test("an owner with no scripts reads the shared muted line where the rows would be, and no switch", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chats = await host.chat.listChats({ limit: 1 });
  const chatId = chats.items[0]?.id;
  if (chatId === undefined) {
    throw new Error("The corpus has no room");
  }
  // The corpus owner has scripts: empty the library through the product's own remove, then confirm it is empty before the mount.
  const library = await host.regex.listScripts();
  expect(library.length).toBeGreaterThan(0);
  await host.regex.bulkRemove({ scriptIds: library.map((script) => script.id) });
  expect(await host.regex.listScripts()).toEqual([]);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(host, PROCEDURES));
  await corpusMedia();
  await mount<typeof RegexScriptPickerStory>(STORY, { chatId });

  await expect(page.locator('[data-slot="muted-line"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="muted-line"]')).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
});

test("two scripts in opposite states are found by their stable names, and a flip writes to its own script", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chats = await host.chat.listChats({ limit: 1 });
  const chatId = chats.items[0]?.id;
  if (chatId === undefined) {
    throw new Error("The corpus has no room");
  }
  const attached = await host.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "Fix quotes", findRegex: "x", replaceString: "y", targets: ["AI_OUTPUT"], passes: ["save"] }),
  });
  const held = await host.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "Soften asides", findRegex: "x", replaceString: "y", targets: ["AI_OUTPUT"], passes: ["save"] }),
  });
  await host.regex.attachToChat({ chatId, scriptId: attached.id });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  const trpc = await routeTrpc(page, serveCorpusProcedures(host, PROCEDURES));
  await corpusMedia();
  await mount<typeof RegexScriptPickerStory>(STORY, { chatId });

  const attachedSwitch = page.getByRole("switch", { name: itemSwitchName(ITEM_ATTACH_SETTING, attached.name), exact: true });
  const heldSwitch = page.getByRole("switch", { name: itemSwitchName(ITEM_ATTACH_SETTING, held.name), exact: true });
  await expect(attachedSwitch).toHaveAttribute("aria-checked", "true");
  await expect(heldSwitch).toHaveAttribute("aria-checked", "false");
  await heldSwitch.click();
  await expect.poll(() => trpc.lastInput("regex.attachToChat")).toMatchObject({ chatId, scriptId: held.id });
});
