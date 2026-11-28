# Catalog read: the sandboxing and WASM deps (2026-11-28)

I read the whole of `pnpm-workspace.yaml` (520 lines). For the deps that run or parse untrusted input, I also read the code that uses them. Items marked **confirmed** were checked against the source or reproduced. The rest are leads.

## 1. CEL is not linear-time (confirmed, likely high)

The header of `packages/kit/src/cel/index.ts` says CEL is "linear-time + mutation-free by construction, so the PARSE-TIME source cap (≤ 2 KiB) IS the whole budget — no runtime watchdog". That claim is false on two counts.

- **`string.matches` backtracks.** It is `new RegExp(b).test(a)` (`@marcbachmann/cel-js@8.0.0/lib/functions.js:358`), a plain backtracking regex.
  - `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaa!".matches("^(a+)+$")` blocked the thread for **10.5 s** on 29 characters.
  - Each extra `a` roughly doubles the time.
- **Nested comprehensions are polynomial.** `l.map(a, l.map(b, l.map(c, a+b+c))).size()` is 46 bytes and took **1.0 s** over a 200-element list.
  - Each nesting level multiplies the time by the list size.
  - 2 KiB holds many levels.
- **The wrapper passes no `limits`.** cel-js's defaults (`maxAstNodes`, `maxDepth`, `maxListElements`) are parse-time caps only. Nothing bounds evaluation steps.
- **The file contradicts itself.** It says `kit/regex` needs a `node:vm` timeout because backtracking is superlinear, yet it exposes an unguarded regex through CEL.

Who can reach it:
- `{{expr::…}}` is a registered macro (`packages/kit/src/macro/registry.ts:819`). The chat engine does not apply `neutralizeMacros` to card text.
- **Not traced end to end:** whether an imported card's text reaches the `expr` handler during prompt assembly on the server. If it does, a downloaded card hangs the server event loop on every turn: a remote DoS.
- Automation rule predicates are owner-authored, so there the risk is only self-DoS.

Fix direction:
- Route `matches` through the `kit/regex` guarded path.
- Bound evaluation: either run CEL off the main thread with a deadline, or walk the AST at parse time and cap comprehension nesting and `matches` use.
- Delete the false header claim in the same change.

Repro script: `node <scratch>/cel.mjs`. It parses both expressions with `@marcbachmann/cel-js` and times them.

## 2. The QuickJS sandbox engine is on a caret (confirmed)

```yaml
quickjs-emscripten-core: ^0.32.0
"@jitl/quickjs-ng-wasmfile-release-sync": ^0.32.0
```

- **The README claims a pin the catalog doesn't hold.** The "Runtime pin" section of `packages/server/src/infra/plugin-host/README.md` names `@0.32.0`. It also depends on measurements taken against that exact build:
  - the 16 to 48 MiB `wasmMemory` ceiling;
  - the 2 GiB growth that `dispose()` did not reclaim;
  - the 256 KiB stack ceiling, without which deep recursion escaped as a host `RangeError`.
- **Every comparable dependency is pinned exact** with a "bump owes" comment: the agent SDK, the `ai` stack, isomorphic-git, cloudflared, acme-client.
- **What can move it today.** The lockfile holds 0.32.0, but a `pnpm update` moves it within 0.32.x. `minimumReleaseAge` only delays that by 24 hours.

Fix: pin both packages exact. Add a comment naming the suites a bump must re-run:
- `tests/server/infra/plugin-host/worker-escape-containment.int.test.ts`
- `tests/server/infra/plugin-host/cpu-guard.test.ts`
- the memory-bomb proof

## 3. PDF extraction runs on the app's main thread (confirmed design, impact not measured)

- **No isolation.** `packages/server/src/infra/extraction/loaders/pdf.ts` runs `pdfjs-dist` (legacy build) on the app's main thread with a fake worker.
- **No bounds or hardening.** There is no deadline and no memory bound, and `isEvalSupported: false` is not set.
- **Exposure.** Uploaded PDFs are attacker bytes. Text-only extraction stays out of pdf.js's font-eval path, but parsing is still a CPU and memory DoS beside every session.
- **Contrast.** Plugins get the whole app → watchdog → broker → Worker tower.
- **Unchecked:** the docx and epub loaders unzip with `fflate`, and I did not check whether they cap inflation.

Fix direction: run extraction in a `Worker` with `resourceLimits` and a deadline.

## 4. Smaller items

- **A nightly in the graph.** `onnxruntime-web@1.31.0-dev.20260914-8d85527a0` is a dev nightly that resolves transitively through `@huggingface/transformers`. Consider an override to a release.
- **Four root deps nothing imports.** `@electric-sql/pglite`, `gel`, `mysql2` and `@cloudflare/workers-types` are declared in the root `package.json` but imported by no package, tool or test. They are probably drizzle peer-type satisfiers. pglite brings a WASM Postgres with it, and no comment says why any of the four are there.
- **Comment rot.** The "Supply-chain delay" comment sits above `peerDependencyRules`, about 20 lines away from the `minimumReleaseAge: 1440` it describes. It also carries history ("The Exclude was orphaned without this — the guard was OFF"), which the comment rules ban.
- **Shiki's JS regex engine (low risk).** `@shikijs/engine-javascript` runs TextMate grammars as JS RegExp over untrusted code fences. The grammars are fixed, so the worst case is a frozen tab, not the server.

## What is solid

- **QuickJS-ng over Bellard QuickJS,** with the sync wasmfile variant chosen deliberately, and the host-memory boundary reasoning in the plugin-host README.
- **isomorphic-git is patched** to bound attacker clone packs: object count, inflation, delta depth, and delta output.
- **The undici global-dispatcher handoff** is named as an SSRF risk, and a test pins it.
- **`allowBuilds` gates install scripts.** It denies cloudflared's unchecksummed installer and onnxruntime's CUDA fetch.
- **The katex override** drops the 0.16 prototype-pollution line.
- **Each ignored advisory carries a reason** it is unreachable.
- **Shiki avoids the WASM oniguruma engine.**

## The sandboxing surfaces, for orientation

- **Server plugins:** QuickJS-ng in Node Workers inside a broker process (`packages/server/src/infra/plugin-host/`, about 11k lines).
  - The broker is RSS-watchdogged.
  - The app re-authorizes every bridge call.
  - All egress runs in the app, through `net-egress.ts` and `safeFetch`.
  - A warm runtime pool is bounded by D347, D348 and D349.
- **Client plugin UI:** QuickJS in a Web Worker (`packages/client/src/features/plugin/lib/ui-guest/`). Open item 3030 says that worker still has network access.
- **Rendered content:** sandboxed iframes (`packages/ui/src/content/sandbox-frame/`) plus render-trust tiers (`packages/client/src/lib/render-trust.ts`, `packages/ui/src/markdown/markdown.tsx`, D294).
- **Expressions:** CEL (`packages/kit/src/cel/`) and regex with a `node:vm` timeout (`packages/kit/src/regex/`).
- **Untrusted file parsing:** pdfjs, fflate (docx, epub, plugin bundles), html-to-text, and sharp for images.
- **Agent SDK:** the env-firewall credential seam (`packages/inference/src/backends/agent-sdk/`).
