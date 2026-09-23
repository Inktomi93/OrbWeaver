// The governed-tree rules on hand-built snapshots: each failure class beside the clean control that
// proves the same walk passes. No tree, no git — `docProblems` is pure over a `DocTree`.
import type { DocTree, GovernedDoc } from "../../../../tooling/src/doc/index.ts";
import {
  adrTemplate,
  docProblems,
  expectedGeneratedFiles,
  itemTemplate,
  LEGACY_ROOTS,
  nextFreeRulingId,
  planTemplate,
} from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const ADR = "docs/adr/0164-docs-plans-adrs.md";
const PLAN = "docs/plans/doc-system/design.md";
const ITEM = "docs/work/0001-ledger-split.md";
const MISSION = "docs/Mission.md";

function itemSource(fields: Readonly<Record<string, string>> = {}): string {
  return itemTemplate({ kind: "work", status: "open", updated: TODAY, ...fields }, "Ledger split");
}

const ON_MAIN = "0123456789abcdef0123456789abcdef01234567";

/** A tree whose generated files are exactly what a fresh render produces, so it is clean by construction. */
function tree(docs: Readonly<Record<string, string>>, overrides: Partial<DocTree> = {}): DocTree {
  const authored: GovernedDoc[] = Object.entries(docs).map(([path, source]) => ({ path, source }));
  const generated: GovernedDoc[] = [...expectedGeneratedFiles(authored)].map(([path, source]) => ({ path, source }));
  const all = [...authored, ...generated];
  return {
    root: [...LEGACY_ROOTS, "adr", "plans", "work", "law", "Mission.md", "catalog"].map((name) => ({ name, directory: !name.endsWith(".md") })),
    docs: all,
    files: all.map((doc) => doc.path),
    evidenceOnMain: new Set([ON_MAIN]),
    ...overrides,
  };
}

const CLEAN = {
  [ADR]: adrTemplate("Docs, plans and ADRs", TODAY),
  [PLAN]: planTemplate("Doc system", TODAY),
  [ITEM]: itemSource({ priority: "P1", area: "docs", plan: "doc-system" }),
  [MISSION]: "---\nkind: law\nstatus: active\nupdated: 2026-07-03\n---\n\n# Mission\n\nWhy.\n",
};

test("a tree whose generated files match a fresh render is clean", () => {
  expect(docProblems(tree(CLEAN))).toEqual([]);
});

test("an unknown top-level folder and a vanished legacy row are both findings (two-sided)", () => {
  const snapshot = tree(CLEAN);
  const root = [...snapshot.root.filter((entry) => entry.name !== "history"), { name: "notes", directory: true }];
  const problems = docProblems({ ...snapshot, root });
  expect(problems.some((line) => line.startsWith("docs/notes: not a docs home"))).toBe(true);
  expect(problems.some((line) => line.startsWith("docs/history: named by LEGACY_ROOTS"))).toBe(true);
});

test("a stale generated index is a finding that names the regenerating command", () => {
  const snapshot = tree(CLEAN);
  const docs = snapshot.docs.map((doc) => (doc.path === "docs/adr/README.md" ? { ...doc, source: `${doc.source}\nstale line\n` } : doc));
  expect(docProblems({ ...snapshot, docs })).toEqual(["docs/adr/README.md: stale generated file — run pnpm doc index"]);
});

test("a missing generated file is a finding", () => {
  const snapshot = tree(CLEAN);
  expect(docProblems({ ...snapshot, docs: snapshot.docs.filter((doc) => doc.path !== "docs/work/README.md") })).toEqual([
    "docs/work/README.md: missing generated file — run pnpm doc index",
  ]);
});

test("frontmatter is judged per kind: a wrong kind for the tree, a status outside the kind's set, a foreign key", () => {
  const wrongKind = tree({ ...CLEAN, [ADR]: adrTemplate("x", TODAY).replace("kind: adr", "kind: plan") });
  expect(docProblems(wrongKind)).toContain(`${ADR}: kind plan is not allowed here; this path takes adr`);
  const wrongStatus = tree({ ...CLEAN, [ADR]: adrTemplate("x", TODAY).replace("status: active", "status: done") });
  expect(docProblems(wrongStatus)).toContain(`${ADR}: status done is not one of active | superseded | rejected for kind adr`);
  const foreignKey = tree({ ...CLEAN, [ADR]: adrTemplate("x", TODAY).replace("status: active", "status: active\nlane: cb-x") });
  expect(docProblems(foreignKey)).toContain(`${ADR}: key lane is not allowed on kind adr`);
  const noBlock = tree({ ...CLEAN, [PLAN]: "# Plan\n\n## Goal\n" });
  expect(docProblems(noBlock)).toContain(`${PLAN}: missing frontmatter (kind, status, updated)`);
});

