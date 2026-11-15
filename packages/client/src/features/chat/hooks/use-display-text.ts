// `useDisplayText` — the browser door to the display pipeline (`lib/message-render.ts`): row macros, the
// viewer's display regex scripts, markdown repair. With no display scripts it is the synchronous pipeline,
// byte-identical to a render with no regex at all. With scripts, the scripts run in the display-pass Worker
// (`lib/display-pass-runner.ts`) and this hook reads the answer through the query cache.
//
// THE CACHE IS THE QUERY KEY, as the plugin display seam's is (`use-plugin-display-text.ts`): the script set
// (interned by content, so an equal set from a fresh array is the same key), the macro-resolved text and the
// macro context. A virtual-scroll remount or a sibling re-render reads it synchronously; an edit, a swipe or a
// changed script set is a new key. The query client's gcTime bounds it: an entry leaves five minutes after its
// last row unmounts. The abort signal is consumed, so a row that unmounts or a stream token that is superseded
// while its job still waits drops that job.
//
// A SETTLED ROW IS HELD, NOT FLASHED. A panel script replaces raw markup, so showing the untransformed text
// first would paint tag source and then jump. While a settled row's pass has no cached answer and the row has
// shown no earlier answer, `pending` is true and the caller lays the body out without showing it; a row that has
// shown one keeps it on screen until the new answer lands. The hold always ends: when the pass lands, when
// the runner cuts the row off (its deadlines resolve every job), when the Worker cannot start (it resolves
// every job unscripted), or at `DISPLAY_HOLD_MAX_MS` after the row began waiting, whichever is first. The
// live ghost row is never held: it shows the previous token's answer while the next computes.

import type { RegexScriptRow } from "@orb/contracts/regex";

import { keepPreviousData, queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import type { RefCallback } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DISPLAY_ROW_BUDGET_MS } from "#src/lib/display-pass-protocol.ts";
import type { DisplayPassRequest } from "#src/lib/display-pass-runner.ts";
import { runDisplayPass } from "#src/lib/display-pass-runner.ts";
import type { StoppedDisplayScript } from "#src/lib/display-script-stops.ts";
import { displayScriptStopKey, stoppedDisplayScripts } from "#src/lib/display-script-stops.ts";
import type { StyledDisplayText } from "#src/lib/display-styled.ts";
import type { DisplayPass, DisplayRowCall, MessageRenderContext } from "#src/lib/message-render.ts";
import { finishDisplayPass, prepareDisplayPass, renderMessageForDisplay } from "#src/lib/message-render.ts";

/** The longest a settled row's body stays hidden while its pass waits in the queue: one row's budget, so a row
 *  the queue reaches late shows its text unscripted and swaps once, instead of staying blank. */
const DISPLAY_HOLD_MAX_MS = DISPLAY_ROW_BUDGET_MS;

const DISPLAY_PASS_KEY = "display-pass";
const NO_SCRIPTS: readonly RegexScriptRow[] = [];
/** Interned script sets kept before the table starts over; a session edits its scripts a handful of times. */
const MAX_INTERNED_SETS = 64;

const internedByArray = new WeakMap<readonly RegexScriptRow[], number>();
const internedByContent = new Map<string, number>();
let nextSetId = 0;

/** One number per distinct script-set content, so the key never carries the scripts themselves. */
function scriptSetId(scripts: readonly RegexScriptRow[]): number {
  const known = internedByArray.get(scripts);
  if (known !== undefined) {
    return known;
  }
  const content = JSON.stringify(scripts);
  let id = internedByContent.get(content);
  if (id === undefined) {
    if (internedByContent.size >= MAX_INTERNED_SETS) {
      internedByContent.clear();
    }
    id = nextSetId++;
    internedByContent.set(content, id);
  }
  internedByArray.set(scripts, id);
  return id;
}

/** The row a text belongs to: the display call's target, author stamps and depth, read off the row's own data. */
export interface DisplayRow extends DisplayRowCall {
  /** The streaming ghost: never held, and shows the previous answer while the next computes. */
  readonly live?: boolean | undefined;
  /** Queue order among waiting rows: a higher value runs first. The row's sequence number, so the newest leads. */
  readonly order?: number | undefined;
}

export interface DisplayText extends StyledDisplayText {
  /** The body is waiting for its first answer: lay it out, do not show it. */
  readonly pending: boolean;
  /** Attach to the body element so the queue knows the row is on screen; undefined when no script runs. */
  readonly observeBody: RefCallback<HTMLElement> | undefined;
}

/** A row's place in the display-pass queue. Its on-screen flag changes from an observer callback, outside
 *  render, so it lives in a closure rather than in React state: a scroll must not re-render the row. */
interface DisplayQueueSlot {
  readonly priority: DisplayPassRequest["priority"];
  readonly see: (visible: boolean) => void;
}

function queueSlot(live: boolean, order: number | undefined): DisplayQueueSlot {
  let visible = live;
  const rank = live ? Number.POSITIVE_INFINITY : (order ?? Number.NEGATIVE_INFINITY);
  return {
    priority: () => ({ visible, order: rank }),
    see: (next): void => {
      visible = next;
    },
  };
}

