// The structural rules for the governed docs tree, PURE over a `DocTree` snapshot: allowed folders,
// per-kind frontmatter, required sections, size caps, flat trees and stray files, work-item shape and
// id uniqueness, ADR id uniqueness, and generated-file freshness.
// `pnpm check:agents` runs them (through `ops/check.ts`); the writing rules 1, 2 and 4 over the same
// docs come from `_shared/prose-rules.ts` and are composed there, not here.
import {
  ADR_KIND,
  DATE_RE,
  DOC_TOOL_TREES,
  FIRST_RESERVED_RULING,
  ITEM_KINDS,
  ITEM_STATES,
  LAST_RESERVED_RULING,
  PLAN_KIND,
  parseFrontmatter,
} from "#doc-catalog";
import type { DocTree, GovernedDoc } from "../contract/types.ts";
import { sectionsOf, splitDocument } from "./frontmatter-write.ts";
import { expectedGeneratedFiles } from "./generated.ts";
import { DESIGN_FILE, isGeneratedPath, PLAN_ARCHIVE_DIR, planSlugOf, TASKS_FILE } from "./indexes.ts";
import { isItemPath, itemShapeProblems, parseItem } from "./items.ts";
import { basenameOf, parseNumberedName } from "./names.ts";
import { ADR_SECTIONS, ITEM_SECTIONS, PLAN_SECTIONS, sectionNames } from "./templates.ts";

const KIB = 1024;
/** Size caps per kind, in bytes: 8 KiB for a decision, 4 KiB for an item, 48 KiB for a plan or a law doc. */
const ADR_CAP = 8192;
const PLAN_CAP = 49_152;
const ITEM_CAP = 4096;
const LAW_CAP = 49_152;
const MISSION_PATH = "docs/Mission.md";
const CATALOG_DIR = "catalog";
const INDEX_KIND = "index";
const ARCHIVED = "archived";
const ARCHIVE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REQUIRED_KEYS = ["kind", "status", "updated"] as const;
/** The reserved D window. `pnpm doc new adr` never mints into it; a main-era ruling is re-minted there with
 *  its ORIGINAL number (D86 is one), so an ADR file inside the window is legal. */
const RESERVED = { lo: FIRST_RESERVED_RULING, hi: LAST_RESERVED_RULING } as const;

/** The legacy top-level entries of `docs/`, kept until each migrates. SHRINK-ONLY and two-sided: a row
 *  whose entry is gone is itself a finding, so the list cannot outlive what it exempts. */
export const LEGACY_ROOTS: readonly string[] = [
  "architecture",
  "design",
  "history",
  "reviews",
  "retro-workboard.md",
  "Qwen_Offline_Investigation.md",
  "client-smalls-lane.md",
  "barrel-star-reexport-residue.md",
];

interface KindRule {
  readonly sections: readonly string[];
  readonly cap: number;
  readonly statuses: readonly string[];
  readonly keys: readonly string[];
}

const ITEM_KEYS = ["priority", "area", "lane", "blocked", "plan", "evidence", "reviewed"];
const SUPERSESSION_KEYS = ["supersedes", "superseded-by"];

/** Per-kind rules. Keys are the OPTIONAL keys a kind may carry beyond `kind`/`status`/`updated`. This map
 *  is the governed tree's whole kind vocabulary; the legacy catalog's `VALID_KINDS` is untouched by it. */
export const KIND_RULES: ReadonlyMap<string, KindRule> = new Map([
  [ADR_KIND, { sections: sectionNames(ADR_SECTIONS), cap: ADR_CAP, statuses: ["active", "superseded"], keys: SUPERSESSION_KEYS }],
  [PLAN_KIND, { sections: sectionNames(PLAN_SECTIONS), cap: PLAN_CAP, statuses: ["active", "complete", ARCHIVED], keys: [] }],
  ["law", { sections: [], cap: LAW_CAP, statuses: ["active", "superseded"], keys: SUPERSESSION_KEYS }],
  ["reference", { sections: [], cap: LAW_CAP, statuses: ["active"], keys: [] }],
  ["index", { sections: [], cap: LAW_CAP, statuses: ["active"], keys: [] }],
  ...ITEM_KINDS.map((kind): readonly [string, KindRule] => [
    kind,
    { sections: sectionNames(ITEM_SECTIONS), cap: ITEM_CAP, statuses: [...ITEM_STATES], keys: ITEM_KEYS },
  ]),
]);

