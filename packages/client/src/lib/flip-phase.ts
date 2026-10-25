// The life of one stamped FLIP, shared by the shell's doors and the room's flank door: every carrier on one
// timeline, and one stop signal however the FLIP ends. DOM access uses local structural types, not the `dom` lib,
// because the node programs that load the lib barrel compile without it.

/** The part of a CSS animation this reads: its keyframe name, its start time and its first-frame promise. */
interface FlipAnimation {
  readonly animationName?: string;
  startTime: unknown;
  readonly ready: Promise<unknown>;
}

interface Animated {
  readonly getAnimations: (options: { readonly subtree: boolean }) => readonly FlipAnimation[];
}

interface AnimationEnd {
  readonly animationName: string;
}

interface FlipRoot extends Animated {
  readonly addEventListener: (type: "animationend" | "animationcancel", listener: (event: AnimationEnd) => void) => void;
  readonly removeEventListener: (type: "animationend" | "animationcancel", listener: (event: AnimationEnd) => void) => void;
}

interface Mutation {
  readonly addedNodes: Iterable<unknown>;
}

interface Observer {
  readonly observe: (target: unknown, options: { readonly childList: boolean; readonly subtree: boolean }) => void;
  readonly disconnect: () => void;
}

type ObserverConstructor = new (callback: (records: readonly Mutation[]) => void) => Observer;

function isAnimated(node: unknown): node is Animated {
  return typeof node === "object" && node !== null && typeof (node as Partial<Animated>).getAnimations === "function";
}

/** The FLIP animations under `root` whose keyframes are in `names`. */
function flipsUnder(root: Animated, names: ReadonlySet<string>): FlipAnimation[] {
  return root.getAnimations({ subtree: true }).filter((animation) => animation.animationName !== undefined && names.has(animation.animationName));
}

/**
 * Hold a just-stamped FLIP in phase until it stops, then call `onStop` once. Returns the disposer, or `null` when the
 * stamp armed nothing (a phone, an empty room), which the caller releases at once.
 *
 * @remarks A carrier mounted mid-FLIP (a transcript row the virtual list adds as the rows reflow) matches the rule on
 * insertion and would start its own FLIP from the `from` corner, out of phase with the boxes armed at the stamp. A
 * mutation observer runs after the inserting commit and before that frame's paint, so the newcomer takes the armed
 * animations' start time there. The FLIP stops on the first end (every carrier shares one duration), or when a cancel
 * leaves none running: a viewport that drops the FLIP rule cancels every one and no end ever fires.
 */
export function holdFlipInPhase(root: FlipRoot, names: ReadonlySet<string>, onStop: () => void): (() => void) | null {
  const armed = flipsUnder(root, names);
  if (armed.length === 0) {
    return null;
  }
  const MutationObserverCtor = Reflect.get(globalThis, "MutationObserver") as ObserverConstructor;
  // The armed animations' shared start time, kept from the first one to start: a row or a closing pane can be cancelled
  // mid-FLIP, and a cancelled animation reads `null`.
  let start: unknown = null;
  const started = Promise.any(armed.map((animation) => animation.ready.then(() => animation))).then((first) => {
    start ??= first.startTime;
  });
  // Every armed animation cancelled before its first frame rejects `started`; the cancel below then stops the FLIP.
  started.catch(() => undefined);
  const join = (node: Animated): void => {
    for (const animation of flipsUnder(node, names)) {
      animation.startTime = start;
    }
  };
  const observer = new MutationObserverCtor((records) => {
    for (const node of records.flatMap((record) => Array.from(record.addedNodes))) {
      if (!isAnimated(node)) {
        continue;
      }
      if (start === null) {
        // Inserted before the first frame: a newcomer can stay pending past it, so it joins once the armed ones start.
        started.then(
          () => join(node),
          () => undefined,
        );
      } else {
        join(node);
      }
    }
  });
  const dispose = (): void => {
    observer.disconnect();
    root.removeEventListener("animationend", onEnd);
    root.removeEventListener("animationcancel", onCancel);
  };
  function onEnd(event: AnimationEnd): void {
    if (names.has(event.animationName)) {
      dispose();
      onStop();
    }
  }
  function onCancel(event: AnimationEnd): void {
    if (names.has(event.animationName) && flipsUnder(root, names).length === 0) {
      dispose();
      onStop();
    }
  }
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("animationend", onEnd);
  root.addEventListener("animationcancel", onCancel);
  return dispose;
}
