// The docs formatter's TWO FIDELITY LAWS (#2067, #2068) — the permanent pin for a tool that was caught
// editing the corpus lossily while reading as a cosmetic pass.
//
// WHY THESE FIXTURES: every one is reduced from a REAL byte diff measured by running the unmodified
// formatter over the pre-widening tree (`91d9a2ab7^`, 350 living docs). That pass added 369 backslash
// escapes, cost 25 distinct snake_case identifiers their grep hits, and left 10 files re-parsing to a
// DIFFERENT tree. `render-identical` was never the bar: a law corpus you cannot grep is a law corpus you
// cannot enforce, and a table that silently gains a column is a law doc that silently says something else.
//
// Every case goes through `formatDocs` on real files, because that is the door `pnpm format:docs` uses —
// the write path, the refusal, and the `dirty` verdict are all properties of it, not of the processor.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatDocs } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Write `body` into the scratch dir and format it; returns the bytes on disk plus the outcome. */
function format(scratch: string, name: string, body: string, write = true): { bytes: string; outcome: ReturnType<typeof formatDocs> } {
  const path = join(scratch, name);
  writeFileSync(path, body);
  const outcome = formatDocs([path], write);
  return { bytes: readFileSync(path, "utf8"), outcome };
}

const FRONTMATTER = "---\nkind: probe\nstatus: active\n---\n\n";

test("SEARCH FIDELITY: an intraword underscore keeps its grep hits across a format", ({ scratch }) => {
  // Reduced from the worst measured loser: `NOT_FOUND` went 6 hits → 0 as `NOT\_FOUND` in one pass.
  // CommonMark §6.2 makes an intraword `_` unable to open or close emphasis, so the escape was never
  // needed — and the escaped spelling is invisible to every literal search the docs are enforced with.
  const body = `${FRONTMATTER}The verb answers NOT_FOUND, never SERVER_INTERNAL.\n`;
  const hits = (text: string, literal: string): number => text.split(literal).length - 1;
  expect(hits(body, "NOT_FOUND")).toBe(1);

  const { bytes } = format(scratch, "search.md", body);

  expect(hits(bytes, "NOT_FOUND")).toBe(1);
  expect(hits(bytes, "SERVER_INTERNAL")).toBe(1);
  expect(bytes).not.toContain("\\_");
});

test("SEARCH FIDELITY: a lone tilde keeps its grep hits, and a strikethrough run still renders", ({ scratch }) => {
  // `singleTilde:false` means only `~~` is strikethrough, so `HEAD~1` never needed its escape. The second
  // half is the boundary case that made the first half wrong once: a `delete` node whose text OPENS with
  // an escaped tilde (`\~110`) sits directly after the `~~` its own parent emitted, so un-escaping it
  // without reading `info.before` produced `~~~110` and re-parsed as different content.
  const body = `${FRONTMATTER}Rebase onto HEAD~1, and see ~~~110 cells across ~55 modules~~ for the old count.\n`;

  const first = format(scratch, "tilde.md", body);
  expect(first.bytes).toContain("HEAD~1");
  expect(first.bytes).not.toContain("HEAD\\~1");
  expect(first.outcome.refused).toStrictEqual([]);

  // The strikethrough must survive as strikethrough: a second pass over the written bytes is a no-op,
  // which it cannot be if the run leaked a tilde into its own text.
  const second = format(scratch, "tilde.md", first.bytes);
  expect(second.bytes).toBe(first.bytes);
});

test("SEARCH FIDELITY: a backslash INSIDE a code span is literal content and survives untouched", ({ scratch }) => {
  // The de-escaping must never reach code. In a code span `\_` is a literal backslash-underscore (this is
  // the exact spelling `Core-Docs-Formatting-Law.md` uses as its own example), so dropping it would BE the
  // lossy edit. Running the rule in the `text` handler makes that unreachable by construction.
  const body = `${FRONTMATTER}Escapes in output (\`F32\\_BLOB\`, \`2\\*3\`) are the serializer's own.\n`;

  const { bytes } = format(scratch, "codespan.md", body);

  expect(bytes).toContain("`F32\\_BLOB`");
  expect(bytes).toContain("`2\\*3`");
});

test("RENDER FIDELITY: a table whose body out-widths its header is REFUSED, not silently widened", ({ scratch }) => {
  // The destructive shape, measured in 3 living docs. An unescaped `|` inside a code span inside a cell
  // splits that row into more cells than the header declares; serialization then sizes the delimiter row
  // to the WIDEST row, so the rendered table GAINS columns and the header gains empty cells. remark's
  // round trip is not total here, so the only honest answer is to leave the file alone and say so.
  const body = `${FRONTMATTER}| Gate | Why |\n| - | - |\n| \`lifecycle\` | a \`RULED-OUT | DERIVED\` classification |\n`;

  const { bytes, outcome } = format(scratch, "table.md", body);

  expect(outcome.refused).toStrictEqual([join(scratch, "table.md")]);
  expect(outcome.dirty).toStrictEqual([]);
  expect(bytes).toBe(body); // NOT written — the refusal is the point
});

test("RENDER FIDELITY: the well-formed corpus shapes are accepted, so the refusal is not a blanket", ({ scratch }) => {
  // The positive control for the arm above: the same constructs spelled correctly must still format.
  // Without this, a refusal that fired on everything would read exactly like a passing guard.
  const body = `${FRONTMATTER}| Gate | Why |\n| - | - |\n| \`lifecycle\` | a \`RULED-OUT \\| DERIVED\` classification |\n\n- a NOT_FOUND row and \`code | with a pipe\`\n`;

  const { bytes, outcome } = format(scratch, "table-ok.md", body);

  expect(outcome.refused).toStrictEqual([]);
  expect(bytes).toContain("NOT_FOUND");
  expect(bytes).toContain("RULED-OUT \\| DERIVED"); // the pipe escape inside a table cell IS required
});

test("IDEMPOTENCE: a second pass over formatted bytes changes nothing", ({ scratch }) => {
  // Half the original defect was the reformat's OWN second pass adding escapes, so a single-pass receipt
  // was never enough. This battery carries one of every construct the measurements touched.
  const body = [
    FRONTMATTER,
    "# Title\n\n",
    "Prose with NOT_FOUND, HEAD~1, a *star*, a [link](https://example.com) and `code_with_underscores`.\n\n",
    "| Flag | Meaning |\n| - | - |\n| `--mode a\\|b` | a pipe inside a code span inside a cell |\n\n",
    "- a list item with snake_case_words and ~~struck text~~\n",
    "- `F32\\_BLOB` stays literal\n\n",
    "```ts\nconst a_b = 1; // fenced code is never escaped\n```\n",
  ].join("");

  const first = format(scratch, "idempotent.md", body);
  expect(first.outcome.refused).toStrictEqual([]);
  const second = format(scratch, "idempotent.md", first.bytes);

  expect(second.bytes).toBe(first.bytes);
  expect(second.outcome.dirty).toStrictEqual([]);
});
