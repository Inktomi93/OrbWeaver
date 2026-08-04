import { z } from "zod";

// Opt Zod 4 into interpreted ("jitless") validation on the CLIENT, BEFORE any schema is built.
//
// WHY: Zod 4 JIT-compiles each object schema's parser with `new Function`, and probes whether eval is
// allowed (`util.allowsEval`) the FIRST time any object schema is CONSTRUCTED — zod/v4/core/schemas.js
// reads `fastEnabled = jit && allowsEval.value` at schema SETUP, not at parse. Our prod CSP carries no
// 'unsafe-eval', so that `Function("")` probe is blocked; Zod catches the throw and falls back to
// interpreted validation (correct behaviour), but the browser still REPORTS the blocked eval as a CSP
// violation. `globalConfig.jitless` short-circuits the probe so it never runs — no console noise,
// identical behaviour (form/tRPC input validation is not a client hot path).
//
// ⚠️ LOAD ORDER IS THE WHOLE FIX. `allowsEval` is MEMOIZED and fires at the first object-schema
// construction anywhere in the import graph — which happens during `main.tsx`'s IMPORTS, i.e. before
// `main.tsx`'s body runs. A `z.config({ jitless: true })` in the body is too late and the violation
// still logs. That was neo-tavern's first attempt (`9a9ae11a`), fixed by `0e96e58a` — this module is
// the ported form of that fix, whose message records the diagnosis and an in-browser verification.
// Hence: its own side-effect module, imported FIRST in main.tsx. Biome keeps a leading side-effect
// import as a barrier and will not sort it down.
//
// CLIENT-ONLY: the Node server never imports this and keeps its JIT-compiled fast path.
z.config({ jitless: true });