test("a required section is demanded by kind and a cap is enforced by kind", () => {
  const missing = tree({ ...CLEAN, [ADR]: adrTemplate("x", TODAY).replace("## Consequences", "## Outcomes") });
  expect(docProblems(missing)).toEqual([`${ADR}: missing required section ## Consequences`]);
  const eightKib = 8192;
  const fat = tree({ ...CLEAN, [ADR]: `${adrTemplate("x", TODAY)}${"z".repeat(eightKib)}\n` });
  expect(docProblems(fat).some((line) => line.startsWith(`${ADR}: `) && line.includes("exceeds the 8 KiB cap"))).toBe(true);
});

test("a plan needs its own folder with a design; there is no archive folder, and an item never lives in a plan folder", () => {
  const loose = tree({ ...CLEAN, "docs/plans/loose.md": planTemplate("Loose", TODAY) });
  expect(docProblems(loose)).toContain("docs/plans/loose.md: a plan lives in its own folder: docs/plans/<slug>/design.md");
  const extra = tree({ ...CLEAN, "docs/plans/doc-system/notes.md": planTemplate("Notes", TODAY) });
  expect(docProblems(extra)).toContain("docs/plans/doc-system/notes.md: a plan folder holds design.md and tasks.md only");
  const archived = tree({ ...CLEAN, "docs/plans/archive/2026-09-01-old/design.md": planTemplate("Old", TODAY).replace("status: active", "status: archived") });
  expect(docProblems(archived)).toEqual(
    expect.arrayContaining([
      "docs/plans/archive/2026-09-01-old/design.md: a plan folder holds design.md and tasks.md only",
      "docs/plans/archive/2026-09-01-old/design.md: status archived is not one of active | parked for kind plan",
    ]),
  );
  const moved = tree({ ...CLEAN, "docs/plans/doc-system/0002-moved.md": itemSource() });
  expect(docProblems(moved)).toContain("docs/plans/doc-system/0002-moved.md: a plan folder holds design.md and tasks.md only");
});

test("a parked plan carries a wake condition in the blocker grammar, and only a parked plan carries one", () => {
  const parked = (blocked: string): string => planTemplate("Doc system", TODAY).replace("status: active", `status: parked\nblocked: ${blocked}`);
  expect(docProblems(tree({ ...CLEAN, [PLAN]: parked("owner") }))).toEqual([]);
  expect(docProblems(tree({ ...CLEAN, [PLAN]: parked("wake path docs/adr/0200-x.md") }))).toEqual([]);
  expect(docProblems(tree({ ...CLEAN, [PLAN]: parked("on 1") }))).toEqual([]);
  expect(docProblems(tree({ ...CLEAN, [PLAN]: parked("on 99") }))).toEqual([`${PLAN}: blocked on 99, which is not an item under docs/work/`]);
  expect(docProblems(tree({ ...CLEAN, [PLAN]: parked("someday") }))).toEqual([
    `${PLAN}: a parked plan carries a reason: blocked: owner | on <id> | wake path <repo path> | wake gone <repo path>`,
  ]);
  const bare = planTemplate("Doc system", TODAY).replace("status: active", "status: parked");
  expect(docProblems(tree({ ...CLEAN, [PLAN]: bare }))).toEqual([
    `${PLAN}: a parked plan carries a reason: blocked: owner | on <id> | wake path <repo path> | wake gone <repo path>`,
  ]);
  const activeWithReason = planTemplate("Doc system", TODAY).replace("status: active", "status: active\nblocked: owner");
  expect(docProblems(tree({ ...CLEAN, [PLAN]: activeWithReason }))).toEqual([
    `${PLAN}: only a parked plan carries blocked — pnpm doc status active ${PLAN} clears it`,
  ]);
});

test("an ADR may be rejected", () => {
  expect(docProblems(tree({ ...CLEAN, [ADR]: adrTemplate("x", TODAY).replace("status: active", "status: rejected") }))).toEqual([]);
});

test("an ADR id must be unique and numbered; a re-minted reserved id is legal", () => {
  const twin = tree({ ...CLEAN, "docs/adr/0164-other.md": adrTemplate("Other", TODAY) });
  expect(docProblems(twin)).toContain(`docs/adr/0164-other.md: id 164 is already ${ADR}`);
  // D86 is a main-era ruling re-minted with its original number inside the reserved window.
  const reminted = tree({ ...CLEAN, "docs/adr/0086-main-era.md": adrTemplate("Main era", TODAY) });
  expect(docProblems(reminted)).toEqual([]);
  const named = tree({ ...CLEAN, "docs/adr/notes.md": adrTemplate("Notes", TODAY) });
  expect(docProblems(named)).toContain("docs/adr/notes.md: an ADR file is NNNN-<slug>.md — mint one with pnpm doc new adr <slug>");
});

test("the next free id is one past the highest ADR and never lands in the reserved window", () => {
  expect(nextFreeRulingId([1, 163, 164])).toBe(165);
  expect(nextFreeRulingId([1, 78])).toBe(106);
  // A re-minted reserved id below the ceiling does not pull the next id into the window.
  expect(nextFreeRulingId([78, 86])).toBe(106);
  expect(nextFreeRulingId([])).toBe(1);
});

