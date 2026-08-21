// Audit evidence for the sealed Select's normal entrance/positioning lifetime. This observes the
// existing Trigger -> Portal -> Positioner -> Popup anatomy; it never changes product mount or motion.
// A trigger intent is provisional until its ARIA-related Positioner actually mounts, and the range ends
// with the real opacity/scale transition (plus one small stale-evidence safety cap).

const SELECT_TRIGGER_SELECTOR = '[data-slot="select-trigger"]';
const SELECT_POSITIONER_SELECTOR = '[data-slot="select-positioner"]';
const SELECT_POPUP_SELECTOR = '[data-slot="select-popup"]';
const OPEN_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", " "]);
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
}

const entrances: MutableEntrance[] = [];
const seenTriggers = new WeakSet<Element>();
let nextEntranceId = 0;

function traceMark(entrance: MutableEntrance, phase: "start" | "confirmed" | "end", startTime: number): void {
  performance.mark(`${TRACE_PREFIX}:${entrance.id}:${phase}`, { startTime });
}

function pruneEvidence(now: number): void {
  for (let index = entrances.length - 1; index >= 0; index -= 1) {
    const entrance = entrances[index];
    const capStart = entrance?.confirmedAt ?? entrance?.startedAt;
    if (entrance !== undefined && capStart !== undefined && now > capStart + SELECT_ENTRANCE_MAX_MS + OBSERVER_DELIVERY_GRACE_MS) {
      entrances.splice(index, 1);
    }
  }
}

function triggerFromEvent(event: Event): Element | null {
  const target = event.target;
  if (!(target instanceof Element && event.isTrusted)) {
    return null;
  }
  const trigger = target.closest(SELECT_TRIGGER_SELECTOR);
  if (trigger === null || trigger.getAttribute("aria-disabled") === "true") {
    return null;
  }
  return trigger;
}

function beginIntent(trigger: Element): void {
  const now = performance.now();
  pruneEvidence(now);
  const existing = entrances.findLast(
    (candidate) => candidate.trigger === trigger && candidate.confirmedAt === undefined && now <= candidate.startedAt + SELECT_ENTRANCE_MAX_MS,
  );
  if (existing !== undefined) {
    return;
  }
  nextEntranceId += 1;
  const entrance: MutableEntrance = {
    id: nextEntranceId,
    startedAt: now,
    firstForTrigger: false,
    trigger,
    activeProperties: new Set<string>(),
    popup: undefined,
    timeoutId: undefined,
    finishFrameId: undefined,
  };
  // The LoAF ring exposes this object's evidence fields. Keep observer-only DOM/lifecycle state out of
  // that snapshot so the bridge neither retains nor serializes portal nodes as accidental evidence.
  for (const key of ["trigger", "popup", "activeProperties", "timeoutId", "finishFrameId"] as const) {
    Object.defineProperty(entrance, key, { configurable: true, enumerable: false, value: entrance[key], writable: true });
  }
  entrances.push(entrance);
  traceMark(entrance, "start", now);
  // Base UI may reuse a Positioner that is still completing its exit instead of adding a fresh node on
  // a quick reopen. Its discrete event update flushes before this microtask, so confirm that existing
  // ARIA-related node through the same narrow relation the MutationObserver uses for a first mount.
  queueMicrotask(() => {
    confirmPositionerForTrigger(trigger);
  });
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
  if (trigger === undefined) {
    return;
  }
  const entrance = entrances.findLast(
    (candidate) => candidate.trigger === trigger && candidate.confirmedAt === undefined && now <= candidate.startedAt + SELECT_ENTRANCE_MAX_MS,
  );
  if (entrance === undefined) {
    return;
  }
  entrance.confirmedAt = now;
  entrance.firstForTrigger = !seenTriggers.has(trigger);
  entrance.popup = positioner.querySelector(SELECT_POPUP_SELECTOR) ?? undefined;
  seenTriggers.add(trigger);
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
  document.addEventListener(
    "pointerdown",
    (event) => {
      const trigger = triggerFromEvent(event);
      if (trigger !== null) {
        beginIntent(trigger);
      }
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const trigger = triggerFromEvent(event);
      if (trigger !== null && event instanceof KeyboardEvent && OPEN_KEYS.has(event.key)) {
        beginIntent(trigger);
      }
    },
    { capture: true, passive: true },
  );
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
    const entranceEnd = entrance.endedAt ?? (entrance.confirmedAt ?? entrance.startedAt) + SELECT_ENTRANCE_MAX_MS;
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
}
