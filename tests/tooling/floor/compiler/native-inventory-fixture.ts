// The child owns native execution; this process borrows only the exact published SQLite generation for verdict assertions.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  InventoryBuildRequest,
  InventoryFileProjection,
  InventoryOverlay,
  InventoryShapeQuery,
  SemanticInventory,
  SemanticInventoryOptions,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { SemanticInventoryError } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, readInventoryGeneration } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { acquireInventoryReadLease } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import type { NativeInventoryFault } from "./native-inventory-stage-fault.ts";

/** Keep shared native-world setup and additional fixture writes on the same authored-byte path. */
export function writeNativeInventoryFixtureFile(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

/** Standalone and transaction controls consume the same complete native-world fixture. */
export function initializeNativeInventoryFixture(root: string): void {
  writeNativeInventoryFixtureFile(root, ".gitignore", ".cache/\nnode_modules/\n");
  writeNativeInventoryFixtureFile(
    root,
    "tsconfig.base.json",
    JSON.stringify({
      files: [],
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
        paths: { "@fixture/barrel": ["./packages/kit/src/barrel.ts"] },
      },
    }),
  );
  writeNativeInventoryFixtureFile(
    root,
    "packages/kit/tsconfig.json",
    JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022"] }, include: ["src/*.ts"] }),
  );
  writeNativeInventoryFixtureFile(
    root,
    "packages/client/tsconfig.json",
    JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM"], customConditions: ["browser"] }, include: ["src/*.ts"] }),
  );
  writeNativeInventoryFixtureFile(
    root,
    "tsconfig.tools.json",
    JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { lib: ["ES2022"] }, include: ["scripts/*.ts", "tests/*.ts"] }),
  );
  writeNativeInventoryFixtureFile(
    root,
    "packages/kit/src/base.ts",
    "export const alive=1; export const lazy=2; export const held=3; export const unused=4; export const onlyTest=5; export const bridge=6; export const schema={value: 1}; export interface Shape { value: number };\n",
  );
  writeNativeInventoryFixtureFile(
    root,
    "packages/kit/src/barrel.ts",
    "export { alive as renamed, lazy, held, schema, type Shape } from './base'; export {platform as native} from 'fixture-platform';\n",
  );
  writeNativeInventoryFixtureFile(
    root,
    "packages/client/src/browser.ts",
    "import { renamed, type Shape, schema, native as platformDoor } from '@fixture/barrel'; import * as ns from '@fixture/barrel'; export const read=renamed; export const viaDoor=platformDoor; export type View=typeof schema; export const held=ns.held; export function shadow(ns: {lazy:number}) { return ns.lazy }; export const later=import('@fixture/barrel').then(m=>m.lazy); export const button=document.createElement('button'); import { platform } from 'fixture-platform'; export const selected=platform;\n",
  );
  writeNativeInventoryFixtureFile(
    root,
    "scripts/tool.ts",
    "import { bridge } from '../packages/kit/src/base'; export const tool=bridge; const witness='alive' satisfies keyof typeof import('../packages/kit/src/base'); export const checked=witness; import { platform } from 'fixture-platform'; export const selected=platform;\n",
  );
  writeNativeInventoryFixtureFile(root, "tests/consumer.ts", "import { onlyTest } from '../packages/kit/src/base'; export const testValue=onlyTest;\n");
  writeNativeInventoryFixtureFile(
    root,
    "node_modules/fixture-platform/package.json",
    JSON.stringify({ name: "fixture-platform", exports: { ".": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  writeNativeInventoryFixtureFile(root, "node_modules/fixture-platform/browser.ts", "export const platform='browser';\n");
  writeNativeInventoryFixtureFile(root, "node_modules/fixture-platform/node.ts", "export const platform='node';\n");
  execFixtureGit(root, ["init", "-q"]);
}

const lifetimeSchema = z.object({ transaction: z.boolean(), queryOnly: z.literal(1), existed: z.boolean(), closed: z.boolean(), removed: z.boolean() });
const coverageSchema = z.object({ enumerations: z.number(), declarationPreparations: z.number(), closureLookups: z.number(), closureKeys: z.number() });
export type NativeInventoryLifetime = z.infer<typeof lifetimeSchema>;
export type NativeInventoryCoverage = z.infer<typeof coverageSchema>;

const resultSchema = z.union([
  z.object({
    generation: z.number().int().positive(),
    databasePath: z.string(),
    workers: z.array(z.string()),
    faults: z.array(z.string()),
    requests: z.array(z.string()),
    published: z.array(z.number()),
    lifetime: lifetimeSchema.optional(),
    coverage: coverageSchema.optional(),
    shapeCohort: z.object({ generation: z.number().int().positive(), partitions: z.array(z.string()) }).optional(),
  }),
  z.object({ refusal: z.string(), workers: z.array(z.string()), faults: z.array(z.string()), requests: z.array(z.string()), published: z.array(z.number()) }),
]);

/** Only source data crosses; callbacks and Projects stay with their executing native owner. */
export function nativeInventoryFixture(
  options: Omit<SemanticInventoryOptions, "buildPartition" | "shapePlan" | "overlay" | "fileSystem" | "projectedPaths">,
  observation: {
    readonly failWorker?: boolean;
    readonly workers?: string[];
    readonly faults?: string[];
    readonly fault?: NativeInventoryFault;
    readonly projection?: InventoryFileProjection;
    readonly authoredAddedPaths?: InventoryOverlay["authoredAddedPaths"];
    readonly lifetime?: NativeInventoryLifetime[];
    readonly coverage?: NativeInventoryCoverage[];
    readonly shapeQueries?: readonly InventoryShapeQuery[];
    readonly requests?: InventoryBuildRequest[];
    readonly shapeSources?: readonly string[];
    readonly backups?: string[];
    readonly handoffFault?: "invalid-source-metadata" | "invalid-shape-generation";
    readonly published?: number[];
  } = {},
): SemanticInventory {
  if (["buildPartition", "shapePlan", "overlay", "fileSystem", "projectedPaths"].some((key) => key in options)) {
    throw new Error("native verdict fixture cannot transport executable callbacks or source carriers");
  }
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-verdict-"));
  let retained = false;
  try {
    const requestPath = join(scratch, "request.json");
    const resultPath = join(scratch, "result.json");
    writeFileSync(
      requestPath,
      JSON.stringify({
        options,
        failWorker: observation.failWorker,
        fault: observation.fault,
        projection: observation.projection,
        authoredAddedPaths: observation.authoredAddedPaths,
        observeCoverage: observation.coverage !== undefined,
        observeRequests: observation.requests !== undefined,
        shapeQueries: observation.shapeQueries,
        shapeSources: observation.shapeSources,
        handoffFault: observation.handoffFault,
      }),
    );
    const entry = fileURLToPath(new URL("./native-inventory-fixture-entry.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, requestPath, resultPath]);
    if (completed.status !== 0) {
      throw new Error(`native inventory fixture failed (${String(completed.status)}, ${completed.errorCode ?? "exit"}): ${completed.stderr}`);
    }
    const result = resultSchema.parse(JSON.parse(readFileSync(resultPath, "utf8")));
    observation.workers?.push(...result.workers);
    observation.faults?.push(...result.faults);
    observation.requests?.push(...result.requests.map((value) => JSON.parse(value) as InventoryBuildRequest));
    observation.published?.push(...result.published);
    if ("refusal" in result) {
      throw new SemanticInventoryError(result.refusal);
    }
    if (result.lifetime !== undefined) {
      observation.lifetime?.push(result.lifetime);
      observation.backups?.push(result.databasePath);
    }
    if (result.coverage !== undefined) {
      observation.coverage?.push(result.coverage);
    }
    const db = openInventoryDatabase(result.databasePath);
    try {
      const partitions = readInventoryGeneration(db, result.generation);
      const lease = acquireInventoryReadLease(db, result.generation, partitions);
      const shape = result.shapeCohort;
      if (
        (observation.shapeQueries !== undefined && shape === undefined) ||
        (shape !== undefined &&
          (shape.generation !== result.generation || JSON.stringify(shape.partitions) !== JSON.stringify(lease.partitions.map(({ id }) => id).toSorted())))
      ) {
        lease[Symbol.dispose]();
        throw new Error("native shape fixture handoff differs from its exact published generation lease");
      }
      const reader = ownedInventoryReader(options.root, result.generation, lease, {
        db,
        shapeCohort: shape !== undefined,
        ...(options.moduleTargetQueries === undefined ? {} : { moduleTargetQueries: options.moduleTargetQueries }),
        dispose: () => {
          try {
            db.close();
          } finally {
            rmSync(scratch, { recursive: true, force: true });
          }
        },
      });
      retained = true;
      return reader;
    } catch (error) {
      db.close();
      throw error;
    }
  } finally {
    if (!retained) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
