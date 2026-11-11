// The app document's CSP in a dev launch differs from a production launch only by the dev-server allowances (HMR sockets, inline and eval script, the devtools logo's `data:` image), and the production
// policy admits no inline or eval script. Both policies are read off the response of a composed root, so they are the
// ones `securityHeaders` builds for each `NODE_ENV`.
// @subject packages/server/src/entry/http/security-headers.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

type Policy = ReadonlyMap<string, readonly string[]>;

async function documentPolicy(nodeEnv: "production" | "development"): Promise<Policy> {
  // A production launch serves the client bundle, so it needs an index to boot against.
  await using owner = new AsyncDisposableStack();
  const clientDistDir = await mkdtemp(join(tmpdir(), "orb-csp-"));
  owner.defer(() => rm(clientDistDir, { recursive: true, force: true }));
  await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>CSP fixture</title>");
  await using root = await createServerHarness({ clientDistDir, env: { ["NODE_ENV"]: nodeEnv } });
  const response = await root.http.request("/api/health", { headers: { host: "localhost" } });
  await response.arrayBuffer();
  const header = response.headers.get("content-security-policy");
  if (header === null) {
    throw new Error(`the ${nodeEnv} launch answered with no content-security-policy`);
  }
  return new Map(
    header
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name !== undefined && name !== "")
      .map(([name = "", ...tokens]) => [name, tokens.toSorted()]),
  );
}

test("a dev launch adds only the dev-server allowances to the production policy and removes none", async () => {
  const production = await documentPolicy("production");
  const development = await documentPolicy("development");

  const added: Record<string, string[]> = {};
  for (const [directive, tokens] of development) {
    const base = production.get(directive) ?? [];
    expect(
      base.filter((token) => !tokens.includes(token)),
      `${directive} loses a production token in dev`,
    ).toEqual([]);
    const extra = tokens.filter((token) => !base.includes(token));
    if (extra.length > 0) {
      added[directive] = extra;
    }
  }
  for (const directive of production.keys()) {
    expect(development.has(directive), `${directive} is missing in dev`).toBe(true);
  }

  expect(added).toEqual({
    ["script-src"]: ["'unsafe-eval'", "'unsafe-inline'"],
    ["img-src"]: ["data:"],
    ["connect-src"]: ["ws:", "wss:"],
  });
  expect(production.get("script-src")).not.toContain("'unsafe-inline'");
  expect(production.get("script-src")).not.toContain("'unsafe-eval'");
});
