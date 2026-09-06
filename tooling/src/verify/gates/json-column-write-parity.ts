// Gate: json-column-write-parity — a JSON column with BOTH a key-wise writer and a whole-record-replace
// writer is a silent clobber. FOUNDING DEFECT (`57fb8595b`, red-first at
// tests/server/domain/refinery/verbs/update-session.int.test.ts): `refinery_sessions.selection` was written
// two ways — `applyFields` REMAPPED `greetingIndexes` key-wise when an accepted rewrite removed a greeting,
// while `updateSession` did `set.selection = refinerySelectionSchema.parse(patch.selection)`, a whole value
// rebuilt from the client's image alone. A scope-dialog save carrying a pre-remap image therefore UNDID the
// remap in the very next write, and the session's positional greeting indexes pointed at the wrong slots.
// The fix was a DELTA patch grammar merged onto the stored value (`mergeSelection`, the rpg `patchSheet` /
// stats `mergeSheet` precedent). Neither writer was wrong alone — the STRADDLE was.
//
// THE CLASSIFIER, and why it is a taint test rather than a name test. A writer is KEY-WISE iff its value
// depends on something read from the ROW; WHOLE-REPLACE iff the value is a pure function of the caller's
// input (`schema.parse(patch.X)`, `patch.X`, `{ ...patch.X }`, a literal). Names prove nothing here: the
// pre-fix `refinerySelectionSchema.parse(patch.selection)` and the post-fix
// `mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection))` BOTH mention `.selection`,
// so a shape/name matcher would have passed the defect (a LYING PROOF, GATE-AUTHORING.md §5). The taint
// roots are: identifiers in the assignment's own RHS, plus — when the `.set()` argument spreads a local
// helper (`{ ...parsePatch(patch, sessionViewOf(row).selection) }`, the exact live shape) — that helper's
// parameters mapped to their call-site arguments, so only the parameters the assignment actually READS
// carry the caller's taint. A root is ROW-DERIVED iff it resolves to a variable declared INSIDE a function
// (the result of a load/compute); imports, module consts, function declarations, and parameters are not.
//
// DERIVED, NEVER HAND-LISTED: the JSON-column set comes from `packages/db/src/schema/**`'s
// `text(..., { mode: "json" })` declarations (the LIVE single source of truth, §10) and the table identity
// from the `db.update(<tableVar>)` in the chain. An empty derivation on a real tree is a RED blindness
// tripwire (§4.6), not a silent pass.
//
// ARM B — THE DOMINANCE ARM (#879, from the #471 settings-blob wipe). A JSON column whose `$type<T>` is a
// type a `defineVersionedConfig(...)` OWNS carries a blob whose READ seam DEGRADES an unreadable value to
// schema defaults; a whole-replace write built on that read persists the stand-in and destroys the real
// blob silently and permanently. `@orb/server/kit`'s `stored-config` module (it lived at
// `domain/settings/substrate/stored-config.ts` until #1026 gave it a second domain caller) and its
// `requireIntactStoredConfig(...)` are the ONE refusal seam, and until this arm its totality over future
// writers rested on a header sentence (0 of 233 gate files referenced it). So: EVERY whole-replace writer
// of a versioned-config column must be DOMINATED by that call inside its own function body — dominance,
// not presence: the guard's own top-level statement must PRECEDE the write's top-level statement in the
// same function body, so a guard sitting in a sibling branch (or after the write) does not absolve it.
// A guard nested inside an EARLIER statement is dominance enough and is the live correct shape
// (`writeUserConfig`'s `if (row !== undefined) { requireIntactStoredConfig(…) }` — an ABSENT row is a
// legitimate first write with nothing to lose).
// FAIL-CLOSED (#944 posture): a `.set(<identifier>)` on a versioned-config-owning table is OPAQUE — the
// gate cannot read which columns it assigns — so it is judged as a whole-replace write rather than skipped.
// The owned-type derivation reads the EXPLICIT type argument first and falls back to the declaration's
// resolved `VersionedConfig<T>`; a call it can read neither way is REPORTED and counted `unresolved`.
//
// DECLARED LIMITS (each has a mustPass row): a column with ONE writer is never judged (there is nothing to
// straddle); an `.insert()`/`.values()` is creation, not a patch; a writer reached through more than one
// helper hop, or through a `db.run(sql\`json_set(...)\`)`, is not classified.
// AND ARM B'S OWN LIMIT: the AppSettings override blob is NOT reachable by this derivation. It lives in the
// generic KV column `settings.value`, typed `JsonValue`, and is identified only by the RUNTIME string
// `APP_SETTINGS_KEY` in a `where(eq(settings.key, …))` — there is no type crossing the seam, so no
// structural fact links that row to `appSettingsConfig`. Its writer (`writeAppOverride`) is guarded by
// convention and by its own header. DO NOT "fix" this with a hand-listed key/path table: a hand list is a
// second home for the ownership fact and rots silently the day the key moves (§3). The end condition is the
// blob moving to a `$type`d column of its own, at which point this arm covers it with no gate edit.
// COLUMNS ARE RESOLVED, NOT REQUIRED INLINE (#945): the columns argument is read through
// `_shared/schema-read.ts`, which follows an imported/aliased object-literal binding (and object spreads)
// and refuses loudly on any other shape. `sqliteTable("x", importedColumns, …)` used to yield ZERO columns
// here, erasing this gate's obligations while the schema file scan stayed healthy; findings anchor on the
// column's DECLARING file and the scan line prints the resolved table/column population.
import { columnProperties, schemaScan } from "@orb/tooling/_shared/schema-read";
import type { Block, CallExpression, FunctionDeclaration, ObjectLiteralExpression, SourceFile, Statement, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

/** `<tableVar>.<column>` → why a straddle is correct there, and what would end the exemption. Two-sided: a
 *  row whose column no longer straddles is RED.
 *
 *  BOTH ROWS WERE INVISIBLE UNTIL #879 added the SHORTHAND reader: `.set({ behavior, … })` /
 *  `.set({ config, … })` is a `ShorthandPropertyAssignment`, and a PropertyAssignment-only collector saw
 *  neither — so this gate reported ✓ over two live straddles, one of them the settings blob the whole
 *  #471 fix exists to protect. Neither is a defect (each reason below says why); the gate's SILENCE was. */
const ALLOWLIST: ExemptionTable = {
  "regexScripts.behavior": {
    why: "BOTH writers are key-wise in fact: `bulk-set-placement.ts` LOADS each row, spreads `toRow(record)` and re-parses, then hands persistence a precomputed `{ id, behavior }[]` — so the row taint is real but crosses a MODULE boundary through an array element, one hop past this gate's declared one-helper-hop taint reach. Ends when the classifier follows cross-module taint, or if that verb ever stops reading the stored row first (then it is a genuine straddle and this row must go)",
  },
  "chats.pendingHandoffOffer": {
    why: "every REAL writer of the offer REPLACES it whole (nominate sets it, accept/decline clear it); the one key-wise writer is the one-shot boot rename `migrateHandoffOfferVocab` (#1649), which moves a KEY and never merges a value onto a client image, so no read-modify-write can be undone. Ends when that migration is retired (then the column no longer straddles and this row must go)",
  },
  "messageVariants.toolCalls": {
    why: "the `chats.pendingHandoffOffer` shape one table over: every REAL writer of a variant's tool-call list REPLACES it whole (the turn pipeline commits the array it just produced at `persistence/canon-write.ts`), and the one key-wise writer is the one-shot boot rename `migratePluginToolWireNames` (#1391), which re-prefixes `$[i].name` on an ALREADY-PERSISTED record and never merges a value onto a client image — so no read-modify-write can be undone by it, and it runs before compose, i.e. before any turn can be in flight. Ends when that migration is retired (then the column no longer straddles and this row must go)",
  },
  "automationRules.actions": {
    why: "the same #1391 shape on the other persisted home of a plugin tool wire name: the rule verbs replace the whole arm list (a rule edit is an authored document, `persistence/rules.ts`), and the lone key-wise writer is the one-shot boot rename `migratePluginToolWireNames`, which rewrites `$[i].name` on `run_tool` arms only and derives nothing from a caller's image. Ends when that migration is retired",
  },
  "presets.config": {
    why: "same shape one table over: the one key-wise writer is the one-shot boot rename `migrateProseSlotVocab` (#1737), moving the `chat.group.castMember` override key; the whole-replace writers carry either a packaged constant or the editor's guarded read (#1026, the ARM B rows below), never an image a rename could be undone by. Ends when that migration is retired",
  },
  "userSettings.config": {
    why: "the DELIBERATE #471 design: `writeUserConfig` is a whole-blob write by contract (the service builds the next blob by spreading a guarded read), `replaceUserConfig` is the same column\'s second whole-blob writer (#1771 — the reset door, content-independent of the row, GUARD_EXEMPT below) and the only key-wise sibling is `clearSelectedThemeIds`'s cross-user `json_set` heal, an admin sweep that is not part of any user's read-modify-write. The residual is a race, not a straddle: a heal landing between one user's read and write is undone. Ends if that race is ruled a defect (then the heal moves behind the same seam) — orchestrator-notified at landing, #879",
  },
};

/** ARM B: `<repo-relative file>#<enclosing function>` → why this whole-replace writer of a versioned-config
 *  column may run UNDOMINATED by `requireIntactStoredConfig`. Two-sided: a row whose writer no longer
 *  violates (it grew the guard, or it left the tree) is RED. */
const GUARD_EXEMPT: ExemptionTable = {
  "packages/server/src/domain/preset/persistence/queries.ts#replacePresetConfig": {
    why: "ISSUE #1026's RULING, and now the whole class this table holds: a whole-replace whose CONTENT DOES NOT DESCEND FROM A READ of the row it lands on. #1026 split `presets.config`'s single writer in two by provenance — `updatePresetRow` carries the editor's read-derived image and GREW the guard (its degraded GET → whole-blob PUT was the real #471 hop, one hop out over the wire), while this function carries content the caller brought with it: the reset verb's DEFAULT_PROMPT_CONFIG and the import verb's strictly-parsed backup file. Guarding these would refuse the user's own explicit repair — the very affordance the guarded editor path tells them to reach for when a preset cannot be read — while preventing no silent loss. Ends if either caller starts merging onto the stored value, or if a third caller reaches this function with a read-derived image (then it owes the guard and this row must go)",
  },
  "packages/server/src/domain/preset/persistence/queries.ts#reseedSystemDefault": {
    why: "same #1026 class: the boot reseed of the system-default row writes a PACKAGED registry constant, never a value derived from a read of the stored blob — overwriting a corrupt system default with the packaged one is the repair, not the defect, and refusing it would wedge boot. Ends if the reseed ever starts merging onto the stored value (then it owes the guard)",
  },
  "packages/server/src/domain/preset/persistence/queries.ts#reseedPackagedPreset": {
    why: "same #1026 class, one shape over: name/kind/config all come from the packaged template registry, not from a read of the row being replaced. Same end condition (a merge-onto-stored rewrite)",
  },
  "packages/server/src/domain/settings/persistence/queries.ts#replaceUserConfig": {
    why: "the #1026 provenance class, on the settings blob: its one caller (`verbs/reset-user-config.ts`) writes DEFAULT_USER_SETTINGS at the current schema version, never a value derived from a read of the row it lands on, so there is no degraded stand-in in it to persist. It exists because #1771 found `user_settings.config` had NO repair door at all — the section autosave, the per-leaf Reset (which writes through updateUserSettingsSection) and the backup restore all read-merge and are therefore correctly refused by the #471 guard, which left an unreadable blob permanently unwritable. The row\'s EXISTENCE is read to choose seed-vs-update; its columns never are. Ends if any caller reaches this function with a read-derived image (then it owes the guard and this row must go)",
  },
};

const MESSAGE =
  "WHOLE-RECORD REPLACE of a JSON column that ANOTHER writer merges key-wise — the replace silently undoes " +
  "the merge on the next write. The founding defect: refinery_sessions.selection, where applyFields remapped " +
  "greetingIndexes across a greeting removal while updateSession rebuilt the whole value from the client's " +
  "image (fixed in 57fb8595b; red-first at " +
  "tests/server/domain/refinery/verbs/update-session.int.test.ts). Neither writer is wrong alone; the " +
  "STRADDLE is. ARM B (#879): AND a whole-replace writer of a VERSIONED-CONFIG column (one whose `$type` is " +
  "a type `defineVersionedConfig(...)` owns) must be DOMINATED in its own function body by " +
  "`requireIntactStoredConfig(...)` — the read seam degrades an unreadable blob to schema defaults, so a " +
  "write built on it persists the stand-in and destroys the user's real blob (#471, the proven cause of the " +
  "#461 settings wipe). Dominance, not presence: a guard in a sibling branch, or after the write, absolves " +
  "nothing. A `.set(<identifier>)` on such a table is OPAQUE and judged as a whole replace.";

const FIX =
  "make the patch a DELTA and merge it key-wise onto the STORED value — the `mergeSelection` shape in " +
  "packages/server/src/domain/refinery/verbs/update-session.ts (absent = keep, null = clear, value = set), " +
  "with the merge basis read through the domain's ONE read seam. The rpg `patchSheet` / stats `mergeSheet` " +
  "helpers are the other precedents. If the replace is genuinely correct (every writer replaces), the OTHER " +
  "writer is the one to convert. ARM B: read the row and hand its `parseOutcome` to " +
  "`requireIntactStoredConfig(...)` BEFORE the write, in the same function body — " +
  "packages/server/src/domain/settings/persistence/queries.ts `writeUserConfig` is the worked shape. If the " +
  "written value genuinely never derives from a read of that row (a packaged reseed constant), add a cited " +
  "GUARD_EXEMPT row keyed `<file>#<function>` in the gate.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry names a JSON column that no longer straddles (its writers agree now, or one of them was " +
  "deleted) — a standing exemption for a site that is gone is a loaded gun: delete the stale row in " +
  "json-column-write-parity.ts: ";

const BLIND_MESSAGE =
  'DERIVED NOTHING — no `text(..., { mode: "json" })` column was found in packages/db/src/schema/** on a ' +
  "tree that HAS a db schema. The column derivation is this gate's whole basis, so a green verdict here " +
  "would be a placebo (GATE-AUTHORING.md §4.6). Re-point the derivation at the schema's current spelling: " +
  "tooling/src/verify/gates/json-column-write-parity.ts";

const GATE_SELF = "tooling/src/verify/gates/json-column-write-parity.ts";
const SCHEMA_DIR = "/packages/db/src/schema/";
const DOMAIN_DIR = "/packages/server/src/domain/";
const CONTRACTS_DIR = "/packages/contracts/src/";
const JSON_MODE_RE = /mode:\s*"json"/u;

// ── ARM B: the versioned-config dominance arm (#879) ───────────────────────────────────────────────────
const DEFINE_VERSIONED_CONFIG = "defineVersionedConfig";
const GUARD_CALLEE = "requireIntactStoredConfig";
const CONFLICT_UPDATE = "onConflictDoUpdate";
const CONFLICT_SET_KEY = "set";
/** The exemption-key name for a write with no enclosing function / no readable one. */
const TOP_LEVEL_SITE = "(top-level)";
const ANONYMOUS_SITE = "(anonymous)";
/** How much of an OPAQUE `.set(<expr>)` the finding quotes as its position token. */
const OPAQUE_TOKEN_CHARS = 40;
/** The real-tree anchor ARM B's stale sweep guards on (§4.5) — the db schema barrel, present on every real
 *  run and needed by no example here. */
const SCHEMA_ANCHOR = "packages/db/src/schema/index.ts";
/** `$type<UserSettings>()` on a column builder chain — the ONE structural link from a db column to the
 *  contracts type whose blob it stores. */
const COLUMN_TYPE_RE = /\$type<([^>]+)>/u;
/** The resolved declaration type of a `defineVersionedConfig(...)` binding, when no explicit type argument
 *  was written (`promptConfigConfig` is the live inferred spelling). */
const VERSIONED_CONFIG_TYPE_RE = /VersionedConfig<([^>]+)>/u;

const UNREADABLE_CONFIG_MESSAGE =
  "UNREADABLE `defineVersionedConfig(...)` declaration — the gate cannot resolve which TYPE this versioned " +
  "config owns (no explicit type argument, and the binding's declared type is not a `VersionedConfig<T>`). " +
  "Its columns therefore carry NO write guard obligation, silently. Write the type argument explicitly " +
  "(`defineVersionedConfig<PromptConfig>({ … })`) so the ownership is readable without the checker.";

const VERSIONED_BLIND_MESSAGE =
  "DERIVED NOTHING — no `defineVersionedConfig(...)` call was found in packages/contracts/src on a tree that " +
  "HAS a contracts package. The owned-type set is ARM B's whole basis, so a green verdict for it would be a " +
  "placebo (GATE-AUTHORING.md §4.6). Re-point the derivation at the primitive's current spelling: " +
  "tooling/src/verify/gates/json-column-write-parity.ts";

const STALE_GUARD_EXEMPT_PREFIX =
  "GUARD_EXEMPT entry names a writer that no longer needs the exemption (it grew the " +
  "`requireIntactStoredConfig` guard, stopped being a whole-replace writer of a versioned-config column, or " +
  "left the tree) — a standing exemption for a site that is gone is a loaded gun: delete the stale row in " +
  "json-column-write-parity.ts: ";

interface Writer {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
}

/** Every drizzle table variable → the names of its `mode: "json"` columns, and the SUBSET whose `$type<T>`
 *  names a versioned-config-owned type. Derived from the schema package, never hand-listed. */
function jsonColumnsOf(init: TsNode, versionedTypes: ReadonlySet<string>): { readonly all: Set<string>; readonly versioned: Set<string> } {
  const all = new Set<string>();
  const versioned = new Set<string>();
  const columns = Node.isCallExpression(init) ? columnProperties(init.getArguments()[1]) : [];
  for (const column of columns) {
    if (!JSON_MODE_RE.test(column.text)) {
      continue;
    }
    all.add(column.name);
    const declared = COLUMN_TYPE_RE.exec(column.text)?.[1]?.trim();
    if (declared !== undefined && versionedTypes.has(declared)) {
      versioned.add(column.name);
    }
  }
  return { all, versioned };
}

interface ColumnIndex {
  /** table variable → every `mode:"json"` column (ARM A's subject). */
  readonly all: Map<string, ReadonlySet<string>>;
  /** table variable → the versioned-config-owned subset (ARM B's subject). */
  readonly versioned: Map<string, ReadonlySet<string>>;
}

function deriveJsonColumns(files: readonly SourceFile[], versionedTypes: ReadonlySet<string>): ColumnIndex {
  const all = new Map<string, ReadonlySet<string>>();
  const versioned = new Map<string, ReadonlySet<string>>();
  for (const sf of files.filter((f) => f.getFilePath().includes(SCHEMA_DIR))) {
    for (const decl of sf.getVariableDeclarations()) {
      const init = decl.getInitializer();
      const cols = init === undefined || !init.getText().startsWith("sqliteTable(") ? undefined : jsonColumnsOf(init, versionedTypes);
      if (cols !== undefined && cols.all.size > 0) {
        all.set(decl.getName(), cols.all);
      }
      if (cols !== undefined && cols.versioned.size > 0) {
        versioned.set(decl.getName(), cols.versioned);
      }
    }
  }
  return { all, versioned };
}

/** The TYPE one `defineVersionedConfig(...)` owns — the EXPLICIT type argument, else the binding's resolved
 *  `VersionedConfig<T>` (the live inferred `promptConfigConfig` spelling). `undefined` = readable neither
 *  way, which this gate REPORTS rather than silently dropping the column obligation it carries. */
function ownedTypeOf(call: CallExpression): string | undefined {
  const explicit = call.getTypeArguments()[0]?.getText().trim();
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }
  const decl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const inferred = decl === undefined ? undefined : VERSIONED_CONFIG_TYPE_RE.exec(decl.getType().getText(decl))?.[1];
  // A resolved type prints qualified (`import("…/preset").PromptConfig`); the DECLARED name is the tail.
  const name = inferred?.trim().split(".").at(-1);
  return name === undefined || name === "" || name.includes("(") ? undefined : name;
}

