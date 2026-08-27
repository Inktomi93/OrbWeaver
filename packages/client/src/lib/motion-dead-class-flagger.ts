// The `[css]` arm of the dev-only motion flagger pack: one initial class census, followed by
// MutationObserver-scoped cooperative scans. Split from motion-flaggers.ts at the client source cap;
// that parent still owns the shared ring, console vocabulary, budgets, and installation door.
//
// WHAT "DEAD" MEANS IS NOT DECIDED HERE — the tokenizer and the marker-namespace tables are
// `@orb/kit/dead-css`, the one home this flagger shares with `pnpm snap --dead-css`'s in-page scan
// (`tooling/src/snap/ops/dead-css.ts`). Only the DOM half — which sheets to walk, which elements to
// visit, and on what clock — is local, because that is the half the two consumers genuinely differ on.

import { classTokensInSelector, isDeadCssMarkerClass } from "@orb/kit/dead-css";
import { isExternalDevtoolsElement } from "./motion-animation-state.ts";

const initialScan = Promise.withResolvers<void>();
let initialScanSettled = false;

// A throttled scan is still capable of monopolizing one rendered frame under CPU pressure. Keep each
// idle slice bounded even when the browser reports a timed-out deadline; the next idle task resumes the
// same lazy tree walk rather than rebuilding a candidate array.
const DEAD_CLASS_SCAN_BATCH_SIZE = 32;
const IDLE_DEADLINE_FLOOR_MS = 1;

export interface DeadClassFlaggerOptions {
  readonly scanIntervalMs: number;
  readonly onDeadClass: (token: string, element: Element) => void;
}

/** Measurement harnesses settle the one initial full census before opening an interaction window. */
export function motionFlaggersSettled(): Promise<void> {
  return initialScan.promise;
}

function markMotionFlaggersSettled(): void {
  if (!initialScanSettled) {
    initialScanSettled = true;
    initialScan.resolve();
  }
}

/** Every class token any loaded stylesheet DEFINES a rule for. Walks nested rules (Tailwind v4 emits
 * variants as nesting) and tolerates cross-origin sheets. The per-selector tokenizer is `@orb/kit`'s
 * (`dead-css`), shared with `pnpm snap --dead-css` so both scans mean the same thing by "dead". */
/** @public Test-anchored CSSOM boundary: only cross-origin SecurityError is an unreadable-sheet skip.
 *  `tokenize` is an INJECTION SEAM, not a knob: the rethrow-everything-but-SecurityError contract can only
 *  be proven by a tokenizer that throws, and faking `@orb/kit/dead-css` wholesale would be the internal
 *  mock `Spine-Testing.md` §3 bans. Production callers take the default and are unchanged. */
export function definedClassTokens(tokenize: (selector: string) => readonly string[] = classTokensInSelector): ReadonlySet<string> {
  const defined = new Set<string>();
  const walk = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      const selector = (rule as CSSStyleRule).selectorText;
      if (typeof selector === "string") {
        for (const token of tokenize(selector)) {
          defined.add(token);
        }
      }
      // `instanceof`, not a cast + a null check: CSSStyleRule extends CSSGroupingRule in the current
      // spec, which is what makes Tailwind v4's nested variant rules reachable.
      if (rule instanceof CSSGroupingRule) {
        walk(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    // SWALLOW OWNERSHIP (empty:error) — CSSOM SecurityError is the browser's cross-origin unreadable-sheet verdict; every tokenizer/walk failure rethrows. Ends if same-origin sheets can raise this name.
    try {
      rules = sheet.cssRules;
    } catch (error) {
      if (error instanceof Error && error.name === "SecurityError") {
        continue;
      }
      throw error;
    }
    walk(rules);
  }
  return defined;
}

function scanElement(el: Element, defined: ReadonlySet<string>, onDeadClass: DeadClassFlaggerOptions["onDeadClass"]): void {
  if (isExternalDevtoolsElement(el)) {
    return;
  }
  for (const token of el.classList) {
    if (!(defined.has(token) || isDeadCssMarkerClass(token))) {
      onDeadClass(token, el);
    }
  }
}

interface ScanJob {
  current: Element | null;
  readonly walker: TreeWalker | null;
}

function scanJob(root: Element, subtree: boolean): ScanJob {
  return {
    current: root,
    walker: subtree ? document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT) : null,
  };
}

