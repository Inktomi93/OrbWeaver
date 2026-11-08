---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# Keep URL credentials out of snap run files

## What

snap --base userinfo reaches run.json argv and SessionRow\.binding.url, on a value redactNetworkUrl already knows how to clean.

## Why

It is the same class as the argv secret fix, on a value the tool can already clean.

## Done when

A planted user:pass base URL reaches no run file or session log.

## Evidence

Ruling (coordinator): `--base`, `--fixture-base` and `--fixture-server` refuse a URL with `user:password@` userinfo at parse, and `--base-credentials-env <ENV_NAME>` supplies the basic-auth answer from the environment. Reason: snap can mask its own files and lines, but not the process table or pnpm's echo of the command, and scrubbing by value missed doors a review found. A refusal closes the class at the door. Token-named query and fragment values stay accepted and are masked, because a refusal would break ordinary URLs.

Ruling (coordinator): `--base-credentials-env` covers the `--base` origin only, and the browser answers no other origin's challenge with it. A fixture origin takes no credentials; a fixture that needs auth gets its own item. `key` and `code` are private as exact URL query and fragment names only, because the shared evidence predicate also judges JSON keys, where they are ordinary fields.

- `tests/tooling/snap/ops/typed-secret-disk.int.test.ts`: each URL flag refuses userinfo without quoting it; env credentials open a basic-auth peer and no file, line or session row holds the password, the token or the base64 pair; a token-bearing `--base` on a dead port keeps the token out of the nav error and the manifest. All were red on the previous fix.
- `tests/tooling/snap/ops/typed-secret-disk.int.test.ts`: a second origin the gated page loads asks for basic auth and receives nothing, while the base origin authenticates; a session call with no route names its artifacts without the token, file names included. Both were red before the origin scope and the masked slug (`livePageSlug`, `tooling/src/snap/lib/session-plan.ts`).
- `tests/tooling/snap/lib/disk-safe-argv.test.ts`: fragment tokens, leading-whitespace URLs, `--fixture-server` argv and exact `key` and `code` pairs are masked, and `sortKey` and `langCode` are not.
- The nav error is scrubbed where it is stored (`tooling/src/snap/ops/capture.ts`), and snap's cli scrubs a thrown error before the crash path prints it.
- Open: Playwright shortens element text in traces before the scrub runs, so a truncated value can survive there.