/** Every versioned-config declaration in `contracts`, split into the types it could read and the calls it
 *  could not (the #944 fail-closed half — a `continue` here would erase obligations silently). */
function deriveVersionedTypes(files: readonly SourceFile[]): { readonly types: Set<string>; readonly unresolved: CallExpression[]; readonly calls: number } {
  const types = new Set<string>();
  const unresolved: CallExpression[] = [];
  let calls = 0;
  for (const sf of files.filter((f) => f.getFilePath().includes(CONTRACTS_DIR))) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() !== DEFINE_VERSIONED_CONFIG) {
        continue;
      }
      calls += 1;
      const owned = ownedTypeOf(call);
      if (owned === undefined) {
        unresolved.push(call);
      } else {
        types.add(owned);
      }
    }
  }
  return { types, unresolved, calls };
}

/** The table variable a `.set(` call updates — walk the fluent chain back to `.update(<table>)` (or, for an
 *  upsert's `onConflictDoUpdate`, back to `.insert(<table>)`). */
function updatedTable(setCallee: TsNode, chainVerb = "update"): string | undefined {
  let cur: TsNode = setCallee;
  let table: string | undefined;
  while (table === undefined && (Node.isCallExpression(cur) || Node.isPropertyAccessExpression(cur))) {
    if (Node.isCallExpression(cur)) {
      const callee = cur.getExpression();
      table = Node.isPropertyAccessExpression(callee) && callee.getName() === chainVerb ? (cur.getArguments()[0]?.getText() ?? "") : undefined;
      cur = callee;
    } else {
      cur = cur.getExpression();
    }
  }
  return table === "" ? undefined : table;
}

