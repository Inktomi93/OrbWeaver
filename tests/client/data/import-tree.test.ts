// data/import-tree — the folder-import POST helper. Pins: the request shape (POST /api/import/tree as
// multipart with the CSRF header, each part's filename carrying the file's webkitRelativePath so the server
// can reconstruct the tree), that a 202 `{ workloadId }` is returned, a non-OK response throws with the
// server's message, and that `relativePathOf` prefers webkitRelativePath and falls back to the bare name.
// `fetch` is stubbed at the global boundary (the import-bundle / upload-asset precedent), never a hand-mock.

// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less node typecheck:graph program (the 2026-06-28 dom-lib incident).
import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, vi } from "vitest";
import { importTree, relativePathOf } from "../../../packages/client/src/data/import-tree";
import { expect, test } from "../../support/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A File whose read-only `webkitRelativePath` is set (as a directory-picked browser File carries it). */
function pickedFile(relPath: string, bytes = "x"): File {
  const file = new File([bytes], relPath.split("/").at(-1) ?? relPath);
  Object.defineProperty(file, "webkitRelativePath", { value: relPath, configurable: true });
  return file;
}

test("relativePathOf prefers webkitRelativePath, falls back to the bare name", () => {
  expect(relativePathOf(pickedFile("default-user/characters/Aria.png"))).toBe(
    "default-user/characters/Aria.png",
  );
  expect(relativePathOf(new File(["x"], "loose.png"))).toBe("loose.png");
});

test("POSTs multipart with each part's relative path as its filename + the CSRF header, returns the id", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(
      new Response(JSON.stringify({ workloadId: "workload_ct_1" }), { status: 202 }),
    );
  });

  const files = [pickedFile("backup/characters/Aria.png"), pickedFile("backup/personas/me.json")];
  const result = await importTree(files);

  expect(captured?.url).toBe("/api/import/tree");
  expect(captured?.init.method).toBe("POST");
  const headers = captured?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  // The part filenames carry the relative paths the server sanitizes + reconstructs.
  const form = captured?.init.body as FormData;
  const names = form.getAll("file").map((f) => (f as File).name);
  expect(names).toEqual(["backup/characters/Aria.png", "backup/personas/me.json"]);
  expect(result.workloadId).toBe("workload_ct_1");
});

test("throws with the server message on a non-OK response (e.g. the 400 unrecognized layout)", async () => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "unrecognized library layout (found: notes)" }), {
        status: 400,
        statusText: "Bad Request",
      }),
    ),
  );
  await expect(importTree([pickedFile("wrap/notes/todo.txt")])).rejects.toThrow("unrecognized");
});
