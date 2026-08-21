// Pure eval-expression plumbing: the auto-invoke wrap, the both-ends result cap, and the dev-server
// churn signatures (HMR/restart error shapes that mean "the world moved", not "your logic is wrong").

// --eval result cap: a runaway selector/object dump shouldn't blow the report budget the text path
// exists to save. Truncation is noted inline, never silent. Raised 2000 → 20000 on 2026-08-16: at 2000
// a routine `__orb.motion()` lost its TAIL, which is exactly where `cls`/`worstShift` live — a reviewer
// read a capped object as a complete one and the missing keys looked like absent instrumentation.
const EVAL_RESULT_CAP = 20_000;
// …and past the cap we keep BOTH ENDS, not the head. A JSON object's last keys are as load-bearing as
// its first; a head-only cut is the specific shape that ate `cls`.
const EVAL_TRUNCATION_TAIL_FRAC = 0.4;

// A bare function LITERAL passed to page.evaluate(string) evaluates to the FUNCTION, never invokes it
// — so `async () => {…}` silently returns undefined (the worst failure mode). Detect a function literal
// (arrow or `function`) and auto-invoke it as `(<expr>)()`. A plain value/expression is left untouched.
const FN_LITERAL_RE = /^\s*(?:async\s+)?(?:function\b|(?:async\s*)?\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u;
const INVOKED_ARROW_RE = /^\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>[\s\S]*\)\s*\(\s*\)\s*$/u;
export function wrapEvalExpr(expr: string): string {
  return !INVOKED_ARROW_RE.test(expr) && FN_LITERAL_RE.test(expr) ? `(${expr})()` : expr;
}

// A dev-server churn (HMR reload / Vite restart / tRPC 5xx mid-run) tears down the page's JS realm; its
// error text is indistinguishable from an app bug unless we name it. These are the Playwright/Chromium
// signatures for "the world moved under us," NOT "your selector/logic is wrong."
const CHURN_SIGNATURES = [
  "Execution context was destroyed",
  "context was destroyed",
  "Target closed",
  "Target page, context or browser has been closed",
  "frame was detached",
];
export function isContextChurn(message: string): boolean {
  return CHURN_SIGNATURES.some((sig) => message.includes(sig));
}
export const CHURN_LINE = "[snap] server churned mid-run (HMR/restart?) — step failed for environmental reasons";

/** Cap an --eval result while keeping BOTH ENDS. A head-only cut is what silently ate the `cls`/
 *  `worstShift` tail of `__orb.motion()`; the middle is the part a reader can most afford to lose, and
 *  the elision says exactly how much went. Exported for the CLI suite (the cut is a contract, not a
 *  formatting detail). */
export function capEvalText(text: string): string {
  if (text.length <= EVAL_RESULT_CAP) {
    return text;
  }
  const tail = Math.floor(EVAL_RESULT_CAP * EVAL_TRUNCATION_TAIL_FRAC);
  const head = EVAL_RESULT_CAP - tail;
  const dropped = text.length - EVAL_RESULT_CAP;
  return `[TRUNCATED ${EVAL_RESULT_CAP}/${text.length} chars — head ${head} + tail ${tail}, ${dropped} elided from the MIDDLE]\n${text.slice(0, head)}\n… [${dropped} chars elided] …\n${text.slice(-tail)}`;
}
