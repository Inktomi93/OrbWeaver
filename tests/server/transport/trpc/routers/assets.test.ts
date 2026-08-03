// transport/trpc/routers/assets — the owned-asset + gallery surface. Proves: the router is registered on
// the appRouter, authedProcedure rejects anon, and the query verbs delegate to the injected service verb
// with the resolved Principal + the validated input (the same thin-driver contract the other routers hold).
// The mutation verbs (add/remove) are structurally identical authedProcedures; their behavior is covered by
// the domain slice tests.

import type { AssetsService } from "@orb/server/domain/assets";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

describe("assets router", () => {
  test("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).assets.listOwned({ limit: 20 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("listOwned delegates to the verb with the Principal + input", async () => {
    const listOwned = vi.fn<AssetsService["listOwned"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listOwned } } });
    await caller(ctx).assets.listOwned({ limit: 20, kind: "gallery" });
    expect(listOwned).toHaveBeenCalledWith({ principal: ctx.auth, limit: 20, kind: "gallery" });
  });

  test("listGallery delegates to the verb with the Principal + input", async () => {
    const listGallery = vi.fn<AssetsService["listGallery"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listGallery } } });
    await caller(ctx).assets.listGallery({ limit: 20 });
    expect(listGallery).toHaveBeenCalledWith({ principal: ctx.auth, limit: 20 });
  });
});
