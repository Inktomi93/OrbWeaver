import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { InventoryBuildRequest } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";

// The faults a dependency or source edit plants, and the export-family staging cuts; each has its own dispatcher.
const DEPENDENCY_STAGE_FAULTS = [
  "drizzle-consumer-tail",
  "drizzle-catalog-input",
  "schema-graph-tail",
  "declaration-output-race",
  "member-world-race",
] as const;
type DependencyStageFault = (typeof DEPENDENCY_STAGE_FAULTS)[number];
type ExportStageFault = `export-${Exclude<keyof typeof NATIVE_EXPORT_CUTS, "worker">}`;

export type NativeInventoryFault =
  | "computed-coverage"
  | "global-origin-coverage"
  | "global-binding-coverage"
  | "global-binding-record"
  | "invocation-stored-value"
  | "invocation-types"
  | "invocation-atoms"
  | "invocation-sources"
  | "invocation-bindings"
  | "reference-coverage"
  | "shape-excluded"
  | "shape-descriptor"
  | "shape-coverage"
  | "projected-alias-retarget"
  | DependencyStageFault
  | ExportStageFault;

export const NATIVE_EXPORT_CUTS = {
  query: "export source/name coverage",
  declarations: "export declaration coverage",
  source: "export source/name coverage",
  family: "wrong partition",
  worker: "injected native worker exit",
  metadata: "native export source ownership is unavailable",
  text: "source text version differs",
  declarationSource: "native export source ownership is unavailable",
  closure: "outside its native closure",
} as const;

function removeCapturedSource(db: DatabaseSync, id: string, file: string, metadata: boolean): void {
  db.prepare("DELETE FROM inventory_text WHERE partition=? AND source IN (SELECT ordinal FROM inventory_source WHERE partition=? AND file=?)").run(
    id,
    id,
    inventoryString(file),
  );
  if (metadata) {
    db.prepare("DELETE FROM inventory_source WHERE partition=? AND file=?").run(id, inventoryString(file));
  }
}

/** Fixed fault sites alter the real exited worker's staging database, never its execution authority. */
export function mutateNativeInventoryStage(fault: NativeInventoryFault, request: InventoryBuildRequest, db: DatabaseSync, id: string): boolean {
  db.exec("PRAGMA foreign_keys=OFF");
  switch (fault) {
    case "drizzle-consumer-tail":
    case "drizzle-catalog-input":
    case "schema-graph-tail":
    case "declaration-output-race":
    case "member-world-race":
      return mutateDependencyStage(fault, request, db, id);
    case "export-query":
    case "export-declarations":
    case "export-source":
    case "export-family":
    case "export-metadata":
    case "export-text":
    case "export-declarationSource":
    case "export-closure":
      return mutateExportStage(fault, request, db, id);
    case "computed-coverage":
      db.exec("DELETE FROM inventory_computed_trace;DELETE FROM inventory_computed_name;");
      return true;
    case "global-origin-coverage":
      db.exec("DELETE FROM inventory_global_origin");
      return true;
    case "global-binding-coverage":
      db.exec("DELETE FROM inventory_global_binding");
      return true;
    case "global-binding-record":
      db.exec("DELETE FROM inventory_fact");
      return true;
    case "invocation-stored-value":
      if (Number(db.prepare("UPDATE inventory_invocation_atom SET key='\"foreign\"' WHERE key='\"stored-value\"'").run().changes) === 0) {
        throw new Error("native stored-value fault did not alter a real facet");
      }
      return true;
    case "invocation-types":
      if (Number(db.prepare("UPDATE inventory_invocation_atom SET key='\"missing\"' WHERE key='\"types\"'").run().changes) === 0) {
        throw new Error("native type fault did not alter a real facet");
      }
      return true;
    case "invocation-atoms":
      db.exec("DELETE FROM inventory_invocation_atom");
      return true;
    case "invocation-sources":
      db.exec("DELETE FROM inventory_invocation_source");
      return true;
    case "invocation-bindings":
      db.exec("DELETE FROM inventory_global_binding");
      return true;
    case "reference-coverage":
      db.exec("UPDATE inventory_reference_query SET resultCount=resultCount+1 WHERE ordinal=0");
      return true;
    case "shape-excluded":
      if ((request.shapeQueries?.length ?? 0) === 0) {
        return false;
      }
      writeFileSync(
        join(request.root, "tooling/src/excluded.ts"),
        "import '../../packages/server/src/left.ts';import '../../packages/contracts/src/right.ts';",
      );
      return true;
    case "shape-descriptor":
      writeFileSync(
        join(request.root, "tsconfig.added.json"),
        JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: ["packages/server/src/left.ts", "packages/contracts/src/right.ts"] }),
      );
      return true;
    case "shape-coverage":
      if ((request.shapeQueries?.length ?? 0) === 0) {
        return false;
      }
      db.exec("DELETE FROM inventory_pair");
      return true;
    case "projected-alias-retarget":
      unlinkSync(join(request.root, "vendor/alias.ts"));
      symlinkSync("other.ts", join(request.root, "vendor/alias.ts"));
      return true;
  }
}