/** Identifier NODES read as VALUES in `node` — property NAMES (`x.selection`'s `selection`) and call
 *  CALLEES (`mergeSelection(…)`) are not value reads and are excluded, or every local helper would look
 *  like data. Nodes, not names: each is classified from its OWN declaration, never by a same-name sweep of
 *  the file (which would resolve a shadowed local to the wrong binding). */
function valueRoots(node: TsNode): TsNode[] {
  if (Node.isIdentifier(node)) {
    return [node];
  }
  const out: TsNode[] = [];
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const parent = id.getParent();
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) {
      continue;
    }
    if (Node.isCallExpression(parent) && parent.getExpression() === id) {
      continue;
    }
    out.push(id);
  }
  return out;
}

/** Is this identifier a value READ FROM THE ROW — i.e. bound by a `const`/`let` INSIDE a function body (a
 *  load result, or something destructured out of one: `const { session } = await resolveApplyBasis(…)` is
 *  the live shape and a BindingElement, NOT a VariableDeclaration, is what a destructure resolves to).
 *  Imports, module consts, function declarations and PARAMETERS — including a destructured parameter
 *  binding (`({ values }: SetVariablesParams)`, the live `chats.variableValues` writer) — are caller-side
 *  or static and never make a write key-wise. */
function isRowDerivedDecl(def: TsNode): boolean {
  if (def.getFirstAncestorByKind(SyntaxKind.Parameter) !== undefined || Node.isParameterDeclaration(def)) {
    return false;
  }
  const varDecl = Node.isVariableDeclaration(def) ? def : def.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return varDecl !== undefined && varDecl.getFirstAncestorByKind(SyntaxKind.Block) !== undefined;
}

