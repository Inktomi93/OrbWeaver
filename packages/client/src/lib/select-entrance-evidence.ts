// Audit evidence for the sealed Select's normal entrance/positioning lifetime. This observes the
// existing Trigger -> Portal -> Positioner -> Popup anatomy; it never changes product mount or motion.
// A trigger intent is provisional until its ARIA-related Positioner actually mounts, and the range ends
// with the real opacity/scale transition (plus one small stale-evidence safety cap).

import type { SelectOpeningObservation, SelectOpeningRequest } from "@orb/ui/select";
import { SELECT_OPENING_PHASES, subscribeSelectOpening } from "@orb/ui/select";

const SELECT_TRIGGER_SELECTOR = '[data-slot="select-trigger"]';
const SELECT_POSITIONER_SELECTOR = '[data-slot="select-positioner"]';
const SELECT_POPUP_SELECTOR = '[data-slot="select-popup"]';
const ENTRANCE_PROPERTIES = new Set(["opacity", "scale"]);
const ARIA_REFERENCE_SEPARATOR = /\s+/u;
const SELECT_ENTRANCE_MAX_MS = 300;
const OBSERVER_DELIVERY_GRACE_MS = 200;
const POST_TRANSITION_PRESENTED_FRAMES = 2;
const TRACE_PREFIX = "orb:select-entrance";

export interface SelectEntranceEvidence {
  readonly id: number;
  readonly startedAt: number;
  readonly confirmedAt?: number;
  readonly endedAt?: number;
  readonly firstForTrigger: boolean;
}

interface MutableEntrance {
  id: number;
  startedAt: number;
  confirmedAt?: number;
  endedAt?: number;
  firstForTrigger: boolean;
  trigger: Element;
  activeProperties: Set<string>;
  popup: Element | undefined;
  timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  finishFrameId: number | undefined;
  request: SelectOpeningRequest;
  accepted: boolean;
}

const entrances: MutableEntrance[] = [];
const requests = new Map<SelectOpeningRequest, MutableEntrance>();
const seenTriggers = new WeakSet<Element>();
let nextEntranceId = 0;

function traceMark(entrance: MutableEntrance, phase: "start" | "confirmed" | "end", startTime: number): void {
  performance.mark(`${TRACE_PREFIX}:${entrance.id}:${phase}`, { startTime });
}

function pruneEvidence(now: number): void {
  for (let index = entrances.length - 1; index >= 0; index -= 1) {
    const entrance = entrances[index];
    const capStart = entrance?.confirmedAt;
    if (
      entrance !== undefined &&
      (!entrance.trigger.isConnected || (capStart !== undefined && now > capStart + SELECT_ENTRANCE_MAX_MS + OBSERVER_DELIVERY_GRACE_MS))
    ) {
      requests.delete(entrance.request);
      entrances.splice(index, 1);
    }
  }
}

function beginRequest(request: SelectOpeningRequest): void {
  pruneEvidence(performance.now());
  nextEntranceId += 1;
  const entrance: MutableEntrance = {
    id: nextEntranceId,
    startedAt: request.startedAt,
    firstForTrigger: false,
    trigger: request.trigger,
    activeProperties: new Set<string>(),
    popup: undefined,
    timeoutId: undefined,
    finishFrameId: undefined,
    request,
    accepted: false,
  };
  // The LoAF ring exposes this object's evidence fields. Keep observer-only DOM/lifecycle state out of
  // that snapshot so the bridge neither retains nor serializes portal nodes as accidental evidence.
  for (const key of ["trigger", "popup", "activeProperties", "timeoutId", "finishFrameId", "request", "accepted"] as const) {
    Object.defineProperty(entrance, key, { configurable: true, enumerable: false, value: entrance[key], writable: true });
  }
  entrances.push(entrance);
  requests.set(request, entrance);
  traceMark(entrance, "start", request.startedAt);
}

