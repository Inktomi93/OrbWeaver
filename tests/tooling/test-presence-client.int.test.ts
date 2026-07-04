// Self-test for the DORMANT `test-presence-client` gate (scripts/check/gates/test-presence-client.ts —
// NOT in report.ts's ALL_CHECKS; it finds 8 client files whose backfill+activation rides W1-1 — see the
// gate header). The gate walks a ts-morph project AND checks mirror-test existence via real fs, so it
// self-tests over a REAL temp-dir fixture tree with a real Project built over it (root swapped), never
// the real repo. Proves clause A (client, strict per-file) fires + is clean, clause B (ui, dir-level)
// fires + is clean, the callable-export gate, and the nested-bucket exclusion.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { testPresenceClient } from "../../scripts/check/gates/test-presence-client.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

function withCtx(files: Record<string, string>, fn: (ctx: CheckContext) => void): void {
  const root = mkdtempSync(join(tmpdir(), "orb-tpc-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, text);
    }
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([`${root}/packages/**/*.ts`, `${root}/packages/**/*.tsx`]);
    fn({ root, project });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SRC = "export function build(): number {\n  return 1;\n}\n";

test("clause A — a client data primitive with a callable export + no mirror test fires", () => {
  withCtx({ "packages/client/src/data/create-entity-mutation.ts": SRC }, (ctx) => {
    const v = testPresenceClient.run(ctx);
    expect(v.some((x) => x.file.endsWith("create-entity-mutation.ts"))).toBe(true);
  });
});

test("clause A — the same primitive WITH a per-file mirror test is clean", () => {
  withCtx(
    {
      "packages/client/src/data/create-entity-mutation.ts": SRC,
      "tests/client/data/create-entity-mutation.test.ts": "export {};\n",
    },
    (ctx) => {
      expect(testPresenceClient.run(ctx)).toEqual([]);
    },
  );
});

test("clause A — a file with NO callable export (plain value / barrel) is clean", () => {
  withCtx({ "packages/client/src/data/constants.ts": "export const X = 1;\n" }, (ctx) => {
    expect(testPresenceClient.run(ctx)).toEqual([]);
  });
});

test("clause A — nested buckets (data/bus, forms/bound-fields) are excluded", () => {
  withCtx(
    {
      "packages/client/src/data/bus/apply-chat-bus-event.ts": SRC,
      "packages/client/src/forms/bound-fields/text-field.tsx": SRC,
    },
    (ctx) => {
      expect(testPresenceClient.run(ctx)).toEqual([]);
    },
  );
});

test("clause B — a ui-logic module with NO test anywhere in its mirror dir fires", () => {
  withCtx({ "packages/ui/src/markdown/policy.ts": SRC }, (ctx) => {
    const v = testPresenceClient.run(ctx);
    expect(v.some((x) => x.file.endsWith("markdown/policy.ts"))).toBe(true);
  });
});

test("clause B — dir-level: a sibling test (different basename) in the mirror dir satisfies presence", () => {
  withCtx(
    {
      "packages/ui/src/markdown/policy.ts": SRC,
      "packages/ui/src/markdown/to-plain-text.ts": SRC,
      "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
    },
    (ctx) => {
      expect(testPresenceClient.run(ctx)).toEqual([]);
    },
  );
});

test("bare primitives/ are NOT scanned (covered by ui-primitive-structure's CT clause)", () => {
  withCtx({ "packages/ui/src/primitives/button/button.tsx": SRC }, (ctx) => {
    expect(testPresenceClient.run(ctx)).toEqual([]);
  });
});
