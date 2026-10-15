// The baseline door writes the same bytes as @orb/ui tokens:build. No second token emitter or census.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { TOKEN_ARTIFACT_PATHS, TOKEN_TYPESCRIPT_ARTIFACT_KEYS } from "@orb/ui/token-contract";
import { generateArtifacts } from "@orb/ui/tokens-build";
import type { TypeHomeNativeSource } from "../../../floor/code-facts/type-home-contract.ts";
import { THEME, UI_PACKAGE_ROOT } from "../../contract/css-family.ts";
import type { PolicyPassInput, PolicyToolError } from "../../contract/policy-pass.ts";
import type { PlannedPolicy } from "../../contract/policy-plan.ts";
import type { ProjectContext } from "../../contract/project-context.ts";
import type { ResourceLoad } from "../../contract/resource.ts";
import type { TokenGeneratedTypeResource } from "../../contract/resource-artifact.ts";
import { TOKEN_GENERATED_TYPE_PATHS, TOKEN_GENERATION_INPUT_PATHS, TOKEN_GENERATOR_PATH } from "../../contract/resource-artifact.ts";
import type { ResourceHostOptions } from "../../contract/resource-host.ts";
import { resolveRuns } from "../../lib/policy-pass-resolve.ts";
import { createResourceHost } from "../resource-host.ts";
import { createResourceReader } from "../resource-reader.ts";

export const THEME_BASELINE = "theme-css";
export const THEME_REGEN = `pnpm exec node tooling/src/verify/cli.ts baseline ${THEME_BASELINE}`;

refuseDirectInvocation(import.meta.url, THEME_REGEN);

export async function deriveThemeCss(root: string): Promise<string> {
  return (await generateArtifacts(join(root, UI_PACKAGE_ROOT))).themeCss;
}

export async function generateThemeCss(root: string): Promise<number> {
  writeFileSync(join(root, THEME), await deriveThemeCss(root));
  return 0;
}

/** Prepare only the selected output family; ordinary alias checks never execute the producer. */
export async function prepareTokenTypeGeneration(
  context: ProjectContext,
  owner: Pick<PlannedPolicy, "policyId" | "mode" | "population"> | undefined,
): Promise<ResourceLoad<TokenGeneratedTypeResource> | undefined> {
  if (
    owner?.policyId !== "no-inline-types" ||
    owner.mode !== "run" ||
    !owner.population.effectiveSourcePaths.some((path) => TOKEN_GENERATED_TYPE_PATHS.includes(path))
  ) {
    return;
  }
  const paths = [...TOKEN_GENERATION_INPUT_PATHS, ...TOKEN_GENERATED_TYPE_PATHS];
  const reader = createResourceReader({ root: context.root });
  const observed = new Map<string, string>();
  for (const path of paths) {
    const load = reader.read(path);
    if (load.status !== "ready") {
      return { ...load, paths, members: observed.size };
    }
    observed.set(path, load.value);
  }
  const sources = new Map<string, TypeHomeNativeSource>();
  for (const path of [TOKEN_GENERATOR_PATH, ...TOKEN_GENERATED_TYPE_PATHS]) {
    const view = context.nativeSourceView?.(path);
    if (view === undefined) {
      return { status: "unresolved", paths, members: sources.size, reason: `canonical native source owner unavailable: ${path}` };
    }
    const source = view.sourceFile;
    const text = source.getFullText();
    if (text !== observed.get(path)) {
      return { status: "unresolved", paths, members: sources.size, reason: `native source differs from generation input: ${path}` };
    }
    sources.set(path, { view, program: source.getProject().getProgram().compilerObject, source: source.compilerNode, text });
  }
  let artifacts: Awaited<ReturnType<typeof generateArtifacts>>;
  try {
    artifacts = await generateArtifacts(join(context.root, UI_PACKAGE_ROOT));
  } catch (error) {
    return { status: "unresolved", paths, members: 0, reason: `token producer preparation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const outputs = new Map(TOKEN_TYPESCRIPT_ARTIFACT_KEYS.map((key) => [`${UI_PACKAGE_ROOT}/${TOKEN_ARTIFACT_PATHS[key]}`, artifacts[key]]));
  return { status: "ready", paths, members: paths.length, value: { context: { sources, outputs }, observed } };
}

/** Both execution doors pass the same optional preparation without declaring a second lifecycle. */
export function tokenTypeGenerationOptions(prepared: ResourceLoad<TokenGeneratedTypeResource> | undefined): Pick<ResourceHostOptions, "tokenTypeGeneration"> {
  return prepared === undefined ? {} : { tokenTypeGeneration: prepared };
}

/** The unplanned scoped door asks the existing dispatcher resolver for this consumer alone. */
export function tokenTypeGenerationOwner(input: PolicyPassInput): Pick<PlannedPolicy, "policyId" | "mode" | "population"> | undefined {
  const policy = input.policies.find(({ id }) => id === "no-inline-types");
  if (policy === undefined) {
    return;
  }
  const errors: PolicyToolError[] = [];
  const { runs } = resolveRuns({ ...input, policies: [policy] }, createResourceHost({ ...input.resourceOptions, root: input.root }).host, errors);
  const [run] = runs;
  if (run === undefined || run.owner.status !== "success") {
    return;
  }
  return { policyId: policy.id, mode: "run", population: run.population };
}