function observeOpening(observation: SelectOpeningObservation): void {
  const phase = observation.phase;
  switch (phase) {
    case SELECT_OPENING_PHASES[0]:
      beginRequest(observation.request);
      return;
    case SELECT_OPENING_PHASES[1]: {
      const entrance = requests.get(observation.request);
      if (entrance !== undefined) {
        entrance.accepted = true;
        confirmPositionerForTrigger(entrance.trigger);
      }
      return;
    }
    case SELECT_OPENING_PHASES[2]: {
      const entrance = requests.get(observation.request);
      requests.delete(observation.request);
      if (entrance !== undefined && entrance.confirmedAt === undefined) {
        const index = entrances.indexOf(entrance);
        if (index !== -1) {
          entrances.splice(index, 1);
        }
      }
      return;
    }
    default: {
      const exhaustive: never = phase;
      throw new Error("Unrecognized Select opening observation", { cause: exhaustive });
    }
  }
}

function controlledIds(positioner: Element): Set<string> {
  return new Set([...positioner.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id).filter((id) => id !== ""));
}

function relatedTrigger(positioner: Element): Element | undefined {
  const ids = controlledIds(positioner);
  return [...document.querySelectorAll<HTMLElement>(SELECT_TRIGGER_SELECTOR)].find((candidate) => {
    const references = `${candidate.getAttribute("aria-controls") ?? ""} ${candidate.getAttribute("aria-describedby") ?? ""}`
      .trim()
      .split(ARIA_REFERENCE_SEPARATOR);
    return references.some((id) => ids.has(id));
  });
}

function confirmPositionerForTrigger(trigger: Element): void {
  for (const positioner of document.querySelectorAll(SELECT_POSITIONER_SELECTOR)) {
    if (relatedTrigger(positioner) === trigger) {
      confirmPositioner(positioner);
    }
  }
}

function finishEntrance(entrance: MutableEntrance, at: number): void {
  if (entrance.endedAt !== undefined) {
    return;
  }
  const endedAt = Math.min(at, (entrance.confirmedAt ?? entrance.startedAt) + SELECT_ENTRANCE_MAX_MS);
  entrance.endedAt = endedAt;
  if (entrance.timeoutId !== undefined) {
    clearTimeout(entrance.timeoutId);
    entrance.timeoutId = undefined;
  }
  if (entrance.finishFrameId !== undefined) {
    cancelAnimationFrame(entrance.finishFrameId);
    entrance.finishFrameId = undefined;
  }
  traceMark(entrance, "end", endedAt);
}

function confirmPositioner(positioner: Element): void {
  const trigger = relatedTrigger(positioner);
  const now = performance.now();
  if (trigger === undefined || trigger.getAttribute("aria-expanded") !== "true") {
    return;
  }
  const firstForTrigger = !seenTriggers.has(trigger);
  seenTriggers.add(trigger);
  const entrance = entrances.findLast(
    (candidate) => candidate.trigger === trigger && candidate.accepted && requests.has(candidate.request) && candidate.confirmedAt === undefined,
  );
  if (entrance === undefined) {
    return;
  }
  entrance.confirmedAt = now;
  entrance.firstForTrigger = firstForTrigger;
  entrance.popup = positioner.querySelector(SELECT_POPUP_SELECTOR) ?? undefined;
  traceMark(entrance, "confirmed", now);
  entrance.timeoutId = globalThis.setTimeout(() => finishEntrance(entrance, performance.now()), SELECT_ENTRANCE_MAX_MS);
}

function recordAddedNode(node: Node): void {
  if (!(node instanceof Element)) {
    return;
  }
  if (node.matches(SELECT_POSITIONER_SELECTOR)) {
    confirmPositioner(node);
  }
  for (const positioner of node.querySelectorAll(SELECT_POSITIONER_SELECTOR)) {
    confirmPositioner(positioner);
  }
}

function entranceForTransition(event: TransitionEvent): MutableEntrance | undefined {
  if (!(ENTRANCE_PROPERTIES.has(event.propertyName) && event.target instanceof Element)) {
    return;
  }
  return entrances.findLast((entrance) => entrance.endedAt === undefined && entrance.popup === event.target);
}