/** Which kinds a path may carry, from its tree and file name. */
function kindsFor(path: string): readonly string[] {
  if (isGeneratedPath(path)) {
    return [INDEX_KIND];
  }
  if (path.startsWith(DOC_TOOL_TREES.adr)) {
    return [ADR_KIND];
  }
  if (path.startsWith(DOC_TOOL_TREES.work) || (path.startsWith(PLAN_ARCHIVE_DIR) && parseNumberedName(basenameOf(path)) !== null)) {
    return [...ITEM_KINDS];
  }
  if (path.startsWith(DOC_TOOL_TREES.plans)) {
    return [PLAN_KIND];
  }
  if (path.startsWith(DOC_TOOL_TREES.law)) {
    return ["law"];
  }
  // The mission doc: foundational prose that reads as law and is filed as either.
  return ["law", "reference"];
}

function rootProblems(tree: DocTree): readonly string[] {
  const allowed = new Set([
    ...Object.values(DOC_TOOL_TREES).map((prefix) => prefix.slice("docs/".length, -1)),
    basenameOf(MISSION_PATH),
    CATALOG_DIR,
    ...LEGACY_ROOTS,
  ]);
  const present = new Set(tree.root.map((entry) => entry.name));
  const problems = tree.root
    .filter((entry) => !allowed.has(entry.name))
    .map(
      (entry) =>
        `docs/${entry.name}: not a docs home — put a decision under ${DOC_TOOL_TREES.adr}, a program under ${DOC_TOOL_TREES.plans}, an item under ${DOC_TOOL_TREES.work}, law under ${DOC_TOOL_TREES.law}`,
    );
  return [
    ...problems,
    ...LEGACY_ROOTS.filter((name) => !present.has(name)).map(
      (name) => `docs/${name}: named by LEGACY_ROOTS in tooling/src/doc/lib/rules.ts and gone — delete the row`,
    ),
  ];
}

/** The three flat trees and the file shape each one holds (a plan folder's depth is judged with the plan rules). */
const FLAT_TREES: readonly { readonly prefix: string; readonly shape: string }[] = [
  { prefix: DOC_TOOL_TREES.work, shape: `an item is ${DOC_TOOL_TREES.work}NNNN-<slug>.md` },
  { prefix: DOC_TOOL_TREES.adr, shape: `an ADR is ${DOC_TOOL_TREES.adr}NNNN-<slug>.md` },
  { prefix: DOC_TOOL_TREES.law, shape: `a law doc is ${DOC_TOOL_TREES.law}<Name>.md` },
];

function nestingProblem(path: string): string | null {
  const tree = FLAT_TREES.find(({ prefix }) => path.startsWith(prefix) && path.slice(prefix.length).includes("/"));
  return tree === undefined ? null : `${path}: ${tree.prefix} is flat — ${tree.shape}`;
}

/** Every file under a governed tree is markdown, and three of the trees are flat. A nested item or a
 *  stray asset is otherwise invisible to a walk that reads `.md` files only. */
function layoutProblems(tree: DocTree): readonly string[] {
  return tree.files.flatMap((path) => {
    if (!path.endsWith(".md")) {
      return [`${path}: only markdown lives under a governed tree — move or delete it`];
    }
    const nested = nestingProblem(path);
    return nested === null ? [] : [nested];
  });
}

function generatedProblems(doc: GovernedDoc, expected: ReadonlyMap<string, string>): readonly string[] {
  const { fields } = splitDocument(doc.source);
  const problems: string[] = [];
  if (fields === null || fields["kind"] !== INDEX_KIND || fields["status"] !== "active" || Object.keys(fields).length !== 2) {
    problems.push(`${doc.path}: a generated file carries exactly kind: index and status: active`);
  }
  const want = expected.get(doc.path);
  if (want === undefined) {
    problems.push(`${doc.path}: orphan generated file, its plan has no items — pnpm doc index deletes it`);
  } else if (want !== doc.source) {
    problems.push(`${doc.path}: stale generated file — run pnpm doc index`);
  }
  return problems;
}

