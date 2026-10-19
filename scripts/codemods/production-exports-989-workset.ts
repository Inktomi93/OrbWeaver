// Turn adjudicated triage rows into the workset production-exports-989.ts applies; the selection, never a bucket, decides.
//
//   node scripts/codemods/production-exports-989-workset.ts --triage=<triage-production-exports --out json>
//        --select=<JSON array of { key, reason }> --out=<workset json, outside the repo>
//
// Each selected key must be a barrel re-export row of the triage file. Origins are read with the codemod's resolver.

import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { Project } from "@orb/tooling/codemod";
import { resolveExportedDeclarations } from "@orb/tooling/floor/code-facts/reference-fact";
import { z } from "zod";

const EXIT_MISUSE = 3;
const triageSchema = z.object({
  records: z.array(z.object({ key: z.string(), kind: z.string(), file: z.string(), symbol: z.string(), reexport: z.boolean() })),
});
const selectSchema = z.array(z.strictObject({ key: z.string().min(1), reason: z.string().min(1) })).min(1);

interface Selection {
  readonly name: string;
  readonly exportedName: string;
  readonly isTypeOnly: boolean;
  readonly origins: readonly { readonly file: string; readonly start: number }[];
}
interface WorksetRow {
  readonly file: string;
  readonly moduleSpecifier: string;
  readonly exports: Selection[];
  readonly preserveModuleEvaluation: boolean;
  readonly reason: string;
}

const { values } = parseArgs({ options: { triage: { type: "string" }, select: { type: "string" }, out: { type: "string" } } });
if (values.triage === undefined || values.select === undefined || values.out === undefined) {
  console.error("usage: production-exports-989-workset.ts --triage=<json> --select=<json> --out=<json>");
  process.exit(EXIT_MISUSE);
}
const root = process.cwd();
const records = new Map(triageSchema.parse(JSON.parse(readFileSync(values.triage, "utf8"))).records.map((r) => [r.key, r]));
const selected = selectSchema.parse(JSON.parse(readFileSync(values.select, "utf8")));

const projects = new Map<string, Project>();
function projectFor(file: string): Project {
  const owner = file.split("/").slice(0, 2).join("/");
  let project = projects.get(owner);
  if (project === undefined) {
    project = new Project({ tsConfigFilePath: resolve(root, owner, "tsconfig.json"), skipAddingFilesFromTsConfig: true });
    projects.set(owner, project);
  }
  return project;
}

const rows = new Map<string, WorksetRow>();
for (const { key, reason } of selected) {
  const record = records.get(key);
  if (record === undefined || !record.reexport || (record.kind !== "exports" && record.kind !== "types")) {
    throw new Error(`Selected key is not a barrel re-export row of the triage file: ${key}`);
  }
  const source = projectFor(record.file).addSourceFileAtPath(resolve(root, record.file));
  source.getProject().resolveSourceFileDependencies();
  const matches = source.getExportDeclarations().flatMap((declaration) =>
    declaration
      .getNamedExports()
      .filter((spec) => (spec.getAliasNode() ?? spec.getNameNode()).getText() === record.symbol)
      .map((spec) => ({ declaration, spec })),
  );
  const [match, ...extra] = matches;
  const moduleSpecifier = match?.declaration.getModuleSpecifierValue();
  if (match === undefined || extra.length > 0 || moduleSpecifier === undefined) {
    throw new Error(`Expected exactly one named re-export of ${record.symbol} in ${record.file}, found ${matches.length}`);
  }
  const fact = resolveExportedDeclarations(source, record.symbol);
  if (fact.kind !== "resolved") {
    throw new Error(`Unresolved export ${record.file}:${record.symbol}`);
  }
  const selection: Selection = {
    name: match.spec.getNameNode().getText(),
    exportedName: record.symbol,
    isTypeOnly: match.declaration.isTypeOnly() || match.spec.isTypeOnly(),
    origins: fact.value.map((declaration) => ({
      file: relative(root, declaration.getSourceFile().getFilePath()),
      start: declaration.getStart(),
    })),
  };
  const rowKey = `${record.file}\0${moduleSpecifier}`;
  const row = rows.get(rowKey);
  if (row === undefined) {
    rows.set(rowKey, { file: record.file, moduleSpecifier, exports: [selection], preserveModuleEvaluation: true, reason });
  } else {
    row.exports.push(selection);
  }
}
writeFileSync(values.out, `${JSON.stringify([...rows.values()], null, 2)}\n`);
console.log(`${selected.length} selections -> ${rows.size} workset rows: ${values.out}`);
