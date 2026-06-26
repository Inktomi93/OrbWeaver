// @total-typescript/ts-reset — tightens TS built-ins that are honest-to-lies:
//   • Array.includes(x)        — narrows correctly when x is a wider type
//   • [].filter(Boolean)       — strips null/undefined from the result type
//   • JSON.parse(x)            — returns `unknown`, not `any` (forces explicit narrowing)
//   • Response.json()/.text()  — return `unknown`, not `any`
//   • Map/Set/.indexOf etc.    — assorted honest signatures
//
// One root file pulled into EVERY package's compilation via tsconfig.base.json's
// `include` (`${configDir}/../../reset.d.ts` — every package lives at packages/<name>,
// so the `../../` always lands here). Declaration-only: zero runtime cost, no emit.
import "@total-typescript/ts-reset";