/** The frontmatter schema for a governed doc: a well-formed flat block, the three required keys, a dated
 *  `updated`, a kind the path admits, a status in the kind's set, no key the kind does not take. Judged
 *  here rather than by the legacy catalog's validator, whose vocabulary stays the legacy tree's. */
function schemaProblems(doc: GovernedDoc, kinds: readonly string[]): readonly string[] {
  const parsed = parseFrontmatter(doc.source, doc.path);
  if (!parsed.present) {
    return [`${doc.path}: missing frontmatter (kind, status, updated)`];
  }
  const problems = [...parsed.errors, ...REQUIRED_KEYS.filter((key) => !(key in parsed.fields)).map((key) => `${doc.path}: missing frontmatter key ${key}`)];
  const updated = parsed.fields["updated"];
  if (updated !== undefined && !DATE_RE.test(updated)) {
    problems.push(`${doc.path}: updated must be YYYY-MM-DD`);
  }
  const kind = parsed.fields["kind"] ?? "";
  if (!kinds.includes(kind)) {
    problems.push(`${doc.path}: kind ${kind || "(none)"} is not allowed here; this path takes ${kinds.join(" | ")}`);
    return problems;
  }
  const rule = KIND_RULES.get(kind);
  if (rule === undefined) {
    return problems;
  }
  const status = parsed.fields["status"] ?? "";
  if (!rule.statuses.includes(status)) {
    problems.push(`${doc.path}: status ${status || "(none)"} is not one of ${rule.statuses.join(" | ")} for kind ${kind}`);
  }
  for (const key of Object.keys(parsed.fields)) {
    if (!((REQUIRED_KEYS as readonly string[]).includes(key) || rule.keys.includes(key))) {
      problems.push(`${doc.path}: key ${key} is not allowed on kind ${kind}`);
    }
  }
  return problems;
}

function bodyProblems(doc: GovernedDoc): readonly string[] {
  const { fields, body } = splitDocument(doc.source);
  const rule = KIND_RULES.get(fields?.["kind"] ?? "");
  if (rule === undefined) {
    return [];
  }
  const problems: string[] = [];
  const present = new Set(sectionsOf(body));
  for (const section of rule.sections) {
    if (!present.has(section)) {
      problems.push(`${doc.path}: missing required section ## ${section}`);
    }
  }
  const bytes = Buffer.byteLength(doc.source, "utf8");
  if (bytes > rule.cap) {
    problems.push(`${doc.path}: ${String(bytes)} bytes exceeds the ${String(rule.cap / KIB)} KiB cap for kind ${fields?.["kind"] ?? ""} — split it or cut it`);
  }
  return problems;
}

interface PlanEntry {
  readonly doc: GovernedDoc;
  readonly parts: readonly string[];
  readonly archived: boolean;
  readonly folder: string;
  readonly name: string;
}

function planEntry(doc: GovernedDoc): PlanEntry {
  const parts = doc.path.slice(DOC_TOOL_TREES.plans.length).split("/");
  const archived = parts[0] === "archive";
  return { doc, parts, archived, folder: archived ? parts.slice(0, 2).join("/") : (parts[0] ?? ""), name: parts.at(-1) ?? "" };
}

const PLAN_DEPTH = 2;
const ARCHIVE_DEPTH = 3;

function planEntryProblems({ doc, parts, archived, name }: PlanEntry): readonly string[] {
  if (parts.length === 1) {
    return [`${doc.path}: a plan lives in its own folder: ${DOC_TOOL_TREES.plans}<slug>/${DESIGN_FILE}`];
  }
  const problems: string[] = [];
  const nested = parts.length > (archived ? ARCHIVE_DEPTH : PLAN_DEPTH);
  if (nested || (name !== DESIGN_FILE && !(archived && parseNumberedName(name) !== null))) {
    problems.push(`${doc.path}: a plan folder holds ${DESIGN_FILE} and ${TASKS_FILE} only`);
  }
  if (archived && !ARCHIVE_FOLDER_RE.test(parts[1] ?? "")) {
    problems.push(`${doc.path}: an archived plan folder is YYYY-MM-DD-<slug>`);
  }
  if (archived && name === DESIGN_FILE && splitDocument(doc.source).fields?.["status"] !== ARCHIVED) {
    problems.push(`${doc.path}: an archived plan's status is ${ARCHIVED}`);
  }
  return problems;
}

