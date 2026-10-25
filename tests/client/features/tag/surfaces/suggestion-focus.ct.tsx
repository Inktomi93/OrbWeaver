import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { SuggestionFocusStory } from "./_suggestion-focus-stories.tsx";

for (const remaining of [false, true]) {
  test(`applying a suggestion focuses ${remaining ? "the next Apply" : "the empty inbox"} after the real user event`, async ({ page, mount }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    for (const suggestion of await caller.tag.listPendingSuggestions()) {
      await caller.tag.attachTag({ tagId: suggestion.id, targetType: "character", targetId: suggestion.characterId, status: "accepted" });
    }
    const character = (await caller.character.list({ limit: 1 })).items[0];
    if (character === undefined) {
      throw new Error("The corpus has no character");
    }
    for (const name of remaining ? ["Focus first", "Focus next"] : ["Focus first"]) {
      const tag = await caller.tag.createTag({ input: { name } });
      await caller.tag.attachTag({ tagId: tag.id, targetType: "character", targetId: character.id, status: "pending" });
    }
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage", "tag.listPendingSuggestions", "tag.attachTag"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    const listening = Promise.withResolvers<void>();
    const joined = Promise.withResolvers<void>();
    const stop = new AbortController();
    let started = false;
    await using subscription = new AsyncDisposableStack();
    subscription.defer(async () => {
      stop.abort();
      if (started) {
        await joined.promise;
      }
    });
    await routeOrbSocket(page, {
      awaitAttaches: 1,
      frames: async (signal) => {
        started = true;
        const events = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, AbortSignal.any([signal, stop.signal]));
        listening.resolve();
        try {
          for await (const event of events) {
            if (event.type === "tagsChanged") {
              return [{ channel: "user", event }];
            }
          }
          return [];
        } catch (error) {
          if (!stop.signal.aborted) {
            throw error;
          }
          return [];
        } finally {
          joined.resolve();
        }
      },
    });
    const component = await mount<typeof SuggestionFocusStory>("tests/client/features/tag/surfaces/_suggestion-focus-stories/SuggestionFocusStory", {});
    const apply = page.locator('[data-slot="label-review-apply"]');
    await expect(apply).toHaveCount(remaining ? 2 : 1);
    await listening.promise;
    await apply.first().click();
    const target = remaining ? apply : page.getByRole("status").filter({ hasText: "No suggested tags awaiting review." });
    await expect(apply).toHaveCount(remaining ? 1 : 0);
    await expect(target).toBeFocused();
    await component.unmount();
    await joined.promise;
  });
}
