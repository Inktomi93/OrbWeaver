// Gate: knob-wire-coverage (D107) — the declared-knob-is-wired ratchet. A settings field/section/leaf, an
// `AppSettings` admin-editor key, a `DEFAULT_FORMAT_STRINGS` format string, or a `chatMetadataSchema` field
// that validates + stores but is never WRITTEN or never READ is a DEAD SWITCH: an edit silently governs
// nothing (the rateLimits dead-ended-pair, the permanently-OFF memory.enabled, the read-by-nobody
// dupThreshold). Six arms share ONE reconcile skeleton over one two-map registry — DOORWAY
// (sanctioned-indefinite rebuild seam, cited) and DEFERRED (tracked debt, cited) — both self-cleaning in
// BOTH directions (the D50 bus-coverage discipline): a member absent from both maps with no wire is
// MISSING-RED; a member that GAINED its wire but still carries an entry is STALE-RED; an entry naming a
// member that no longer exists is ORPHAN-RED. Every member source is found BY SYMBOL NAME project-wide
// (never a file path — path-keyed-gates-die-on-rename), each with a paired-anchor rename tripwire that REDs
// loudly instead of going vacuous-green. Whole-project ts-morph run; the founding registry + full spec:
// docs/reviews/stickler/2026-07-25-knob-drift-gates.md; ruling: Core-Path-Registry.md D107;
// Spine-Config-and-Serialization.md §"Settings / config".
import type { ObjectLiteralExpression, Project, SourceFile, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

// ── the two-map registry (keyed "<arm>:<member>") ───────────────────────────────────────────────────────
// DOORWAY = a SANCTIONED, indefinitely-dormant rebuild seam a purged/future domain will graft onto (never
// re-litigated, only stale-checked). DEFERRED = TRACKED DEBT with a remediation cite. Delete an entry the
// moment its wire lands (the gate REDs the stale entry). Founding set verified against the live tree
// 2026-07-25 (docs/reviews/stickler/2026-07-25-knob-drift-gates.md §7 "Founding entries").
const DOORWAY: Record<string, string> = {
  // F: read-live at entry/compose/chat.ts (meta.providerRouting → RouteChatAssignment) but NO verb/router
  // writes it — domain/connection/verbs/resolve-chat.ts's header says the middle hop is "intentionally NOT
  // wired". A per-chat connection-overlay writer is the intended graft (D107; audit Q2).
  "F:providerRouting:write": 'resolve-chat.ts "intentionally NOT wired" + D107 (audit Q2) — a per-chat connection-overlay writer is the future graft.',
  // NOTE: `roleDefaults.agent` (the buddy-rebuild seam) needs NO entry — "agent" is a GENERIC leaf name, so
  // arm C's documented name-keyed lenience (a generic name passes on any unrelated `"agent"` occurrence)
  // lets it through; only a distinctively-named dead leaf ever bites. Listing it would be a permanent stale.
};

const DEFERRED: Record<string, string> = {
  // A: resolved (env floor ⊕ admin override) but READ by no server behavior outside the resolver.
  "A:importSkipCharacters":
    "D107 triage — resolved env-floor list read by no import behavior; remediation = domain/import consumes getEffectiveConfig().importSkipCharacters.",
  "A:allowNonOwnerLocalCompute":
    "D107 triage — resolved compute-permission read by no behavior outside the resolver; remediation = the non-owner local-compute gate reads getEffectiveConfig().allowNonOwnerLocalCompute.",
  // B: a USER_SETTINGS_SECTIONS member with no reachable section-patch write path — its schema defaults are
  // pinned for every user (the memory.enabled class: a master switch nobody can flip). memory + worldInfo
  // WIRED 2026-07-25 (Phase B ①/②, the settings-section contribution seam: features/chat's
  // memory-settings-section writes section:"memory"; features/world-info's world-info-settings-section
  // writes section:"worldInfo") — entries pruned. workloads WIRED 2026-07-26 (Phase B ⑤: features/workloads'
  // workloads-tuning-section writes section:"workloads" — dupThreshold/computeThemesK/maxPairs/hubFraction).
  "B:profile":
    "D107 — the settings-wiring remediation program (profile.avatarAssetId is live-read but the section has zero writers; the user's own avatar is unsettable).",
  "B:groupDefaults":
    "D107 audit Q1 — READ half wired 2026-07-25 (start-chat seeds metadata.group when the creator's defaults deviate); the section-patch WRITE path (a groupDefaults editor) rides the settings-wiring program.",
  // B2: an AppSettings admin-editor key with no write field in the admin surfaces. memoryDefaults +
  // memorySummarizer + rateLimits WIRED 2026-07-26 (Phase B ③: features/user-admin's memory-tuning-section +
  // rate-limits-section write them through the admin pane's settings-section seam) — entries pruned.
  "B2:importSkipCharacters": "D107 — the admin-editor wave of the settings-wiring program (verified UI-less 2026-07-25: zero admin-surface write field).",
  // C: a settings schema leaf READ by nothing — dead from the schema down. personaWizardSeen DELETED
  // 2026-07-26 (Phase B ⑥ / D107): the first-run persona gate triggers on zero personas, never a "seen" flag,
  // so the field was removed (the rateLimits.general dead-field precedent) — entry pruned with the field.
};

// ── member-source symbols + their paired-anchor rename tripwires ─────────────────────────────────────────
// If the companion anchor identifier is present in the tree but the member-source symbol is NOT, the source
// was renamed away → RED loudly (never a vacuous green). Content-guarded so synthetic mini-trees can't
// misfire (the verify-registry-parity arm-2 pattern).
const SETTINGS_CONTRACTS = /\/packages\/contracts\/src\/settings\/index\.ts$/u;
const PRESET_CONTRACTS = /\/packages\/contracts\/src\/preset\/index\.ts$/u;

const EFFECTIVE_APP_CONFIG = "EffectiveAppConfig";
const APP_SETTINGS_SCHEMA = "appSettingsSchema";
const USER_SETTINGS_SECTIONS = "USER_SETTINGS_SECTIONS";
const DEFAULT_FORMAT_STRINGS = "DEFAULT_FORMAT_STRINGS";
const CHAT_METADATA_SCHEMA = "chatMetadataSchema";

// Companion anchors (present ⇒ the member source MUST be findable, else the source was renamed away).
const ANCHOR_GET_EFFECTIVE_CONFIG = "getEffectiveConfig";
const ANCHOR_UPDATE_SECTION = "updateUserSettingsSection";
const ANCHOR_PRESET_SCHEMA = "presetSchema";
const ANCHOR_PARSE_METADATA = "parseChatMetadata";

// ── scopes ──────────────────────────────────────────────────────────────────────────────────────────────
const SERVER_SRC = /\/packages\/server\/src\//u;
// Arm A: the resolver (a function returning EffectiveAppConfig) DEFAULTS every field off an AppSettings
// receiver — its reads are AppSettings-typed, never EffectiveAppConfig-typed, so type-keying already
// excludes it from the consumer set; the config-cache APPLICATION seam (reloadEffectiveConfig rebinding
// live subsystems, e.g. logger.level = resolved.logLevel) is a GENUINE consumer and stays IN scope. So arm
// A needs no path exclusion — the type-key is the whole filter (deviation from the spec's broad
// domain/settings/** exclusion: that hid the load-bearing logLevel application; verified 2026-07-25).
const CLIENT_SERVER_UI_SRC = /\/packages\/(?:server|client|ui)\/src\//u;
const CLIENT_SRC = /\/packages\/client\/src\//u;
const ENTRY_SCOPE = /\/packages\/server\/src\/entry\//u;
const CONTRACTS_SRC = /\/packages\/contracts\/src\//u;
// Arm B2: the admin write surfaces (settings + user-admin feature dirs).
const ADMIN_SURFACES = /\/packages\/client\/src\/features\/(?:settings|user-admin)\//u;
// Arm F: metadata WRITE scope (verbs + tRPC routers); the parser file is excluded from the READ scope.
const CHAT_WRITE_SCOPE = /\/packages\/server\/src\/(?:domain\/chat\/verbs|transport\/trpc)\//u;
const METADATA_PARSER = /\/packages\/server\/src\/domain\/chat\/contract\/metadata\.ts$/u;

const TEST_FILE_RE = /\.test\.tsx?$/u;

function isTest(fp: string): boolean {
  return TEST_FILE_RE.test(fp);
}

// ── generic helpers ─────────────────────────────────────────────────────────────────────────────────────
function findFile(project: Project, re: RegExp): SourceFile | undefined {
  return project.getSourceFiles().find((sf) => re.test(sf.getFilePath()));
}

/** Does any file in the project mention `ident` as a bare identifier (the companion-anchor presence
 *  check)? Content-guarded so a synthetic tree lacking the anchor never activates the tripwire. */
function identifierPresent(project: Project, ident: string): boolean {
  for (const sf of project.getSourceFiles()) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === ident) {
        return true;
      }
    }
  }
  return false;
}

