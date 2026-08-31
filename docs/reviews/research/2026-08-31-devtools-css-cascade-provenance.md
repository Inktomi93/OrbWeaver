---
kind: review
status: active
updated: 2026-08-31
---

# DevTools CSS cascade provenance — pinned-feasibility proof for #950

> **Verdict: feasible, with a revision-matched offline DevTools frontend closure.** Chromium's own `CSSMatchedStyles` implementation can classify declarations as `Active` or `Overloaded` from a headless, machine-only SDK bridge. Raw CDP cannot provide that verdict, and Orbweaver must not grow a partial cascade evaluator. This research freezes the smallest proven architecture; it does not implement product or tooling code.

## 0. Scope and evidence status

The proof ran against a disposable synthetic page only. It did not mutate an Orbweaver product page, owner CSS, repository stylesheet, or Project state. The proof scripts and resource manifest were created under `/tmp` and are **scratch evidence, not durable artifacts**. They will disappear and MUST NOT be cited by the implementation as shipped proof. The implementation must re-materialize the planted fixture, bridge, closure manifest, checksums, and licenses as committed repository assets/tests.

The commands below are the exact reproduction shape used for the proof. The script names identify the scratch programs whose material behavior is specified in this document; a future run must first recreate their committed equivalents.

```sh
pnpm exec tsx /tmp/probe-950-serve-rev.ts
pnpm exec tsx /tmp/probe-950-local-proxy.ts
pnpm exec tsx /tmp/probe-950-set-effective.ts
sha256sum /tmp/probe-950-closure.json
wc -c /tmp/probe-950-closure.json
```

Repository-side executions remain workspace `pnpm` entry points. The one-time external proof used the revision server only to establish feasibility; remote `serve_rev` is forbidden as a product runtime.

## 1. Exact runtime pins

| component | exact proof pin | durable source receipt |
| - | - | - |
| Playwright | `playwright-core@1.61.1` | `pnpm-lock.yaml` and installed `playwright-core/package.json` |
| browser | `HeadlessChrome/149.0.7827.55` | installed `playwright-core/browsers.json` |
| Chromium revision | `3188f8a607ae7e067593be8aab7f02d2451fec07` | Playwright's revision-matched browser build |
| DevTools frontend revision | `33c2f401a9c8ddad2159eb0ab83aa244a5247361` | Chromium M149's exact frontend revision, fetched from `serve_rev` for the proof |
| CDP | protocol `1.3` | installed `playwright-core/types/protocol.d.ts` |

These four version axes are one compatibility tuple. An update to Playwright or its Chromium pin MUST fail until the frontend revision, closure manifest, checksum, license inventory, and planted cascade matrix are regenerated and reverified together. “Latest DevTools” is not compatible provenance.

The successful loopback launch used:

```text
--remote-debugging-port=0
--remote-allow-origins=http://127.0.0.1:<frontend-port>
```

No private-network-access disable was required by the loopback arm. The initial remote-origin proof also tried broad origin/PNA disables; those are not part of the durable design.

## 2. Browser-owned winner bridge

The proof loaded `inspector.html?ws=127.0.0.1:<debug-port>/devtools/page/<target-id>` from the exact revision closure, then evaluated a direct SDK bridge in that frontend page. There was no DOM or Styles-pane scraping.

The bridge sequence is:

```ts
const SDK = await import("./core/sdk/sdk.js");
const Root = await import("./core/root/root.js");
Object.assign(Root.Runtime.hostConfig, {
  devToolsAnimationStylesInStylesTab: { enabled: true },
});

const target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
const domModel = target?.model(SDK.DOMModel.DOMModel);
const cssModel = target?.model(SDK.CSSModel.CSSModel);
const documentNode = await domModel?.requestDocument();
const nodeId = await domModel?.querySelector(documentNode.id, selector);
const matched = await cssModel?.getMatchedStyles(nodeId);
const computed = await cssModel?.getComputedStyle(nodeId);

for (const style of matched.nodeStyles()) {
  for (const property of style.allProperties()) {
    const state = matched.propertyState(property); // Active or Overloaded
  }
}
```

