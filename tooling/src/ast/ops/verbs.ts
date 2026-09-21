// The verb dispatch tables — what the cli routes through (re-exported via index.ts).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags } from "../contract/types.ts";
import { cmdApiSurface } from "./apisurface.ts";
import { cmdChains } from "./chains.ts";
import { cmdColumns } from "./columns.ts";
import { cmdDead } from "./dead.ts";
import { cmdContractFieldLiveness } from "./fields.ts";
import { cmdAliases, cmdCycles } from "./graph.ts";
import { cmdOrphans, cmdTestOnly } from "./orphans.ts";
import { cmdProdOnly } from "./prodonly.ts";
import { cmdRegistryCandidates } from "./registry-candidates.ts";
import { cmdRegKeys } from "./regkeys.ts";
import { cmdRespell } from "./respell.ts";
import { cmdRot } from "./rot.ts";
import { cmdStringy } from "./stringy.ts";
import { cmdSubsetCallers } from "./subset-callers.ts";
import { cmdSwallowed } from "./swallowed.ts";
import { cmdCallers, cmdExports, cmdIdent, cmdImporters, cmdJsx, cmdLiteral, cmdRefs } from "./symbols.ts";
import { cmdTypeOnly } from "./typeonly.ts";
import { cmdViewGap } from "./viewgap.ts";
import { cmdClientGap, cmdUnwired } from "./wiring.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

export const VERBS: Record<string, (project: SourceCorpus, arg: string, flags: Flags) => void> = {
  refs: cmdRefs,
  callers: cmdCallers,
  "subset-callers": cmdSubsetCallers,
  importers: cmdImporters,
  exports: cmdExports,
  jsx: cmdJsx,
  ident: cmdIdent,
  literal: cmdLiteral,
  dead: cmdDead,
  orphans: cmdOrphans,
  testonly: cmdTestOnly,
  prodonly: cmdProdOnly,
  cycles: cmdCycles,
  aliases: cmdAliases,
  unwired: cmdUnwired,
  clientgap: cmdClientGap,
  viewgap: cmdViewGap,
  swallowed: cmdSwallowed,
  respell: cmdRespell,
  "typeonly-alive": cmdTypeOnly,
  columns: cmdColumns,
  regkeys: cmdRegKeys,
  "registry-candidates": cmdRegistryCandidates,
  "contract-field-liveness": cmdContractFieldLiveness,
  chains: cmdChains,
  stringy: cmdStringy,
  apisurface: cmdApiSurface,
  rot: cmdRot,
};

// Verbs that resolve module specifiers to origin declarations (need the types:true / full-graph arm).
// refs+cycles use the language service; orphans+testonly resolve every import to its origin decl so
// liveness keys on (file, name) — bare-name matching over-reports same-file use and misses collisions.
export const TYPED_VERBS = new Set([
  "refs",
  "dead",
  "cycles",
  "orphans",
  "testonly",
  "prodonly",
  "unwired",
  "clientgap",
  "swallowed",
  "respell",
  "typeonly-alive",
  "columns",
  "chains",
  "stringy",
  "apisurface",
  "rot",
]);

// Verbs that load the TYPED file set (searchGlobs) WITHOUT the type graph — a purely syntactic walk (no
// language-service resolution) over the wide corpus. `literal` is the only member: a value-change battery
// needs "which code/tests pin this literal" over tests+fixtures+scripts, at the cheap syntactic load.
export const WIDE_SYNTACTIC_VERBS = new Set(["literal"]);

// Verbs whose scope arg is OPTIONAL (default to the whole surface) — run bare, arg defaults to "".
export const ARGLESS_VERBS = new Set([
  "unwired",
  "clientgap",
  "viewgap",
  "swallowed",
  "respell",
  "typeonly-alive",
  "columns",
  "regkeys",
  "contract-field-liveness",
  "registry-candidates",
  "chains",
  "stringy",
  "apisurface",
]);
