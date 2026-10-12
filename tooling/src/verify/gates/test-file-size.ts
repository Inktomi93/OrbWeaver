// Policy: test-file-size (docs/law/Spine-Testing.md §10, "Share setup") — a test-tree file stays at or below
// `TEST_FILE_LINE_CAP` lines, so a suite is split by concern before it is too large to review. The cap is wider than
// the source caps because a test spells its arrange and assert inline. FAMILY `component-size`: the line count is
// `lib/source-line-count.ts#authoredLineCount`. Current monoliths are reviewed-grant rows in
// `lib/reviewed-grants-test-file-size.ts`.
import { defineGate } from "../contract/policy.ts";
import { authoredLineCount } from "../lib/source-line-count.ts";

const TEST_FILE_LINE_CAP = 1000;
const OPERATION = "oversize";
const MESSAGE = `a test-tree file exceeds ${String(TEST_FILE_LINE_CAP)} lines — split it by concern, and move repeated setup to a builder in the file or in tests/support (docs/law/Spine-Testing.md §10).`;

export const gate = defineGate({
  id: "test-file-size",
  family: "component-size",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tests",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "split the file by the concern each block proves; a current monolith is a reviewed-grant row naming its burn-down, and a new file is split instead of granted.",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      const path = ctx.relativePath(sourceFile);
      const lines = authoredLineCount(sourceFile);
      if (lines > TEST_FILE_LINE_CAP) {
        ctx.report.file(path, {
          line: TEST_FILE_LINE_CAP + 1,
          column: 1,
          message: `${String(lines)} lines (cap ${String(TEST_FILE_LINE_CAP)}). ${MESSAGE}`,
          subject: path,
          operation: OPERATION,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tests/server/domain/chat/verbs/turn.int.test.ts": "export const x = 1;\n".repeat(TEST_FILE_LINE_CAP + 1) },
      expect: { count: 1, line: TEST_FILE_LINE_CAP + 1, messageIncludes: "1001 lines (cap 1000)" },
      grant: { subject: "tests/server/domain/chat/verbs/turn.int.test.ts", operation: OPERATION },
      why: "one line over the cap in a test file is the split trigger",
    },
    {
      mode: "source",
      files: { "tests/client/features/chat/_ct-stories.tsx": "export const x = 1;\n".repeat(TEST_FILE_LINE_CAP + 1) },
      expect: { count: 1, line: TEST_FILE_LINE_CAP + 1 },
      why: "a story module is test-tree code under the same cap: a monolith harness is as hard to review as a monolith suite",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "tests/server/domain/chat/verbs/turn.int.test.ts": "export const x = 1;\n".repeat(TEST_FILE_LINE_CAP) },
      why: "exactly at the cap passes; the terminal newline closes the last line rather than adding one",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/turn.ts": "export const x = 1;\n".repeat(TEST_FILE_LINE_CAP + 1),
        "tests/server/domain/chat/verbs/turn.int.test.ts": "export const x = 1;\n",
      },
      why: "POPULATION: production source answers to its own package caps, not this one",
    },
  ],
});
