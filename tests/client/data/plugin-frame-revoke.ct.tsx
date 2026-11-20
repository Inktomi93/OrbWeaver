// Leaving a plugin surface revokes its minted frame handle with a request that survives the page going away, so a
// navigation never logs an aborted DELETE; the mint POST beside it is the positive control for the recorder.
import { PLUGIN_FRAME_ROUTE, pluginFrameUrl } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";
import { UNMOUNT_FRAME_NAME } from "./_plugin-frame-src-names.ts";
import type { PluginFrameSrcStory } from "./_plugin-frame-src-stories.tsx";

const STORY = "tests/client/data/_plugin-frame-src-stories/PluginFrameSrcStory";
const HANDLE_ID = "witness-handle";
const EXPIRES_IN_MS = 60_000;
const RECORDER = "__frameFetches";
const recordedSchema = z.array(z.strictObject({ method: z.string(), keepalive: z.boolean() }));

test("unmounting a plugin frame revokes its handle with a keepalive DELETE", async ({ page, mount }) => {
  await using root = await createServerHarness({ startJobs: false });
  const handleUrl = pluginFrameUrl(HANDLE_ID);
  await page.addInitScript((recorder): void => {
    const record: { method: string; keepalive: boolean }[] = [];
    Reflect.set(globalThis, recorder, record);
    const real = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init): Promise<Response> => {
      record.push({ method: init?.method ?? "GET", keepalive: init?.keepalive === true });
      return real(input, init);
    };
  }, RECORDER);
  await page.route(`**${PLUGIN_FRAME_ROUTE}{,/**}`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: handleUrl, expiresInMs: EXPIRES_IN_MS }) });
      return;
    }
    await route.fulfill({ status: 204 });
  });
  await mount<typeof PluginFrameSrcStory>(STORY, { pluginId: root.idSource.typeId(ID_PREFIX.plugin) });
  await expect(page.getByRole("status")).toHaveText(handleUrl);

  await page.getByRole("button", { name: UNMOUNT_FRAME_NAME, exact: true }).click();
  const recorded = async (): Promise<z.infer<typeof recordedSchema>> =>
    recordedSchema.parse(JSON.parse(await page.evaluate((recorder): string => JSON.stringify(Reflect.get(globalThis, recorder)), RECORDER)));
  await expect.poll(recorded).toContainEqual({ method: "DELETE", keepalive: true });
  expect(await recorded()).toContainEqual({ method: "POST", keepalive: false });
});
