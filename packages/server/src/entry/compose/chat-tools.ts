// Registration is graph wiring; chat owns argument validation and model-facing reaction outcomes.
import type { ReactToolArgs } from "@orb/contracts/chat";
import { CHAT_REACT_TOOL_DESCRIPTION, CHAT_REACT_TOOL_NAME, reactToolArgsSchema } from "@orb/contracts/chat";
import type { ReactToolHandlerDeps } from "#domain/chat";
import { createReactToolHandler } from "#domain/chat";
import type { ToolDefinition } from "#domain/tool-use";

/** Register the builtin at the member floor; the delegated character-reaction verb gates its writes. */
export function createReactToolDefinition(deps: ReactToolHandlerDeps): ToolDefinition<ReactToolArgs> {
  return {
    name: CHAT_REACT_TOOL_NAME,
    description: CHAT_REACT_TOOL_DESCRIPTION,
    argsSchema: reactToolArgsSchema,
    capability: null,
    source: "builtin",
    handler: createReactToolHandler(deps),
  };
}
