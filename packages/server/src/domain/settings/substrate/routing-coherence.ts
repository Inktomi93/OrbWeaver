// domain/settings/substrate/routing-coherence — the WRITE-BOUNDARY guard for `routing.roleDefaults`, where
// `(source, model)` is ONE selection and the store lets them drift apart.
//
// THE BUG THIS KILLS. `deepMergePlain` treats an omitted key as "don't touch", so a patch that named a role's
// SOURCE without its MODEL left the previous source's model pinned:
//   stored {source:"openrouter", model:"anthropic/claude-sonnet-5"} + patch {source:"vllm"}
//     ⇒ {source:"vllm", model:"anthropic/claude-sonnet-5"} — a pair the local engine 404s on every turn.
// That is exactly the live dev row, written by the e2e seed's `{api, source}` routing patch. The Connections
// pane clears the model in the same patch as a source flip, but the pane is only ONE doorway — the guard has
// to live here, where every doorway lands (the sibling `(api, source)` fix `3315e1b3` made the same call).
//
// TWO RULES, both applied to the patch BEFORE the merge:
//   1. HEAL — a role patch that names `source` and does NOT name `model` gets an explicit `model: null`.
//      Asserting half a selection cannot leave the other half pinned from a different one; `null` is the
//      clear the lenient parser heals to "unset", and the resolver re-derives the new source's default live.
//   2. REJECT — a role patch that names a NON-EMPTY `model` against a CONFIG-DERIVED source (vllm /
//      local-light: the engine serves exactly what it was launched with) is refused outright. Decidable with
//      no catalog, no credential and no cross-domain read, which is why it is enforceable HERE.
// NOT decidable at this boundary (and deliberately not guessed): openrouter and max-pro-sub membership needs
// the catalog/daemon snapshots the `connection` domain owns, and `custom_openai` is a BYO endpoint whose
// model set is free text by construction. Those three heal on the READ side instead (`resolveRole` →
// `pickOrModel` / `healToChatDefault`), which is also the arm that recovers a row written before this guard.
//
// Only roles NAMED in the patch are inspected: a patch is answerable for what it asserts, never for stale
// data it doesn't touch — otherwise one pre-existing bad row would lock the user out of every other setting.

import { isConfigDerivedModelSource } from "@orb/contracts/connection";
import type { UserSettings } from "@orb/contracts/settings";
import { DomainOperationError } from "@orb/kit/errors";
import { isPlainObject } from "@orb/kit/guards";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";

/** The two leaves this guard reads out of one role's patch object. */
interface RolePatch {
  readonly namesSource: boolean;
  readonly namesModel: boolean;
  readonly source: string;
  readonly model: string;
}

function readRolePatch(patch: Record<string, unknown>, stored: Record<string, unknown> | undefined): RolePatch {
  const namesSource = "source" in patch;
  const namesModel = "model" in patch;
  const source = namesSource ? patch["source"] : stored?.["source"];
  const model = namesModel ? patch["model"] : undefined;
  return {
    namesSource,
    namesModel,
    source: typeof source === "string" ? source : "",
    model: typeof model === "string" ? model : "",
  };
}

/**
 * Return the `routing` patch made coherent (rule 1), or throw `DomainOperationError(incoherent_role_model)`
 * for a pair no source can serve (rule 2). Pure — the caller merges the RESULT, never the raw patch. A patch
 * with no `roleDefaults` object (or a non-object one, which the lenient parser drops) passes through.
 */
export function coherentRoutingPatch(current: UserSettings["routing"], patch: Record<string, unknown>): Record<string, unknown> {
  const roleDefaults = patch["roleDefaults"];
  if (!isPlainObject(roleDefaults)) {
    return patch;
  }
  const storedRoles: Record<string, unknown> = current.roleDefaults;
  const healed: Record<string, unknown> = {};
  for (const [role, rolePatch] of Object.entries(roleDefaults)) {
    if (!isPlainObject(rolePatch)) {
      healed[role] = rolePatch;
      continue;
    }
    const stored = storedRoles[role];
    const read = readRolePatch(rolePatch, isPlainObject(stored) ? stored : undefined);
    if (read.namesModel && read.model !== "" && isConfigDerivedModelSource(read.source)) {
      throw new DomainOperationError(
        SETTINGS_OP_CODES.incoherentRoleModel,
        `routing.roleDefaults.${role}: '${read.source}' serves the model it was configured with — a pinned '${read.model}' cannot be resolved on it.`,
      );
    }
    healed[role] = read.namesSource && !read.namesModel ? { ...rolePatch, model: null } : rolePatch;
  }
  return { ...patch, roleDefaults: healed };
}
