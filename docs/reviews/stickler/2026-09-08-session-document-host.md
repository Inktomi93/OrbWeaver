---
kind: review
status: active
updated: 2026-09-08
---

# Session document-host security review

Review target: the uncommitted session document-host split over `9cde150af`, limited to `auth-bootstrap`, `stale-session`, `use-session-recovery`, the new `lib/session-document-host.ts`, its barrel export, the `main.tsx` binding, and the affected Node/CT tests. The sibling codemod and appearance/scroll-fade edits were excluded.

## Verdict

**CONFIRMED.** No security or correctness defects found.

The split removes DOM types and direct `document`/`location` access from `client/src/data` without changing the session lifecycle. Logout still completes the CSRF-protected revoke before broadcasting `signed-out`, then performs the whole-document navigation. Stale-session recovery still probes first, preserves same-identity state, hard-resets on an identity crossing, broadcasts before navigation, avoids a second navigation, and leaves unreachable-server errors in place for a later retry. The visibility sensor still subscribes once and reads live visibility at each edge.

Initialization is correctly ordered. `main.tsx` binds the browser host before `createRoot(...).render(...)`; the QueryClient and router constructed during dependency evaluation only capture callbacks and cannot issue a route/query/socket lifecycle event until render. The stable facade resolves the current binding at call time, so the `useSessionRecovery` effect does not capture a stale host. The unbound posture is fail-closed for navigation (`currentPathname() === null` prevents the recovery ladder from starting; direct navigation throws) and inert for visibility, matching the previous off-browser behavior.

The four identical CT bindings were consolidated after review into the existing client test composition root, `tests/support/browser/ct-data-providers.tsx`. Every affected story already imports that module; ESM dependency evaluation therefore installs the test document host before the story body can run. This is test-only deduplication and does not add a second production abstraction.

The host carries capabilities only, never auth state, a session verdict, a broadcast payload, or a server-truth payload. Every navigation target remains a module constant or the server-produced OIDC end-session URL already returned by the CSRF-protected logout route. No change reaches role resolution, authorization, cookie minting/validation, or the session-channel schema.

## Evidence

- Read the changed production and test files in full, plus `query-client.ts`, `session-freshness.ts`, `app-singletons.ts`, and the shared CT data-provider composition file.
- Final `pnpm ast refs` found one production binding in `main.tsx`, one shared CT binding, the two focused Node-test binding sites, and exactly three production consumers across `auth-bootstrap`, `stale-session`, and `use-session-recovery`; the scan covered 7,312 TypeScript-family files.
- Structural and literal sweeps found no remaining `globalThis.document`, `globalThis.location`, DOM `Document`, or direct `document.*` access in the changed data modules; ast-grep scanned 53 TS and 4 TSX data files.
- Focused Node verification passed 33/33: `auth-bootstrap.test.ts`, `stale-session.test.ts`, and `session-document-host.test.ts`.
- Focused CT verification passed 32/32 after the test-composition cleanup across session recovery, socket recovery, reauth, and persona logout. The persona CT observes the real browser navigation after the CSRF header reaches `/api/auth/logout`.
- `pnpm typecheck:tests-dom` passed; scoped Biome and ESLint passed on the shared provider plus the four restored story files.
- `git diff --check` passed. The supplied root graph run remains red on 12 inherited tooling-policy type errors unrelated to this split, so it is not claimed as a green receipt.

## Security assumptions

- `main.tsx` remains the production client entry and runs in a browser document before any React route, query, or socket lifecycle begins.
- Client package code is trusted; plugin UI remains sandboxed and cannot import or rebind `#lib` capabilities.
- The server continues to validate and constrain the OIDC `endSessionUrl`; this change preserves that existing trust boundary and does not widen it.

## Human security review

None required for this split.
