// The add dialog's typed-model reasons (inference program §5.3a): a hosted or built-in draft has no catalog
// read, so its reason must name the saved-connection action that has one, by that action's exact label.

import type { ProviderDef } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import { draftModelReason } from "../../../../../packages/client/src/features/credentials/lib/add-connection-form-model.ts";
import { addModelActionLabel } from "../../../../../packages/client/src/features/credentials/lib/add-model-on-key-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function builtin(id: string): ProviderDef {
  const row = BUILTIN_PROVIDERS.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return row;
}

test("a hosted draft's typed-model reason points at the saved-key action by its exact label", () => {
  expect(draftModelReason(builtin("openrouter"))).toContain(`“${addModelActionLabel("key")}”`);
  expect(draftModelReason(builtin("claude-sub"))).toContain("as Claude subscription spells it");
  expect(draftModelReason(builtin("local-light"))).toContain(`“${addModelActionLabel("builtin")}”`);
  expect(draftModelReason(builtin("vllm"))).toBe("Type the model id your server serves, or list them from the URL above.");
});
