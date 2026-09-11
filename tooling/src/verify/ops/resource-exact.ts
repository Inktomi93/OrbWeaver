// Exact named-file acquisition. Fail-closed over the whole demanded id set; see the contract header for why
// a per-id miss inside a `ready` fact would invert the consuming judgment rather than narrow it.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type { ExactFile, ExactResourceId } from "../contract/resource-exact.ts";
import { EXACT_RESOURCE_PATHS } from "../contract/resource-exact.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

export function loadExactFiles(reader: ResourceReader, ids: readonly ExactResourceId[]): ResourceLoad<ReadonlyMap<ExactResourceId, ExactFile>> {
  const distinct = [...new Set(ids)].toSorted((left, right) => left.localeCompare(right));
  if (distinct.length === 0) {
    return { status: "empty", paths: [], members: 0, reason: "exact files were demanded for zero ids" };
  }
  const unknown = distinct.find((id) => !Object.hasOwn(EXACT_RESOURCE_PATHS, id));
  if (unknown !== undefined) {
    return { status: "unresolved", paths: [], members: 0, reason: `unknown exact resource id: ${String(unknown)}` };
  }
  const files = new Map<ExactResourceId, ExactFile>();
  const paths = distinct.map((id) => EXACT_RESOURCE_PATHS[id]);
  for (const id of distinct) {
    const path = EXACT_RESOURCE_PATHS[id];
    const loaded = reader.read(path);
    if (loaded.status !== "ready") {
      return { status: loaded.status, paths, members: files.size, reason: `exact resource ${id} (${path}) is unavailable: ${loaded.reason}` };
    }
    files.set(id, Object.freeze({ id, path, text: loaded.value, bytes: Buffer.byteLength(loaded.value), lines: loaded.value.split("\n").length }));
  }
  // `members` is what the door MEASURED — every demanded id — which here equals the served set precisely
  // because a single miss has already refused the fact.
  return { status: "ready", value: files, paths, members: files.size };
}
