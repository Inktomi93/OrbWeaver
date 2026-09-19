// THE VENDORED DEVTOOLS FRONTEND'S OWN PROTOCOL CHATTER, recognized in ONE place (#2431). The appearance
// pass and `--cascade` load the official DevTools frontend (`snap/lib/devtools-frontend`, served off an
// ephemeral loopback origin under `/serve_rev/@<revision>/`) to read Chromium's own cascade. That frontend
// boots its full panel set and enables the `Autofill` domain, which the pinned browser does not expose, so
// its protocol client logs two method-not-found errors per attach:
//   Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}
//   Request Autofill.setAddresses failed. {"code":-32601,"message":"'Autofill.setAddresses' wasn't found"}
// MEASURED 2026-09-19 on `pnpm snap home --cascade …`: both arrive on the FRONTEND's page (c0/p1) from
// `…/serve_rev/@<rev>/core/protocol_client/protocol_client.js` and both were counted as console errors, on
// a run whose product page had none — i.e. two false console errors on EVERY `--matrix` cell.
//
// THE CALL SITE IS NOT OURS TO SILENCE: nothing in `tooling/src` or playwright-core 1.61.1 calls Autofill
// (playwright names it only in `types/protocol.d.ts`); the caller is inside the vendored closure, whose
// bytes are hash-pinned by the `devtools-frontend-assets` gate. So the answer is a named partition, like
// the sandbox-trace and file-origin classes beside it in `ops/noise.ts` — never dropped: the report prints
// the lines, the manifest keeps them, and the RESULT line counts them under `devtools-frontend-noise`.
//
// IT LIVES HERE, ON THE BARE (text, url) PAIR, because TWO readers with DIFFERENT record shapes must agree
// about it: `ops/noise.ts` judges a `CapturedConsole` for the verdict counters, and
// `lib/run-finding-console-annotation.ts` judges a `DiskSafeBrowserDiagnostic` for the FINDING row's
// disposition. A per-reader spelling is how a row comes to print `disposition=counted(console-errors)`
// beside `RESULT console-errors=0`, which is the contradiction that file's own header warns about.
//
// NARROW ON BOTH AXES, so a real failure cannot hide here: the ORIGIN must be the frontend's own
// `/serve_rev/@…` asset path (a product script can never be served from it), and the text must be a
// method-NOT-FOUND (`-32601`) protocol request error. A DevTools protocol call that fails for any other
// reason — the bridge's own CSS/DOM queries, whose failure means the cascade receipt is wrong — stays a
// real console error and still reds the run.
const DEVTOOLS_FRONTEND_PATH = "/serve_rev/@";
const DEVTOOLS_METHOD_MISSING_RE = /^Request [A-Za-z]+\.[A-Za-z]+ failed\. \{"code":-32601,/u;

export function isDevToolsFrontendProtocolNoise(text: string, url: string | null | undefined): boolean {
  if (url === null || url === undefined) {
    return false;
  }
  return url.includes(DEVTOOLS_FRONTEND_PATH) && DEVTOOLS_METHOD_MISSING_RE.test(text.trim());
}
