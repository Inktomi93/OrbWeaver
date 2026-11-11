// @subject packages/server/src/domain/export/substrate/bundle-path.ts
// A library bundle holds one archive path per entry. A wrong allocator silently drops or renames a member of an
// account backup, and the failure only shows on restore.
import { expect, test } from "@orb/testkit/node";
import { createBundlePaths } from "#server/domain/export/index.ts";

test("a colliding path takes the first free numeric suffix before its extension", () => {
  const allocate = createBundlePaths();
  expect([allocate("characters/Ada.png"), allocate("characters/Ada.png"), allocate("characters/Ada.png")]).toEqual([
    "characters/Ada.png",
    "characters/Ada-2.png",
    "characters/Ada-3.png",
  ]);
});

test("a suffixed variant an earlier entry already asked for is skipped", () => {
  const allocate = createBundlePaths();
  expect([allocate("Ada-2.png"), allocate("Ada.png"), allocate("Ada.png")]).toEqual(["Ada-2.png", "Ada.png", "Ada-3.png"]);
});

test("case variants collide, and the later entry keeps its own casing", () => {
  const allocate = createBundlePaths();
  expect([allocate("Cards/Ada.PNG"), allocate("cards/ada.png"), allocate("CARDS/ADA.PNG")]).toEqual(["Cards/Ada.PNG", "cards/ada-2.png", "CARDS/ADA-3.PNG"]);
});

test("a path no earlier entry asked for is never renamed", () => {
  const allocate = createBundlePaths();
  const asked = ["a.txt", "b.txt", "dir/a.txt", "a.txt.bak", "A-2.txt"];
  expect(asked.map((path) => allocate(path))).toEqual(asked);
});

test("a dot in a directory segment does not start the extension", () => {
  const allocate = createBundlePaths();
  expect([allocate("v1.2/notes"), allocate("v1.2/notes")]).toEqual(["v1.2/notes", "v1.2/notes-2"]);
});

test("only the last dot in the leaf starts the extension", () => {
  const allocate = createBundlePaths();
  expect([allocate("a.tar.gz"), allocate("a.tar.gz")]).toEqual(["a.tar.gz", "a.tar-2.gz"]);
});

test("a leading dot in the leaf is part of the name, not an extension", () => {
  const allocate = createBundlePaths();
  expect([allocate("dir/.env"), allocate("dir/.env")]).toEqual(["dir/.env", "dir/.env-2"]);
});

test("each bundle allocates against its own taken set", () => {
  const first = createBundlePaths();
  const second = createBundlePaths();
  first("a.txt");
  expect(second("a.txt")).toBe("a.txt");
});
