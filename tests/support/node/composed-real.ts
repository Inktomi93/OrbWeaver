// tests/support/node/composed-real — THE IMPORT-PHASE WARM for a COMPOSED-REAL test file. Import it for
// its side effect (`import "./composed-real.ts";`) in any file whose tests destructure the
// `app` / `services` / `*Caller` fixtures; it exports nothing on purpose.
//
// WHAT IT FIXES — an ACCOUNTING defect, not a slow test. `support/node/fixtures.ts` loads the composition root
// through a DYNAMIC import inside the `app` fixture body (deliberately: a kit/ui/client test must not pay,
// or crash on, the server env parse). Vitest charges fixture setup to the TEST's wall clock, so the FIRST
// test in a composed-real file pays the whole server module graph inside `testTimeout` (`budget(5000)`),
// while every later test in that file pays 0ms — the graph is already in that file's registry. Importing
// it here moves the same work into vitest's untimed IMPORT phase, where module loading belongs.
//
// WHY NOT the other arms. (a) A `testTimeout` bump declares the limit instead of fixing it, and the number
// it would have to declare is a transform cost, not a statement about the test. (b) A file-scoped or
// worker-scoped `app` fixture does not help: the load is ALREADY paid once per file (vitest isolates the
// module registry per file), and file-scoping the fixture would additionally share one db + one services
// instance across a file's tests. (c) There is no heavy LEAF to lazy-import: the cost is the graph itself,
// spread uniformly across `infra/providers`, `domain/chat`, `transport/trpc` and `entry/compose`.
//
// The graphs below are exactly what the `db`, `harness` and caller fixtures load lazily; keep them in
// sync with `support/node/fixtures.ts` if a fixture grows a fourth heavy dynamic import.
import "@orb/server/entry/compose";
import "@orb/server/transport/trpc";
import "./db.ts";
import "./server.ts";
