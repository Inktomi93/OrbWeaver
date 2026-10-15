import { blobUrl } from "@orb/contracts/assets";
import { characterDetailSchema } from "@orb/contracts/character";
import { createCorpusHarness } from "@orb/testkit/node/corpus.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import type { TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { CT_CACHE_DIR_ENV } from "@orb/tooling/floor/testing/ct-run-slot";
import { CharacterExampleLifetimeStory } from "./_example-lifetime-stories.tsx";

test.use({ trace: "on" });

test("example preview retains native link consent for identical reads and drops it when the transcript is replaced", async ({
  corpus,
  corpusMedia,
  mount,
  page,
}, testInfo) => {
  const library = corpus.reads["character.list"][0]?.output;
  const character = library?.items.find((item) => item.avatarHash === null);
  const hashes = library?.items.flatMap((item) => (item.avatarHash === null ? [] : [item.avatarHash]));
  if (character === undefined || hashes?.[0] === undefined || hashes[1] === undefined) {
    throw new Error("Committed character library must include a bare card and two real images");
  }
  await using root = await createCorpusHarness(undefined, { clientDistDir: processEnvValue(CT_CACHE_DIR_ENV) });
  const caller = await root.internalCallerFor(root.ownerId);
  const characterId = characterDetailSchema.shape.id.parse(character.id);
  const firstText = `<START>\n![Example witness](${blobUrl(hashes[0])})\n[Read image](${blobUrl(hashes[0])})`;
  let detail: TrpcWireOutput<"character.get"> = await caller.character.update({ characterId, input: { exampleMessages: firstText } });
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  const activePresetId = settings.config.seeds.defaultPresetId;
  if (activePresetId === null) {
    throw new Error("Committed owner has no active preset");
  }
  const preset = await caller.preset.get({ id: activePresetId });
  const chats = await caller.chat.listChats({ characterId, limit: 1 });
  const scripts = await caller.regex.listForCharacter({ characterId });
  const pendingTags = await caller.tag.listPendingSuggestions({ characterId });
  const trpc = await routeTrpc(page, {
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "character.get": () => detail,
    "preset.get": () => preset,
    "chat.listChats": () => chats,
    "regex.listForCharacter": () => scripts,
    "tag.listPendingSuggestions": () => pendingTags,
  });
  await corpusMedia();
  const component = await mount(<CharacterExampleLifetimeStory characterId={characterId} />);
  await page.getByRole("button", { name: /Example messages/ }).click();
  const image = page.getByRole("img", { name: "Example witness", exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Read image", exact: true }).click();
  const consent = page.locator('[data-streamdown="link-safety-modal"]');
  await expect(consent).toBeVisible();
  await component.update(<CharacterExampleLifetimeStory characterId={characterId} revision={1} />);
  await expect(page.getByRole("status", { name: "Read revision", exact: true })).toHaveText("1");
  await expect(consent).toBeVisible();
  const before = testInfo.outputPath("unchanged-example-consent.png");
  await page.screenshot({ path: before });
  await testInfo.attach("unchanged-example-consent", { path: before });
  detail = await caller.character.update({
    characterId,
    input: { exampleMessages: `<START>\n![Replacement witness](${blobUrl(hashes[1])})\n[Read replacement](${blobUrl(hashes[1])})` },
  });
  await component.update(<CharacterExampleLifetimeStory characterId={characterId} revision={2} />);
  await expect(page.getByRole("status", { name: "Read revision", exact: true })).toHaveText("2");
  await expect(page.getByRole("button", { name: "Read replacement", exact: true })).toBeVisible();
  await expect(consent).toHaveCount(0);
  const replacement = page.getByRole("img", { name: "Replacement witness", exact: true });
  expect(
    await replacement.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Read replacement", exact: true }).click();
  await expect(consent).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(consent).toHaveCount(0);
  const after = testInfo.outputPath("replacement-example.png");
  await page.screenshot({ path: after });
  await testInfo.attach("replacement-example", { path: after });
  expect(trpc.unstubbed()).toEqual([]);
});
