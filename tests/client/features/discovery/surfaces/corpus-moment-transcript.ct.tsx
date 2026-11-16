// A search result's transcript window draws each message's prose and prints no stylesheet a message holds. Production
// entry: the Corpus content pane with a captured search passage opened, over a real server's message window.
// @subject packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx

import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CorpusDestinationStory } from "./_corpus-destination-stories.tsx";

const DESTINATION_STORY = "tests/client/features/discovery/surfaces/_corpus-destination-stories/CorpusDestinationStory";
const CSS_MARK = "corpus-moment-mark";
const PROSE = "The ledger keeps its witnesses.";

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a message in the source window that holds a stylesheet draws its prose and none of its CSS", async ({ corpus, mount, page }) => {
  const discover = corpus.searchLibrary?.reads.discover.output;
  const hit = discover?.over === "discover" ? discover.hits[0] : undefined;
  const segment = hit?.segments[0];
  const messageId = segment?.source.messageStartId ?? null;
  if (hit === undefined || segment === undefined || messageId === null) {
    throw new Error("The corpus search capture has no passage with a first message");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.chat.editMessage({
    chatId: segment.chatId,
    messageId,
    content: `<style>.${CSS_MARK}{color:red}\n\n.${CSS_MARK} b{margin:0}</style>${PROSE}`,
    timeZone: UTC_TIME_ZONE,
  });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...SHELL_MOUNT_PROCEDURES,
      "chat.getMessageWindow",
      "discovery.similarChats",
      "discovery.swipeHotspots",
    ]),
  );
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, {
    open: "artifact",
    destination: { kind: "scene", hit: segment, characterName: hit.name, rank: null },
  });
  await expect(page.getByText(PROSE, { exact: false })).toBeVisible();
  expect((await page.locator("body").textContent()) ?? "").not.toContain(CSS_MARK);
});
