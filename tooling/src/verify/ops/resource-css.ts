import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad } from "../contract/resource.ts";
import type { CssFacts } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { collectCssFacts } from "../lib/css-resource-facts.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function semanticMembers(facts: CssFacts): number {
  return (
    facts.population.declarations +
    facts.population.selectors +
    facts.population.selectorHooks +
    facts.population.customPropertyDefinitions +
    facts.population.customPropertyReferences
  );
}

/** Derive positioned syntax facts from one already-loaded CSS corpus. */
export function loadCssFacts(corpus: ResourceLoad<readonly AuthoredCssFile[]>): ResourceLoad<CssFacts> {
  if (corpus.status !== "ready") {
    return corpus;
  }
  const value = collectCssFacts(corpus.value);
  return { status: "ready", value, paths: corpus.paths, members: semanticMembers(value) };
}
