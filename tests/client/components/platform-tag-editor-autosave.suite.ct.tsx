import type { StreamFrame } from "@orb/contracts/stream";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { holdServed, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { TagEditorStory } from "./_tag-editor-stories.tsx";

const STORY = "tests/client/components/_tag-editor-stories/TagEditorStory";
const READS = ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage"] as const;

async function nextTagEvent(events: AsyncIterable<UserBusEvent>, stop: AbortSignal): Promise<readonly StreamFrame[]> {
  try {
    for await (const event of events) {
      if (event.type === "tagsChanged") {
        return [{ channel: "user", event }];
      }
    }
    return [];
  } catch (error) {
    if (!stop.aborted) {
      throw error;
    }
    return [];
  }
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900, hasTouch: false },
  { name: "phone", width: 390, height: 844, hasTouch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });
    test("rename and behavior changes preserve the failed draft and retry through the real tag verb", async ({ page, mount }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Authored tag" } });
      let failing = true;
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["tag.updateTag"], () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
        "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
        "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
      });
      await routeOrbSocket(page);
      await mount<typeof TagEditorStory>(STORY, { tagId: tag.id });
      const name = page.getByRole("textbox", { name: "Name", exact: true });
      await name.fill("Pending rename");
      await page.getByRole("switch", { name: "Hide chip on cards", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Save failed" })).toBeVisible();
      await expect(name).toHaveValue("Pending rename");
      await expect(page.getByRole("switch", { name: "Hide chip on cards", exact: true })).toBeChecked();
      expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe(tag.name);

      failing = false;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(page.getByRole("status", { exact: true }).filter({ hasText: /^Saved$/u })).toBeVisible();
      expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)).toMatchObject({ name: "Pending rename", isHiddenOnCard: true });
      await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    });

    for (const mode of ["clean-external", "dirty-external", "own"] as const) {
      test(`the real tag event respects the ${mode} editor session`, async ({ page, mount }) => {
        const dirty = mode !== "clean-external";
        await using root = await createServerHarness({ startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        const tag = await caller.tag.createTag({ input: { name: "Original tag" } });
        const pending = holdServed();
        await routeTrpc(page, {
          ...serveCorpusProcedures(caller, READS),
          ...serveCorpusProcedures(caller, ["tag.updateTag"], () => pending),
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
          pending.release();
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
              return await nextTagEvent(events, stop.signal);
            } finally {
              joined.resolve();
            }
          },
        });
        const component = await mount<typeof TagEditorStory>(STORY, { tagId: tag.id });
        const name = page.getByRole("textbox", { name: "Name", exact: true });
        await expect(name).toHaveValue(tag.name);
        await listening.promise;
        if (dirty) {
          await name.fill("My pending rename");
          await name.blur();
          await pending.requested;
        }
        if (mode === "own") {
          pending.release();
        } else {
          await caller.tag.updateTag({ tagId: tag.id, patch: { name: "External rename" } });
        }
        await expect(page.getByRole("heading", { name: mode === "own" ? "My pending rename" : "External rename", exact: true })).toBeVisible();
        await expect(name).toHaveValue(dirty ? "My pending rename" : "External rename");
        pending.release();
        await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
        expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe(dirty ? "My pending rename" : "External rename");
        await component.unmount();
        await joined.promise;
      });
    }
  });
}
