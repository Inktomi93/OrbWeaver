import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

// `pnpm install` on a fresh machine must not depend on a download the app does not need. A postinstall that
// fetches from a third-party host fails the whole install behind a proxy or offline, so each such package is
// denied in `allowBuilds` and its need is met elsewhere.

const workspaceSchema = z.object({ allowBuilds: z.record(z.string(), z.boolean()) });

function allowBuilds(repoRoot: string): Readonly<Record<string, boolean>> {
  return workspaceSchema.parse(parse(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"))).allowBuilds;
}

test("the install runs no postinstall that downloads from a third-party host", ({ repoRoot }) => {
  const builds = allowBuilds(repoRoot);
  // onnxruntime-node's postinstall fetches the CUDA providers from api.nuget.org; the CPU binding ships in its tarball.
  expect(builds["onnxruntime-node"]).toBe(false);
  // cloudflared's postinstall fetches an unpinned binary; the relay controller downloads the pinned one.
  expect(builds["cloudflared"]).toBe(false);
});
