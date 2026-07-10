// Self-test for the DORMANT `content-part-seam` gate (scripts/check/gates/content-part-seam.ts — D51 the
// content-part wire seam; held out of ALL_CHECKS pending doc reconciliation). Proves: an upstream
// `ChatContentPart` import (assemble/shape/verbs) fires, the seam producer + request DTO + infra consumers
// pass, and the centralized tests/ mirror is exempt (it tests the contract type).
import { Project } from "ts-morph";
import { contentPartSeam } from "../../scripts/check/gates/content-part-seam.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

const IMPORT =
  'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type X = ChatContentPart;\n';

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

test("fires on an upstream domain/chat import (assemble/shape)", () => {
  const up = "packages/server/src/domain/chat/assembly/context.ts";
  const v = contentPartSeam.run(ctxFor({ [up]: IMPORT }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D51");
});

test("passes the engine request SEAM (pipeline.ts)", () => {
  const seam = "packages/server/src/domain/chat/engine/pipeline.ts";
  expect(contentPartSeam.run(ctxFor({ [seam]: IMPORT }))).toEqual([]);
});

test("passes the request DTO (contract/results.ts)", () => {
  const dto = "packages/server/src/domain/chat/contract/results.ts";
  expect(contentPartSeam.run(ctxFor({ [dto]: IMPORT }))).toEqual([]);
});

test("passes an infra/providers consumer", () => {
  const infra = "packages/server/src/infra/providers/backends/kit/history.ts";
  expect(contentPartSeam.run(ctxFor({ [infra]: IMPORT }))).toEqual([]);
});

test("passes the contracts home", () => {
  const home = "packages/contracts/src/chat/index.ts";
  expect(contentPartSeam.run(ctxFor({ [home]: IMPORT }))).toEqual([]);
});

test("exempts the centralized tests/ mirror (a type-test of the contract)", () => {
  const testFile = "tests/contracts/chat/index.test-d.ts";
  expect(contentPartSeam.run(ctxFor({ [testFile]: IMPORT }))).toEqual([]);
});
