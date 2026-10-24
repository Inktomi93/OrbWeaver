---
kind: work
status: open
updated: 2026-10-24
priority: P3
plan: test-foundation
---

# Qualify sandbox behavior against served CSP

## What

Verify sandbox-frame behavior against the security policy production serves. Re-derive whether maintained consumers need a shared CSP directive table before moving production code.

## Why

A copied CSP table can drift; moving production policy solely to preserve a reference test creates unnecessary coupling.

## Done when

A maintained case verifies sandbox behavior against actual served policy without a copied table. Share pure policy data only if current production and test consumers need it.

## Case map

Reference: `ui/content/sandbox-frame/sandbox-frame.ct.tsx` in the external legacy source. Layer rule: whether the browser enforces a policy is CT; the policy text is unit.

Maintained coverage before this item: none for the frame or the card-frame policy. [sandbox.test.ts](../../tests/server/infra/plugin-host/sandbox.test.ts) covers the WebAssembly plugin-host guest sandbox, a different surface, so it is not a counterpart. [body-limit-ordering](../../tests/server/entry/http/body-limit-ordering.int.test.ts) covers only the mint size cap.

Where the policy comes from: the CT mints and serves through the production card-frame routes (`packages/server/src/entry/http/card-frame.ts`) over the composed corpus root, and reads the app policy from the production security headers. The unit test calls `buildCardFrameCsp` and `buildCardFrameDocument` from `@orb/kit/card-frame`. Production already exports both, so no shared table and no new export is needed.

| Reference case | Layer | Decision | Home |
| - | - | - | - |
| srcdoc sandbox has no allow-scripts or allow-same-origin; an authored script does not reach the parent | CT | Rebuild | `sandbox-frame.ct.tsx` floor case, sandbox attribute pinned to the literal empty grant, script marker absent after the card parsed |
| srcdoc carries `default-src 'none'`, no `connect-src` | unit | Move | `tests/kit/card-frame/index.test.ts` policy-text case, which also pins `form-action 'none'` and `base-uri 'none'` on every delivery and posture |
| fail-closed floor has no `https:` media; `allowExternalMedia` widens exactly `img-src` and `media-src` | unit and CT | Move and Rebuild | unit case on the built policy; CT case that the rendered srcdoc `<meta>` equals the production policy for each verdict |
| routed arm emits `src` and no `srcdoc`; routed sandbox is exactly `allow-scripts`; no `src` means srcdoc | unit and CT | Move and Rebuild | the kit unit pins `CARD_FRAME_SANDBOX` and the built `sandbox` directive to the literal grant; the CT routed-arm case pins the rendered attribute and the served directive to the same literal; floor case |
| incomplete card shows a skeleton | CT | Rebuild | skeleton case |
| title names the frame, empty title still named | CT | Rebuild | tab-order name case |
| base body rule uses theme vars, non-color slice reaches the document (string checks on the srcdoc) | unit | Drop | asserts the CSS bytes the builder emits; the clamp grammar is kept below and the served theme token is exercised by the scrollbar case |
| the color and non-color clamps stay disjoint; hostile font family and theme tokens are dropped | unit | Move | clamp case in the kit unit test, and a `buildCardFrameDocument` case that feeds the same hostile tokens and asserts the emitted document is clamped, each with surviving-value controls. The component's own clamps get no rendered case: the srcdoc arm reaches `buildCardFrameDocument`, which clamps again, so removing them changes no rendered byte |
| short routed card measures below the pre-measurement height; oversize report clamps to the cap | CT | Rebuild | height cases; the cap is derived from `foldCardFrameHeight` |
| card-authored script refused by the served `script-src`; forged height ignored | CT | Rebuild | hostile-script case; the refusal text must contain the served `script-src` directive |
| height message from another window ignored | CT | Rebuild | foreign-window case |
| srcdoc floor does not self-measure | CT | Rebuild | floor height case |
| the hash pins the one emitted script | unit | Move | kit unit recomputes the digest of the emitted script and compares it to the served `script-src` |
| `'unsafe-inline'` beside a hash grants nothing (hand-built policy) | CT | Drop | asserts browser CSP3 behavior on a policy production never emits; the kit unit pins the interactive `script-src` to exactly `'unsafe-inline'` |
| navigation controls: link lands under a widened `frame-src`; same-origin lands | CT | Rebuild | navigation spec controls; the widened policy is the parsed served app policy with `frame-src` replaced, or appended when it is inherited from `default-src` |
| off-origin link, `_top` link, form, meta refresh blocked | CT | Rebuild | navigation spec; the embedding page carries the served app policy, not a copy |
| interactive card runs code, top and popup navigation refused, script self-navigation refused, meta refresh refused | CT | Rebuild | navigation spec against a served interactive document; the popup leg records `page.on("popup")`, and the off-origin route is context-level so a popup's request is counted |
| interactive script runs; height script still measures; forged height clamps; reach census (eval, storage, parent, network); focus is not taken | CT | Rebuild | `sandbox-frame.ct.tsx`; the network probe also counts requests at the far end |
| reach census: a `blob:` worker is refused | CT | Rebuild | reach census case; the worker posts back if it runs, and the refusal must report a `worker-src` violation |
| frame scrollbar is thin and themed | CT | Rebuild | scrollbar case over a served document with theme tokens |

Distinct cross-layer purpose: the unit cases pin the policy text and the script digest; the CT cases show the browser enforces the served bytes.

## Evidence

- The external sandbox-frame CT was a candidate, not evidence that maintained tests held the same copy. None did.
- `pnpm test:ct tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx tests/ui/content/sandbox-frame/sandbox-frame-navigation.ct.tsx` passes. `pnpm test tests/kit/card-frame/index.test.ts` passes.
- Defect controls, each planted in production source and reverted:
  - Static `script-src` set to `'unsafe-inline'` and `connect-src *` added: the hostile-script and reach cases fail.
  - App `frame-src` widened to `*` in the security headers: the link, meta refresh and script self-navigation cases fail.
  - One character added to the height script: the kit digest case fails.
  - `CARD_FRAME_SANDBOX.document` set to `allow-scripts allow-forms allow-popups allow-modals`: the kit sandbox case fails, the CT routed-arm case fails on the rendered attribute, and the popup leg records `https://navigation-external.test/landing?via=open`.
  - The clamps removed from `buildCardFrameDocument`: the kit document case fails on the injected script. With only the font clamp removed, it fails on `url(//evil`.
  - `worker-src blob:` added to the card policy: the reach census reads `blobWorker: "allowed"`, so the probe can see a worker that runs.
  - `frameSrc` removed from the app security headers, with the served policy checked to name no `frame-src`: all navigation cases pass, so the widening works when `frame-src` is inherited.
- The CT form case guards the pair of form controls: the sandbox grants no `allow-forms`, and the card policy names `form-action 'none'`. The kit unit pins each one. Under the widened-sandbox control, which grants `allow-forms`, the form case still passes, so `form-action 'none'` blocks the submit without the sandbox.
- Residual: the base body colors are not asserted in the browser; only the served scrollbar tint is.
