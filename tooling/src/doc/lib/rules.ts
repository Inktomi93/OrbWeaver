// The structural rules for the governed docs tree, PURE over a `DocTree` snapshot: allowed folders,
// per-kind frontmatter, required sections, size caps, work-item shape, ADR id uniqueness, and generated
// index freshness. `pnpm check:agents` runs them (through `ops/check.ts`); the writing rules 1, 2 and 4
// over the same docs come from `_shared/prose-rules.ts` and are composed there, not here.
import { ADR_KIND, DOC_TOOL_TREES, frontmatterErrors, ITEM_KINDS, ITEM_STATES, PLAN_KIND, parseFrontmatter } from "#doc-catalog";
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

/** The legacy top-level entries of `docs/`, kept until each migrates. SHRINK-ONLY and two-sided: a row
 *  whose entry is gone is itself a finding, so the list cannot outlive what it exempts. */
export const LEGACY_ROOTS: readonly string[] = [
  "architecture",
  "design",
  "history",
  "reviews",
  "vendor",
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

/** Per-kind rules. Keys are the OPTIONAL keys a kind may carry beyond `kind`/`status`/`updated`. */
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

function generatedProblems(doc: GovernedDoc, expected: ReadonlyMap<string, string>): readonly string[] {
  const { fields } = splitDocument(doc.source);
  const problems: string[] = [];
  if (fields === null || fields["kind"] !== INDEX_KIND || fields["status"] !== "active" || Object.keys(fields).length !== 2) {
    problems.push(`${doc.path}: a generated file carries exactly kind: index and status: active`);
  }
  const want = expected.get(doc.path);
  if (want !== undefined && want !== doc.source) {
    problems.push(`${doc.path}: stale generated file — run pnpm doc index`);
  }
  return problems;
}

function schemaProblems(doc: GovernedDoc, kinds: readonly string[]): readonly string[] {
  const parsed = parseFrontmatter(doc.source, doc.path);
  if (!parsed.present) {
    return [`${doc.path}: missing frontmatter (kind, status, updated)`];
  }
  const problems = [...frontmatterErrors(doc.path, parsed)];
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
    if (!(key === "kind" || key === "status" || key === "updated" || rule.keys.includes(key))) {
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

function planEntryProblems({ doc, parts, archived, name }: PlanEntry): readonly string[] {
  if (parts.length === 1) {
    return [`${doc.path}: a plan lives in its own folder: ${DOC_TOOL_TREES.plans}<slug>/${DESIGN_FILE}`];
  }
  const problems: string[] = [];
  if (name !== DESIGN_FILE && !(archived && parseNumberedName(name) !== null)) {
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

function adrIdProblems(tree: DocTree): readonly string[] {
  const problems: string[] = [];
  const seen = new Map<number, string>();
  for (const doc of tree.docs) {
    if (!doc.path.startsWith(DOC_TOOL_TREES.adr) || isGeneratedPath(doc.path)) {
      continue;
    }
    const name = parseNumberedName(basenameOf(doc.path));
    if (name === null) {
      problems.push(`${doc.path}: an ADR file is NNNN-<slug>.md — mint one with pnpm doc new adr <slug>`);
      continue;
    }
    const twin = seen.get(name.id);
    if (twin !== undefined) {
      problems.push(`${doc.path}: id ${String(name.id)} is already ${twin}`);
    }
    seen.set(name.id, doc.path);
    if (tree.registryIds.has(name.id)) {
      problems.push(
        `${doc.path}: id ${String(name.id)} is still anchored in the legacy registry — move the row with pnpm doc migrate-ledger, or pick the next free id`,
      );
    }
    if (tree.reserved !== null && name.id >= tree.reserved.lo && name.id <= tree.reserved.hi) {
      problems.push(`${doc.path}: id ${String(name.id)} is inside the reserved range D${String(tree.reserved.lo)}–D${String(tree.reserved.hi)}`);
    }
  }
  return problems;
}

function itemProblems(tree: DocTree): readonly string[] {
  const items = tree.docs.flatMap((doc) =>
    (isItemPath(doc.path) || planSlugOf(doc.path) !== null) && parseNumberedName(basenameOf(doc.path)) !== null ? [parseItem(doc.path, doc.source)] : [],
  );
  const known = new Set(items.flatMap((item) => (item === null ? [] : [item.id])));
  return items.flatMap((item) => (item === null ? [] : itemShapeProblems(item, known)));
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
  return [...rootProblems(tree), ...perDoc, ...missingGenerated, ...planFolderProblems(tree), ...adrIdProblems(tree), ...itemProblems(tree)];
}
