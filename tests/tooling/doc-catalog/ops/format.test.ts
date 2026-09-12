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
import { formatDocs, formatTargets } from "../../../../tooling/src/doc-catalog/index.ts";
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

test("OVERFLOW ROW: a table whose body out-widths its header is REFUSED, not silently widened", ({ scratch }) => {
  // THE PLANTED POSITIVE CONTROL. This arm's corpus count is ZERO by design — the three live instances
  // were repaired in #2104 and every older one was already normalized — so a real-tree receipt would be
  // an unmeasurable zero. The fixture is the defect reduced: an unescaped `|` inside a code span inside
  // a cell splits that row to 3 cells under a 2-cell header, and GFM DROPS the third. The formatter's
  // instinct is to widen the header to match, which makes the dropped cell appear under a blank heading
  // and leaves the table self-consistent forever. Refusing is the only answer that preserves the render.
  const body = `${FRONTMATTER}| Gate | Why |\n| - | - |\n| \`lifecycle\` | a \`RULED-OUT | DERIVED\` classification |\n`;

  const { bytes, outcome } = format(scratch, "table.md", body);

  expect(outcome.dirty).toStrictEqual([]);
  expect(bytes).toBe(body); // NOT written — the refusal is the point
  expect(outcome.refused.map((r) => r.file)).toStrictEqual([join(scratch, "table.md")]);
  // The MESSAGE is the deliverable, not the verdict: without the census a reader cannot tell a stray
  // pipe (one occupied row) from content that has no column (several), and those need opposite repairs.
  const reason = outcome.refused[0]?.reason ?? "";
  expect(reason).toContain("header declares 2 column(s)");
  expect(reason).toContain("1 row(s) carry more");
  expect(reason).toContain("3 cells vs header 2");
  expect(reason).toContain("occupancy over 1 body rows, by column: 1 · 1 · 1");
});

test("OVERFLOW ROW: the NARROW direction is not a finding — GFM pads it and it renders as written", ({ scratch }) => {
  // Direction is the whole rule. A row with FEWER cells than its header loses nothing: GFM pads it and
  // the render matches the source. Refusing here would red the corpus on a harmless shape, so this arm
  // is the fence that keeps the guard from over-firing — and it is a REAL risk, not a hypothetical, since
  // a two-sided "row width must equal header width" check is the obvious way to write this wrong.
  const body = `${FRONTMATTER}| Gate | Why | When |\n| - | - | - |\n| \`lifecycle\` | a reason |\n| \`other\` | a reason | now |\n`;

  const { outcome } = format(scratch, "narrow.md", body);

  expect(outcome.refused).toStrictEqual([]);
  expect(outcome.dirty).toStrictEqual([join(scratch, "narrow.md")]);
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

test("FROZEN ARCHAEOLOGY: a doc in EITHER history tree is never written and never judged", () => {
  // TWO controls, one per tree, because the defect WAS that one tree was covered and its twin was not:
  // `docs/history/**` fell outside the living trees by omission, while `docs/architecture/history/**`
  // nested INSIDE `docs/architecture/` and was admitted for months under a header claiming otherwise.
  // A single control reproduces exactly the blind spot that shipped.
  //
  // The bodies below would be BOTH dirty (a `\~` the formatter removes) AND refused (a row wider than
  // its header) if they were judged — so a clean, empty outcome can only mean the fence held. And they
  // are named at paths that do NOT EXIST: the fence short-circuits before the read, so an ENOENT here
  // would be the failure. That is what makes "never judged" a stronger claim than "never written".
  const frozen = ["docs/history/planted-control.md", "docs/architecture/history/planted-control.md"];

  const outcome = formatDocs(frozen, true);

  expect(outcome.dirty).toStrictEqual([]);
  expect(outcome.refused).toStrictEqual([]);
  expect(outcome.scanned).toBe(2);
});

test("FROZEN ARCHAEOLOGY: neither tree appears in the resolved corpus", () => {
  // The population half of the same fence, against the REAL tree rather than a fixture — 628 tracked
  // files across the two trees must all be absent, and `docs/architecture/` must still be present, or
  // the exclusion would have been written as "drop the living tree" rather than "drop the frozen ones".
  const targets = formatTargets([]);

  expect(targets.filter((path) => path.startsWith("docs/history/"))).toStrictEqual([]);
  expect(targets.filter((path) => path.startsWith("docs/architecture/history/"))).toStrictEqual([]);
  expect(targets.some((path) => path.startsWith("docs/architecture/core/"))).toBe(true);
});

test("WIDENING: class 2 is admitted, and the bytes this repo does not author are not", () => {
  // Class 2 (#2144) is the skills tree plus the `tooling/` guides the constitution cites as law. The two
  // exclusions are the `docs/vendor/**` rule applied to a new tree, and each would fail differently:
  // the DevTools closure is hash-validated (formatting it reds `devtools-frontend-assets`), and
  // `flags.md` is DERIVED, so admitting it would deadlock `check:docs` against `check:ledgers-fresh`.
  const targets = formatTargets([]);

  expect(targets).toContain("tooling/src/verify/gates/GATE-AUTHORING.md");
  expect(targets).toContain(".claude/skills/orchestrator-runbook/SKILL.md");
  expect(targets.filter((path) => path.startsWith("tooling/src/snap/lib/devtools-frontend/"))).toStrictEqual([]);
  expect(targets).not.toContain(".claude/skills/snap-driving/reference/flags.md");
});

test("CLASS 3: the root entry points are admitted, and the generated-block file is not", () => {
  // Widened by PATH, not by the pair the row enumerated: `README.md` is a third root file matching the
  // row's own description, and enumerating would have missed it the way omission missed the second
  // archaeology tree. `AGENTS.md` is fenced because its lines 1-37 are written by `pnpm agents:sync`,
  // whose array emits no blank line at either marker seam — the exact two blanks this formatter wants —
  // and whose freshness is the REGISTERED `check:agents` stage. Admitting it makes two stages unable to
  // be green at once. That fence is temporary; its successor is two blank lines in the generator.
  const targets = formatTargets([]);

  expect(targets).toContain("CLAUDE.md");
  expect(targets).toContain("README.md");
  expect(targets).not.toContain("AGENTS.md");
});

test("CLASS 3: the `@` import directive survives a REAL write, not just an empty pass", ({ scratch }) => {
  // `CLAUDE.md` line 1 is `@docs/architecture/core/AGENTS.md` — a directive the harness resolves, not
  // prose. The file happens to be canonical today, so "the formatter proposed nothing" would prove
  // nothing about what happens when it DOES write. So the defect is planted ELSEWHERE (a `\~` the
  // formatter removes, far from line 1) and the assertion is that the write happened AND line 1 came
  // through byte-exact. A blank line inserted above or below it would fail this too, since it pins the
  // first two lines. Same construction for `README.md`'s own first line.
  const directive = "@docs/architecture/core/AGENTS.md";
  const body = `${directive}\n\n# Root entry point\n\nA line with a \\~250 escape the formatter removes.\n`;

  const { bytes, outcome } = format(scratch, "CLAUDE-like.md", body);

  expect(outcome.dirty).toStrictEqual([join(scratch, "CLAUDE-like.md")]); // it really did write
  expect(bytes).toContain("~250"); // the planted defect really was repaired
  expect(bytes.split("\n")[0]).toBe(directive); // …and the directive is untouched
  expect(bytes.split("\n")[1]).toBe("");
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