The `devToolsAnimationStylesInStylesTab` host-config arm is required. Without it, the SDK omits the dynamic animation/transition styles that participate in the real winner. The durable bridge must pin this arm explicitly and plant both dynamic cases so a renamed or stale host-config field fails loud.

For every selected property, the bridge must return the browser computed value plus every relevant SDK declaration in browser cascade order, including `propertyState`, `important`, inherited status, style type, selector when present, stylesheet id, and source range. The Node side then resolves stylesheet ids through `CSS.styleSheetAdded` headers and the committed repository-source map. It must not recompute the winner.

### Planted expected/actual receipt

| case | planted candidates | expected | actual from revision-pinned `CSSMatchedStyles` |
| - | - | - | - |
| layer precedence | layered `color:red`; unlayered `color:blue` | unlayered blue wins | unlayered blue `Active`; layered red `Overloaded`; computed blue |
| specificity | `.specific {color:red}`; `#specific {color:blue}` | id wins | id blue `Active`; class red `Overloaded`; computed blue |
| inline | author rule red; `style="color:lime"` | inline wins | inline lime `Active`; author red `Overloaded`; computed lime |
| inherited | parent `color:purple`; child has none | inherited declaration wins | purple `Active`, `isInherited=true`; computed purple |
| custom-property fallback | `--tone:orange`; `color:var(--missing,var(--tone))` | fallback resolves orange | `--tone` and color declaration `Active`; computed orange |
| custom-property cycle | `--a:var(--b)`; `--b:var(--a)`; `color:var(--a,green)` | cycle invalidates vars, fallback wins | both custom declarations reported `Active`; computed custom vars absent; color declaration `Active`; computed green |
| undefined custom property | `color:var(--void,teal)` | fallback wins; no invented declaration | color declaration `Active`; computed teal; no fake `--void` row |
| animation | authored black plus running keyframes | animation value wins | dynamic animation style `Active`; authored black `Overloaded` |
| transition | authored red/blue plus running transition | transition value wins | dynamic transition style `Active`; authored blue/red `Overloaded` |

The custom-cycle result is important: declaration activity and computed custom-property validity are different facts. The bridge must preserve both rather than relabeling an `Active` custom declaration as the computed winner of a dependent property.

## 3. Closure and cost

The normalized proof manifest contained **184 HTTP resources**, **9,279,321 decoded bytes**, and **2,413,138 compressed transfer bytes**. The JSON manifest itself was **47,079 bytes** with SHA-256 `0b2c9c64110fefb480ea1c1546a1006a1dc5c77a241eab642a5acdb5d6e1fa25`. That hash describes the scratch manifest, not a committed artifact; the implementation must reproduce and commit its own canonical manifest and checksum.

| closure root | resource count |
| - | -: |
| `ui/` | 46 |
| `models/` | 45 |
| `panels/` | 36 |
| `Images/` | 24 |
| `third_party/` | 13 |
| `core/` | 9 |
| `entrypoints/` | 5 |
| `services/` | 2 |
| `inspector.html` | 1 |
| `foundation/` | 1 |
| `application_tokens.css` | 1 |
| `design_system_tokens.css` | 1 |

This is the full response closure observed while loading the SDK and extracting the nine-case receipt, not an assumed hand-picked import list. The durable fetch/build tool must start from the exact revision, record URL/path, decoded byte length, SHA-256, MIME type, and license owner for every asset, then serve only manifest members. Redirects, missing members, extra network requests, hash drift, duplicate normalized paths, or a zero-resource manifest are hard failures.

### License and provenance inventory

The DevTools frontend root is BSD-3-Clause. The observed closure also reaches third-party material whose upstream `LICENSE` and/or `README.chromium` notices must travel with the vendored closure: Acorn; Chromium client-variations; CodeMirror.next; diff; i18n; intl-messageformat; legacy-javascript; Lighthouse; Lit; marked; source-map-scopes-codec; and third-party-web. The implementation must generate a committed per-family notice inventory from the exact revision rather than copying this prose as a substitute.

