import type { EmitRpgEvent, RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";

export interface RpgEventBus extends Disposable {
  readonly publishRpgEvent: EmitRpgEvent;
  readonly subscribeRpgEvents: (chatId: ChatId, signal: AbortSignal) => AsyncIterable<RpgBusEvent>;
}