/** True once a row has waited `DISPLAY_HOLD_MAX_MS`; it stays true, so a row the queue reached late is never held again. */
function useHoldOver(waiting: boolean): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => setOver(true), DISPLAY_HOLD_MAX_MS);
    return (): void => clearTimeout(timer);
  }, [waiting]);
  return over;
}

/** Tells the slot whether the body is on screen. */
function bodyObserver(slot: DisplayQueueSlot): RefCallback<HTMLElement> {
  return (element): (() => void) | undefined => {
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      slot.see(entries.at(-1)?.isIntersecting ?? false);
    });
    observer.observe(element);
    return (): void => observer.disconnect();
  };
}

/** The pass the Worker runs for this row, or null when no script admits it, which needs no Worker. */
function workerPass(text: string, ctx: MessageRenderContext | undefined, row: DisplayRow): DisplayPass | null {
  if (ctx === undefined || (ctx.displayScripts?.length ?? 0) === 0) {
    return null;
  }
  const pass = prepareDisplayPass(text, ctx, row);
  return pass.scripts.length > 0 ? pass : null;
}

/** The text a row shows for `text` under `ctx`. Absent `ctx` means no roster is threaded yet: the text as is. */
export function useDisplayText(text: string, ctx: MessageRenderContext | undefined, row: DisplayRow): DisplayText {
  const set = ctx?.displayScripts ?? NO_SCRIPTS;
  const pass = workerPass(text, ctx, row);
  const live = row.live === true;
  const [created] = useState(() => queueSlot(live, row.order));
  // The slot is not in the key: rows whose pass is equal share one answer whichever asked first.
  const slot: DisplayQueueSlot = created;
  const query = useQuery(
    queryOptions({
      queryKey: pass === null ? [DISPLAY_PASS_KEY] : [DISPLAY_PASS_KEY, scriptSetId(set), pass.running, pass.text, pass.macroCtx],
      queryFn: pass === null ? skipToken : ({ signal }): Promise<StyledDisplayText> => runDisplayPass(pass, { signal, priority: slot.priority }),
      // Local work: it must run offline, and a script that failed once fails the same way again.
      networkMode: "always",
      retry: false,
      ...(live ? { placeholderData: keepPreviousData } : {}),
    }),
  );
  // A row also waits while the room's script set itself is loading: drawn now, its raw markup would flash.
  const waiting = !live && ((pass !== null && query.data === undefined) || ctx?.displayScriptsLoading === true);
  const holdOver = useHoldOver(waiting);
  const observeBody = pass === null || live ? undefined : bodyObserver(slot);

  // The last answer this row showed. A later miss (an edit, a script set that arrived after the row) keeps it on
  // screen until the new answer lands, so only a row that has never shown anything is held.
  const [shown, setShown] = useState<StyledDisplayText | null>(null);
  const answer = displayedAnswer({ text, ctx, row, pass, scripted: query.data });
  if (answer.landed && (answer.text !== shown?.text || answer.styled !== shown.styled)) {
    setShown({ text: answer.text, styled: answer.styled });
  }
  if (answer.landed || shown === null) {
    return { text: answer.text, styled: answer.styled, pending: !answer.landed && waiting && !holdOver, observeBody };
  }
  return { text: shown.text, styled: shown.styled, pending: false, observeBody };
}

/** The row's finished text once it has landed; before that, its text without the scripts. */
function displayedAnswer(input: {
  readonly text: string;
  readonly ctx: MessageRenderContext | undefined;
  readonly row: DisplayRow;
  readonly pass: DisplayPass | null;
  readonly scripted: StyledDisplayText | undefined;
}): StyledDisplayText & { readonly landed: boolean } {
  const { text, ctx, row, pass, scripted } = input;
  if (ctx === undefined) {
    return { landed: true, text, styled: false };
  }
  // No script admits the row, so the calling thread runs only the macro and markdown steps.
  if (pass === null) {
    return { landed: ctx.displayScriptsLoading !== true, text: renderMessageForDisplay(text, ctx, row), styled: false };
  }
  return scripted === undefined
    ? { landed: false, text: finishDisplayPass(pass.text, ctx), styled: false }
    : { landed: true, text: finishDisplayPass(scripted.text, ctx), styled: scripted.styled };
}

/** The stop on a script as it is now, if any: an edit to its pattern clears it, because every pass runs the edited
 *  script again. This browser's own stop wins over a server pass's report, because it is why the script is off on
 *  this screen. The room's On screen regex roster reads it. */
export function useDisplayScriptStop(): (script: Pick<RegexScriptRow, "id" | "findRegex">) => StoppedDisplayScript | undefined {
  const stoppedThisSession: readonly StoppedDisplayScript[] = useSyncExternalStore(stoppedDisplayScripts.subscribe, stoppedDisplayScripts.getSnapshot);
  const byKey = new Map<string, StoppedDisplayScript>();
  for (const entry of stoppedThisSession) {
    const key = displayScriptStopKey(entry);
    if (byKey.get(key)?.side !== "browser") {
      byKey.set(key, entry);
    }
  }
  return (script) => byKey.get(displayScriptStopKey(script));
}
