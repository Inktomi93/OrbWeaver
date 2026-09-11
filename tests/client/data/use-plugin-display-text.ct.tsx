// CT: `usePluginDisplayText` — the CLIENT half of the plugin DISPLAY-transform seam (plugin-ui-plane #679 U6,
// seam 14) over the REAL tRPC path with a stubbed network.
//
// Two properties, and the first is the one the whole per-row design rests on:
//   1. BYTE-IDENTITY WHEN OFF — a viewer with no registered display transforms gets their own text back AND
//      makes zero `plugin.transformForDisplay` requests. That gate is what keeps a 200-row transcript from
//      becoming a 200-request storm, so it is asserted as a REQUEST COUNT, not merely as an unchanged string
//      (an unchanged string would also be produced by a broken round-trip).
//   2. THE ANNOTATION — with a registrant, the returned text replaces the input after one round-trip, and the
//      request carries exactly what the design says it carries (the row identity + the ALREADY-RENDERED text).
//
// The failure posture is pinned too: a REFUSED round-trip leaves the row reading exactly as it would have.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRecorder } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { PluginDisplayTextStory } from "./_ct-stories.tsx";

const SLOT = '[data-slot="plugin-display-text"]';
const INPUT_TEXT = "a rendered line";

test("no registered display transforms ⇒ the row's own text, and ZERO per-row requests", async ({ mount, page }) => {
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.listDisplayTransforms": () => [],
    // Deliberately FED but never expected: if the gate leaked, this would answer and the count below would
    // catch it as a request rather than as a wrong string.
    "plugin.transformForDisplay": () => ({ text: "SHOULD NOT BE CALLED" }),
  });

  await mount(<PluginDisplayTextStory text={INPUT_TEXT} />);

  await expect(page.locator(SLOT)).toHaveText(INPUT_TEXT);
  // Settle on the gate query itself before reading the count — otherwise a zero could just be "nothing has
  // happened yet", which is the un-failable shape.
  await expect.poll(() => recorder.count("plugin.listDisplayTransforms")).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): provably settled at read-time by the two barriers above — the row's SETTLED text has painted AND the gate query has answered, which is every event that could schedule the per-row read. A poll here would pass instantly against 0 and prove nothing.
  expect(recorder.count("plugin.transformForDisplay")).toBe(0);
});

test("a registered display transform ANNOTATES the row, and the request carries the row identity + rendered text", async ({ mount, page }) => {
  const seen: { chatId?: unknown; messageId?: unknown; text?: unknown }[] = [];
  await routeTrpc(page, {
    "plugin.listDisplayTransforms": () => [{ pluginId: "plugin_ct_oracle000000001", name: "furigana" }],
    "plugin.transformForDisplay": (input: unknown) => {
      seen.push(input as { chatId?: unknown; messageId?: unknown; text?: unknown });
      return { text: `${INPUT_TEXT} ✦` };
    },
  });

  await mount(<PluginDisplayTextStory text={INPUT_TEXT} />);

  // SETTLED state, not the in-flight flash: the annotated text is the arm the story script produces.
  await expect(page.locator(SLOT)).toHaveText(`${INPUT_TEXT} ✦`);
  expect(seen).toHaveLength(1);
  expect(seen[0]?.text).toBe(INPUT_TEXT);
  expect(seen[0]?.chatId).toBe("chat_ct_display0000000000000");
  expect(seen[0]?.messageId).toBe("msg_ct_display00000000000000");
});

test("a REFUSED round-trip degrades to the row's own text — never an error boundary, never a blank row", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.listDisplayTransforms": () => [{ pluginId: "plugin_ct_oracle000000001", name: "furigana" }],
    "plugin.transformForDisplay": () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "the guest blew up" }),
  });

  await mount(<PluginDisplayTextStory text={INPUT_TEXT} />);

  await expect(page.locator(SLOT)).toHaveText(INPUT_TEXT);
});