function onTransitionStart(event: TransitionEvent): void {
  const entrance = entranceForTransition(event);
  if (entrance !== undefined) {
    entrance.activeProperties.add(event.propertyName);
  }
}

function finishAfterPresentedFrames(entrance: MutableEntrance, remaining: number): void {
  entrance.finishFrameId = requestAnimationFrame((frameStart) => {
    entrance.finishFrameId = undefined;
    if (entrance.activeProperties.size > 0) {
      return;
    }
    if (remaining > 0) {
      finishAfterPresentedFrames(entrance, remaining - 1);
    } else {
      finishEntrance(entrance, frameStart);
    }
  });
}

function onTransitionStop(event: TransitionEvent): void {
  const entrance = entranceForTransition(event);
  if (entrance === undefined) {
    return;
  }
  entrance.activeProperties.delete(event.propertyName);
  if (entrance.activeProperties.size === 0 && entrance.finishFrameId === undefined) {
    // Base UI's trace stays PRESENTED_PARTIAL for two complete frames after transition completion, then
    // becomes NO_UPDATE_DESIRED. Close on that measured handoff, not an arbitrary millisecond grace.
    finishAfterPresentedFrames(entrance, POST_TRANSITION_PRESENTED_FRAMES);
  }
}

/** Install once beside the LoAF observer. Trigger identity deliberately survives evidence resets: a
 * checkpoint cannot turn a natural reopen into the trigger's first page-lifetime entrance. */
export function installSelectEntranceObserver(): void {
  subscribeSelectOpening(observeOpening);
  for (const positioner of document.querySelectorAll(SELECT_POSITIONER_SELECTOR)) {
    confirmPositioner(positioner);
  }
  for (const type of ["transitionrun", "transitionstart"]) {
    document.addEventListener(type, onTransitionStart as EventListener, { capture: true, passive: true });
  }
  for (const type of ["transitionend", "transitioncancel"]) {
    document.addEventListener(type, onTransitionStop as EventListener, { capture: true, passive: true });
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element &&
        mutation.target.matches(SELECT_TRIGGER_SELECTOR) &&
        mutation.target.getAttribute("aria-expanded") === "true"
      ) {
        // A repeat may reactivate an exit-retained Positioner without adding a node. The trusted intent
        // is still provisional until this lookup finds that trigger's own ARIA-related Positioner.
        confirmPositionerForTrigger(mutation.target);
      }
      for (const node of mutation.addedNodes) {
        recordAddedNode(node);
      }
    }
  }).observe(document.documentElement, { attributeFilter: ["aria-expanded"], attributes: true, childList: true, subtree: true });
}

/** Return the same mutable evidence object for every LoAF overlapping the provisional entrance. It is
 * classifiable only after mount confirmation; an earlier focus frame can therefore be confirmed by the
 * Positioner mutation that follows without delaying the PerformanceObserver. */
export function selectEntranceForFrame(entry: PerformanceEntry): SelectEntranceEvidence | undefined {
  const frameEnd = entry.startTime + entry.duration;
  pruneEvidence(frameEnd);
  return entrances.findLast((entrance) => {
    const entranceEnd = entrance.endedAt ?? (entrance.confirmedAt === undefined ? Number.POSITIVE_INFINITY : entrance.confirmedAt + SELECT_ENTRANCE_MAX_MS);
    return entrance.startedAt <= frameEnd && entranceEnd >= entry.startTime;
  });
}

/** Clear checkpoint-scoped ranges and their safety timers. `seenTriggers` remains page-lifetime state. */
export function resetSelectEntranceEvidence(): void {
  for (const entrance of entrances) {
    if (entrance.timeoutId !== undefined) {
      clearTimeout(entrance.timeoutId);
    }
    if (entrance.finishFrameId !== undefined) {
      cancelAnimationFrame(entrance.finishFrameId);
    }
  }
  entrances.length = 0;
  requests.clear();
}
