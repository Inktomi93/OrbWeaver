// Strict-JSON acquisition. The refusal split IS the capability: `missing`, `empty` and `unresolved` are
// three different answers and none of them is `{}` (`resource-gate-access-patterns.md:126`).
//
// The reader below it already separates absent from unreadable — `ResourceReader.read` returns `missing`
// for an absent path, `empty` for a zero-byte file, and `unresolved` for a decode failure — so this provider
// adds exactly one distinction of its own: text that arrived but is not JSON. That is `unresolved` with the
// parser's own message, never `missing`, because "the config is not there" and "the config is broken" send a
// reader to two different places.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type { JsonResourceFacts, JsonResourceId, JsonValue } from "../contract/resource-json.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

export function loadJsonResource(reader: ResourceReader, id: JsonResourceId): ResourceLoad<JsonResourceFacts> {
  if (!Object.hasOwn(JSON_RESOURCE_PATHS, id)) {
    return { status: "unresolved", paths: [], members: 0, reason: `unknown json resource id: ${String(id)}` };
  }
  const path = JSON_RESOURCE_PATHS[id];
  const loaded = reader.read(path);
  if (loaded.status !== "ready") {
    return loaded;
  }
  let value: JsonValue;
  try {
    value = JSON.parse(loaded.value) as JsonValue;
  } catch (error) {
    return {
      status: "unresolved",
      paths: loaded.paths,
      members: 0,
      reason: `json resource ${id} did not parse as strict JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // `members` is what the door MEASURED — one document — never the census inside it. A provider that
  // receipts its findings preempts its own accuser (guide §12.3), and a resource whose top level is an empty
  // array or object is a real, policy-visible answer that its consumer judges, not a host-level refusal.
  return { status: "ready", value: { id, path, value }, paths: loaded.paths, members: 1 };
}
