import type { ReactToolArgs, ReactToolOutcome } from "@orb/contracts/chat";
import type { ChatToolExecutionData } from "@orb/contracts/tool-use";
import type { ReactAsCharacterOp } from "./results.ts";

export type ReactToolHandlerContext = Pick<ChatToolExecutionData, "principal" | "chatId">;
export interface ReactToolHandlerDeps {
  readonly reactAsCharacter: ReactAsCharacterOp;
}
export type ReactToolHandler = (args: ReactToolArgs, exec: ReactToolHandlerContext) => Promise<ReactToolOutcome>;