function isRowDerived(id: TsNode): boolean {
  return Node.isIdentifier(id) && id.getDefinitionNodes().some(isRowDerivedDecl);
}

/** Every JSON-column assignment reachable from a `.set()` argument, classified. `paramTaint` carries the
 *  ONE helper hop: when the argument spreads `helper(a, b)`, each of `helper`'s parameters inherits whether
 *  its call-site argument was row-derived, so an assignment inside the helper is key-wise only if it READS
 *  a tainted parameter. */
interface Sink {
  readonly cols: ReadonlySet<string>;
  readonly out: Writer[];
}

function collectFromObject(obj: ObjectLiteralExpression, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      collectWriters(prop.getExpression(), sink, paramTaint, hop);
    } else if (Node.isPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      const rhs = prop.getInitializer();
      sink.out.push({ node: prop, wholeReplace: rhs === undefined || !isKeyWise(rhs, paramTaint) });
    } else if (Node.isShorthandPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      // `.set({ config, schemaVersion, updatedAt })` — the live `writeUserConfig` spelling, and a writer the
      // PropertyAssignment-only reader could not see at all. The value's binding is the shorthand's own
      // VALUE symbol (its name node resolves to the property, not to what it reads).
      const decls = prop.getValueSymbol()?.getDeclarations() ?? [];
      sink.out.push({ node: prop, wholeReplace: paramTaint.get(prop.getName()) !== true && !decls.some(isRowDerivedDecl) });
    }
  }
}

function collectWriters(arg: TsNode | undefined, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
  if (arg === undefined) {
    return;
  }
  if (Node.isParenthesizedExpression(arg)) {
    collectWriters(arg.getExpression(), sink, paramTaint, hop);
  } else if (Node.isConditionalExpression(arg)) {
    collectWriters(arg.getWhenTrue(), sink, paramTaint, hop);
    collectWriters(arg.getWhenFalse(), sink, paramTaint, hop);
  } else if (Node.isObjectLiteralExpression(arg)) {
    collectFromObject(arg, sink, paramTaint, hop);
  } else if (Node.isCallExpression(arg) && hop < 1) {
    descendHelper(arg, sink, hop);
  }
}

/** The helper's parameters, each carrying whether ITS call-site argument was row-derived. */
function paramTaintOf(def: FunctionDeclaration, args: readonly TsNode[]): ReadonlyMap<string, boolean> {
  const next = new Map<string, boolean>();
  def.getParameters().forEach((param, i) => {
    const actual = args[i];
    next.set(param.getName(), actual !== undefined && valueRoots(actual).some(isRowDerived));
  });
  return next;
}

/** The helper's accumulator shape (`const set: Partial<…> = {}; set.selection = …; return set;`) — the live
 *  `parsePatch` spelling. */
function collectFromAccumulator(def: FunctionDeclaration, sink: Sink, taint: ReadonlyMap<string, boolean>): void {
  for (const bin of def.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const lhs = bin.getLeft();
    if (bin.getOperatorToken().getText() === "=" && Node.isPropertyAccessExpression(lhs) && sink.cols.has(lhs.getName())) {
      sink.out.push({ node: bin, wholeReplace: !isKeyWise(bin.getRight(), taint) });
    }
  }
}