/** The property names of the object literal passed to the LAST `z.object({...})` chain a declaration owns,
 *  by variable OR interface name. Used to read appSettingsSchema keys + the metadata schema keys. */
function zObjectKeys(sf: SourceFile, varName: string): string[] {
  const decl = sf.getVariableDeclaration(varName);
  if (decl === undefined) {
    return [];
  }
  for (const call of decl.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const ex = call.getExpression();
    if (Node.isPropertyAccessExpression(ex) && ex.getName() === "object") {
      const arg = call.getArguments()[0];
      if (arg !== undefined && Node.isObjectLiteralExpression(arg)) {
        return arg.getProperties().flatMap((p) => (Node.isPropertyAssignment(p) ? [p.getName()] : []));
      }
    }
  }
  return [];
}

/** The string-array-literal members of an `as const` tuple declaration (USER_SETTINGS_SECTIONS). */
function tupleMembers(sf: SourceFile, varName: string): string[] {
  const decl = sf.getVariableDeclaration(varName);
  const arr = decl?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  if (arr === undefined) {
    return [];
  }
  return arr.getElements().flatMap((el) => (Node.isStringLiteral(el) ? [el.getLiteralText()] : []));
}

/** The property names of an exported `interface` declaration (EffectiveAppConfig). */
function interfaceKeys(sf: SourceFile, name: string): string[] {
  const iface = sf.getInterface(name);
  if (iface === undefined) {
    return [];
  }
  return iface.getProperties().map((p) => p.getName());
}

