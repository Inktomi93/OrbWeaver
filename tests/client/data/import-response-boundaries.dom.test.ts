// @subject packages/client/src/data/import-bundle.ts
// @subject packages/client/src/data/import-tree.ts
// @subject packages/client/src/data/import-chats.ts
// @subject packages/client/src/data/restore-card-lorebook.ts
import { importBundle, importChats, importTree, restoreCardLorebook } from "@orb/client/data";
import { importStartedSchema } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";
import { z } from "zod";

function upload(): File {
  return new File(["fixture"], "fixture.json", { type: "application/json" });
}

for (const [name, read] of [
  ["bundle", importBundle],
  ["tree", (file: File): ReturnType<typeof importTree> => importTree([file])],
] as const) {
  test(`accepted ${name} responses refuse an invalid workload identity before returning a subscription handle`, async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(Response.json({ workloadId: "invalid" }, { status: 202 }))),
    );
    await expect(read(upload())).rejects.toBeInstanceOf(z.ZodError);
  });
}

test("chat import refuses malformed per-file failures instead of returning an apparently accepted batch", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ imported: [], failed: [{ filename: "bad.jsonl", error: false }], memoryScope: null })));
  await expect(importChats([upload()])).rejects.toBeInstanceOf(z.ZodError);
});

test("the restore door parses its 400 refusal as data but refuses an unreadable refusal body", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: false, error: "No owned card matches" }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ ok: false, error: 42 }, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  await expect(restoreCardLorebook(upload())).resolves.toEqual({ ok: false, error: "No owned card matches" });
  await expect(restoreCardLorebook(upload())).rejects.toBeInstanceOf(z.ZodError);
});

test("valid workload-backed import responses still return the server's real workload handle", async () => {
  const started = importStartedSchema.parse({ workloadId: mintTypeId(ID_PREFIX.workload) });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(Response.json(started, { status: 202 }))),
  );
  await expect(importBundle(upload())).resolves.toEqual(started);
  await expect(importTree([upload()])).resolves.toEqual(started);
});
