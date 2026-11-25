// Cross-checks the host calls a script makes against the capabilities `manifest.json` declares. The host
// refuses an undeclared call at runtime, so a plugin that makes one ships a feature that never runs.
import { HOST_FUNCTION_CAPABILITY } from "@orb/contracts/plugin";
import type { SourceProblem } from "./contract/index.ts";
import type { HostCall } from "./host-calls.ts";

function requiredCapability(path: string): string | undefined {
  return Object.hasOwn(HOST_FUNCTION_CAPABILITY, path) ? HOST_FUNCTION_CAPABILITY[path as keyof typeof HOST_FUNCTION_CAPABILITY] : undefined;
}

/** Report each host call whose capability the manifest does not declare. */
export function capabilityProblems(hostCalls: readonly HostCall[], declared: ReadonlySet<string>): readonly SourceProblem[] {
  return hostCalls.flatMap(({ path, call }) => {
    const capability = requiredCapability(path);
    return capability === undefined || declared.has(capability)
      ? []
      : [{ node: call, message: `host.${path} needs the "${capability}" capability, which manifest.json does not declare` }];
  });
}
