// createEntityMutation CT — the canonical 4-phase optimistic flow + the lightweight variables-render
// mode (UI-Primitives §13.1; blueprint: UI-Lib-TanStack-Query.md §2/§3), exercised against a REAL
// `trpc.tag.createTag.mutationOptions()` + `trpc.tag.listTags.queryOptions()` pair (never a
// hand-mock — a mock mutationFn would hide the exact variance the factory's `context.client`
// callback-arg contract depends on). Four properties pinned:
//   1. cache-optimistic: onMutate writes the pending row into the `listTags` cache BEFORE the
//      network settles (cancelQueries → snapshot → setQueryData, all before mutationFn resolves).
//   2. rollback: a failed mutation reverts the cache to the pre-mutate snapshot (onError restores
//      from the RETURNED context, not a closure).
//   3. sticky error → reset: the error slot stays visible after a failure and clears on the NEXT
//      `mutate()` call (v5's sticky-mutation-error gotcha, the factory's own addition over the
//      official examples).
//   4. variables-mode: no cache write at all — a failed create surfaces the error + a `retry()`
//      affordance that re-fires the SAME failed variables, and a retried success clears it.
//
// The `listTags` responder below is STATEFUL (a real in-memory list, not a constant `[]`) — a
// constant responder would make `onSettled`'s ALWAYS-invalidate refetch erase the optimistic row on
// EVERY settle (success or fail), which would make "does the row survive to the real read" racy
// against "when did the assertion happen" instead of actually pinning reconciliation.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import {
  SectionEchoStory,
  SectionRefusalStory,
  TagCreateColdCacheStory,
  TagCreateOptimisticStory,
  TagCreateOverlapStory,
  TagCreateSameValueOverlapStory,
  TagCreateVariablesStory,
} from "./_ct-stories.tsx";

interface FixtureTag {
  readonly id: string;
  readonly name: string;
  readonly color: null;
  readonly color2: null;
  readonly source: null;
  readonly folderType: "NONE";
  readonly sortOrder: null;
  readonly isHiddenOnCard: false;
}

function makeTag(id: string, name: string): FixtureTag {
  return {
    id,
    name,
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
  };
}

test("cache-optimistic: the pending tag lands in the list before settle, then reconciles", async ({ mount, page }) => {
  const tags: FixtureTag[] = [];
  const trpc = await routeTrpc(page, {
    "tag.listTags": () => tags,
    "tag.createTag": (input: unknown) => {
      const created = makeTag("tag_real_1", (input as { input: { name: string } }).input.name);
      tags.push(created);
      return created;
    },
  });

  await mount(<TagCreateOptimisticStory />);
  await expect(page.getByTestId("tag-list").getByRole("listitem")).toHaveCount(0);

  await page.getByRole("button", { name: "create" }).click();

  // The optimistic write lands before/independent of the network settling — the created tag renders.
  await expect(page.getByTestId("tag-list")).toContainText("new-tag");
  await expect.poll(() => trpc.count("tag.createTag")).toBe(1);
  // onSettled invalidated `listTags` — a background refetch reconciles with server truth, and the
  // real (non-optimistic) row is STILL there (the fixture is stateful — this isn't a transient flash).
  await expect.poll(() => trpc.count("tag.listTags")).toBeGreaterThan(1);
  await expect(page.getByTestId("tag-list")).toContainText("new-tag");
});

