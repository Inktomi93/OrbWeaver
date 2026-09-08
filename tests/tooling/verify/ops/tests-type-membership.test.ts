// The PERMANENT PIN for the `tests-membership` stage's #1228 triple-slash-lib-leak tripwire
// (`findTripleSlashLibLeaks`, tooling/src/verify/ops/tests-type-membership.ts). What it defends, and why:
//
//   RED-FIRST, on the tree BEFORE #1228: scripts/probes/st-goldens/generate-goldens.ts carried
//   `/// <reference lib="dom" />` — a triple-slash directive is PROGRAM-scoped, not file-scoped, so that
//   ONE line silently supplied lib.dom to the ENTIRE `tsconfig.json` root aggregator (whose own header
//   claims DOM-less-by-design), masking 121 genuinely DOM-coupled escapee files riding the leak instead
//   of being explicitly homed. `tests-type-membership`'s PRE-EXISTING closure-membership check could not
//   catch this: it only asks "is this file in SOME program's closure", and the leak makes that question
//   answer YES for every affected file — for the wrong reason. Only a direct ban on the MECHANISM closes
//   the class; that ban is `findTripleSlashLibLeaks`, pinned here in both directions.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyMembership, findTripleSlashLibLeaks, runTestsTypeMembership } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

function withScratchDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "orb-lib-leak-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("findTripleSlashLibLeaks flags a bare triple-slash reference-lib directive", () => {
  withScratchDir((dir) => {
    writeFileSync(join(dir, "leaky.ts"), '/// <reference lib="dom" />\nexport const x = 1;\n');
    expect(findTripleSlashLibLeaks(dir, ["leaky.ts"])).toEqual(["leaky.ts"]);
  });
});

test("findTripleSlashLibLeaks flags the directive mid-file, not just on line 1 (the real founding shape)", () => {
  withScratchDir((dir) => {
    // The founding defect: generate-goldens.ts's directive sat at line 1 above a doc-comment header, but
    // the mechanism is a per-LINE match — a leak buried below other code must bite identically.
    writeFileSync(join(dir, "leaky-mid.ts"), 'import { spawn } from "node:child_process";\n\n/// <reference lib="dom" />\nexport const x = spawn;\n');
    expect(findTripleSlashLibLeaks(dir, ["leaky-mid.ts"])).toEqual(["leaky-mid.ts"]);
  });
});

test("findTripleSlashLibLeaks flags every distinct quoting/spacing spelling of the directive", () => {
  withScratchDir((dir) => {
    const spellings: Record<string, string> = {
      "single-quote.ts": "/// <reference lib='dom' />\nexport const a = 1;\n",
      "no-space.ts": '///<reference lib="dom"/>\nexport const b = 1;\n',
      "extra-space.ts": '///   <reference   lib="es2025" />\nexport const c = 1;\n',
    };
    for (const [name, body] of Object.entries(spellings)) {
      writeFileSync(join(dir, name), body);
    }
    const files = Object.keys(spellings);
    expect(findTripleSlashLibLeaks(dir, files).toSorted()).toEqual(files.toSorted());
  });
});

test("findTripleSlashLibLeaks does NOT flag a `///` mention inside ordinary prose (comment-safe, permissive-direction control)", () => {
  withScratchDir((dir) => {
    // The house rule (GATE-AUTHORING.md §5 "literal-matching gate declares its comment posture"): a
    // scanner over file TEXT must not let a comment DESCRIBING the banned shape absolve or falsely accuse
    // real code. Here: neither a `//`-prefixed mention (2 slashes, not 3) nor the literal substring
    // appearing later in a line (not at line-start) should trip the LINE-START-anchored directive match.
    const body =
      '// A "/// <reference lib=" directive is banned here (see #1228) — this sentence merely NAMES it.\n' +
      'export const note = "the string /// <reference lib=\\"dom\\" /> is just data, not a directive";\n';
    writeFileSync(join(dir, "mentions-only.ts"), body);
    expect(findTripleSlashLibLeaks(dir, ["mentions-only.ts"])).toEqual([]);
  });
});

