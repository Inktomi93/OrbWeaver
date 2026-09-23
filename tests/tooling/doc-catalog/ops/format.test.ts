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
  // the exact spelling `.claude/rules/writing.md` uses as its own example), so dropping it would BE the
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

test("SOURCE FIDELITY: a template literal nested inside single-backtick code delimiters is REFUSED", ({ scratch }) => {
  const body = `${FRONTMATTER}The guard is \`startsWith(\`prefix ${"${EXEMPT_DIR}"}/\`)\`, not a prefix guess.\n`;

  const { bytes, outcome } = format(scratch, "nested-backtick.md", body);

  expect(outcome.dirty).toStrictEqual([]);
  expect(bytes).toBe(body);
  expect(outcome.refused.map((r) => r.file)).toStrictEqual([join(scratch, "nested-backtick.md")]);
  const reason = outcome.refused[0]?.reason ?? "";
  expect(reason).toContain("line 6");
  expect(reason).toContain("longer backtick delimiter");
});

test("SOURCE FIDELITY: longer delimiters carry a template literal, and ordinary adjacent code spans remain valid", ({ scratch }) => {
  const body = `${FRONTMATTER}The guard is \`\`startsWith(\`prefix ${"${EXEMPT_DIR}"}/\`)\`\`, beside \`left\` and \`right\`.\n`;

  const { bytes, outcome } = format(scratch, "nested-backtick-ok.md", body);

  expect(outcome.refused).toStrictEqual([]);
  expect(bytes).toBe(body);
});

test("SOURCE FIDELITY: contiguous code-template-code fragments are conservatively refused, with a content-preserving canonical spelling", ({ scratch }) => {
  const ambiguous = `${FRONTMATTER}The pieces are \`left\`${"${NAME}"}\`right\`.\n`;
  const refused = format(scratch, "adjacent-template-fragments.md", ambiguous);

  expect(refused.bytes).toBe(ambiguous);
  expect(refused.outcome.refused.map((entry) => entry.file)).toStrictEqual([join(scratch, "adjacent-template-fragments.md")]);
  expect(refused.outcome.refused[0]?.reason).toContain("longer backtick delimiter");

  const fencedCarrier = "```txt\n`left`${NAME}`right`\n```\n\n";
  const canonicalSpan = "The pieces are ``left``${NAME}``right``.\n";
  const canonical = `${FRONTMATTER}${fencedCarrier}${canonicalSpan}\n${canonicalSpan}`;
  const accepted = format(scratch, "adjacent-template-fragments-ok.md", canonical);

  expect(accepted.outcome.refused).toStrictEqual([]);
  expect(accepted.bytes).toBe(canonical);
  const content = accepted.bytes.slice(FRONTMATTER.length);
  expect(content.startsWith(fencedCarrier)).toBe(true);
  const spanPattern = /^The pieces are ``([^`]+)``(\$\{[^}]+\})``([^`]+)``\.$/u;
  expect(
    content
      .slice(fencedCarrier.length)
      .trim()
      .split("\n\n")
      .map((line) => spanPattern.exec(line)?.slice(1)),
  ).toEqual([
    ["left", "${NAME}", "right"],
    ["left", "${NAME}", "right"],
  ]);
  expect(content.slice(fencedCarrier.length).replaceAll("``", "")).toBe("The pieces are left${NAME}right.\n\nThe pieces are left${NAME}right.\n");
  const second = format(scratch, "adjacent-template-fragments-ok.md", accepted.bytes);
  expect(second.outcome.refused).toStrictEqual([]);
  expect(second.outcome.dirty).toStrictEqual([]);
  expect(second.bytes).toBe(accepted.bytes);
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
  expect(targets.some((path) => path.startsWith("docs/law/"))).toBe(true);
});

test("WIDENING: class 2 is admitted, and only the bytes this repo does not AUTHOR are fenced", () => {
  // Class 2 (#2144) is the skills tree plus the `tooling/` guides the constitution cites as law. ONE
  // exclusion survives: the DevTools closure is vendored AND hash-validated, so formatting the one `.md`
  // in it reds `devtools-frontend-assets` rather than tidying a doc.
  //
  // The GENERATED `flags.md` was the second, until #2178. It is asserted PRESENT here now: its deadlock
  // (`check:docs` wanting escapes that `check:ledgers-fresh` would overwrite) was closed at the SOURCE —
  // code spans in `snap/ops/flags-metadata.ts` — rather than by widening the fence, so admitting it is the
  // state to defend. `tests/tooling/verify/ops/gen/snap-flags-index.test.ts` holds the other half: the
  // derived index must keep the literals (`__orb`, `path[,path]`) that escaping would have destroyed.
  const targets = formatTargets([]);

  expect(targets).toContain("tooling/src/verify/gates/GATE-AUTHORING.md");
  expect(targets).toContain(".claude/skills/orchestrator/SKILL.md");
  expect(targets).toContain(".claude/skills/snap-driving/reference/flags.md");
  expect(targets.filter((path) => path.startsWith("tooling/src/snap/lib/devtools-frontend/"))).toStrictEqual([]);
});

