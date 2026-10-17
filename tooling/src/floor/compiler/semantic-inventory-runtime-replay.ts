// Queried targets are never loaded; the cold helper must execute the same observed code as its launcher.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { InventoryRuntimeResolution } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { inventoryRuntimeResolutionSchema, inventoryRuntimeSchema } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { runNicedSync } from "../process/proc.ts";
import {
  assertInventoryRuntimeSealed,
  captureInventoryRuntime,
  inventoryRuntimeArguments,
  replayInventoryRuntimeResolution,
} from "./semantic-inventory-runtime.ts";

const resultSchema = z.object({ outcomes: inventoryRuntimeResolutionSchema.shape.outcome.array(), implementation: inventoryRuntimeSchema });

/** The active launcher import binds this helper and its dependencies to the caller's implementation graph. */
export function replayInventoryRuntime(requests: readonly InventoryRuntimeResolution[]): InventoryRuntimeResolution["outcome"][] {
  const expected = captureInventoryRuntime([import.meta.url]);
  const scratch = mkdtempSync(join(tmpdir(), "orb-inventory-runtime-replay-"));
  try {
    const request = join(scratch, "request.json");
    const result = join(scratch, "result.json");
    writeFileSync(request, JSON.stringify(requests));
    const bootstrap = fileURLToPath(new URL("./semantic-inventory-runtime.ts", import.meta.url));
    const completed = runNicedSync(process.execPath, [...inventoryRuntimeArguments(), "--import", bootstrap, import.meta.filename, request, result]);
    if (completed.status !== 0) {
      throw new Error(`native implementation resolution replay failed: ${completed.stderr}`);
    }
    const captured = resultSchema.parse(JSON.parse(readFileSync(result, "utf8")));
    assertInventoryRuntimeSealed(expected);
    if (!isDeepStrictEqual(captured.implementation, expected)) {
      throw new Error("native implementation replay executing graph differs from its loaded controller");
    }
    return captured.outcomes;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function resolveRequests(requests: readonly InventoryRuntimeResolution[]): Promise<InventoryRuntimeResolution["outcome"][]> {
  const results: InventoryRuntimeResolution["outcome"][] = [];
  let active: InventoryRuntimeResolution | undefined;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const request = active;
      if (request !== undefined && specifier === "node:module") {
        active = undefined;
        if (request.kind === "request" && JSON.stringify(context.conditions) !== JSON.stringify(request.context.conditions)) {
          throw new Error("native implementation replay conditions differ from execution");
        }
        try {
          results.push({ kind: "resolved", value: { ...replayInventoryRuntimeResolution(request.specifier, request.context, nextResolve) } });
        } catch (error) {
          if (!(error instanceof Error && "code" in error && typeof error.code === "string")) {
            throw error;
          }
          results.push({ kind: "failed", code: error.code, message: error.message });
        }
        return replayInventoryRuntimeResolution(specifier, context, nextResolve);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith("file:")) {
        throw new Error(`native implementation replay attempted to execute a target: ${url}`);
      }
      return nextLoad(url, context);
    },
  });
  try {
    for (const request of requests) {
      active = request;
      if (request.mode === "require") {
        createRequire(request.context.parentURL)("node:module");
      } else {
        await import("node:module");
      }
      if (active !== undefined) {
        throw new Error("native implementation replay did not enter the native resolver");
      }
    }
    return results;
  } finally {
    hooks.deregister();
  }
}

if (process.argv[1] === import.meta.filename) {
  const requestPath = process.argv[2];
  const resultPath = process.argv[3];
  if (requestPath === undefined || resultPath === undefined) {
    throw new Error("native implementation replay requires its parent-owned request and result paths");
  }
  const requests = inventoryRuntimeResolutionSchema.array().parse(JSON.parse(readFileSync(requestPath, "utf8")));
  const outcomes = await resolveRequests(requests);
  const implementation = captureInventoryRuntime([import.meta.url]);
  assertInventoryRuntimeSealed(implementation);
  writeFileSync(resultPath, JSON.stringify({ outcomes, implementation }));
}
