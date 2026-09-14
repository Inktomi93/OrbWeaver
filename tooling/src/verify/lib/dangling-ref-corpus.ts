import type { DocumentIndex } from "../contract/resource-document.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import type { AuthoredTextCorpus } from "../contract/resource-text.ts";

const LAW_AUTHORITIES: ReadonlySet<string> = new Set(["normative", "current-reference", "operational"]);
const DESIGN_AUTHORITY = "design";
const LIVING_STATUS = "active";
const PARKED_SET_LANE = "architecture-proposed";
const LINK_SCAN_DIRS: readonly string[] = ["docs/architecture/core", "docs/architecture/proposed"];
const AUDIT_SCAN_DIRS: readonly string[] = ["docs/architecture/core"];

export const CATALOG_REL = "docs/catalog/catalog.json";
export const LAW_OUTSIDE_DOCS: readonly string[] = ["tooling/src/verify/gates/GATE-AUTHORING.md", "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md"];

export interface AbsentByDesignCitation {
  readonly why: string;
  readonly cite: string;
}

/** A committed doc cite for a generated path whose absence is the expected clean-checkout state. */
export const GITIGNORED_ABSENT: Readonly<Record<string, AbsentByDesignCitation>> = {
  "packages/client/dist": {
    why:
      "the client build output is present only after a build and is ignored by the literal `dist/` rule; " +
      "docs/design/containerize-build-plan.md quotes the matching .dockerignore entry. Ends when that plan stops citing the output.",
    cite: ".dockerignore",
  },
};

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

function catalogClass(doc: CatalogDoc, available: ReadonlySet<string>): "law" | "design" | undefined {
  const path = typeof doc["path"] === "string" ? doc["path"] : undefined;
  const receipt = recordOf(doc["receipt"]);
  const authority = typeof receipt?.["authority"] === "string" ? receipt["authority"] : undefined;
  if (path === undefined || authority === undefined || fieldOf(doc, "status") !== LIVING_STATUS || !available.has(path)) {
    return;
  }
  if (LAW_AUTHORITIES.has(authority)) {
    return "law";
  }
  return authority === DESIGN_AUTHORITY && doc["lane"] !== PARKED_SET_LANE ? "design" : undefined;
}

function catalogued(value: JsonValue, available: ReadonlySet<string>): { readonly law: readonly string[]; readonly design: readonly string[] } {
  const docs = typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, "documents") : undefined;
  if (!Array.isArray(docs)) {
    throw new Error(`${CATALOG_REL} must contain a documents array`);
  }
  const law: string[] = [];
  const design: string[] = [];
  for (const raw of docs) {
    const doc = catalogDoc(raw);
    if (doc === undefined || typeof doc["path"] !== "string") {
      continue;
    }
    const kind = catalogClass(doc, available);
    if (kind === "law") {
      law.push(doc["path"]);
    } else if (kind === "design") {
      design.push(doc["path"]);
    }
  }
  return { law, design };
}

export function danglingRefCorpora(value: JsonValue, docPaths: readonly string[], outside: readonly string[]): DanglingRefCorpora {
  const { law, design } = catalogued(value, new Set(docPaths));
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
    catalogued: law.length + design.length,
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