test("findTripleSlashLibLeaks does NOT flag an ordinary DOM-less file (the founding negative)", () => {
  withScratchDir((dir) => {
    writeFileSync(join(dir, "clean.ts"), 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n');
    expect(findTripleSlashLibLeaks(dir, ["clean.ts"])).toEqual([]);
  });
});

test("the real tree carries ZERO triple-slash reference-lib directives (the tripwire holds after #1228)", () => {
  // Read-only, real-tree receipt: scripts/probes/st-goldens/generate-goldens.ts is now the negative
  // control (its former leak line was removed and it moved to tsconfig.tests-dom.json), and no other
  // file on the type-relevant surface may carry the mechanism. A regression here means the class this
  // stage exists to prevent is back.
  const root = new URL("../../../..", import.meta.url).pathname.replace(/\/$/u, "");
  const rel = "scripts/probes/st-goldens/generate-goldens.ts";
  // Sanity FIRST: the founding file still exists at that path (a moved/renamed file would make the
  // negative assertion below vacuous, not meaningful).
  expect(existsSync(join(root, rel))).toBe(true);
  expect(findTripleSlashLibLeaks(root, [rel])).toEqual([]);
});

test("classifyMembership (phase-0 report): predicted / drift / import-only / unowned from root + closure sets", () => {
  const root = "/repo";
  const abs = (rel: string): string => `${root}/${rel}`;
  const files = [
    "tests/server/x.test.ts", // rooted by its predicted program only
    "tests/support/browser/y.ts", // rooted by the OTHER world's program → drift
    "tests/support/node/helper.ts", // in a closure, a root of nothing → import-only
    "tests/tooling/z.test.ts", // in no program at all → unowned
  ];
  const roots = new Map<string, ReadonlySet<string>>([
    ["tsconfig.json", new Set(["tests/server/x.test.ts", "tests/support/browser/y.ts"])],
    ["tsconfig.tests-dom.json", new Set<string>()],
  ]);
  const closures = new Map<string, ReadonlySet<string>>([
    ["tsconfig.json", new Set([abs("tests/server/x.test.ts"), abs("tests/support/browser/y.ts")])],
    ["tsconfig.tests-dom.json", new Set([abs("tests/support/node/helper.ts")])],
  ]);
  const rows = classifyMembership(root, files, roots, closures);
  expect(rows.map(({ file, outcome }) => `${file}=${outcome}`)).toEqual([
    "tests/server/x.test.ts=predicted",
    "tests/support/browser/y.ts=drift",
    "tests/support/node/helper.ts=import-only",
    "tests/tooling/z.test.ts=unowned",
  ]);
  expect(rows[1]?.predicted).toBe("tsconfig.tests-dom.json");
  expect(rows[2]?.containedBy).toEqual(["tsconfig.tests-dom.json"]);
});

test("the report covers source and config owners without blessing transitional test-directory rules", () => {
  const files = [
    "packages/kit/src/value.ts",
    "tooling/src/verify/cli.ts",
    "knip.ts",
    "packages/client/vite.config.ts",
    "playwright-ct.config.ts",
    "reset.d.ts",
    "tests/client/value.test.ts",
    "tests/client/value.dom.test-d.ts",
  ] as const;
  const roots = new Map<string, ReadonlySet<string>>([
    ["packages/kit/tsconfig.json", new Set([files[0]])],
    ["tooling/tsconfig.json", new Set([files[1]])],
    ["tsconfig.json", new Set([files[0], files[1], files[2], files[5]])],
    ["packages/client/tsconfig.json", new Set([files[3]])],
    ["tsconfig.tests-dom.json", new Set([files[6], files[7]])],
  ]);
  const closures = new Map([...roots].map(([config, paths]) => [config, new Set([...paths].map((file) => `/repo/${file}`))]));
  const rows = classifyMembership("/repo", files, roots, closures);
  expect(rows.map(({ world, outcome }) => [world, outcome])).toEqual([
    ["iso", "predicted"],
    ["node", "predicted"],
    ["node", "predicted"],
    ["node", "drift"],
    ["node", "unowned"],
    [null, "unclassified"],
    ["node", "drift"],
    ["browser", "predicted"],
  ]);
  expect(rows[3]?.predicted).toBe("tsconfig.json");
  expect(rows[5]?.predicted).toBeNull();
});

test("unsupported membership arguments refuse before reading a repository", () => {
  expect(() => runTestsTypeMembership("/does-not-exist", ["--scope", "tests"])).toThrow("accepts only --json");
  expect(() => runTestsTypeMembership("/does-not-exist", ["--json", "--json"])).toThrow("accepts only --json");
});

test("iso helpers can satisfy their primary owner and expose a wrong node owner", () => {
  const file = "tests/support/iso/values.ts";
  const closures = new Map([["tsconfig.tests-iso.json", new Set([`/repo/${file}`])]]);
  const owned = classifyMembership("/repo", [file], new Map([["tsconfig.tests-iso.json", new Set([file])]]), closures);
  expect(owned[0]).toMatchObject({ world: "iso", predicted: "tsconfig.tests-iso.json", outcome: "predicted" });
  const wrong = classifyMembership("/repo", [file], new Map([["tsconfig.json", new Set([file])]]), new Map([["tsconfig.json", new Set([`/repo/${file}`])]]));
  expect(wrong[0]?.outcome).toBe("drift");
});
