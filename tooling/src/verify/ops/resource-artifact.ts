// Generated token type preparation refuses missing or changed inputs.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { generatedTypeHomeContextRefusal } from "../../floor/code-facts/type-home-declaration.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type { TokenGeneratedTypeResource } from "../contract/resource-artifact.ts";
import { TOKEN_GENERATED_TYPE_PATHS, TOKEN_GENERATION_INPUT_PATHS } from "../contract/resource-artifact.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

export function loadTokenGeneratedTypes(
  reader: ResourceReader,
  prepared: ResourceLoad<TokenGeneratedTypeResource> | undefined,
): ResourceLoad<TokenGeneratedTypeResource> {
  const paths = [...TOKEN_GENERATION_INPUT_PATHS, ...TOKEN_GENERATED_TYPE_PATHS];
  if (prepared === undefined) {
    return { status: "unresolved", paths, members: 0, reason: "generated token type preparation was not supplied" };
  }
  if (prepared.status !== "ready") {
    return prepared;
  }
  const refusal = generatedTypeHomeContextRefusal(prepared.value.context);
  if (refusal !== undefined) {
    return { status: "unresolved", paths, members: 0, reason: refusal };
  }
  for (const path of paths) {
    const text = prepared.value.observed.get(path);
    if (text === undefined) {
      return { status: "unresolved", paths, members: 0, reason: `generation input was not observed: ${path}` };
    }
    const current = reader.read(path);
    if (current.status !== "ready") {
      return { ...current, paths, members: 0 };
    }
    if (current.value !== text) {
      return { status: "unresolved", paths, members: 0, reason: `generated token source changed after preparation: ${path}` };
    }
  }
  return prepared;
}