/** One hop into a locally-declared helper the `.set()` argument spreads. The caller's `paramTaint` does
 *  NOT carry in: the helper opens a new scope, and its parameters are re-derived from THIS call's
 *  arguments (which is the whole point — only the params the assignment reads inherit the taint). */
function descendHelper(call: CallExpression, sink: Sink, hop: number): void {
  const callee = call.getExpression();
  if (!Node.isIdentifier(callee)) {
    return;
  }
  const args = call.getArguments();
  for (const def of callee.getDefinitionNodes()) {
    if (!Node.isFunctionDeclaration(def)) {
      continue;
    }
    const taint = paramTaintOf(def, args);
    collectFromAccumulator(def, sink, taint);
    for (const ret of def.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
      collectWriters(ret.getExpression(), sink, taint, hop + 1);
    }
  }
}

/** A drizzle `sql` tagged template that interpolates a COLUMN reference is reading the stored value
 *  SQL-side (a `sql` template around `json_set(${userSettings.config}, …)` — the live theme-clear
 *  writer). The taint test
 *  cannot see through SQL text, so the column reference is what stands in for the read. */
function isSqlColumnMerge(rhs: TsNode): boolean {
  return (
    Node.isTaggedTemplateExpression(rhs) &&
    rhs.getTag().getText() === "sql" &&
    rhs.getTemplate().getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).length > 0
  );
}

/** Does this value expression depend on something read from the row? */
function isKeyWise(rhs: TsNode, paramTaint: ReadonlyMap<string, boolean>): boolean {
  return isSqlColumnMerge(rhs) || valueRoots(rhs).some((root) => paramTaint.get(root.getText()) === true || isRowDerived(root));
}

const EMPTY_TAINT: ReadonlyMap<string, boolean> = new Map();

/** The column a collected writer assigns — a `metadata: …` property, or a `set.metadata = …` accumulator
 *  assignment (whose LHS is the property access). */
function columnOf(w: Writer): string {
  if (Node.isPropertyAssignment(w.node) || Node.isShorthandPropertyAssignment(w.node)) {
    return w.node.getName();
  }
  const lhs = Node.isBinaryExpression(w.node) ? w.node.getLeft() : undefined;
  return Node.isPropertyAccessExpression(lhs) ? lhs.getName() : "";
}

/** The JSON-column-bearing table this call updates, if it is a `db.update(<table>).set(…)` at all. */
function jsonTableOf(
  call: CallExpression,
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly table: string; readonly cols: ReadonlySet<string> } | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "set") {
    return;
  }
  const table = updatedTable(callee.getExpression());
  const cols = table === undefined ? undefined : jsonColumns.get(table);
  return table === undefined || cols === undefined ? undefined : { table, cols };
}

/** Every `<table>.<column>` a domain `.set()` writes → its classified writers. */
function collectByColumn(files: readonly SourceFile[], jsonColumns: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Writer[]> {
  const byColumn = new Map<string, Writer[]>();
  for (const sf of files.filter((f) => f.getFilePath().includes(DOMAIN_DIR))) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const target = jsonTableOf(call, jsonColumns);
      if (target === undefined) {
        continue;
      }
      const found: Writer[] = [];
      collectWriters(call.getArguments()[0], { cols: target.cols, out: found }, EMPTY_TAINT, 0);
      for (const w of found) {
        const key = `${target.table}.${columnOf(w)}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), w]);
      }
    }
  }
  return byColumn;
}

// ── ARM B: the versioned-config dominance arm ──────────────────────────────────────────────────────────

/** One whole-replace write of a versioned-config column, and the exemption key that would forgive it. */
interface GuardTarget {
  readonly node: TsNode;
  readonly token: string;
  /** `<repo-relative file>#<enclosing function>` — the GUARD_EXEMPT key. */
  readonly key: string;
  readonly dominated: boolean;
  readonly opaque: boolean;
}

/** The enclosing function's BODY BLOCK and the name a reader would call it — the unit dominance is judged
 *  in. A write outside any function body has no place to put a guard and is never dominated. */
interface EnclosingFunction {
  readonly body: Block;
  readonly name: string;
}

function enclosingBody(node: TsNode): EnclosingFunction | undefined {
  let found: EnclosingFunction | undefined;
  for (const a of node.getAncestors()) {
    const body =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) || Node.isFunctionExpression(a) || Node.isArrowFunction(a) ? a.getBody() : undefined;
    if (body === undefined || !Node.isBlock(body)) {
      continue;
    }
    const named =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) ? a.getName() : a.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
    found = { body, name: named === undefined || named === "" ? ANONYMOUS_SITE : named };
    break;
  }
  return found;
}

/** Which of `statements` this node sits under, by identity — the position dominance compares. */
function statementIndexIn(node: TsNode, statements: readonly Statement[]): number {
  for (let cur: TsNode | undefined = node; cur !== undefined; cur = cur.getParent()) {
    const at = statements.findIndex((s) => s === cur);
    if (at >= 0) {
      return at;
    }
  }
  return -1;
}

/** DOMINANCE, not presence: some `requireIntactStoredConfig(...)` call's own top-level statement must
 *  PRECEDE the write's top-level statement in the same function body. A guard nested inside an EARLIER
 *  statement counts (`if (row !== undefined) { guard }` is the live correct shape — an absent row is a
 *  legitimate first write); a guard in the write's own statement, in a sibling branch, or after it, does not. */
function isDominatedByGuard(node: TsNode, body: Block): boolean {
  const statements = body.getStatements();
  const writeAt = statementIndexIn(node, statements);
  if (writeAt < 0) {
    return false;
  }
  return body.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    if (call.getExpression().getText() !== GUARD_CALLEE) {
      return false;
    }
    const guardAt = statementIndexIn(call, statements);
    return guardAt >= 0 && guardAt < writeAt;
  });
}

/** The unwrapped `.set(...)` / `onConflictDoUpdate({ set })` argument, for the OPAQUE test. */
function unwrapArg(arg: TsNode | undefined): TsNode | undefined {
  return arg !== undefined && Node.isParenthesizedExpression(arg) ? unwrapArg(arg.getExpression()) : arg;
}

/** Every whole-replace write of a versioned-config column reachable from one `set` object, plus the
 *  fail-closed OPAQUE verdict when the gate cannot read the object at all. */