/** The property names of the const object literal a variable declaration owns (DEFAULT_FORMAT_STRINGS). */
function constObjectKeys(sf: SourceFile, varName: string): string[] {
  const decl = sf.getVariableDeclaration(varName);
  const obj = decl?.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  if (obj === undefined) {
    return [];
  }
  return obj.getProperties().flatMap((p) => (Node.isPropertyAssignment(p) ? [p.getName()] : []));
}

// ── reader corpora ──────────────────────────────────────────────────────────────────────────────────────
/** Every property name READ off a receiver whose TYPE symbol (or alias symbol) is `typeName`, in files the
 *  `inScope` predicate accepts. Type-keyed (ctx.checker via ts-morph .getType()) so an unrelated `.rateLimits`
 *  on some other object never counts. */
function typedReadNames(project: Project, typeName: string, inScope: (fp: string) => boolean): Set<string> {
  const out = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (!inScope(sf.getFilePath())) {
      continue;
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      const t: Type = pa.getExpression().getType();
      const sym = t.getSymbol() ?? t.getAliasSymbol();
      if (sym?.getName() === typeName) {
        out.add(pa.getName());
      }
    }
  }
  return out;
}

/** Accumulate names one file contributes, per a per-file collector, over the files `inScope` accepts. */
function collectNames(project: Project, inScope: (fp: string) => boolean, per: (sf: SourceFile, out: Set<string>) => void): Set<string> {
  const out = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (inScope(sf.getFilePath())) {
      per(sf, out);
    }
  }
  return out;
}

/** One file's read-shaped names: PropertyAccess name · BindingElement (binding/property) name · string
 *  ElementAccess literal · bare string literal (catches dynamic `MAP[key]` where key is a string-union
 *  literal, e.g. DEFAULT_FORMAT_STRINGS[key: "continueNudge"|…]). Comments are never those node kinds. */
function collectReadShaped(sf: SourceFile, out: Set<string>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    out.add(pa.getName());
  }
  for (const be of sf.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    const nn = be.getNameNode();
    if (Node.isIdentifier(nn)) {
      out.add(nn.getText());
    }
    const pn = be.getPropertyNameNode();
    if (pn !== undefined && Node.isIdentifier(pn)) {
      out.add(pn.getText());
    }
  }
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const a = ea.getArgumentExpression();
    if (a !== undefined && Node.isStringLiteral(a)) {
      out.add(a.getLiteralText());
    }
  }
  for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    out.add(lit.getLiteralText());
  }
}