The repository currently has no sanctioned home for this revisioned runtime asset tree. Before assets land, architecture law must name one exact asset root, its source-of-truth/update owner, generated-vs-authored status, manifest/checksum contract, and license home. That Core Path Registry / asset-root law change is a prerequisite, not permission to hide the closure under an arbitrary tooling directory.

## 4. Hermetic offline architecture

1. A pin file owns the Playwright version, Chromium revision, DevTools frontend revision, closure checksum, and expected browser major as one tuple.
2. A maintainer-only materializer fetches or builds the exact official revision, follows the proof's full response closure, copies only normalized manifest members into the sanctioned asset root, and emits hashes plus license inventory. Normal Snap/CT runs never fetch the network.
3. Snap launches the existing Playwright Chromium with a temporary profile, `--remote-debugging-port=0`, and an exact loopback `--remote-allow-origins` value. The chosen ports come from OS-assigned loopback listeners; no fixed or externally bound port is allowed.
4. A loopback-only static server serves immutable manifest members with strict path normalization, no proxying, no directory listing, no user-controlled filesystem path, and no remote fallback. It shuts down in the same `finally` ownership tree as the browser/context.
5. The inspected product page and the frontend page share the browser process but are distinct targets. Target identity is selected from `/json/list` by the captured target id and checked again in the SDK; “first about:blank” is not a durable selector.
6. The bridge evaluates the fixed SDK module procedure above and returns structured data. No DevTools UI element, localized label, shadow DOM, console text, or screenshot is part of the contract.
7. Node maps the browser's stylesheet ids/ranges to the sanctioned five repository CSS homes, generated theme source, inline style, inherited source, dynamic animation/transition source, and the named owner-custom-CSS end-of-head source. Unknown author sheets remain explicit `opaque` rows; they are never discarded.
8. Snap/CT consume the same machine-readable `__orb.css` transport frozen by #949. This work adds the cascade producer/consumer behind that schema; it does not invent a parallel transport.

### Security boundaries

The asset server binds only `127.0.0.1`, accepts only `GET`/`HEAD`, serves a closed manifest, and has no upstream proxy. The debugging endpoint is ephemeral and lives only for the probe. The allow-origin flag names the single generated frontend origin; `*` is forbidden. Bridge inputs are validated property names plus selectors already admitted by Snap's selector grammar. Returned CSS text and owner custom CSS are inert evidence data, never evaluated, injected, or written back. Owner custom CSS must be reported as the named trusted end-of-head source while preserving its existing validation/injection boundary; #950 does not widen that boundary.

### Failure and zero-population semantics

Any missing pin, asset, hash, license row, host-config arm, target, DOM/CSS model, document, selector node, matched-style response, computed-style response, stylesheet header/text, or repository-source mapping is `INSTRUMENT ERROR`. A requested property with zero declarations is not “clean”; the receipt must distinguish a legitimate computed-default/no-declaration arm from unavailable evidence and must include a planted positive declaration in the same test run. An empty asset closure, empty selected-element population, empty stylesheet population, or empty repository declaration population is also `INSTRUMENT ERROR`.

Receipts deduplicate only by a stable semantic key (target identity, normalized source, selector/range, property, value, state, inheritance/style type), never by display text. Repeated identical observations may collapse with a count; winners and losers with the same spelling at different ranges must remain separate.

## 5. Implementation handoff

Exact final filenames depend on #949's frozen transport and the asset-root law. The smallest expected change set is:

- the sanctioned revisioned DevTools asset root, generated closure manifest, checksum/pin file, and third-party notice inventory;
- one maintainer-only materializer under `tooling/src/` with a workspace `pnpm` entry point;
- one shared DevTools loopback lifecycle module beside `tooling/src/_shared/browser.ts`;
- one Snap cascade operation/producer under `tooling/src/snap/ops/`, wired through the existing argument/plan/report path and #949's `__orb.css` contract;
- contract types in `tooling/src/snap/contract/` only where #949 has not already supplied them;
- focused tooling tests beside `tests/tooling/snap/`, plus the instrument-registry proof required by `tooling/src/_shared/instruments.ts`;
- a generated-source map that names the five sanctioned product stylesheets, generated theme, inline/inherited/dynamic sources, and owner custom CSS without changing the custom-CSS trust boundary.

