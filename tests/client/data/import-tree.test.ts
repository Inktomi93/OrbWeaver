// data/import-tree — the folder-import POST helper. Pins: the request shape (POST /api/import/tree as
// multipart with the CSRF header, each part's filename carrying the file's webkitRelativePath so the server
// can reconstruct the tree), that a 202 `{ workloadId }` is returned, a non-OK response throws with the
// server's message, and that `relativePathOf` prefers webkitRelativePath and falls back to the bare name.
// `fetch` is stubbed at the global boundary (the import-bundle / upload-asset precedent), never a hand-mock.

// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less node typecheck:graph program (the 2026-06-28 dom-lib incident).
import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, vi } from "vitest";
import { importTree, relativePathOf, reviewTreePersonas } from "#client/data/import-tree.ts";
import { expect, test } from "../../support/fixtures.ts";

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
  expect(relativePathOf(pickedFile("default-user/characters/Aria.png"))).toBe("default-user/characters/Aria.png");
  expect(relativePathOf(new File(["x"], "loose.png"))).toBe("loose.png");
});

test("POSTs multipart with each part's relative path as its filename + the CSRF header, returns the id", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ workloadId: "workload_ct_1" }), { status: 202 }));
  });

  const files = [pickedFile("backup/characters/Aria.png"), pickedFile("backup/personas/me.json")];
  const result = await importTree(files);

  expect(captured?.url).toBe("/api/import/tree");
  expect(captured?.init.method).toBe("POST");
  // @orb-waive no-test-fabrication(Record<string, string>): baselined when the gate widened to value casts; burn-down item 906.
  const headers = captured?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  // The part filenames carry the relative paths the server sanitizes + reconstructs.
  // @orb-waive no-test-fabrication(FormData): baselined when the gate widened to value casts; burn-down item 906.
  const form = captured?.init.body as FormData;
  // @orb-waive no-test-fabrication(File): baselined when the gate widened to value casts; burn-down item 906.
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

// ── secrets.json never leaves the browser, from the POST helper itself ───────────────────────────────
test("importTree drops a secrets.json part whatever the caller passed", async () => {
  let form: FormData | undefined;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    // @orb-waive no-test-fabrication(FormData): baselined when the gate widened to value casts; burn-down item 906.
    form = init.body as FormData;
    return Promise.resolve(new Response(JSON.stringify({ workloadId: "workload_ct_2" }), { status: 202 }));
  });

  await importTree([
    pickedFile("default-user/secrets.json", '{"api_key":"never"}'),
    pickedFile("default-user/characters/Aria.png"),
    pickedFile("default-user/settings.json"),
  ]);

  // @orb-waive no-test-fabrication(File): baselined when the gate widened to value casts; burn-down item 906.
  const names = form?.getAll("file").map((f) => (f as File).name) ?? [];
  expect(names).toEqual(["default-user/characters/Aria.png", "default-user/settings.json"]);
});

// ── the persona review ─────────────────────────────────────────────────────────────────────────────
test("importTree carries each persona collision choice as its own multipart value", async () => {
  let form: FormData | undefined;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    // @orb-waive no-test-fabrication(FormData): baselined when the gate widened to value casts; burn-down item 906.
    form = init.body as FormData;
    return Promise.resolve(new Response(JSON.stringify({ workloadId: "workload_ct_3" }), { status: 202 }));
  });

  await importTree([pickedFile("default-user/settings.json")], { nate: "keep-both", eve: "merge" });

  expect(form?.getAll("personaCollision")).toEqual(["keep-both:nate", "merge:eve"]);
});

test("reviewTreePersonas posts ONLY settings.json and User Avatars parts, and returns the server's collisions", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const collision = { key: "nate", name: "Nate", existingDescription: "a", incomingDescription: "b", differs: ["description"], keepBothName: "Nate 2" };
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ collisions: [collision] }), { status: 200 }));
  });

  const collisions = await reviewTreePersonas([
    pickedFile("default-user/settings.json"),
    pickedFile("default-user/User Avatars/nate.png"),
    pickedFile("default-user/characters/Aria.png"),
    pickedFile("default-user/chats/Aria/2024.jsonl"),
  ]);

  expect(captured?.url).toBe("/api/import/tree/review");
  // @orb-waive no-test-fabrication(Record<string, string>): baselined when the gate widened to value casts; burn-down item 906.
  expect((captured?.init.headers as Record<string, string>)[CSRF_HEADER]).toBe("1");
  // @orb-waive no-test-fabrication(FormData): baselined when the gate widened to value casts; burn-down item 906.
  // @orb-waive no-test-fabrication(File): baselined when the gate widened to value casts; burn-down item 906.
  expect((captured?.init.body as FormData).getAll("file").map((f) => (f as File).name)).toEqual([
    "default-user/settings.json",
    "default-user/User Avatars/nate.png",
  ]);
  expect(collisions).toEqual([collision]);
});

test("reviewTreePersonas makes no request for a folder without a settings.json", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);

  expect(await reviewTreePersonas([pickedFile("backup/characters/Aria.png"), pickedFile("backup/User Avatars/x.png")])).toEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a failed review throws instead of letting the import proceed unasked", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 500, statusText: "Server Error" })));

  await expect(reviewTreePersonas([pickedFile("default-user/settings.json")])).rejects.toThrow("reviewTreePersonas");
});
