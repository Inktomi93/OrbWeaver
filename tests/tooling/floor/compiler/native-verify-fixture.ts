import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { InventoryBuildRequest } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { runNicedSync, spawnNiced } from "../../../../tooling/src/floor/process/proc.ts";
import type { NATIVE_POLICY_CASES } from "./native-policy-cases.ts";

/** The existing command functions execute natively; the caller receives their actual exit contract. */
export async function nativeVerifyFixture(
  root: string,
  door: "structure" | "scoped",
  args: readonly string[],
  observation: {
    readonly failWorker?: boolean;
    readonly workers?: string[];
    readonly forbidSyntax?: boolean;
    readonly syntaxReads?: number[];
    readonly requests?: InventoryBuildRequest[];
  } = {},
): Promise<number> {
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-verify-fixture-"));
  try {
    const request = join(scratch, "request.json");
    const result = join(scratch, "result.json");
    writeFileSync(
      request,
      JSON.stringify({
        root,
        door,
        args,
        failWorker: observation.failWorker,
        forbidSyntax: observation.forbidSyntax,
        observeRequests: observation.requests !== undefined,
      }),
    );
    const entry = fileURLToPath(new URL("./native-verify-fixture-entry.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const completed = await spawnNiced(process.execPath, ["--import", bootstrap, entry, request, result]);
    if (completed.code !== 0 || completed.timedOut) {
      throw new Error(`native verify fixture did not complete (${String(completed.code)}): ${completed.stderr}\n${completed.stdout}`);
    }
    const response = z
      .object({
        exit: z.number().int().min(0).max(3),
        workers: z.array(z.string()),
        syntaxReads: z.number().int().nonnegative(),
        requests: z.array(z.string()),
      })
      .parse(JSON.parse(readFileSync(result, "utf8")));
    observation.workers?.push(...response.workers);
    observation.syntaxReads?.push(response.syntaxReads);
    observation.requests?.push(...response.requests.map((value) => JSON.parse(value) as InventoryBuildRequest));
    return response.exit;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Policy callbacks remain source-owned native code, not serialized functions or claimed execution receipts. */
export function nativePolicyFixture(
  mode: (typeof NATIVE_POLICY_CASES)[number],
  root: string,
): {
  readonly text: string;
  readonly requests: readonly InventoryBuildRequest[];
} {
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-policy-fixture-"));
  try {
    const result = join(scratch, "result.json");
    const entry = fileURLToPath(new URL("./native-policy-cases.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, mode, root, result]);
    if (completed.status !== 0) {
      throw new Error(`native policy fixture did not complete (${String(completed.status)}): ${completed.stderr}\n${completed.stdout}`);
    }
    const text = readFileSync(result, "utf8");
    const { requests } = z.object({ requests: z.array(z.string()) }).parse(JSON.parse(text));
    return { text, requests: requests.map((value) => JSON.parse(value) as InventoryBuildRequest) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
