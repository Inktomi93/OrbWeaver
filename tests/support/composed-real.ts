// tests/support/composed-real — THE IMPORT-PHASE WARM for a COMPOSED-REAL test file (#2386). Import it for
// its side effect (`import "../../support/composed-real.ts";`) in any file whose tests destructure the
// `app` / `services` / `*Caller` fixtures; it exports nothing on purpose.
//
// WHAT IT FIXES — an ACCOUNTING defect, not a slow test. `support/fixtures.ts` loads the composition root
// through a DYNAMIC import inside the `app` fixture body (deliberately: a kit/ui/client test must not pay,
// or crash on, the server env parse). Vitest charges fixture setup to the TEST's wall clock, so the FIRST
// test in a composed-real file paid the whole server module graph inside `testTimeout` (`budget(5000)`),
// while every later test in that file paid 0ms — the graph is already in that file's registry. Measured on
// this box, 2026-09-18, `pnpm test:scoped tests/server/entry/compose/roster-preset.int.test.ts`:
//
//   before — `import(@orb/server/entry/compose)` 5.9-7.7s inside the first test ⇒ RED at 5006ms; the two
//            later tests in the same file green in 73-3480ms.
//   after  — same file, same box: the first test runs in 481ms and the file is green; total wall time is
//            unchanged (14.7s), because the SAME work now happens in vitest's untimed IMPORT phase
//            (`import 14.09s`, `tests 577ms`) where module loading belongs.
//
// WHY NOT the other arms. (a) A `testTimeout` bump declares the limit instead of fixing it, and the number
// it would have to declare is a transform cost, not a statement about the test. (b) A file-scoped or
// worker-scoped `app` fixture does not help: the load is ALREADY paid once per file (vitest isolates the
// module registry per file — 35 files in `tests/server/entry/compose` produced 35 fixtures-module
// evaluations and only 7 non-zero compose imports, one per composing file), and file-scoping the fixture
// would additionally share one db + one services instance across a file's tests. (c) There is no heavy
// LEAF to lazy-import: the cost is the graph itself, measured uniformly —
// `@orb/server/infra/providers` 1043ms, `@orb/server/domain/chat` 1051ms, `@orb/server/transport/trpc`
// 1055ms, `@orb/server/entry/compose` 2677ms, with the top per-module vite transform at 483ms
// (`packages/db/src/schema/chat.ts`) over ~1500 transformed modules.
//
// The three graphs below are exactly what the `db`, `app` and caller fixtures load lazily; keep them in
// sync with `support/fixtures.ts` if a fixture grows a fourth heavy dynamic import.
import "@orb/server/entry/compose";
import "@orb/server/transport/trpc";
import "./db.ts";