function mutateDependencyStage(fault: DependencyStageFault, request: InventoryBuildRequest, db: DatabaseSync, id: string): boolean {
  switch (fault) {
    case "drizzle-consumer-tail":
    case "drizzle-catalog-input":
      if (request.descriptor.id !== "packages/server/tsconfig.json") {
        throw new Error("unchanged native catalog unexpectedly rebuilt");
      }
      if (fault === "drizzle-catalog-input") {
        const path = join(request.root, "packages/db/src/schema/unrelated.ts");
        const original = readFileSync(path, "utf8");
        const changed = original.replace("'unrelated'", "'different'");
        if (changed === original) {
          throw new Error("native catalog race did not change its subject input");
        }
        writeFileSync(path, changed);
      } else {
        const changed = db
          .prepare(
            "DELETE FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_drizzle_evidence WHERE partition=?) AND ordinal=(SELECT MAX(ordinal) FROM inventory_drizzle_atom WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_drizzle_evidence WHERE partition=?))",
          )
          .run(id, id, id, id);
        if (Number(changed.changes) !== 1) {
          throw new Error("native Drizzle graph fault did not remove exactly its tail");
        }
      }
      return true;
    case "schema-graph-tail":
      if (
        Number(
          db
            .prepare("DELETE FROM inventory_drizzle_atom WHERE partition=? AND ordinal=(SELECT MAX(ordinal) FROM inventory_drizzle_atom WHERE partition=?)")
            .run(id, id).changes,
        ) !== 1
      ) {
        throw new Error("native schema fault did not remove exactly its graph tail");
      }
      return true;
    case "declaration-output-race": {
      const path = join(request.root, "packages/kit/src/platform.ts");
      writeFileSync(path, `${readFileSync(path, "utf8")}\nexport const changedDuringExtraction=1;`);
      return true;
    }
    case "member-world-race":
      for (const relative of ["packages/client/src/features/probe/flush.ts", "packages/server/src/transport/trpc/routers/probe.ts"]) {
        const path = join(request.root, relative);
        writeFileSync(path, `${readFileSync(path, "utf8")}\nexport const changedDuringExtraction=1;`);
      }
      return true;
  }
}
function mutateExportStage(fault: ExportStageFault, request: InventoryBuildRequest, db: DatabaseSync, id: string): boolean {
  switch (fault) {
    case "export-query":
      db.prepare("DELETE FROM inventory_export_declaration_node WHERE partition=?").run(id);
      db.prepare("DELETE FROM inventory_export_declaration WHERE partition=?").run(id);
      return true;
    case "export-declarations":
      db.prepare("DELETE FROM inventory_export_declaration_node WHERE partition=?").run(id);
      return true;
    case "export-source":
      db.prepare("UPDATE inventory_export_declaration SET file=? WHERE partition=?").run(inventoryString(join(request.root, "missing.ts")), id);
      return true;
    case "export-family":
      db.prepare("DELETE FROM inventory_family WHERE partition=? AND name='export-declarations'").run(id);
      return true;
    case "export-metadata":
      removeCapturedSource(db, id, join(request.root, "entry.ts"), true);
      return true;
    case "export-text":
      removeCapturedSource(db, id, join(request.root, "entry.ts"), false);
      return true;
    case "export-declarationSource":
      removeCapturedSource(db, id, join(request.root, "browser-bound.ts"), true);
      return true;
    case "export-closure":
      db.prepare("DELETE FROM inventory_list WHERE partition=? AND kind='available' AND value=?").run(
        id,
        inventoryString(join(request.root, "browser-bound.ts")),
      );
      return true;
  }
}
