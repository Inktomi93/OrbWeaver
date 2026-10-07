// Select request observations preserve native event identity across Base UI's deferred focus/open work.
import type { SelectRoot } from "@base-ui/react/select";

export const SELECT_OPENING_PHASES = ["captured", "accepted", "invalidated"] as const;

export interface SelectOpeningRequest {
  readonly trigger: Element;
  readonly event: Event;
  /** Native timestamp in the page's performance time origin. */
  readonly startedAt: number;
}

export interface SelectOpeningObservation {
  readonly phase: (typeof SELECT_OPENING_PHASES)[number];
  readonly request: SelectOpeningRequest;
  readonly event: Event;
}

type OpeningSubscriber = (observation: SelectOpeningObservation) => void;
const subscribers = new Set<OpeningSubscriber>();
const OPEN_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", " "]);

/** Observe the seal's native requests without controlling its open state. */
export function subscribeSelectOpening(subscriber: OpeningSubscriber): () => void {
  subscribers.add(subscriber);
  return (): void => {
    subscribers.delete(subscriber);
  };
}

function publish(phase: SelectOpeningObservation["phase"], request: SelectOpeningRequest, event: Event = request.event): void {
  for (const subscriber of subscribers) {
    subscriber({ phase, request, event });
  }
}

export interface SelectOpeningObserver {
  readonly pointer: (trigger: Element, event: PointerEvent, uncontrolled: boolean) => void;
  readonly mouse: (trigger: Element, event: MouseEvent, uncontrolled: boolean) => void;
  readonly key: (trigger: Element, event: KeyboardEvent, uncontrolled: boolean) => void;
  readonly click: (trigger: Element, event: MouseEvent, uncontrolled: boolean) => void;
  readonly change: (open: boolean, details: SelectRoot.ChangeEventDetails, uncontrolled: boolean, event: Event) => void;
  readonly clear: () => void;
}

/** Bind one seal instance's captures to the exact native event carried by its Root callback. */
export function createSelectOpeningObserver(bornUncontrolled: boolean): SelectOpeningObserver {
  const requests = new Set<SelectOpeningRequest>();
  const events = new WeakMap<Event, SelectOpeningRequest>();
  let pointer: SelectOpeningRequest | undefined;
  let keyboard: SelectOpeningRequest | undefined;
  let accepted: SelectOpeningRequest | undefined;

  function invalidate(request: SelectOpeningRequest): void {
    requests.delete(request);
    publish("invalidated", request);
  }

  function clear(): void {
    for (const request of requests) {
      invalidate(request);
    }
    pointer = undefined;
    keyboard = undefined;
    accepted = undefined;
  }

  function capture(trigger: Element, event: Event): SelectOpeningRequest {
    for (const request of requests) {
      if (request !== accepted) {
        invalidate(request);
      }
    }
    const request: SelectOpeningRequest = { trigger, event, startedAt: event.timeStamp };
    requests.add(request);
    events.set(event, request);
    publish("captured", request);
    return request;
  }

  function associate(trigger: Element, event: Event, request: SelectOpeningRequest | undefined): boolean {
    if (request === undefined || request.trigger !== trigger || !requests.has(request)) {
      return false;
    }
    events.set(event, request);
    return true;
  }

  return {
    pointer(trigger, event, uncontrolled): void {
      if (bornUncontrolled && uncontrolled && event.isTrusted && event.button === 0) {
        keyboard = undefined;
        pointer = capture(trigger, event);
      }
    },
    mouse(trigger, event, uncontrolled): void {
      if (bornUncontrolled && uncontrolled && event.isTrusted && event.button === 0 && !associate(trigger, event, pointer)) {
        pointer = capture(trigger, event);
      }
    },
    key(trigger, event, uncontrolled): void {
      if (bornUncontrolled && uncontrolled && event.isTrusted && OPEN_KEYS.has(event.key)) {
        pointer = undefined;
        keyboard = capture(trigger, event);
      }
    },
    click(trigger, event, uncontrolled): void {
      if (bornUncontrolled && uncontrolled && event.isTrusted && !associate(trigger, event, event.detail === 0 ? keyboard : pointer)) {
        capture(trigger, event);
      }
    },
    change(open, details, uncontrolled, event): void {
      const request = events.get(event);
      // A superseded native callback still belongs to its old request, not the current gesture.
      if (open && request !== undefined && !requests.has(request)) {
        return;
      }
      if (!open || details.isCanceled || !bornUncontrolled || !uncontrolled || !event.isTrusted || request === undefined || !requests.has(request)) {
        clear();
        return;
      }
      for (const previous of requests) {
        if (previous !== request) {
          invalidate(previous);
        }
      }
      accepted = request;
      publish("accepted", request, event);
    },
    clear,
  };
}