/** Read-shaped name occurrences (name-keyed, documented lenience — bus-coverage/arm-C posture). */
function readShapedNames(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, collectReadShaped);
}

/** The `section:` literal a `section`-named PropertyAssignment (`section: "x"`) or PropertySignature
 *  (`readonly section: "x"`) declares — both are live call-site shapes; anything else contributes nothing. */
function literalText(node: Node | undefined): string | undefined {
  return node !== undefined && Node.isStringLiteral(node) ? node.getLiteralText() : undefined;
}

function sectionLiteralOf(node: Node): string | undefined {
  if (Node.isPropertyAssignment(node) && node.getName() === "section") {
    return literalText(node.getInitializer());
  }
  const tn = Node.isPropertySignature(node) && node.getName() === "section" ? node.getTypeNode() : undefined;
  return tn !== undefined && Node.isLiteralTypeNode(tn) ? literalText(tn.getLiteral()) : undefined;
}

/** Every `section: "<x>"` literal in the scope (arm B write-path corpus). */
function sectionLiterals(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, (sf, out) => {
    for (const node of [...sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment), ...sf.getDescendantsOfKind(SyntaxKind.PropertySignature)]) {
      const s = sectionLiteralOf(node);
      if (s !== undefined) {
        out.add(s);
      }
    }
  });
}

/** Any occurrence of a name (identifier or string literal) in the scope — arm B2 write presence + arm F
 *  write/read presence (name-keyed presence, the contract-verb-presence posture). */
function anyNameOccurrences(project: Project, inScope: (fp: string) => boolean): Set<string> {
  return collectNames(project, inScope, (sf, out) => {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      out.add(id.getText());
    }
    for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
      out.add(lit.getLiteralText());
    }
  });
}

// ── the per-arm reconcile ───────────────────────────────────────────────────────────────────────────────
const MISSING = (armMember: string, detail: string): string =>
  `knob-wire-coverage[${armMember}]: ${detail} — a declared knob wired to nothing is a dead switch (an edit silently governs nothing). Wire the missing half, or add a cited DEFERRED (tracked debt) / DOORWAY (sanctioned rebuild seam) entry in scripts/check/gates/knob-wire-coverage.ts. Spine-Config-and-Serialization.md §7.2; Core-Path-Registry.md D107; docs/reviews/stickler/2026-07-25-knob-drift-gates.md.`;
const STALE = (armMember: string): string =>
  `knob-wire-coverage[${armMember}]: this member GAINED its wire but still carries a DOORWAY/DEFERRED entry — delete the stale entry in scripts/check/gates/knob-wire-coverage.ts (a self-cleaning ratchet, both directions; Core-Path-Registry.md D107).`;
const ORPHAN = (armMember: string): string =>
  `knob-wire-coverage[${armMember}]: a DOORWAY/DEFERRED entry names a member that no longer exists (renamed/deleted) — drop the entry in scripts/check/gates/knob-wire-coverage.ts (Core-Path-Registry.md D107).`;
const TRIPWIRE = (source: string, anchor: string): string =>
  `knob-wire-coverage: the ${anchor} companion anchor is present but the ${source} member source is not — it was renamed away, so the arm would go vacuous-green. Re-point the member source in scripts/check/gates/knob-wire-coverage.ts (path-keyed-gates-die-on-rename; Core-Path-Registry.md D107).`;

/** One arm's declarative spec: how to key its registry entries, its member set, its wired-predicate, and
 *  its per-member MISSING detail. `report` is the finding-anchor file. */
type ArmSpec = {
  readonly report: string;
  readonly keyOf: (member: string) => string;
  readonly members: readonly string[];
  readonly isWired: (member: string) => boolean;
  readonly detailOf: (member: string) => string;
};

type ArmResult = { readonly violations: readonly Violation[]; readonly liveKeys: readonly string[] };

/** One arm's reconcile: MISSING when unwired + uncited; STALE when wired + cited; the live registry keys
 *  it owns (for the ORPHAN pass). ORPHAN is judged once per loaded source by the caller. */
