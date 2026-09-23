import type { DocumentIndex } from "../contract/resource-document.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import type { AuthoredTextCorpus } from "../contract/resource-text.ts";

const LAW_AUTHORITIES: ReadonlySet<string> = new Set(["normative", "current-reference", "operational"]);
const LIVING_STATUS = "active";
const LINK_SCAN_DIRS: readonly string[] = ["docs/law"];
/** Live program designs: each plan's `design.md`. A finished plan is deleted, so every one present is living. */
const PLANS_DIR = "docs/plans";
const PLAN_DESIGN_FILE = "design.md";
/** The D-ledger (`docs/adr/`) is law and sits outside the catalog, so it is admitted by directory. */
const AUDIT_SCAN_DIRS: readonly string[] = ["docs/law", "docs/adr"];

export const CATALOG_REL = "docs/catalog/catalog.json";
export const LAW_OUTSIDE_DOCS: readonly string[] = ["tooling/src/verify/gates/GATE-AUTHORING.md", "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md"];

type CatalogDoc = Readonly<Record<string, unknown>>;

export interface DanglingRefCorpora {
  readonly links: readonly string[];
  readonly audit: readonly string[];
  readonly symbols: readonly string[];
  readonly law: number;
  readonly design: number;
  readonly lawOutsideDocs: number;
  readonly lawOutsideDocsMissing: readonly string[];
  readonly catalogued: number;
}

function inDirectories(paths: readonly string[], dirs: readonly string[]): readonly string[] {
  return paths.filter((path) => dirs.some((dir) => path.startsWith(`${dir}/`)));
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function fieldOf(doc: CatalogDoc, key: string): string | undefined {
  const fields = recordOf(recordOf(doc["frontmatter"])?.["fields"]);
  const value = fields?.[key];
  return typeof value === "string" ? value : undefined;
}

function catalogDoc(value: unknown): CatalogDoc | undefined {
  return recordOf(value);
}

function isLivingLaw(doc: CatalogDoc, available: ReadonlySet<string>): boolean {
  const path = typeof doc["path"] === "string" ? doc["path"] : undefined;
  const receipt = recordOf(doc["receipt"]);
  const authority = typeof receipt?.["authority"] === "string" ? receipt["authority"] : undefined;
  return path !== undefined && authority !== undefined && fieldOf(doc, "status") === LIVING_STATUS && available.has(path) && LAW_AUTHORITIES.has(authority);
}

function cataloguedLaw(value: JsonValue, available: ReadonlySet<string>): readonly string[] {
  const docs = typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, "documents") : undefined;
  if (!Array.isArray(docs)) {
    throw new Error(`${CATALOG_REL} must contain a documents array`);
  }
  const law: string[] = [];
  for (const raw of docs) {
    const doc = catalogDoc(raw);
    if (doc !== undefined && typeof doc["path"] === "string" && isLivingLaw(doc, available)) {
      law.push(doc["path"]);
    }
  }
  return law;
}

export function danglingRefCorpora(value: JsonValue, docPaths: readonly string[], outside: readonly string[]): DanglingRefCorpora {
  const law = cataloguedLaw(value, new Set(docPaths));
  const design = inDirectories(docPaths, [PLANS_DIR]).filter((path) => path.endsWith(`/${PLAN_DESIGN_FILE}`));
  const symbols = [...new Set([...inDirectories(docPaths, AUDIT_SCAN_DIRS), ...law, ...outside])].toSorted();
  const audit = [...new Set([...symbols, ...design])].toSorted();
  const links = [...new Set([...inDirectories(docPaths, LINK_SCAN_DIRS), ...audit])].toSorted();
  return {
    links,
    audit,
    symbols,
    law: law.length,
    design: design.length,
    lawOutsideDocs: outside.length,
    lawOutsideDocsMissing: LAW_OUTSIDE_DOCS.filter((path) => !outside.includes(path)),
    catalogued: law.length,
  };
}

export function danglingRefTextIndex(documents: DocumentIndex, outside: AuthoredTextCorpus): ReadonlyMap<string, string> {
  for (const refusal of documents.refusals) {
    if (refusal.status !== "empty") {
      throw new Error(`document ${refusal.path} was refused (${refusal.status}): ${refusal.reason}`);
    }
  }
  for (const refusal of outside.refusals) {
    if (refusal.status !== "empty" && refusal.status !== "missing") {
      throw new Error(`law document ${refusal.path} was refused (${refusal.status}): ${refusal.reason}`);
    }
  }
  return new Map([
    ...documents.documents.map((document) => [document.path, document.text] as const),
    ...outside.files.map((file) => [file.path, file.text] as const),
  ]);
}