test("rollback: a failed mutation reverts the optimistic row, surfacing the sticky error", async ({ mount, page }) => {
  const tags: FixtureTag[] = [];
  const trpc = await routeTrpc(page, {
    "tag.listTags": () => tags,
    "tag.createTag": () => trpcError({ message: "create failed" }),
  });

  await mount(<TagCreateOptimisticStory />);

  await page.getByRole("button", { name: "create" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("create failed");
  // The rollback: the optimistic row is gone, reverted to the pre-mutate (empty) snapshot — and it
  // STAYS gone after the settle-triggered refetch too (the fixture never gained a row on failure).
  await expect(page.getByTestId("tag-list")).not.toContainText("new-tag");
  await expect.poll(() => trpc.count("tag.createTag")).toBe(1);
});

test("an older optimistic failure cannot overwrite a newer successful cache value", async ({ mount, page }) => {
  await routeTrpc(page, { "tag.listTags": () => [] });

  await mount(<TagCreateOverlapStory />);
  await page.getByRole("button", { name: "older", exact: true }).click();
  await expect(page.getByTestId("overlap-tag-list")).toContainText("older");
  await page.getByRole("button", { name: "newer" }).click();
  await expect(page.getByTestId("overlap-tag-list")).toHaveText("newer");

  await page.getByRole("button", { name: "fail older" }).click();
  await expect(page.getByRole("alert")).toHaveText("older failed");
  await expect(page.getByTestId("overlap-tag-list")).toHaveText("newer");
});

test("a newer deep-equal success owns the cache even when structural sharing preserves the older reference", async ({ mount, page }) => {
  await routeTrpc(page, { "tag.listTags": () => [] });

  await mount(<TagCreateSameValueOverlapStory />);
  await page.getByRole("button", { name: "older", exact: true }).click();
  await expect(page.getByTestId("overlap-tag-list")).toHaveText("desired");
  await page.getByRole("button", { name: "newer" }).click();
  await expect(page.getByTestId("overlap-tag-list")).toHaveText("desired");

  await page.getByRole("button", { name: "fail older" }).click();
  await expect(page.getByRole("alert")).toHaveText("older failed");
  await expect(page.getByTestId("overlap-tag-list")).toHaveText("desired");
});

test("cold-cache rollback: a failed mutation against a never-fetched query REMOVES the phantom row", async ({ mount, page }) => {
  // No `listTags` responder + no reader in the story → that query is never fetched (COLD). The
  // optimistic write creates the cache entry; onError's snapshot is undefined. The old code did
  // setQueryData(key, undefined) (a v5 no-op) and the phantom row stuck; the fix removeQueries it.
  const trpc = await routeTrpc(page, {
    "tag.createTag": () => trpcError({ message: "cold create failed" }),
  });

  await mount(<TagCreateColdCacheStory />);

  await page.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("alert")).toContainText("cold create failed");

  // Read the cache directly (getQueryData never fetches; the unobserved query is never refetched).
  // Fixed: the poisoned entry is gone → `absent`. Old bug: the phantom optimistic row persists.
  await page.getByRole("button", { name: "read-cache" }).click();
  await expect(page.getByTestId("cache-state")).toHaveText("absent");
  await expect.poll(() => trpc.count("tag.createTag")).toBe(1);
  await expect.poll(() => trpc.count("tag.listTags")).toBe(0);
});

test("sticky error clears on the NEXT mutate — a retried success removes the banner", async ({ mount, page }) => {
  const tags: FixtureTag[] = [];
  let call = 0;
  await routeTrpc(page, {
    "tag.listTags": () => tags,
    "tag.createTag": () => {
      if (call++ === 0) {
        return trpcError({ message: "first attempt fails" });
      }
      const created = makeTag("tag_real_2", "new-tag");
      tags.push(created);
      return created;
    },
  });

  await mount(<TagCreateOptimisticStory />);

  await page.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("alert")).toContainText("first attempt fails");

  // Calling mutate() again (v5 native reset-on-next-mutate) clears the sticky error slot.
  await page.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("tag-list")).toContainText("new-tag");
});