function runArm(spec: ArmSpec): ArmResult {
  const violations: Violation[] = [];
  const liveKeys: string[] = [];
  for (const member of spec.members) {
    const key = spec.keyOf(member);
    liveKeys.push(key);
    const cited = key in DOORWAY || key in DEFERRED;
    const wired = spec.isWired(member);
    if (!(wired || cited)) {
      violations.push({ file: spec.report, line: 1, message: MISSING(key, spec.detailOf(member)) });
    }
    if (wired && cited) {
      violations.push({ file: spec.report, line: 1, message: STALE(key) });
    }
  }
  return { violations, liveKeys };
}

// Real-tree sentinels: live registry keys the REAL member sources always produce (a stable member no
// remediation deletes). ORPHAN (a registry key naming a member that vanished) is judged ONLY when a
// sentinel is present — a synthetic conformance mini-tree (its own tiny member set) omits every sentinel,
// so it never orphan-flags the real founding entries (the verify-registry-parity real-root-guard pattern).
const REAL_TREE_SENTINELS: readonly string[] = ["B:routing", "A:corpusAutoindex", "E:wiFormat", "F:group:read"];

/** ORPHAN check: every registry key with a loaded arm-prefix must name a real live member — guarded on a
 *  real-tree sentinel so a synthetic tree never fires it. */
function orphanCheck(armPrefixes: readonly string[], liveKeys: ReadonlySet<string>): Violation[] {
  if (!REAL_TREE_SENTINELS.some((s) => liveKeys.has(s))) {
    return [];
  }
  const out: Violation[] = [];
  for (const key of [...Object.keys(DOORWAY), ...Object.keys(DEFERRED)]) {
    if (armPrefixes.some((p) => key.startsWith(p)) && !liveKeys.has(key)) {
      out.push({ file: "scripts/check/gates/knob-wire-coverage.ts", line: 1, message: ORPHAN(key) });
    }
  }
  return out;
}

/** A member-source tripwire: the companion anchor is present but the source symbol vanished → RED.
 *  `sourceMissing` = the member set came back empty (the source symbol wasn't found). */
type Tripwire = { readonly sourceMissing: boolean; readonly anchor: string; readonly source: string; readonly report: string };
function tripwireViolation(project: Project, tw: Tripwire): readonly Violation[] {
  return tw.sourceMissing && identifierPresent(project, tw.anchor) ? [{ file: tw.report, line: 1, message: TRIPWIRE(tw.source, tw.anchor) }] : [];
}

const SETTINGS_REPORT = "packages/contracts/src/settings/index.ts";
const PRESET_REPORT = "packages/contracts/src/preset/index.ts";
const METADATA_REPORT = "packages/server/src/domain/chat/contract/metadata.ts";

/** Arms A/B/B2/C — all sourced from the settings contracts module. */
function settingsArms(project: Project, settings: SourceFile): ArmResult & { readonly tripwires: readonly Violation[] } {
  const fields = interfaceKeys(settings, EFFECTIVE_APP_CONFIG);
  const sections = tupleMembers(settings, USER_SETTINGS_SECTIONS);
  const appKeys = zObjectKeys(settings, APP_SETTINGS_SCHEMA);
  const leaves = settingsLeaves(settings, new Set(sections));

  const consumed = typedReadNames(project, EFFECTIVE_APP_CONFIG, (fp) => SERVER_SRC.test(fp) && !isTest(fp));
  const written = sectionLiterals(project, (fp) => (CLIENT_SRC.test(fp) || ENTRY_SCOPE.test(fp)) && !isTest(fp));
  const adminWritten = anyNameOccurrences(project, (fp) => ADMIN_SURFACES.test(fp) && !isTest(fp));
  const readNames = readShapedNames(project, (fp) => CLIENT_SERVER_UI_SRC.test(fp) && !SETTINGS_CONTRACTS.test(fp) && !isTest(fp));

  const arms: ArmResult[] = [
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `A:${m}`,
      members: fields,
      isWired: (m) => consumed.has(m),
      detailOf: (m) => `EffectiveAppConfig.${m} is resolved (env floor ⊕ admin override) but READ by no server behavior`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `B:${m}`,
      members: sections,
      isWired: (m) => written.has(m),
      detailOf: (m) => `USER_SETTINGS_SECTIONS "${m}" has no reachable section-patch write path (client or compose seed)`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `B2:${m}`,
      members: appKeys,
      isWired: (m) => adminWritten.has(m),
      detailOf: (m) => `appSettingsSchema key "${m}" has no write field in the admin surfaces (features/settings ∪ user-admin)`,
    }),
    runArm({
      report: SETTINGS_REPORT,
      keyOf: (m) => `C:${m}`,
      members: leaves,
      isWired: (m) => readNames.has(m),
      detailOf: (m) => `settings schema leaf "${m}" is READ by nothing — the knob is dead from the schema down (the dupThreshold class)`,
    }),
  ];
  const tripwires = [
    ...tripwireViolation(project, {
      sourceMissing: fields.length === 0,
      anchor: ANCHOR_GET_EFFECTIVE_CONFIG,
      source: EFFECTIVE_APP_CONFIG,
      report: SETTINGS_REPORT,
    }),
    ...tripwireViolation(project, {
      sourceMissing: sections.length === 0,
      anchor: ANCHOR_UPDATE_SECTION,
      source: USER_SETTINGS_SECTIONS,
      report: SETTINGS_REPORT,
    }),
  ];
  return { violations: arms.flatMap((a) => a.violations), liveKeys: arms.flatMap((a) => a.liveKeys), tripwires };
}

