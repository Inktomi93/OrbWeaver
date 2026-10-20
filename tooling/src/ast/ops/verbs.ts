// The verb dispatch tables — what the cli routes through (re-exported via index.ts).

import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { InventoryFamily } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { Flags } from "../contract/types.ts";
import { cmdApiSurface } from "./apisurface.ts";
import { cmdChains } from "./chains.ts";
import { cmdColumns } from "./columns.ts";
import { cmdDead } from "./dead.ts";
import { cmdContractFieldLiveness } from "./fields.ts";
import { cmdAliases, cmdCycles } from "./graph.ts";
import { cmdOrphans, cmdTestOnly } from "./orphans.ts";
import { cmdProdOnly } from "./prodonly.ts";
import { cmdRegistryCandidates } from "./registry-candidates-command.ts";
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
  "callers",
  "importers",
  "jsx",
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

/** Liveness includes checked witness origins and carrier references, not only import edges. */
export const INVENTORY_VERB_FAMILIES: ReadonlyMap<string, readonly InventoryFamily[]> = new Map<string, readonly InventoryFamily[]>([
  ["dead", DEFAULT_INVENTORY_FAMILIES],
  ["orphans", DEFAULT_INVENTORY_FAMILIES],
  ["testonly", DEFAULT_INVENTORY_FAMILIES],
  ["swallowed", DEFAULT_INVENTORY_FAMILIES],
  ["typeonly-alive", ["exports", "references"]],
  ["chains", DEFAULT_INVENTORY_FAMILIES],
  ["apisurface", DEFAULT_INVENTORY_FAMILIES],
  ["rot", DEFAULT_INVENTORY_FAMILIES],
]);

/** Inventory routing cannot admit a verb without its explicit fact demand. */
export const INVENTORY_VERBS = new Set(INVENTORY_VERB_FAMILIES.keys());

/** Inventory verbs whose positional argument is a file scope; `dead` names a symbol searched corpus-wide. */
export const INVENTORY_SCOPED_VERBS: ReadonlySet<string> = new Set(["orphans", "testonly", "swallowed", "typeonly-alive", "chains", "apisurface", "rot"]);

// Verbs that load searchGlobs WITHOUT the type graph — purely syntactic walks over the wide corpus.
export const WIDE_SYNTACTIC_VERBS = new Set(["aliases", "exports", "ident", "literal"]);

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
