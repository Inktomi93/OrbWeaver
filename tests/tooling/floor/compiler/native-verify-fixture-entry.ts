import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import type { Node as MorphNode } from "ts-morph";
import type { InventoryWorkerRequest } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

const requestPath = process.argv[2];
const resultPath = process.argv[3];
if (requestPath === undefined || resultPath === undefined) {
  throw new Error("native verify fixture requires its request and result paths");
}
const { z } = await import("zod");
const request = z
  .object({
    root: z.string(),
    door: z.enum(["structure", "scoped"]),
    args: z.array(z.string()),
    failWorker: z.boolean().optional(),
    forbidSyntax: z.boolean().optional(),
    observeRequests: z.boolean().optional(),
  })
  .parse(JSON.parse(readFileSync(requestPath, "utf8")));
const workers: string[] = [];
const requests: string[] = [];
const failed = join(dirname(resultPath), "failed-worker.mjs");
writeFileSync(failed, "process.stderr.write('injected native verify worker exit');process.exitCode=7;\n");
const spawn = childProcess.spawnSync;
Object.defineProperty(childProcess, "spawnSync", {
  value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
    const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
    const path = index < 0 ? undefined : args[1]?.[index + 1];
    if (path !== undefined) {
      const { controllerImplementation: _executingController, ...input } = JSON.parse(readFileSync(path, "utf8")) as InventoryWorkerRequest;
      workers.push(input.descriptor.id);
      if (request.observeRequests === true) {
        requests.push(JSON.stringify(input));
      }
    }
    return spawn(
      args[0],
      args[1]?.map((value) => (request.failWorker === true && value.endsWith("semantic-inventory-worker.ts") ? failed : value)),
      args[2],
    );
  },
});
syncBuiltinESMExports();
const { Node, Identifier } = await import("ts-morph");
const { hasRegisteredSemanticProgram } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
const symbolFor = Node.prototype.getSymbol;
const typeFor = Node.prototype.getType;
const definitionsFor = Identifier.prototype.getDefinitionNodes;
const definitionsOwn = Object.getOwnPropertyDescriptor(Identifier.prototype, "getDefinitionNodes");
let syntaxReads = 0;
if (request.forbidSyntax === true) {
  Object.defineProperty(Node.prototype, "getSymbol", {
    value(this: MorphNode): ReturnType<MorphNode["getSymbol"]> {
      if (!hasRegisteredSemanticProgram(this.getProject())) {
        syntaxReads++;
        throw new Error("native command read a syntax carrier symbol");
      }
      return symbolFor.call(this);
    },
  });
  Object.defineProperty(Node.prototype, "getType", {
    value(this: MorphNode): ReturnType<MorphNode["getType"]> {
      if (!hasRegisteredSemanticProgram(this.getProject())) {
        syntaxReads++;
        throw new Error("native command read a syntax carrier Type");
      }
      return typeFor.call(this);
    },
  });
  Object.defineProperty(Identifier.prototype, "getDefinitionNodes", {
    configurable: true,
    value(this: InstanceType<typeof Identifier>): ReturnType<InstanceType<typeof Identifier>["getDefinitionNodes"]> {
      if (!hasRegisteredSemanticProgram(this.getProject())) {
        syntaxReads++;
        throw new Error("native command read syntax carrier definitions");
      }
      return definitionsFor.call(this);
    },
  });
}
try {
  const exit =
    request.door === "structure"
      ? await (await import("../../../../tooling/src/verify/ops/structure.ts")).runStructure(request.root, request.args)
      : await (await import("../../../../tooling/src/verify/ops/scoped.ts")).runScopedCli(request.root, request.args);
  writeFileSync(resultPath, JSON.stringify({ exit, workers, syntaxReads, requests }));
} finally {
  Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  Object.defineProperty(Node.prototype, "getSymbol", { value: symbolFor });
  Object.defineProperty(Node.prototype, "getType", { value: typeFor });
  if (definitionsOwn === undefined) {
    Reflect.deleteProperty(Identifier.prototype, "getDefinitionNodes");
  } else {
    Object.defineProperty(Identifier.prototype, "getDefinitionNodes", definitionsOwn);
  }
}