/** Arm E — DEFAULT_FORMAT_STRINGS read coverage. */
function presetArm(project: Project, preset: SourceFile): ArmResult & { readonly tripwires: readonly Violation[] } {
  const keys = constObjectKeys(preset, DEFAULT_FORMAT_STRINGS);
  // Read-shaped (PropertyAccess) OR string-literal (catches DEFAULT_FORMAT_STRINGS[key] dynamic reads).
  const read = readShapedNames(project, (fp) => SERVER_SRC.test(fp) && !CONTRACTS_SRC.test(fp) && !isTest(fp));
  const arm = runArm({
    report: PRESET_REPORT,
    keyOf: (m) => `E:${m}`,
    members: keys,
    isWired: (m) => read.has(m),
    detailOf: (m) => `DEFAULT_FORMAT_STRINGS.${m} is an editable/importable format string READ by no server behavior — a lie to the user and the ST importer`,
  });
  return {
    ...arm,
    tripwires: tripwireViolation(project, {
      sourceMissing: keys.length === 0,
      anchor: ANCHOR_PRESET_SCHEMA,
      source: DEFAULT_FORMAT_STRINGS,
      report: PRESET_REPORT,
    }),
  };
}

/** Arm F — chatMetadataSchema write+read coverage (two directions). */
function metadataArm(project: Project, metadata: SourceFile): ArmResult & { readonly tripwires: readonly Violation[] } {
  const keys = zObjectKeys(metadata, CHAT_METADATA_SCHEMA);
  const written = anyNameOccurrences(project, (fp) => CHAT_WRITE_SCOPE.test(fp) && !isTest(fp));
  const read = readShapedNames(project, (fp) => SERVER_SRC.test(fp) && !METADATA_PARSER.test(fp) && !CHAT_WRITE_SCOPE.test(fp) && !isTest(fp));
  const write = runArm({
    report: METADATA_REPORT,
    keyOf: (m) => `F:${m}:write`,
    members: keys,
    isWired: (m) => written.has(m),
    detailOf: (m) => `chatMetadataSchema.${m} has no write verb (domain/chat/verbs ∪ transport/trpc) — a metadata field whose documentation lies`,
  });
  const readBelt = runArm({
    report: METADATA_REPORT,
    keyOf: (m) => `F:${m}:read`,
    members: keys,
    isWired: (m) => read.has(m),
    detailOf: (m) => `chatMetadataSchema.${m} is never READ outside the parser + write scope — dead parse weight`,
  });
  return {
    violations: [...write.violations, ...readBelt.violations],
    liveKeys: [...write.liveKeys, ...readBelt.liveKeys],
    tripwires: tripwireViolation(project, {
      sourceMissing: keys.length === 0,
      anchor: ANCHOR_PARSE_METADATA,
      source: CHAT_METADATA_SCHEMA,
      report: METADATA_REPORT,
    }),
  };
}

