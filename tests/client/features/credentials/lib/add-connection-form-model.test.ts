// The add dialog's validator and its typed-model reasons (inference program §5.3a). The case worth pinning:
// after a partial failure the dialog holds a saved key and has cleared the pasted secret, and a retry must
// still be submittable — an empty key field is then not a missing key.

import type { ProviderDef } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import type { AddConnectionFormValues } from "../../../../../packages/client/src/features/credentials/lib/add-connection-form-model.ts";
import {
  ADD_CONNECTION_DEFAULTS,
  draftModelReason,
  validateAddConnection,
} from "../../../../../packages/client/src/features/credentials/lib/add-connection-form-model.ts";
import { addModelActionLabel } from "../../../../../packages/client/src/features/credentials/lib/add-model-on-key-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const HOSTED_DRAFT: AddConnectionFormValues = { ...ADD_CONNECTION_DEFAULTS, providerId: "openrouter", auth: "apiKey", model: "anthropic/claude-opus-5" };

function builtin(id: string): ProviderDef {
  const row = BUILTIN_PROVIDERS.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return row;
}

test("a hosted draft needs its key until the dialog holds a saved one", () => {
  expect(validateAddConnection(HOSTED_DRAFT)).toEqual({ fields: { key: "Paste your API key." } });
  expect(validateAddConnection({ ...HOSTED_DRAFT, keyHeld: true })).toBeUndefined();
});

test("the subscription's missing-token message names the command it asks the user to run", () => {
  expect(validateAddConnection({ ...HOSTED_DRAFT, auth: "oauthToken", providerId: "claude-sub" })?.fields["key"]).toBe(
    "Paste the token from `claude setup-token`.",
  );
});

test("a hosted draft's typed-model reason points at the saved-key action by its exact label", () => {
  expect(draftModelReason(builtin("openrouter"))).toContain(`“${addModelActionLabel("key")}”`);
  expect(draftModelReason(builtin("claude-sub"))).toContain("as Claude subscription spells it");
  expect(draftModelReason(builtin("local-light"))).toContain(`“${addModelActionLabel("builtin")}”`);
  expect(draftModelReason(builtin("vllm"))).toBe("Type the model id your server serves, or list them from the URL above.");
});
