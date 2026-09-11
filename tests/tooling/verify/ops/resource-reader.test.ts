import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("disk and virtual additions, replacements, and deletions share one immutable tree view", ({ scratch }) => {
  const base = join(scratch, "sources");
  mkdirSync(base);
  writeFileSync(join(base, "old.ts"), "old");
  writeFileSync(join(base, "replaced.ts"), "disk");
  const overlay = { "sources/old.ts": null, "sources/replaced.ts": "virtual\n", "sources/new/file.ts": "new" };
  const reader = createResourceReader({ root: scratch, overlay });
  overlay["sources/replaced.ts"] = "later mutation";
  const tree = reader.tree("sources");
  expect(tree.status).toBe("ready");
  if (tree.status !== "ready") {
    throw new Error(tree.reason);
  }
  expect(tree.value.map((entry) => [entry.path, entry.kind])).toEqual([
    ["sources/new", "directory"],
    ["sources/new/file.ts", "file"],
    ["sources/replaced.ts", "file"],
  ]);
  expect(reader.read("sources/replaced.ts")).toMatchObject({ status: "ready", value: "virtual\n" });
  expect(reader.read("sources/old.ts").status).toBe("missing");
  expect(readFileSync(join(base, "replaced.ts"), "utf8")).toBe("disk");
  expect(reader.tree("sources")).toBe(tree);
  expect(Object.isFrozen(tree.value[0])).toBe(true);
});

test("missing and empty roots are distinct and virtual directories need no disk writes", ({ scratch }) => {
  mkdirSync(join(scratch, "empty"));
  const reader = createResourceReader({ root: scratch, overlay: { "virtual/a/b.ts": "x" } });
  expect(reader.tree("missing").status).toBe("missing");
  expect(reader.tree("empty").status).toBe("empty");
  expect(reader.tree("virtual")).toMatchObject({ status: "ready", members: 2, paths: ["virtual/a", "virtual/a/b.ts"] });
});

test("raw byte and NUL counts do not depend on UTF8 text decoding", ({ scratch }) => {
  mkdirSync(join(scratch, "bytes"));
  writeFileSync(join(scratch, "bytes/raw.bin"), Buffer.from([255, 0, 10, 0]));
  writeFileSync(join(scratch, "bytes/empty.txt"), "");
  const reader = createResourceReader({ root: scratch });
  expect(reader.tree("bytes")).toMatchObject({
    status: "ready",
    value: [
      { path: "bytes/empty.txt", bytes: 0, lines: 1, nulBytes: 0 },
      { path: "bytes/raw.bin", bytes: 4, lines: 2, nulBytes: 2 },
    ],
  });
  expect(reader.read("bytes/raw.bin").status).toBe("unresolved");
  expect(reader.read("bytes/empty.txt").status).toBe("empty");
});

test("an authored transaction snapshot preserves binary bytes and overlay identity", ({ scratch }) => {
  writeFileSync(join(scratch, "raw.bin"), Buffer.from([255, 0, 10]));
  writeFileSync(join(scratch, "gone.bin"), Buffer.from([1]));
  const result = createResourceReader({ root: scratch, overlay: { "virtual.txt": "overlay", "gone.bin": null } }).snapshot(["raw.bin", "virtual.txt"]);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(result.reason);
  }
  expect(result.paths).toEqual(["raw.bin", "virtual.txt"]);
  expect(result.value.map((entry) => ({ path: entry.path, kind: entry.kind, origin: entry.origin }))).toEqual([
    { path: "raw.bin", kind: "file", origin: "disk" },
    { path: "virtual.txt", kind: "file", origin: "overlay" },
  ]);
  expect(result.value[0]?.kind === "file" ? [...result.value[0].bytes] : []).toEqual([255, 0, 10]);
});

test("file snapshots survive disk edits and a new invocation observes the change", ({ scratch }) => {
  writeFileSync(join(scratch, "data.txt"), "before");
  const first = createResourceReader({ root: scratch });
  expect(first.read("data.txt")).toMatchObject({ value: "before" });
  writeFileSync(join(scratch, "data.txt"), "after");
  expect(first.read("data.txt")).toMatchObject({ value: "before" });
  expect(createResourceReader({ root: scratch }).read("data.txt")).toMatchObject({ value: "after" });
});

