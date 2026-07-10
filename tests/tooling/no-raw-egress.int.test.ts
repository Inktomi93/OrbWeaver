// Self-test for the DORMANT `no-raw-egress` gate (scripts/check/gates/no-raw-egress.ts — D61 B5a the
// hardened-egress guard; held out of ALL_CHECKS pending doc reconciliation). Proves: a bare `fetch(`
// outside the sanctioned zones fires, `safeFetch(`/`x.fetch(` don't, the provider-egress + safeFetch-home
// zones pass, and a `corsproxy.io` literal anywhere in server source fires.
import { Project } from "ts-morph";
import { noRawEgress } from "../../scripts/check/gates/no-raw-egress.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

const RAW = 'export async function f() {\n  return await fetch("https://x");\n}\n';

test("fires on a bare fetch( in an unsanctioned server zone (domain/hub)", () => {
  const hub = "packages/server/src/domain/hub/verbs/browse.ts";
  const v = noRawEgress.run(ctxFor({ [hub]: RAW }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("safeFetch");
});

test("passes safeFetch( and a method .fetch( — only the bare identifier is banned", () => {
  const hub = "packages/server/src/domain/hub/verbs/browse.ts";
  const src =
    "export async function f(c: { fetch: (u: string) => Promise<unknown> }) {\n" +
    '  await safeFetch("https://x", { allowedHosts: [] });\n' +
    '  await c.fetch("https://y");\n' +
    "}\n";
  expect(noRawEgress.run(ctxFor({ [hub]: src }))).toEqual([]);
});

test("passes raw fetch in the sanctioned provider-egress zones + safeFetch home", () => {
  const files = {
    "packages/server/src/infra/network/openai-models.ts": RAW,
    "packages/server/src/infra/providers/vllm/engine/client.ts": RAW,
    "packages/server/src/domain/imagery/verbs/generate-picture.ts": RAW,
  };
  expect(noRawEgress.run(ctxFor(files))).toEqual([]);
});

test("fires on a corsproxy.io literal anywhere in server source", () => {
  const src = 'export const proxy = "https://corsproxy.io/?url=";\n';
  const v = noRawEgress.run(ctxFor({ "packages/server/src/domain/hub/lib/x.ts": src }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("corsproxy.io");
});

test("does not scan non-server source", () => {
  expect(noRawEgress.run(ctxFor({ "packages/client/src/x.ts": RAW }))).toEqual([]);
});
