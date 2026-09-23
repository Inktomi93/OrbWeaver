// The add dialog's validator and its typed-model reasons (inference program §5.3a). The case worth pinning:
// after a partial failure the dialog holds a saved key and has cleared the pasted secret, and a retry must
// still be submittable — an empty key field is then not a missing key.

import type { ProviderDef } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import type { AddConnectionFormValues } from "../../../../../packages/client/src/features/credentials/lib/add-connection-form-model.ts";
import {
  ADD_CONNECTION_DEFAULTS,
  draftModelReason,
  modelIdExample,
  submitFailureSentence,
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
  // The built-in provider lists in the dialog itself, so its reason points at no menu a new user lacks.
  expect(draftModelReason(builtin("local-light"))).toBe("Pick one of the models Built-in (this device) runs.");
  expect(draftModelReason(builtin("vllm"))).toBe("Type the model id your server serves, or list them from the URL above.");
});

test("a failed submit is one sentence: with a saved key it names the row (or says it is unnamed); without one, nothing was saved", () => {
  expect(submitFailureSentence({ heldKeyLabel: "work", reason: "the provider refused the model id." })).toBe(
    "Your key was saved as “work” in Saved keys, but the connection wasn't created — the provider refused the model id. Adding again reuses the saved key. If you cancel, the key stays in Saved keys.",
  );
  expect(submitFailureSentence({ heldKeyLabel: null, reason: "boom" })).toBe(
    "Your key (unnamed) was saved in Saved keys, but the connection wasn't created — boom. Adding again reuses the saved key. If you cancel, the key stays in Saved keys.",
  );
  expect(submitFailureSentence({ heldKeyLabel: undefined, reason: "boom." })).toBe("Nothing was saved — boom.");
});

test("the typed-id example is in each provider's own spelling", () => {
  expect(BUILTIN_PROVIDERS.map((provider) => [provider.id, modelIdExample(provider)])).toEqual([
    ["openrouter", "e.g. anthropic/claude-opus-5"],
    ["anthropic", "e.g. claude-opus-5"],
    ["claude-sub", "e.g. opus"],
    ["openai", "e.g. gpt-5"],
    ["vllm", "e.g. Qwen/Qwen3-32B"],
    ["lm-studio", "e.g. Qwen/Qwen3-32B"],
    ["ollama", "e.g. Qwen/Qwen3-32B"],
    ["custom-openai", "e.g. Qwen/Qwen3-32B"],
    // A closed catalog's example is a model it runs — the seeded encoder, not an id the runtime refuses.
    ["local-light", "e.g. jinaai/jina-clip-v2"],
  ]);
});
