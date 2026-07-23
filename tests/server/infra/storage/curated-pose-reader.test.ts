// infra/storage/curated-pose-reader (comfyui-control §4.12, C6d): the shipped curated-pose byte reader + its
// PATH CONFINEMENT. Confinement is pinned directly (a crafted `..`-escaping rel → refused, never a read outside
// the root) — the id resolves through the frozen index so an escape is defense-in-depth, but a path-ish key
// gets confinement by default. The reader itself: a known id reads its file's bytes; an unknown id ⇒ null.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listCuratedPoses } from "@orb/contracts/poses";
import { confinePosePath, createCuratedPoseReader } from "@orb/server/infra/storage";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

describe("confinePosePath — the traversal confinement", () => {
  const root = "/srv/app/poses/library";

  test("a normal category/name rel resolves WITHIN the root", () => {
    expect(confinePosePath(root, "action/action_10.png")).toBe(join(root, "action/action_10.png"));
  });

  test("a ../-escaping rel is REFUSED (null) — never a path outside the root", () => {
    expect(confinePosePath(root, "../../etc/passwd")).toBeNull();
    expect(confinePosePath(root, "action/../../../secret.png")).toBeNull();
  });

  test("an absolute rel cannot escape the root", () => {
    expect(confinePosePath(root, "/etc/passwd")).toBeNull();
  });
});

describe("createCuratedPoseReader — the shipped-byte read", () => {
  let dir: string;
  const first = listCuratedPoses()[0];
  // The `/poses/library/<rel>` on-disk relpath the reader derives from the curated thumbnailSrc.
  const rel = first?.thumbnailSrc.replace("/poses/library/", "") ?? "action/action_10.png";
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orb-pose-reader-"));
    const target = join(dir, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, bytes);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("a KNOWN curated id reads its shipped skeleton bytes", async () => {
    const read = createCuratedPoseReader(dir);
    expect(first).toBeDefined();
    const out = await read(first?.id ?? "");
    expect(out).toEqual(bytes);
  });

  test("an UNKNOWN id (not in the frozen index) resolves to null", async () => {
    const read = createCuratedPoseReader(dir);
    expect(await read("not/a-real-pose")).toBeNull();
  });

  test("a missing file (a partial dist) degrades honestly to null", async () => {
    const read = createCuratedPoseReader(join(dir, "nonexistent-root"));
    expect(await read(first?.id ?? "")).toBeNull();
  });
});