function reconcile(ctx: Pick<GateRunCtx, "project">): Violation[] {
  const project = ctx.project;
  const settings = findFile(project, SETTINGS_CONTRACTS);
  const preset = findFile(project, PRESET_CONTRACTS);
  const metadata = findFile(project, METADATA_PARSER);

  const violations: Violation[] = [];
  const liveKeys = new Set<string>();
  const orphanPrefixes: string[] = [];

  if (settings !== undefined) {
    const r = settingsArms(project, settings);
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("A:", "B:", "B2:", "C:");
  }
  if (preset !== undefined) {
    const r = presetArm(project, preset);
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("E:");
  }
  if (metadata !== undefined) {
    const r = metadataArm(project, metadata);
    violations.push(...r.violations, ...r.tripwires);
    for (const k of r.liveKeys) {
      liveKeys.add(k);
    }
    orphanPrefixes.push("F:");
  }

  // ORPHAN: judged only for arms whose source loaded (a synthetic tree omitting a source must not
  // orphan-flag every one of its keys).
  violations.push(...orphanCheck(orphanPrefixes, liveKeys));
  return violations;
}

/** Arm C leaves: every `z.object({...})` PropertyAssignment name in the settings contracts module, minus
 *  the section names and `schemaVersion`. Name-keyed (documented lenience — a generic-named leaf passes on
 *  an unrelated read). */
/** The object literal a `z.object({...})` CallExpression declares, else undefined. */
function zObjectArg(call: Node): ObjectLiteralExpression | undefined {
  const ex = Node.isCallExpression(call) ? call.getExpression() : undefined;
  const isZObject = ex !== undefined && Node.isPropertyAccessExpression(ex) && ex.getName() === "object";
  const arg = isZObject && Node.isCallExpression(call) ? call.getArguments()[0] : undefined;
  return arg !== undefined && Node.isObjectLiteralExpression(arg) ? arg : undefined;
}

function settingsLeaves(settings: SourceFile, sections: ReadonlySet<string>): string[] {
  const leaves = new Set<string>();
  for (const call of settings.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const obj = zObjectArg(call);
    if (obj === undefined) {
      continue;
    }
    for (const p of obj.getProperties()) {
      const n = Node.isPropertyAssignment(p) ? p.getName() : undefined;
      if (n !== undefined && !sections.has(n) && n !== "schemaVersion") {
        leaves.add(n);
      }
    }
  }
  return [...leaves];
}

