import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { vi } from "vitest";
import { verifyDevToolsAssets } from "../../../tooling/src/_shared/devtools-assets.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

// The manifest is slash-authored even when its filesystem census uses Windows separators.
vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return { ...actual, normalize: actual.win32.normalize, relative: actual.win32.relative };
});

test("Windows normalization and filesystem census preserve the exact committed DevTools closure", ({ repoRoot }) => {
  expect(normalize("licenses/devtools-frontend/LICENSE")).toBe("licenses\\devtools-frontend\\LICENSE");
  expect(relative("/closure", "/closure/licenses/LICENSE")).toBe("licenses\\LICENSE");
  const closure = verifyDevToolsAssets(`${repoRoot}/tooling/src/snap/lib/devtools-frontend`);
  expect(closure.manifest.resources.length).toBe(closure.pin.resourceCount);
  expect(closure.filesByUrl.size).toBe(closure.pin.resourceCount);
  expect([...closure.filesByUrl.keys()]).toContain(`/serve_rev/@${closure.pin.devtoolsFrontendRevision}/inspector.html`);
});

test("Windows asset validation still refuses noncanonical and escaping declared members", ({ repoRoot, scratch }) => {
  cpSync(join(repoRoot, "tooling/src/snap/lib/devtools-frontend"), scratch, { recursive: true });
  const licensePath = join(scratch, "licenses.json");
  const licenses = JSON.parse(readFileSync(licensePath, "utf8")) as { families: { notices: { file: string }[] }[] };
  const notice = licenses.families[0]?.notices[0];
  if (notice === undefined) {
    throw new Error("the real closure has no license notice for the path control");
  }
  for (const path of ["../escape", "/absolute", "licenses//LICENSE", "licenses/../LICENSE", "C:/escape", "licenses\\LICENSE"]) {
    notice.file = path;
    writeFileSync(licensePath, JSON.stringify(licenses));
    expect(() => verifyDevToolsAssets(scratch)).toThrow("is not a canonical relative path");
  }
});