function guardTargetsOf(setArg: TsNode | undefined, cols: ReadonlySet<string>, root: string): GuardTarget[] {
  const arg = unwrapArg(setArg);
  if (arg === undefined) {
    return [];
  }
  const site = enclosingBody(arg);
  const key = `${arg.getSourceFile().getFilePath().replace(`${root}/`, "")}#${site === undefined ? TOP_LEVEL_SITE : site.name}`;
  const dominates = (n: TsNode): boolean => site !== undefined && isDominatedByGuard(n, site.body);
  if (!Node.isObjectLiteralExpression(arg)) {
    return [{ node: arg, token: arg.getText().slice(0, OPAQUE_TOKEN_CHARS), key, dominated: dominates(arg), opaque: true }];
  }
  const found: Writer[] = [];
  collectWriters(arg, { cols, out: found }, EMPTY_TAINT, 0);
  return found
    .filter((w) => w.wholeReplace && cols.has(columnOf(w)))
    .map((w) => ({ node: w.node, token: columnOf(w), key, dominated: dominates(w.node), opaque: false }));
}

/** The `set` object of an `onConflictDoUpdate({ target, set: { … } })` upsert — a whole-blob replace of an
 *  EXISTING row, so it owes the guard exactly as `.set()` does. */
function conflictSetObject(call: CallExpression): TsNode | undefined {
  const arg = unwrapArg(call.getArguments()[0]);
  const prop = arg !== undefined && Node.isObjectLiteralExpression(arg) ? arg.getProperty(CONFLICT_SET_KEY) : undefined;
  return Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** The write verb → the fluent chain verb that names its table. */
const WRITE_VERBS: ReadonlyMap<string, string> = new Map([
  ["set", "update"],
  [CONFLICT_UPDATE, "insert"],
]);

/** The `set` object of ONE write call, when that call writes a table owning a versioned-config column. */
function versionedSetArg(
  call: CallExpression,
  versionedColumns: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly arg: TsNode | undefined; readonly cols: ReadonlySet<string> } | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const chainVerb = WRITE_VERBS.get(callee.getName());
  const table = chainVerb === undefined ? undefined : updatedTable(callee.getExpression(), chainVerb);
  const cols = table === undefined ? undefined : versionedColumns.get(table);
  if (cols === undefined) {
    return;
  }
  return { arg: callee.getName() === CONFLICT_UPDATE ? conflictSetObject(call) : call.getArguments()[0], cols };
}

/** Every versioned-config write site in the domain corpus, classified. */
function collectGuardTargets(files: readonly SourceFile[], versionedColumns: ReadonlyMap<string, ReadonlySet<string>>, root: string): GuardTarget[] {
  const out: GuardTarget[] = [];
  for (const sf of files.filter((f) => f.getFilePath().includes(DOMAIN_DIR))) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const target = versionedSetArg(call, versionedColumns);
      if (target !== undefined) {
        out.push(...guardTargetsOf(target.arg, target.cols, root));
      }
    }
  }
  return out;
}

/** ARM B's two instrument-health arms: the owned-type derivation coming back EMPTY on a tree that has a
 *  contracts package (§4.6), and each declaration whose owned type is unreadable (#944 — a `continue` here
 *  would erase every column obligation that declaration carries, silently). */
function reportVersionedTypeHealth(ctx: GateRunCtx, files: readonly SourceFile[], versioned: ReturnType<typeof deriveVersionedTypes>): void {
  if (versioned.types.size === 0 && files.some((f) => f.getFilePath().includes(CONTRACTS_DIR))) {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: VERSIONED_BLIND_MESSAGE });
  }
  for (const call of versioned.unresolved) {
    const rel = call.getSourceFile().getFilePath().replace(`${ctx.root}/`, "");
    const binding = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? "(unbound)";
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${UNREADABLE_CONFIG_MESSAGE} The unreadable declaration is \`${binding}\` in ${rel} — the reader is tooling/src/verify/gates/json-column-write-parity.ts`,
    });
  }
}

/** ARM B proper. Returns the GUARD_EXEMPT keys a live violation actually claimed, for the stale sweep. */
function reportUndominatedWrites(ctx: GateRunCtx, files: readonly SourceFile[], versionedColumns: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const claimed = new Set<string>();
  for (const target of collectGuardTargets(files, versionedColumns, ctx.root)) {
    if (target.dominated) {
      continue;
    }
    if (target.key in GUARD_EXEMPT) {
      claimed.add(target.key);
      continue;
    }
    ctx.report(target.node, { token: target.token, offset: 0 });
  }
  return claimed;
}

/** Two-sided (§4.4), guarded on a real-tree ANCHOR so a conformance mini-project — which loads none of the
 *  exempt writers — cannot red the gate's own self-proof. */
/** ARM A's stale sweep, on the same real-tree ANCHOR — a conformance mini-project loads none of the
 *  allowlisted columns' writers, so an unguarded sweep would red the gate's own self-proof (§4.5). */
