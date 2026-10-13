import type { ReactToolArgs, ReactToolOutcome } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import type { ReactAsCharacterOp } from "./results.ts";

export interface ReactToolHandlerContext {
  readonly principal: Principal;
  readonly chatId: ChatId | null;
}
export interface ReactToolHandlerDeps {
  readonly reactAsCharacter: ReactAsCharacterOp;
}
export type ReactToolHandler = (args: ReactToolArgs, exec: ReactToolHandlerContext) => Promise<ReactToolOutcome>;