/** A plan folder holds `design.md` (plus the generated `tasks.md`); an archive folder is dated and its
 *  design is `archived`. */
function planFolderProblems(tree: DocTree): readonly string[] {
  const entries = tree.docs.filter((doc) => doc.path.startsWith(DOC_TOOL_TREES.plans) && !isGeneratedPath(doc.path)).map(planEntry);
  const paths = new Set(tree.docs.map((doc) => doc.path));
  const folders = new Set(entries.filter((entry) => entry.parts.length > 1).map((entry) => entry.folder));
  const missing = [...folders]
    .filter((folder) => !paths.has(`${DOC_TOOL_TREES.plans}${folder}/${DESIGN_FILE}`))
    .map((folder) => `${DOC_TOOL_TREES.plans}${folder}/: no ${DESIGN_FILE} — a plan folder without a design is not a plan`);
  return [...entries.flatMap(planEntryProblems), ...missing];
}

function adrIds(tree: DocTree): readonly { readonly path: string; readonly id: number | null }[] {
  return tree.docs
    .filter((doc) => doc.path.startsWith(DOC_TOOL_TREES.adr) && !isGeneratedPath(doc.path))
    .map((doc) => {
      const name = parseNumberedName(basenameOf(doc.path));
      return { path: doc.path, id: name === null ? null : name.id };
    });
}

function adrIdProblems(tree: DocTree): readonly string[] {
  const problems: string[] = [];
  const seen = new Map<number, string>();
  for (const { path, id } of adrIds(tree)) {
    if (id === null) {
      problems.push(`${path}: an ADR file is NNNN-<slug>.md — mint one with pnpm doc new adr <slug>`);
      continue;
    }
    const twin = seen.get(id);
    if (twin !== undefined) {
      problems.push(`${path}: id ${String(id)} is already ${twin}`);
    }
    seen.set(id, path);
  }
  return problems;
}

/** The next free D id, skipping the reserved window — the one derivation the ADR minting verb uses. */
export function nextFreeRulingId(adrIdList: readonly number[]): number {
  const next = Math.max(0, ...adrIdList) + 1;
  return next >= RESERVED.lo && next <= RESERVED.hi ? RESERVED.hi + 1 : next;
}

function itemProblems(tree: DocTree): readonly string[] {
  const items = tree.docs.flatMap((doc) =>
    (isItemPath(doc.path) || planSlugOf(doc.path) !== null) && parseNumberedName(basenameOf(doc.path)) !== null ? [parseItem(doc.path, doc.source)] : [],
  );
  const known = new Set(items.flatMap((item) => (item === null ? [] : [item.id])));
  const seen = new Map<number, string>();
  const problems: string[] = [];
  for (const item of items) {
    if (item === null) {
      continue;
    }
    const twin = seen.get(item.id);
    if (twin !== undefined) {
      problems.push(`${item.path}: id ${String(item.id)} is already ${twin} — two lanes minted the same next id; renumber one with git mv and pnpm doc index`);
    }
    seen.set(item.id, item.path);
    problems.push(...itemShapeProblems(item, known));
    if (item.state === "done" && item.evidence !== null && !tree.evidenceOnMain.has(item.evidence)) {
      problems.push(`${item.path}: evidence ${item.evidence} is not a commit on main — pnpm doc land <id> --evidence <sha> names one`);
    }
  }
  return problems;
}

/** Every structural finding over the governed tree. Empty = clean. */
export function docProblems(tree: DocTree): readonly string[] {
  const expected = expectedGeneratedFiles(tree.docs);
  const perDoc = tree.docs.flatMap((doc) => {
    const kinds = kindsFor(doc.path);
    if (kinds[0] === INDEX_KIND) {
      return generatedProblems(doc, expected);
    }
    return [...schemaProblems(doc, kinds), ...bodyProblems(doc)];
  });
  const missingGenerated = [...expected.keys()]
    .filter((path) => !tree.docs.some((doc) => doc.path === path))
    .map((path) => `${path}: missing generated file — run pnpm doc index`);
  return [
    ...rootProblems(tree),
    ...layoutProblems(tree),
    ...perDoc,
    ...missingGenerated,
    ...planFolderProblems(tree),
    ...adrIdProblems(tree),
    ...itemProblems(tree),
  ];
}