test("variables-mode: a failed create surfaces error + retry; retry re-fires the SAME variables", async ({ mount, page }) => {
  const tags: FixtureTag[] = [];
  let call = 0;
  const trpc = await routeTrpc(page, {
    "tag.listTags": () => tags,
    "tag.createTag": (input: unknown) => {
      if (call++ === 0) {
        return trpcError({ message: "variables attempt failed" });
      }
      const created = makeTag("tag_real_3", (input as { input: { name: string } }).input.name);
      tags.push(created);
      return created;
    },
  });

  await mount(<TagCreateVariablesStory />);

  await page.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("alert")).toContainText("variables attempt failed");

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Both attempts carried the identical variables — retry() re-fires `mutation.variables` verbatim.
  await expect.poll(() => trpc.count("tag.createTag")).toBe(2);
  await expect.poll(() => trpc.inputs("tag.createTag")).toEqual([{ input: { name: "variables-tag" } }, { input: { name: "variables-tag" } }]);
});

// `echo` (the 2026-08-02 stuck-chip incident): a busDriven write's own response IS the authoritative row
// for the read it just made stale. Without this seam the reader keeps rendering the PRE-write value until
// a bus tick refetches — and a surface that computes "is this my live connection?" from that read calls a
// persisted selection unsaved for exactly as long as the tick is missing. The read is fetched ONCE here
// (the mount); the post-save value can therefore only have come from the write's response.
test("echo: the write's own response seeds the read — no refetch, no invalidate", async ({ mount, page }) => {
  let stored: Record<string, unknown> = { chat: { source: "openrouter" } };
  const view = (): unknown => ({
    userId: "user_ct_echo",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, routing: { roleDefaults: stored } },
    updatedAt: 0,
  });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => view(),
    "settings.updateUserSettingsSection": (input: unknown) => {
      stored = (input as { readonly patch: { readonly roleDefaults: Record<string, unknown> } }).patch.roleDefaults;
      return view();
    },
  });

  await mount(<SectionEchoStory />);
  await expect(page.getByTestId("chat-source")).toHaveText("openrouter");

  await page.getByRole("button", { name: "save" }).click();
  await expect(page.getByTestId("chat-source")).toHaveText("vllm");

  await expect.poll(() => trpc.count("settings.updateUserSettingsSection")).toBe(1);
  // ONESHOT-OK: a belt over the DOM pin above — this story wires NO refetch path at all (the mutation is busDriven, so its settle invalidates nothing, and a CT has no bus), so the read count cannot move.
  expect(trpc.count("settings.getUserSettings")).toBe(1);
});

// `refusal` (EDITSNAP-OK): the THIRD outcome class. A verb whose contract promises a legible refusal answers
// `{ok:false, reason}` on a 200 — the mutation RESOLVES, so `errorToast` cannot fire, `onError` never runs
// and `mutation.error` stays null. Every rpg hand-door call site is fire-and-forget (they reconcile through
// `invalidates`), so before this arm a refusal was total silence: a five-plane scene write was lost to one
// over-length label with the panel simply repainting its pre-write state.
test("refusal: an errors-as-data refusal TOASTS the server's reason and does NOT seed the echo", async ({ mount, page }) => {
  const stored: Record<string, unknown> = { chat: { source: "openrouter" } };
  const view = (): unknown => ({
    userId: "user_ct_refusal",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, routing: { roleDefaults: stored } },
    updatedAt: 0,
  });
  await routeTrpc(page, {
    "settings.getUserSettings": () => view(),
    // A 200 carrying a REFUSAL — not a transport error. The write never happened.
    "settings.updateUserSettingsSection": () => ({ ok: false, reason: "label exceeds 40 characters" }),
  });

  await mount(<SectionRefusalStory />);
  await expect(page.getByTestId("chat-source")).toHaveText("openrouter");

  await page.getByRole("button", { name: "save" }).click();

  // The host is TOLD, with the server's own reason intact…
  await expect(page.getByTestId("notified")).toHaveText("refused — label exceeds 40 characters");
  // …and the refused response is NOT authoritative for the read it would otherwise seed: the reader still
  // shows the true stored value, never the intent the server declined.
  await expect(page.getByTestId("chat-source")).toHaveText("openrouter");
});