test("two work items sharing one id is a finding, and so is done evidence that is not on main", () => {
  const twin = tree({ ...CLEAN, "docs/work/0001-other.md": itemSource() });
  expect(docProblems(twin)).toEqual([
    `docs/work/0001-other.md: id 1 is already ${ITEM} — two lanes minted the same next id; renumber one with git mv and pnpm doc index`,
  ]);
  const offMain = tree({ ...CLEAN, [ITEM]: itemSource({ status: "done", evidence: "abcdef1234567" }) });
  expect(docProblems(offMain)).toEqual([`${ITEM}: evidence abcdef1234567 is not a commit on main — pnpm doc land <id> --evidence <sha> names one`]);
  const onMain = tree({ ...CLEAN, [ITEM]: itemSource({ status: "done", evidence: ON_MAIN }) });
  expect(docProblems(onMain)).toEqual([]);
});

test("an orphan tasks.md, a nested item folder and a non-markdown file under a governed tree are findings", () => {
  const orphan = tree(CLEAN);
  const docs = [...orphan.docs, { path: "docs/plans/doc-system/tasks.md", source: "---\nkind: index\nstatus: active\n---\n\n# old\n" }];
  expect(docProblems({ ...orphan, docs: [...docs].filter((doc) => doc.path !== ITEM), files: docs.map((doc) => doc.path) })).toContain(
    "docs/plans/doc-system/tasks.md: orphan generated file, its plan has no items — pnpm doc index deletes it",
  );
  const nested = tree({ ...CLEAN, "docs/work/sub/0002-x.md": itemSource() });
  expect(docProblems(nested)).toContain("docs/work/sub/0002-x.md: docs/work/ is flat — an item is docs/work/NNNN-<slug>.md");
  const stray = tree(CLEAN, { files: [...tree(CLEAN).files, "docs/adr/notes.txt"] });
  expect(docProblems(stray)).toContain("docs/adr/notes.txt: only markdown lives under a governed tree — move or delete it");
});

test("the doc tool's kinds and states never widen the legacy catalog's vocabulary", async () => {
  const { frontmatterErrors, parseFrontmatter } = await import("../../../../tooling/src/doc-catalog/index.ts");
  const legacy = "docs/design/x.md";
  expect(frontmatterErrors(legacy, parseFrontmatter("---\nkind: bug\nstatus: doing\nupdated: 2026-09-23\nlane: cb-x\n---\n", legacy))).toEqual([
    `${legacy}: unsupported frontmatter key lane`,
    `${legacy}: invalid frontmatter kind bug`,
    `${legacy}: invalid frontmatter status doing`,
  ]);
});

test("a work item's final shape is judged: doing needs a lane, blocked needs a reason naming an item, done needs evidence", () => {
  const doing = tree({ ...CLEAN, [ITEM]: itemSource({ status: "doing" }) });
  expect(docProblems(doing)).toEqual([`${ITEM}: a doing item names its lane: pnpm doc set <id> doing --lane <lane>`]);
  const blockedBare = tree({ ...CLEAN, [ITEM]: itemSource({ status: "blocked" }) });
  expect(docProblems(blockedBare)).toEqual([
    `${ITEM}: a blocked item carries a reason: blocked: owner | on <id> | wake path <repo path> | wake gone <repo path>`,
  ]);
  const shell = tree({ ...CLEAN, [ITEM]: itemSource({ status: "blocked", blocked: "wake test -f x" }) });
  expect(docProblems(shell)).toEqual([`${ITEM}: a blocked item carries a reason: blocked: owner | on <id> | wake path <repo path> | wake gone <repo path>`]);
  const blockedGhost = tree({ ...CLEAN, [ITEM]: itemSource({ status: "blocked", blocked: "on 42" }) });
  expect(docProblems(blockedGhost)).toEqual([`${ITEM}: blocked on 42, which is not an item under docs/work/`]);
  const done = tree({ ...CLEAN, [ITEM]: itemSource({ status: "done" }) });
  expect(docProblems(done)).toEqual([`${ITEM}: a done item carries its evidence commit: pnpm doc land <id> --evidence <sha>`]);
  const badPriority = tree({ ...CLEAN, [ITEM]: itemSource({ priority: "high" }) });
  expect(docProblems(badPriority)).toEqual([`${ITEM}: priority must be P0..P3, found high`]);
  const complete = tree({ ...CLEAN, [ITEM]: itemSource({ status: "blocked", blocked: "owner" }) });
  expect(docProblems(complete)).toEqual([]);
});

test("a generated file carries exactly kind: index and status: active", () => {
  const snapshot = tree(CLEAN);
  const docs = snapshot.docs.map((doc) =>
    doc.path === "docs/law/README.md" ? { ...doc, source: doc.source.replace("status: active", "status: active\nupdated: 2026-09-23") } : doc,
  );
  const problems = docProblems({ ...snapshot, docs });
  expect(problems).toContain("docs/law/README.md: a generated file carries exactly kind: index and status: active");
});