test("CLASS 3: every root entry point is admitted, including the always-on AGENTS.md", () => {
  // Widened by PATH, not by enumeration, so a new root file is owned from birth. `AGENTS.md` is also read
  // by the `check:agents` stage; asserting it is PRESENT stops an exclusion creeping in the next time the
  // two stages disagree about its bytes.
  const targets = formatTargets([]);

  // The REPO-RELATIVE spelling `git ls-files` emits, which is what `CLASS_3_ROOT` matches against.
  expect(targets).toContain("README.md");
  expect(targets).toContain("AGENTS.md");
});

test("CLASS 3: the `@` import directive survives a REAL write, not just an empty pass", ({ scratch }) => {
  // A root entry point may open with an `@path` import — a directive the harness resolves, not
  // prose. "The formatter proposed nothing" on a clean file would prove nothing about what happens when
  // it DOES write. So the defect is planted ELSEWHERE (a `\~` the
  // formatter removes, far from line 1) and the assertion is that the write happened AND line 1 came
  // through byte-exact. A blank line inserted above or below it would fail this too, since it pins the
  // first two lines. Same construction for `README.md`'s own first line.
  const directive = "@docs/law/Constitution.md";
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

test("ESCAPE DELTA: a code span split by bare pipes in a cell is REFUSED, not cemented as literal backticks", ({ scratch }) => {
  // THE #2235 DEFECT, reduced. An author writes a code span inside a table cell and the span contains a
  // bare `|`. The pipe is a CELL BOUNDARY before it is content, so the parse never forms the span: the
  // backticks land in `text` nodes as literal characters, split across three cells. The serializer then
  // escapes them, and the author's code span is written back as literal escaped backticks — the exact
  // byte shape #2145 was filed to repair on `.claude/agents/side-eye.md:170`.
  //
  // BOTH EXISTING GUARDS ARE BLIND BY CONSTRUCTION, which is why this arm exists:
  //   · the overflow census fires only when a body row out-widths its HEADER, and here the header is
  //     declared 5 wide and the split row is 5 wide, so there is nothing to count;
  //   · `fidelityKey` compares PARSE TREES, and the escape is render-identical — the loss already
  //     happened at parse time, so comparing the render to itself can never see it.
  // The signal exists only BETWEEN the source and the output: a backtick bare in the source and escaped
  // in the output is a code span the parse did not form.
  const body = `${FRONTMATTER}| # | Flag | Alt | Alt2 | Why |\n| - | - | - | - | - |\n| 1 | the flag \`--theme <name | id | none>\` splits | probe |\n`;

  const { bytes, outcome } = format(scratch, "escape-delta.md", body);

  expect(outcome.dirty).toStrictEqual([]);
  expect(bytes).toBe(body); // NOT written — the whole point is that the loss is not cemented
  expect(outcome.refused.map((r) => r.file)).toStrictEqual([join(scratch, "escape-delta.md")]);
  const reason = outcome.refused[0]?.reason ?? "";
  expect(reason).toContain("2 backtick(s)");
  expect(reason).toContain("line 8"); // 4 frontmatter lines + blank + header + delimiter row + the row
  expect(reason).toContain("\\|");
});

test("ESCAPE DELTA: an ALREADY-escaped literal backtick is stable and still formats", ({ scratch }) => {
  // THE PLANTED CONTROL IN THE OTHER DIRECTION, and the arm that keeps the refusal from being a blanket:
  // a guard that only ever refuses is as useless as one that only ever says "fine". A literal backtick
  // the author ALREADY escaped is a deliberate spelling, not a lost span — source and output carry the
  // same escape, the delta is zero, and the file must still format. The planted `\~250` makes the write
  // real, so this cannot pass by the formatter merely proposing nothing.
  const body = `${FRONTMATTER}A literal \\\` in prose, a real \`code span\`, and a \\~250 escape to repair.\n`;

  const { bytes, outcome } = format(scratch, "escaped-ok.md", body);

  expect(outcome.refused).toStrictEqual([]);
  expect(outcome.dirty).toStrictEqual([join(scratch, "escaped-ok.md")]); // it really did write
  expect(bytes).toContain("~250"); // the planted defect really was repaired
  expect(bytes).toContain("\\`"); // …and the deliberate escape survived
  expect(bytes).toContain("`code span`");
});
