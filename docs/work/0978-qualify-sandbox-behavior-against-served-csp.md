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
| srcdoc sandbox has no allow-scripts or allow-same-origin; an authored script does not reach the parent | CT | Rebuild | `sandbox-frame.ct.tsx` floor case, sandbox read from `CARD_FRAME_SANDBOX.meta`, script marker absent after the card parsed |
| srcdoc carries `default-src 'none'`, no `connect-src` | unit | Move | `tests/kit/card-frame/index.test.ts` no-`connect-src` case |
| fail-closed floor has no `https:` media; `allowExternalMedia` widens exactly `img-src` and `media-src` | unit and CT | Move and Rebuild | unit case on the built policy; CT case that the rendered srcdoc `<meta>` equals the production policy for each verdict |
| routed arm emits `src` and no `srcdoc`; routed sandbox is exactly the production grant; no `src` means srcdoc | CT | Rebuild | routed-arm and floor cases |
| incomplete card shows a skeleton | CT | Rebuild | skeleton case |
| title names the frame, empty title still named | CT | Rebuild | tab-order name case |
| base body rule uses theme vars, non-color slice reaches the document (string checks on the srcdoc) | unit | Drop | asserts the CSS bytes the builder emits; the clamp grammar is kept below and the served theme token is exercised by the scrollbar case |
| the color and non-color clamps stay disjoint; hostile font family and theme tokens are dropped | unit | Move | clamp case in the kit unit test, with surviving-value controls |
| short routed card measures below the pre-measurement height; oversize report clamps to the cap | CT | Rebuild | height cases; the cap is derived from `foldCardFrameHeight` |
| card-authored script refused by the served `script-src`; forged height ignored | CT | Rebuild | hostile-script case; the refusal text must contain the served `script-src` directive |
| height message from another window ignored | CT | Rebuild | foreign-window case |
| srcdoc floor does not self-measure | CT | Rebuild | floor height case |
| the hash pins the one emitted script | unit | Move | kit unit recomputes the digest of the emitted script and compares it to the served `script-src` |
| `'unsafe-inline'` beside a hash grants nothing (hand-built policy) | CT | Drop | asserts browser CSP3 behavior on a policy production never emits; the kit unit pins the interactive `script-src` to exactly `'unsafe-inline'` |
| navigation controls: link lands under a widened `frame-src`; same-origin lands | CT | Rebuild | navigation spec controls; the widened policy is the served app policy with one directive replaced |
| off-origin link, `_top` link, form, meta refresh blocked | CT | Rebuild | navigation spec; the embedding page carries the served app policy, not a copy |
| interactive card runs code, top and popup navigation refused, script self-navigation refused, meta refresh refused | CT | Rebuild | navigation spec against a served interactive document |
| interactive script runs; height script still measures; forged height clamps; reach census (eval, storage, parent, network); focus is not taken | CT | Rebuild | `sandbox-frame.ct.tsx`; the network probe also counts requests at the far end |
| frame scrollbar is thin and themed | CT | Rebuild | scrollbar case over a served document with theme tokens |

Distinct cross-layer purpose: the unit cases pin the policy text and the script digest; the CT cases show the browser enforces the served bytes.

## Evidence

- The external sandbox-frame CT was a candidate, not evidence that maintained tests held the same copy. None did.
- `pnpm test:ct tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx tests/ui/content/sandbox-frame/sandbox-frame-navigation.ct.tsx` passes. `pnpm test tests/kit/card-frame/index.test.ts` passes.
- Defect controls, each planted in production source and reverted:
  - Static `script-src` set to `'unsafe-inline'` and `connect-src *` added: the hostile-script and reach cases fail.
  - App `frame-src` widened to `*` in the security headers: the link, meta refresh and script self-navigation cases fail.
  - One character added to the height script: the kit digest case fails.
- The card form-action defect is not observable by CT alone: the frame sandbox grants no `allow-forms`, so a form is also blocked there. The form case stays as a guard on the pair.
- Residual: the base body colors are not asserted in the browser; only the served scrollbar tint is.
