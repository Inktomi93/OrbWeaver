// The per-row regex-script autosave form (D121-E), mounted through the D78 session boundary keyed by the script's
// own id. Its value is `CreateRegexScriptInput`, the authored fields, so create and edit drive one field set.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexTarget } from "@orb/kit/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { createAutosaveEntityForm } from "#forms/editor";
import { regexWhenPasses } from "../lib/regex-when.ts";

/** A new script changes the two conversational texts on screen and in the prompt: a default that rewrites stored
 *  messages before the user has typed a pattern would be the worst first state, and an empty set runs nowhere. */
const DEFAULT_TARGETS: readonly RegexTarget[] = ["USER_INPUT", "AI_OUTPUT"];

/** A fresh script seeded with the schema defaults. */
export function makeRegexScriptDefaults(): CreateRegexScriptInput {
  return {
    name: "New script",
    findRegex: "",
    replaceString: "",
    targets: [...DEFAULT_TARGETS],
    passes: regexWhenPasses("displayAndPrompt"),
    enabled: true,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
  };
}

export const RegexScriptForm = createAutosaveEntityForm<CreateRegexScriptInput>({
  defaultValues: makeRegexScriptDefaults(),
});
