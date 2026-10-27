import type { StreamFrame } from "@orb/contracts/stream";
import { normalizeTagName } from "@orb/kit/tag";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { holdServed, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { TagEditorChipStory } from "./_tag-editor-stories.tsx";

const STORY = "tests/client/components/_tag-editor-stories/TagEditorChipStory";
const READS = ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage"] as const;
const STREAM_ROUTES: TrpcRoutes<"stream.attach" | "stream.detach"> = {
  "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
};

async function expectMerged(page: Page, confirm: Locator, release: () => void): Promise<void> {
  await expect(page.getByText("This tag was deleted.", { exact: true })).toBeVisible();
  const response = page.waitForResponse((candidate) => candidate.url().includes("tag.mergeTags"));
  release();
  await (await response).finished();
  await expect(confirm).toHaveCount(0);
}

async function expectFailedMerge(page: Page, confirm: Locator, resumeWrites: () => void): Promise<void> {
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByText("Couldn't merge the tags.", { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Failed source draft");
  resumeWrites();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
}

async function forwardTagEvent(page: Page, root: ServerTestHarness): Promise<AsyncDisposable & { readonly listening: Promise<void> }> {
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  await routeOrbSocket(page, {
    awaitAttaches: 1,
    frames: async (signal): Promise<readonly StreamFrame[]> => {
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
  return {
    listening: listening.promise,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      stop.abort();
      if (started) {
        await joined.promise;
      }
    },
  };
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900, hasTouch: false },
  { name: "phone", width: 390, height: 844, hasTouch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });

    test("an early own event and late response canonicalize the saved name without another write", async ({ page, mount }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Original tag" } });
      const held = trpcHold<"tag.updateTag">();
      const release = Promise.withResolvers<void>();
      await using cleanup = new AsyncDisposableStack();
      cleanup.defer(() => release.resolve());
      const recorder = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...STREAM_ROUTES,
        "tag.updateTag": (input) => {
          void caller.tag.updateTag(input).then(
            async (row): Promise<void> => {
              await release.promise;
              held.release(row);
            },
            (error: Error): void => held.release(trpcError({ message: error.message })),
          );
          return held;
        },
      });
      await using events = await forwardTagEvent(page, root);
      const component = await mount<typeof TagEditorChipStory>(STORY, { tag });
      await page.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true }).click();
      const name = page.getByRole("textbox", { name: "Name", exact: true });
      await events.listening;
      await name.fill("");
      await name.pressSequentially("Two  Words");
      await expect(name).toHaveValue("Two  Words");
      const canonical = normalizeTagName("Two  Words");
      await expect(page.getByRole("heading", { name: canonical, exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: /^Saving/u })).toBeVisible();
      release.resolve();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
      await expect(name).toHaveValue(canonical);
      await page.getByRole("button", { name: "Close tag editor", exact: true }).click();
      await component.unmount();
      expect(recorder.inputs("tag.updateTag")).toHaveLength(1);
      expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe(canonical);
    });

    for (const merging of [true, false]) {
      test(`${merging ? "merge" : "failed merge"} preserves the writer lifecycle over a failed draft`, async ({ page, mount }) => {
        await using root = await createServerHarness({ startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        const tag = await caller.tag.createTag({ input: { name: "Source tag" } });
        const target = await caller.tag.createTag({ input: { name: "Target tag" } });
        const response = trpcHold<"tag.mergeTags">();
        const release = Promise.withResolvers<void>();
        await using cleanup = new AsyncDisposableStack();
        cleanup.defer(() => release.resolve());
        let failUpdates = true;
        const recorder = await routeTrpc(page, {
          ...serveCorpusProcedures(caller, READS),
          ...serveCorpusProcedures(caller, ["tag.updateTag"], () => (failUpdates ? trpcError() : undefined)),
          ...STREAM_ROUTES,
          "tag.mergeTags": (input) => {
            if (!merging) {
              return trpcError({ message: "Merge transport refused" });
            }
            void caller.tag.mergeTags(input).then(
              async (): Promise<void> => {
                await release.promise;
                response.release(null);
              },
              (error: Error): void => response.release(trpcError({ message: error.message })),
            );
            return response;
          },
        });
        await using events = await forwardTagEvent(page, root);
        const component = await mount<typeof TagEditorChipStory>(STORY, { tag });
        await page.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true }).click();
        const name = page.getByRole("textbox", { name: "Name", exact: true });
        await events.listening;
        await name.fill("Failed source draft");
        await expect(page.getByRole("alert").filter({ hasText: "Save failed" })).toBeVisible();
        await page.getByRole("button", { name: "Merge into…", exact: true }).click();
        await page.getByRole("combobox", { name: "Merge target tag", exact: true }).click();
        await page.getByRole("option", { name: target.name, exact: true }).click();
        const confirm = page.getByRole("group", { name: `Merge "${tag.name}" into another tag`, exact: true });
        await confirm.getByRole("button", { name: "Merge", exact: true }).click();
        if (merging) {
          await expectMerged(page, confirm, release.resolve);
        } else {
          await expectFailedMerge(page, confirm, (): void => {
            failUpdates = false;
          });
        }
        await component.unmount();
        expect(recorder.inputs("tag.updateTag")).toHaveLength(merging ? 1 : 2);
        const tags = await caller.tag.listTagsWithUsage();
        expect(tags.some((row) => row.id === target.id)).toBe(true);
        expect(tags.find((row) => row.id === tag.id)?.name).toBe(merging ? undefined : "Failed source draft");
      });
    }

    test("ordinary dismiss still flushes a failed pending draft", async ({ page, mount }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Dismiss tag" } });
      let failing = true;
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["tag.updateTag"], () => (failing ? trpcError() : undefined)),
        ...STREAM_ROUTES,
      });
      await routeOrbSocket(page);
      await mount<typeof TagEditorChipStory>(STORY, { tag });
      await page.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true }).click();
      await page.getByRole("textbox", { name: "Name", exact: true }).fill("Flushed draft");
      await expect(page.getByRole("alert").filter({ hasText: "Save failed" })).toBeVisible();
      failing = false;
      await page.getByRole("button", { name: "Close tag editor", exact: true }).click();
      await expect.poll(async () => (await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe("Flushed draft");
    });

    test("dismissal during a held merge preserves the teardown write when that merge fails", async ({ page, mount }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Surviving source" } });
      const target = await caller.tag.createTag({ input: { name: "Unchanged target" } });
      const merging = holdServed();
      await using cleanup = new AsyncDisposableStack();
      cleanup.defer(() => merging.fail());
      let failing = true;
      const recorder = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["tag.updateTag"], () => (failing ? trpcError() : undefined)),
        ...serveCorpusProcedures(caller, ["tag.mergeTags"], () => merging),
        ...STREAM_ROUTES,
      });
      await routeOrbSocket(page);
      const component = await mount<typeof TagEditorChipStory>(STORY, { tag });
      await page.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true }).click();
      await page.getByRole("textbox", { name: "Name", exact: true }).fill("Surviving dismissed draft");
      await expect(page.getByRole("alert").filter({ hasText: "Save failed" })).toBeVisible();
      await page.getByRole("button", { name: "Merge into…", exact: true }).click();
      await page.getByRole("combobox", { name: "Merge target tag", exact: true }).click();
      await page.getByRole("option", { name: target.name, exact: true }).click();
      const confirm = page.getByRole("group", { name: `Merge "${tag.name}" into another tag`, exact: true });
      await confirm.getByRole("button", { name: "Merge", exact: true }).click();
      await merging.requested;
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      failing = false;
      await page.getByRole("button", { name: "Close tag editor", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
      merging.fail();
      await expect.poll(async () => (await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe("Surviving dismissed draft");
      await component.unmount();
      expect(recorder.inputs("tag.updateTag")).toHaveLength(2);
      expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === target.id)?.name).toBe(target.name);
    });

    test("inline merge Cancel and Escape return focus without closing the chip editor", async ({ page, mount }) => {
      const press = (target: Locator): Promise<void> => (viewport.hasTouch ? target.tap() : target.click());
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Cancel source" } });
      await caller.tag.createTag({ input: { name: "Cancel target" } });
      await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...STREAM_ROUTES });
      await routeOrbSocket(page);
      await mount<typeof TagEditorChipStory>(STORY, { tag });
      const edit = page.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true });
      await press(edit);
      const trigger = page.getByRole("button", { name: "Merge into…", exact: true });
      await press(trigger);
      const group = page.getByRole("group", { name: `Merge "${tag.name}" into another tag`, exact: true });
      await expect(page.getByRole("combobox", { name: "Merge target tag", exact: true })).toBeFocused();
      await press(group.getByRole("button", { name: "Cancel", exact: true }));
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(group).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(group).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(tag.name);
      await page.keyboard.press("Escape");
      await expect(edit).toBeFocused();
    });
  });
}