export const gate: GateDescriptor = {
  name: "knob-wire-coverage",
  docRow: "Core-Enforcement-Active-Gates.md (Core-Path-Registry.md D107)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a declared knob is wired to nothing — a settings field/section/leaf, an AppSettings admin-editor key, a format string, or a chat-metadata field that validates and stores but is never written or never read is a dead switch: edits silently change nothing (the rateLimits/memory.enabled/dupThreshold classes). Wire the missing half, or add a cited DEFERRED (tracked debt) / DOORWAY (sanctioned rebuild seam) entry. Spine-Config-and-Serialization.md §7.2; Core-Path-Registry.md D107; docs/reviews/stickler/2026-07-25-knob-drift-gates.md.",
  fix: "wire the consumer/writer the arm names, or add the cited registry entry; a stale entry (member gained its wire) must be deleted in the same change.",
  run: (ctx) => {
    for (const v of reconcile(ctx)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      // Arm A: an EffectiveAppConfig field with no typed server consumer + no entry.
      files: {
        "packages/contracts/src/settings/index.ts": "export interface EffectiveAppConfig {\n  ghostA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts": "export const getEffectiveConfig = 1;\nexport const q = 2;\n",
      },
      expect: { messageIncludes: "READ by no server behavior" },
      why: "arm A: an EffectiveAppConfig field resolved but read by no server behavior (the rateLimits dead-ended-pair)",
    },
    {
      // Arm B: a USER_SETTINGS_SECTIONS member with no section-patch write.
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["ghostB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { messageIncludes: "no reachable section-patch write path" },
      why: "arm B: a section member with no client section-patch and no compose seed writer (the memory.enabled class)",
    },
    {
      // Arm B2: an appSettingsSchema key with no admin-surface write field.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = z.object({ ghostB2: z.boolean() });\n',
        "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
      },
      expect: { messageIncludes: "no write field in the admin surfaces" },
      why: "arm B2: an AppSettings key absent from every admin write surface (a UI-less AppSettings)",
    },
    {
      // Arm C: a settings leaf read by nothing.
      files: {
        "packages/contracts/src/settings/index.ts":
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = ["workloads"] as const;\nexport const s = z.object({ ghostLeaf: z.number() });\n',
        "packages/server/src/domain/x/x.ts": "export const unrelated = 1;\n",
      },
      expect: { messageIncludes: "dead from the schema down" },
      why: "arm C: a distinctively-named settings leaf with no read-shaped occurrence anywhere (the dupThreshold class)",
    },
    {
      // Arm E: a DEFAULT_FORMAT_STRINGS key read by no server behavior.
      files: {
        "packages/contracts/src/preset/index.ts": 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { ghostNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts": "export const somethingElse = 1;\n",
      },
      expect: { messageIncludes: "READ by no server behavior" },
      why: "arm E: an editable/importable format string nothing reads — a lie to the user and the ST importer",
    },
    {
      // Arm F: a chatMetadataSchema key with no write verb (and no read) — the write arm fires.
      files: {
        "packages/server/src/domain/chat/contract/metadata.ts":
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ ghostMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const noWrite = 1;\n",
      },
      expect: { messageIncludes: "no write verb" },
      why: "arm F (write): a metadata field with no verb/router writer — the toolRecurseLimit class, its documentation lies",
    },
    {
      // STALE: a member that IS wired but STILL carries a founding DEFERRED entry. The proof MUST borrow a
      // member that is a LIVE DEFERRED key in this file's map above — a synthetic tree can't inject into the
      // gate's own module-level DEFERRED, so it references a surviving entry. `B:profile` is that key (the
      // profile section has no writer yet). A tree whose ONLY section is `profile`, WITH a section:"profile"
      // write, makes it wired+cited → STALE. (No real-tree sentinel is present, so ORPHAN stays quiet —
      // ORPHAN's bite is proven live on the real tree, the bus-coverage-twin pattern.)
      // NEXT PRUNER: if you delete B:profile, repoint this fixture at another SURVIVING DEFERRED "B:" key
      // (else this stale bite-proof goes vacuous — expected a finding but gets 0).
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["profile"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const w = { section: "profile", patch: {} };\n',
      },
      expect: { messageIncludes: "GAINED its wire but still carries" },
      why: "STALE: the founding DEFERRED B:profile member gains a section-patch writer → its stale entry must be deleted (the ratchet, self-cleaning both directions)",
    },
    {
      // TRIPWIRE: the updateUserSettingsSection anchor present but USER_SETTINGS_SECTIONS renamed away.
      files: {
        "packages/contracts/src/settings/index.ts": "export const RENAMED_SECTIONS = [] as const;\nexport const x = 1;\n",
        "packages/client/src/features/x/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { messageIncludes: "was renamed away" },
      why: "the paired-anchor tripwire: the companion anchor is present but the member source symbol vanished — RED loudly, never vacuous-green",
    },
  ],
  mustPass: [
    {
      // Arm A: a typed consumer reads the field → passes.
      files: {
        "packages/contracts/src/settings/index.ts": "export interface EffectiveAppConfig {\n  wiredA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ wiredA: 1 });\nexport const use = getEffectiveConfig().wiredA;\n',
      },
      why: "arm A: a compose consumer reads the field off an EffectiveAppConfig-typed receiver — real consumption, passes",
    },
    {
      // Arm B: a client section-patch writes the member → passes.
      files: {
        "packages/contracts/src/settings/index.ts": 'export const USER_SETTINGS_SECTIONS = ["wiredB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredB", patch: {} };\n',
      },
      why: 'arm B: a client mutation writes section:"wiredB" — the write path exists, passes',
    },
    {
      // Arm E: the format string is read (PropertyAccess) → passes; the dynamic-key form also passes.
      files: {
        "packages/contracts/src/preset/index.ts": 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { wiredNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts":
          "declare const cfg: { formatStrings?: { wiredNudge?: string } };\nexport const v = cfg.formatStrings?.wiredNudge;\n",
      },
      why: "arm E: a server behavior reads cfg.formatStrings.wiredNudge — the belt is satisfied, passes",
    },
    {
      // Arm F: a verb writes the key AND a consumer reads it → both sub-belts pass.
      files: {
        "packages/server/src/domain/chat/contract/metadata.ts":
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ wiredMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { wiredMeta: 1 };\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { wiredMeta?: number };\nexport const r = meta.wiredMeta;\n",
      },
      why: "arm F: a verb writes wiredMeta and the engine reads it — both write and read belts satisfied, passes",
    },
  ],
};
