// @total-typescript/ts-reset — tightens TS built-ins that are honest-to-lies:
//   • Array.includes(x)        — narrows correctly when x is a wider type
//   • [].filter(Boolean)       — strips null/undefined from the result type
//   • JSON.parse(x)            — returns `unknown`, not `any` (forces explicit narrowing)
//   • Response.json()/.text()  — return `unknown`, not `any`
//   • Map/Set/.indexOf etc.    — assorted honest signatures
//
// tsconfig.base.json has no `include`: each program's own tsconfig lists this file in its `include`,
// so a new tsconfig must list it too. Declaration-only, no emit.
import "@total-typescript/ts-reset";