test("missing facts remain missing within an invocation and refusals never become empty success", ({ scratch }) => {
  const reader = createResourceReader({ root: scratch });
  const absent = reader.read("later.txt");
  writeFileSync(join(scratch, "later.txt"), "now");
  expect(reader.read("later.txt")).toBe(absent);
  mkdirSync(join(scratch, "dir"));
  expect(createResourceReader({ root: scratch }).read("dir").status).toBe("unresolved");
  symlinkSync(join(scratch, "later.txt"), join(scratch, "dir/link.txt"));
  const next = createResourceReader({ root: scratch });
  expect(next.tree("dir").status).toBe("unresolved");
  expect(next.read("dir/link.txt").status).toBe("unresolved");
});

test("invalid and conflicting overlay paths are refused before acquisition", ({ scratch }) => {
  expect(() => createResourceReader({ root: scratch, overlay: { "../outside.ts": "x" } })).toThrow(/path/);
  expect(() => createResourceReader({ root: scratch, overlay: { a: null, "a/b.ts": "x" } })).toThrow(/conflicting/);
  expect(() => createResourceReader({ root: scratch, overlay: { "node_modules/pkg/index.ts": "x" } })).toThrow(/non-authored/);
  const reader = createResourceReader({ root: scratch });
  expect(() => reader.read("/absolute")).toThrow(/path/);
});

test("deleting a directory hides its children while installed output never joins the authored corpus", ({ scratch }) => {
  mkdirSync(join(scratch, "sources/gone"), { recursive: true });
  mkdirSync(join(scratch, "sources/node_modules"));
  writeFileSync(join(scratch, "sources/gone/a.ts"), "gone");
  writeFileSync(join(scratch, "sources/node_modules/a.ts"), "installed");
  const reader = createResourceReader({ root: scratch, overlay: { "sources/gone": null, "sources/kept.ts": "kept" } });
  expect(reader.tree("sources")).toMatchObject({ status: "ready", paths: ["sources/kept.ts"] });
  expect(reader.read("sources/gone/a.ts").status).toBe("missing");
});

test("file and directory membership use the same snapshot across read order and disk deletion", ({ scratch }) => {
  mkdirSync(join(scratch, "sources"));
  writeFileSync(join(scratch, "sources/a.ts"), "before");
  const reader = createResourceReader({ root: scratch });
  expect(reader.read("sources/a.ts")).toMatchObject({ status: "ready", value: "before" });
  rmSync(join(scratch, "sources/a.ts"));
  expect(reader.tree("sources")).toMatchObject({ status: "ready", paths: ["sources/a.ts"] });
  const empty = createResourceReader({ root: scratch });
  expect(empty.tree("sources").status).toBe("empty");
  writeFileSync(join(scratch, "sources/b.ts"), "after");
  expect(empty.read("sources/b.ts").status).toBe("missing");
  expect(createResourceReader({ root: scratch }).read("sources/b.ts")).toMatchObject({ status: "ready", value: "after" });
});

test("cached file ancestry cannot become a directory midway through the invocation", ({ scratch }) => {
  mkdirSync(join(scratch, "sources"));
  writeFileSync(join(scratch, "sources/a"), "before");
  const reader = createResourceReader({ root: scratch });
  expect(reader.read("sources/a")).toMatchObject({ status: "ready", value: "before" });
  rmSync(join(scratch, "sources/a"));
  mkdirSync(join(scratch, "sources/a"));
  writeFileSync(join(scratch, "sources/a/b.ts"), "after");
  expect(reader.read("sources/a/b.ts").status).toBe("unresolved");
  expect(reader.tree("sources/a").status).toBe("unresolved");
  expect(reader.tree("sources")).toMatchObject({ status: "ready", value: [{ path: "sources/a", kind: "file" }] });
});
