import type { ChatBusEvent } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";

/** The row a view-carrying event describes; a view-less event names none. */
export function eventViewMessageId(event: ChatBusEvent): MessageId | undefined {
  return "view" in event ? event.view.id : undefined;
}

/** Stamps this viewer's position onto a delivered view. Durable rows hold no position, so a position that cannot be
 *  resolved leaves the view unnumbered. */
export function withViewPosition(event: ChatBusEvent, position: number | undefined): ChatBusEvent {
  return position === undefined || !("view" in event) ? event : { ...event, view: { ...event.view, position } };
}
