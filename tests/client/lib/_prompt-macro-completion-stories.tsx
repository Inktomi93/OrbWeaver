import { BUILTIN_MACRO_SUGGESTIONS } from "@orb/client/lib";
import { CtIsolation } from "@orb/testkit/browser";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import type { ReactElement } from "react";
import { useState } from "react";

/** The prompt editors' completion field over the production builtin catalog. */
export function BuiltinMacroCompletionStory(): ReactElement {
  const [value, setValue] = useState("");
  return (
    <CtIsolation subject="MacroTextarea" isolates="The completion list over the builtin macro catalog, without the editor around it">
      <MacroTextarea aria-label="Macro field" onChange={setValue} suggestions={BUILTIN_MACRO_SUGGESTIONS} value={value} />
    </CtIsolation>
  );
}
