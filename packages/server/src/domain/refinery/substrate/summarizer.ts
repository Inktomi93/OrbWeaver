// The summarize-slot FACTS one refinery call reads off the owner's bundle: which model answers and how wide
// its window is (`RoleClients.resolved("structured")` — the refinery's calls are schema-constrained, and
// `structured` rides the summarize binding, inference program §7.5-1). One read per verb call, never a
// boot-frozen string: a run stamped with a model the owner has since moved off would be false provenance.

import { canFund, windowForPreset } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import { RefineryBackgroundRefusedError, RefineryNotConfiguredError } from "../contract/errors.ts";
import type { ResolveStructuredBinding } from "../contract/planning.ts";
import type { SummarizerFacts } from "../contract/results.ts";

/** The window is the one the call sends: on a route whose window the request sets, the Utility preset's Max
 *  context (`windowForPreset`), so the budget and the sent window agree. `resolved` reads `null` for both nothing
 *  bound and background consent withheld, so that case asks the plan line's `resolveStructuredBinding` which one it is. */
export async function summarizerFactsOf(
  rc: RoleClients,
  presetParams: Pick<UserIntent, "maxContextTokens"> | undefined,
  binding: { readonly ownerId: UserId; readonly resolveStructuredBinding: ResolveStructuredBinding },
): Promise<SummarizerFacts> {
  const resolved = await rc.resolved("structured");
  if (resolved === null) {
    const bound = await binding.resolveStructuredBinding(binding.ownerId);
    throw bound !== null && !canFund(bound, "structured") ? new RefineryBackgroundRefusedError() : new RefineryNotConfiguredError();
  }
  const contextTokens =
    resolved.capability.kind === "generation" ? windowForPreset(resolved.capability.generation, presetParams?.maxContextTokens).context.window : null;
  return { model: resolved.model, contextTokens };
}