/** Consume one cooperative slice. `didTimeout` may make `timeRemaining()` zero, so the hard element cap
 * is the backstop: timed-out and setTimeout-fallback work progresses without becoming one long task. */
function scanBatch(jobs: ScanJob[], defined: ReadonlySet<string>, deadline: IdleDeadline, onDeadClass: DeadClassFlaggerOptions["onDeadClass"]): void {
  let inspected = 0;
  while (
    jobs.length > 0 &&
    inspected < DEAD_CLASS_SCAN_BATCH_SIZE &&
    (inspected === 0 || deadline.didTimeout || deadline.timeRemaining() > IDLE_DEADLINE_FLOOR_MS)
  ) {
    const job = jobs[0];
    if (job === undefined) {
      return;
    }
    const current = job.current;
    if (current === null) {
      jobs.shift();
      continue;
    }
    scanElement(current, defined, onDeadClass);
    inspected += 1;
    job.current = job.walker === null ? null : (job.walker.nextNode() as Element | null);
    if (job.current === null) {
      jobs.shift();
    }
  }
}

function addsStylesheet(node: Element): boolean {
  const selector = 'style, link[rel="stylesheet"]';
  return node.matches(selector) || node.querySelector(selector) !== null;
}

function addRoot(pending: Map<Element, boolean>, root: Element, subtree: boolean): void {
  pending.set(root, subtree || pending.get(root) === true);
}

function collectRoots(records: readonly MutationRecord[], pending: Map<Element, boolean>): boolean {
  let stylesheetChanged = false;
  for (const record of records) {
    if (record.type === "attributes" && record.target instanceof Element) {
      addRoot(pending, record.target, false);
    }
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) {
        continue;
      }
      addRoot(pending, node, true);
      stylesheetChanged ||= addsStylesheet(node);
    }
  }
  return stylesheetChanged;
}

/** Throttled and idle-deferred: the initial census walks the document once; later scans consume only
 * MutationObserver roots. A mutation inside the throttle window schedules one trailing scan. */
export function installDeadClassFlagger({ scanIntervalMs, onDeadClass }: DeadClassFlaggerOptions): void {
  let defined: ReadonlySet<string> | null = null;
  const pending = new Map<Element, boolean>([[document.documentElement, true]]);
  const jobs: ScanJob[] = [];
  let stylesheetChanged = true;
  let lastScan = 0;
  let queued = false;
  let trailingPending = false;
  const run = (deadline: IdleDeadline): void => {
    if (jobs.length === 0) {
      lastScan = performance.now();
      if (defined === null || stylesheetChanged) {
        defined = definedClassTokens();
        stylesheetChanged = false;
      }
      for (const [root, subtree] of pending) {
        jobs.push(scanJob(root, subtree));
      }
      pending.clear();
    }
    const activeDefinition = defined ?? definedClassTokens();
    defined = activeDefinition;
    scanBatch(jobs, activeDefinition, deadline, onDeadClass);
    if (jobs.length > 0) {
      scheduleRun();
      return;
    }
    queued = false;
    markMotionFlaggersSettled();
    if (pending.size > 0) {
      maybeScan();
    }
  };
  function scheduleRun(): void {
    queued = true;
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: scanIntervalMs });
      return;
    }
    setTimeout(() => run({ didTimeout: true, timeRemaining: () => 0 }), 0);
  }
  function maybeScan(): void {
    if (queued) {
      return;
    }
    const elapsed = performance.now() - lastScan;
    if (elapsed >= scanIntervalMs) {
      scheduleRun();
      return;
    }
    if (trailingPending) {
      return;
    }
    trailingPending = true;
    setTimeout(() => {
      trailingPending = false;
      maybeScan();
    }, scanIntervalMs - elapsed);
  }
  new MutationObserver((records) => {
    stylesheetChanged ||= collectRoots(records, pending);
    maybeScan();
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  maybeScan();
}