function reportStaleAllowlist(ctx: GateRunCtx, seen: ReadonlySet<string>): void {
  if (!fileLoaded(ctx, SCHEMA_ANCHOR)) {
    return;
  }
  for (const key of Object.keys(ALLOWLIST)) {
    if (!seen.has(key)) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_ENTRY_MESSAGE_PREFIX}"${key}" — tooling/src/verify/gates/json-column-write-parity.ts`,
      });
    }
  }
}

function reportStaleGuardExempt(ctx: GateRunCtx, claimed: ReadonlySet<string>): void {
  if (!fileLoaded(ctx, SCHEMA_ANCHOR)) {
    return;
  }
  for (const key of Object.keys(GUARD_EXEMPT)) {
    if (!claimed.has(key)) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_GUARD_EXEMPT_PREFIX}"${key}" — tooling/src/verify/gates/json-column-write-parity.ts`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "json-column-write-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the verdict is a comparison ACROSS a column's writers, which live in different files
  message: MESSAGE,
  fix: FIX,
  // ARM B reads `packages/contracts/src` too — that is where `defineVersionedConfig` names the types whose
  // columns owe the write guard.
  scanRoot: (p) => p.includes("packages/db/src/schema/") || p.includes("packages/server/src/domain/") || p.includes("packages/contracts/src/"),

  run: (ctx) => {
    ctx.scan(schemaScan(ctx.project));
    const files = ctx.project
      .getSourceFiles()
      .filter((f) => f.getFilePath().includes(SCHEMA_DIR) || f.getFilePath().includes(DOMAIN_DIR) || f.getFilePath().includes(CONTRACTS_DIR));
    const versioned = deriveVersionedTypes(files);
    reportVersionedTypeHealth(ctx, files, versioned);
    const columns = deriveJsonColumns(files, versioned.types);
    ctx.scan({
      population: [
        { source: "defineVersionedConfig owners", members: versioned.types.size, unresolved: versioned.unresolved.length },
        { source: "versioned-config columns", members: [...columns.versioned.values()].reduce((n, cols) => n + cols.size, 0) },
      ],
    });
    reportStaleGuardExempt(ctx, reportUndominatedWrites(ctx, files, columns.versioned));
    const jsonColumns = columns.all;
    if (jsonColumns.size === 0) {
      if (files.some((f) => f.getFilePath().includes(SCHEMA_DIR))) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
      }
      return; // a synthetic mini-project with no schema at all is a legitimate zero (§4.5)
    }

    const byColumn = collectByColumn(files, jsonColumns);
    const seenAllowlisted = new Set<string>();
    for (const [key, writers] of byColumn) {
      const straddles = writers.some((w) => w.wholeReplace) && writers.some((w) => !w.wholeReplace);
      if (!straddles) {
        continue;
      }
      if (key in ALLOWLIST) {
        seenAllowlisted.add(key);
        continue;
      }
      for (const w of writers.filter((x) => x.wholeReplace)) {
        // §4.3a: two arms can now report on one `.set({ a, b })` line, so each finding names its POSITION.
        ctx.report(w.node, { token: columnOf(w), offset: 0 });
      }
    }
    reportStaleAllowlist(ctx, seenAllowlisted);
  },

  mustFlag: [
    {
      // #1035: the straddling JSON column is a SHORTHAND member; the inline `notes.body` column keeps the
      // derivation non-empty so the red cannot come from the blindness arm.
      files: {
        "packages/db/src/schema/refinery.ts":
          'const selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE #1035 SHORTHAND RED: a JSON column declared as a shorthand member still owes write parity — dropped, the straddle that undid the greeting remap would have been invisible",
    },
    {
      // #945: the straddling JSON column is IMPORTED, and a second INLINE json column keeps the derivation
      // non-empty — so the red cannot come from the zero-result blindness arm instead of the real straddle.
      files: {
        "packages/db/src/schema/refinery-columns.ts":
          'export const sessionColumns = {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n};\n',
        "packages/db/src/schema/refinery.ts":
          'import { sessionColumns } from "./refinery-columns";\nexport const refinerySessions = sqliteTable("refinery_sessions", sessionColumns);\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE #945 IMPORTED-COLUMNS RED: a JSON column behind an imported columns object still owes write parity — and the inline `notes.body` column proves the red is the straddle, not the empty-derivation tripwire",
    },
    {
      files: {
        "packages/db/src/schema/refinery.ts":
          'export const refinerySessions = sqliteTable("refinery_sessions", {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch) {\n  const set = {};\n  set.selection = refinerySelectionSchema.parse(patch.selection);\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch) }).where(sessionId);\n}\n",
        // The live shape, faithfully: `session` is DESTRUCTURED out of an awaited resolver, not handed in
        // as a parameter. Conformance caught an earlier draft of this row that took it as a param and
        // therefore proved the opposite of the defect — the LYING-PROOF class, GATE-AUTHORING.md §5.
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE FOUNDING DEFECT verbatim (57fb8595b): the whole-replace lives one helper hop in and reads only `patch`, while the sibling verb merges key-wise off a LOADED session — the straddle that undid the greeting remap",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/a.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/b.ts":
          "export async function b(ctx, patch, chatId) {\n  await ctx.db.update(chats).set({ metadata: { ...patch.metadata } }).where(chatId);\n}\n",
      },
      expect: { count: 1 },
      why: "the `X: { ...patch.X }` spelling of the replace — a spread of the CALLER's image is still a whole record; the spread reads nothing stored",
    },
    {
      files: {
        "packages/db/src/schema/rpg.ts": 'export const rpgSheets = sqliteTable("rpg_sheets", {\n  sheet: text("sheet", { mode: "json" }),\n});\n',
        "packages/server/src/domain/rpg/verbs/set.ts":
          "export async function set(ctx, input, id) {\n  await ctx.db.update(rpgSheets).set({ sheet: input.sheet }).where(id);\n}\n",
        "packages/server/src/domain/rpg/verbs/patch.ts":
          "export async function patchIt(ctx, input, id) {\n  const row = await load(ctx, id);\n  await ctx.db.update(rpgSheets).set({ sheet: patchSheet(row.sheet, input.delta) }).where(id);\n}\n",
      },
      expect: { count: 1 },
      why: "the bare `X: input.X` replace beside the rpg `patchSheet` precedent — the taint test, not a name test, is what separates them",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "THE #879 ARM-B RED, and the founding #471 shape: a whole-blob writer of a versioned-config column with NO requireIntactStoredConfig anywhere — the read seam degrades, so this write persists the stand-in. It also proves the SHORTHAND spelling (`set({ config, … })`) is seen at all: the PropertyAssignment-only reader could not see the live writer",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row === undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  } else {\n    await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n  }\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "DOMINANCE, NOT PRESENCE: the guard is present in the SAME function and even in the same `if` — but in the SIBLING branch, so no execution reaching the write ever runs it. A presence test would pass this; that is the whole reason the arm is a dominance test",
    },
    {
      files: {
        "packages/contracts/src/preset/index.ts":
          "export const promptConfigConfig = defineVersionedConfig<PromptConfig>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/preset.ts":
          'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }).$type<PromptConfig>().notNull(),\n});\n',
        // Deliberately a SYNTHETIC path: an example landing on a real GUARD_EXEMPT key would be absolved by
        // the table and prove nothing (it did, on the first draft of this row, against the
        // `queries.ts#updatePresetRow` entry #1026 has since deleted).
        "packages/server/src/domain/preset/persistence/writes.ts":
          "export async function writePresetRow(db, id, patch) {\n  await db.update(presets).set(patch).where(eq(presets.id, id));\n}\n",
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED (#944 posture): a `.set(<identifier>)` on a versioned-config-owning table is OPAQUE — the gate cannot read which columns it assigns — so it is JUDGED, never skipped. A silent skip is the audited escape verbatim, and `.set(patch)` is the live `updatePresetRow` shape (which since #1026 satisfies the arm with a dominating guard rather than an exemption row)",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function seed(db, ownerId, config, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config, updatedAt: at }).onConflictDoUpdate({ target: userSettings.userId, set: { config, updatedAt: at } });\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "the UPSERT spelling: `onConflictDoUpdate({ set: { config } })` replaces an EXISTING row's blob, so it owes the guard exactly as `.set()` does. A plain `.values()` insert stays creation (a mustPass row below keeps that limit)",
    },
    {
      files: {
        "packages/contracts/src/preset/index.ts":
          "export const promptConfigConfig = defineVersionedConfig({ schema: s, version: 1, lifts: {}, default: d });\n",
        // A READABLE sibling keeps the owned-type derivation non-empty, so this red can only be the
        // fail-closed arm and never the empty-derivation tripwire (the #945 row's trick, one arm over).
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/preset.ts":
          'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }).$type<PromptConfig>().notNull(),\n});\n',
      },
      expect: { count: 1, messageIncludes: "UNREADABLE" },
      why: "THE #944 FAIL-CLOSED ROW: a `defineVersionedConfig(...)` with no explicit type argument whose binding type does not resolve is REPORTED, never silently skipped — a skip would erase every column obligation that declaration carries while the file scan stayed healthy. It bit on the real tree at landing: `promptConfigConfig` was inferred, so `presets.config` carried NO guard obligation at all until the type argument was written",
    },
    {
      files: {
        // The real-tree ANCHOR both stale sweeps guard on, plus a json column so the run gets past the
        // empty-derivation return — with NO writer for any exempted key, so every row is stale at once.
        "packages/db/src/schema/index.ts": 'export * from "./notes.ts";\n',
        "packages/db/src/schema/notes.ts": 'export const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
      },
      expect: { count: 7, messageIncludes: "ALLOWLIST entry names" },
      why: "BOTH STALE SWEEPS, two-sided (§4.4): the anchor is loaded and NOTHING on this tree claims any ALLOWLIST or GUARD_EXEMPT row, so all seven rows red as stale. It is also the mode-B proof — a row whose site left the project is examined, because the sweep is keyed on a `seen` set and never on the row's own file existing",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/refinery.ts":
          'const selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\n',
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      why: "the SHORTHAND's green twin: one key-wise writer on the resolved column is not a straddle",
    },
    {
      files: {
        "packages/db/src/schema/refinery.ts":
          'export const refinerySessions = sqliteTable("refinery_sessions", {\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch, current) {\n  const set = {};\n  set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection));\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  const row = await loadOwnedSessionRow(ctx.db, sessionId);\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch, sessionViewOf(row).selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      why: "THE FIX (57fb8595b) — the merge basis is passed in from a LOADED row, so the helper's `current` parameter carries the row taint and both writers are key-wise. This row is the gate's own regression pin against re-flagging the corrected shape",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  variableValues: text("variable_values", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/set.ts":
          "export async function setVars(ctx, values, chatId) {\n  await ctx.db.update(chats).set({ variableValues: values }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/clear.ts":
          "export async function clearVars(ctx, chatId) {\n  await ctx.db.update(chats).set({ variableValues: null }).where(chatId);\n}\n",
      },
      why: "the live `chats.variableValues` pair — a whole FLUSH and a CLEAR. Both replace, so there is nothing to clobber; the gate judges the STRADDLE, never the replace on its own",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/roster.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\nexport async function b(ctx, chatId) {\n  const nextMetadata = await build(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: nextMetadata }).where(chatId);\n}\n",
      },
      why: "the live `chats.metadata` family — seven writers, every one of them computed off a loaded row. Uniformly key-wise, so it never enters the straddle set",
    },
    {
      files: {
        "packages/db/src/schema/preset.ts": 'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/update.ts":
          "export async function upd(ctx, patch, id) {\n  await ctx.db.update(presets).set({ config: patch.config }).where(id);\n}\n",
      },
      why: "DECLARED LIMIT — a SINGLE-writer column is never judged. A lone whole-replace is the normal, correct shape for a column only one verb owns; the defect needs a second writer to clobber",
    },
    {
      files: {
        "packages/db/src/schema/preset.ts": 'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/create.ts":
          "export async function make(ctx, input, id) {\n  const row = await loadPreset(ctx, id);\n  await ctx.db.insert(presets).values({ config: input.config });\n  await ctx.db.update(presets).set({ config: { ...row.config, seen: true } }).where(1);\n}\n",
      },
      why: "DECLARED LIMIT — an `.insert().values()` is CREATION, not a patch: there is no stored value to clobber, so it never counts as a writer for the straddle test",
    },
    {
      files: {
        "packages/db/src/schema/settings.ts": 'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearTheme(ctx, id) {\n  await ctx.db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id);\n}\nexport async function writeAll(ctx, id) {\n  const row = await loadSettings(ctx, id);\n  await ctx.db.update(userSettings).set({ config: { ...row.config } }).where(id);\n}\n",
      },
      why: "the live `userSettings.config` SQL-side merge. Conformance caught the first draft of this row: the taint test cannot see through SQL TEXT, so `json_set` read as a whole-replace and falsely straddled the sibling. The classifier now recognises a `sql` tagged template that interpolates a COLUMN reference as the read it is. DECLARED LIMIT — that is a SHAPE test, not SQL comprehension: a `sql` template that genuinely overwrites the column without reading it would be misread as key-wise",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row !== undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  }\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      why: "THE LIVE CORRECT SHAPE (`writeUserConfig`): the guard is nested inside an EARLIER statement — an ABSENT row is a legitimate first write with nothing to lose — and that still DOMINATES the write. A strict CFG dominance test would red this correct code, which is why the rule is 'the guard's own top-level statement precedes the write's'",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearSelectedThemeIds(db, ids, at) {\n  await db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme.selectedThemeId', json('null'))`, updatedAt: at }).where(inArray(sel, ids));\n}\n",
      },
      why: "THE BRIEF'S OWN mustPass (theme-queries.ts:154): a key-wise `json_set` heal READS the stored value SQL-side and replaces nothing, so it is not a whole-replace writer and owes no guard. ARM B judges the REPLACE, never the merge",
    },
    {
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function ensureUserSettings(db, ownerId, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config: DEFAULT_USER_SETTINGS, updatedAt: at }).onConflictDoNothing();\n}\n",
      },
      why: "DECLARED LIMIT, ARM B: a `.values()` insert with `onConflictDoNothing` is CREATION — it cannot overwrite an existing blob, so it owes no guard (the live `ensureUserSettings` seed). Only `onConflictDoUpdate`'s `set` object crosses into replace territory",
    },
    {
      files: {
        "packages/db/src/schema/character.ts":
          'export const characters = sqliteTable("characters", {\n  extensions: text("extensions", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/server/src/domain/character/persistence/queries.ts":
          "export async function writeExtensions(db, id, extensions) {\n  await db.update(characters).set({ extensions }).where(eq(characters.id, id));\n}\n",
      },
      why: "DECLARED LIMIT, ARM B: an ordinary json column is NOT a versioned-config column — `$type<Record<string, unknown>>` names no `defineVersionedConfig` owner, so its whole-replace writers owe nothing here. The obligation is DERIVED from the primitive, never from a path or a column-name list",
    },
    {
      files: {
        "packages/db/src/schema/settings.ts":
          'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      why: "THE ANCHOR GUARD, ARM B: no contracts package in this mini-project, so the owned-type derivation is legitimately EMPTY (§4.5) — the blindness tripwire stays silent and the same unguarded writer that reds the row above passes here. A `scope.kind` check could not tell these two apart",
    },
  ],
};
