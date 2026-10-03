import type { ChatId } from "@orb/kit/ids";
import type { InferenceDeps } from "../deps.ts";
import type { ProviderBackend } from "./backend.ts";
import type { Resolved } from "./resolved.ts";

export interface GoogleBackendDeps {
  readonly now: InferenceDeps["now"];
  readonly random?: InferenceDeps["random"];
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: InferenceDeps["addSpanEvent"];
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
}

export interface GoogleCall {
  readonly connection: Resolved;
  readonly deps: GoogleBackendDeps;
  readonly label: string;
  readonly api: string;
  readonly chatId?: ChatId | undefined;
}

export type GoogleBackend = {
  readonly [K in "wire" | "runChatTurn" | "summarize" | "structured" | "embed" | "imageEmbed" | "generateImage" | "probe" | "listModels"]: NonNullable<
    ProviderBackend[K]
  >;
};
