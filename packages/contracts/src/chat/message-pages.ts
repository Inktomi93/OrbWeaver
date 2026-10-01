import type { MessageId } from "@orb/kit/ids";
import type { CorpusSourceOutcome } from "../search/source.ts";
import type { MessageView } from "./messages.ts";
import type { ChatIdentity } from "./producers.ts";

/** Each canon page carries identity coverage for its own historical speaker stamps. */
export interface MessagesPage {
  readonly messages: readonly MessageView[];
  readonly identities: readonly ChatIdentity[];
}

/** Source resolution is distinct from ordinary paging and retains its resolved stable endpoints. */
export interface MessageWindow extends MessagesPage {
  readonly outcome: CorpusSourceOutcome;
  readonly anchorMessageId: MessageId | null;
  readonly anchorSeq: number | null;
  readonly endSeq: number | null;
  readonly endMessageId: MessageId | null;
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
}