Required controls:

- one nine-case fixture matching §2, with `Active`/`Overloaded` and computed-value assertions;
- cross-sheet repository conflict whose expected winner changes when source order is swapped;
- explicit shell -> UI globals -> client globals source-order pin and the zero-authored-`@layer` contract;
- owner-custom-CSS end-of-head winner and loser arms;
- stale Playwright/Chromium/frontend tuple, manifest hash drift, missing license, missing host-config, missing/empty matched styles, unknown sheet, zero nodes, and zero repository declarations all RED;
- a false-positive control where a computed default legitimately has no authored declaration;
- direct SDK bridge assertion that remains independent of DevTools UI text/DOM;
- cleanup control proving listeners, profile, server, debugging endpoint, and browser close on success and failure.

The implementation must exercise the real Snap/CT surface after focused unit/integration controls. A typecheck alone cannot graduate this instrument.

## 6. Rejected alternatives

### Browser-bundled `devtools://devtools/bundled`

Direct navigation resolved to `about:blank`, and `--auto-open-devtools-for-tabs` produced no automatable frontend target in the headless proof. Depending on undocumented browser UI target creation is not a machine contract. Rejected.

### The npm `chrome-devtools-frontend` package

The inspected package was roughly 80 MB of raw frontend source, had no supported public Node export for `CSSMatchedStyles`, and was not revision-aligned with Playwright's M149 browser. Constructing the SDK class directly also drags Target/DOM/CSS model infrastructure and browser-host state. The official package proves source availability, not Node-library viability. Rejected in favor of the exact built browser frontend closure.

### Raw CDP winner inference

`CSS.getMatchedStylesForNode` returns structured matched rules, inline/attributes/inherited/pseudo/dynamic style arms, layers/scopes, ranges, and specificity inputs, but protocol `CSSProperty` has no active/overloaded bit. `CSS.getComputedStyleForNode` supplies the value, not which declaration produced it. Any Node algorithm combining those fields would be a second, partial cascade implementation and cannot honestly cover modern tree scopes, registered functions, pseudo fallback, animations, and transitions. Rejected.

### `CSS.startRuleUsageTracking`

Rule usage is selector/range coverage. The proof observed losing rules as used; it does not identify the winning declaration or property. Rejected.

### `CSS.setEffectivePropertyValueForNode`

The mutation probe is neither observational nor reliably reversible:

- the inline case rewrote `style="color: lime"` to an RGB sentinel and did not restore byte-identically;
- the inherited case inserted a child inline declaration instead of identifying the parent source;
- an undefined custom property inserted a new inline custom property;
- animation/transition cases mutated authored sheets while the dynamic computed value continued to win;
- `CSS.styleSheetChanged` reported only a stylesheet id, not the winning source range.

Same-value or sentinel mutation therefore cannot produce a trustworthy winner receipt, and restoration failure is unacceptable on product/owner CSS. Rejected.

### Remote `serve_rev`, UI scraping, and source-text cascade approximation

Remote assets are non-hermetic, network-dependent, and entangle private-network policy. UI scraping depends on localized/unstable presentation. Source-text approximation is explicitly below the browser's cascade semantics. All three are rejected. The remote exact-revision server was acceptable only for this one feasibility proof and asset-closure measurement.

## 7. Hard conclusion

\#950 can preserve exact declaration-winner attribution without vendoring the full DevTools source graph and without implementing the cascade. The price is a roughly 9.3 MB decoded, 184-resource, revision-pinned official frontend closure plus strict update/license/runtime machinery. That is the minimum honest modern option found. If the asset-root law or the frozen #949 transport rejects that cost, the correct result is to block #950; it is not permission to fall back to raw-CDP guesses or mutation.
