// Policy: persisted-store-registry (UI-Theming-and-Content.md §12.1, UI-Gates-and-Lessons.md §11.5) — the
// REGISTRY half of the old `persistence-boundary` module, split off because its authority is different.
// Every `createPersistedStore` / `createEntityDraftStore` call site must name a store the tree has already
// decided is legitimately DEVICE-local; a new persisted name is a deliberate act reviewed against §12.1
// ("would a user expect this to follow them across devices? then it belongs in the synced user_settings
// blob, and this is the wrong tool").
//
// DEVICE_LOCAL_REGISTRY IS AUTHORITATIVE DATA, NOT AN EXEMPTION TABLE (exception census: "14 device-local
// store identities" under hard policy and authoritative runtime data). It is the ruling itself — which
// state the tree decided is per-device — so it stays in the module as typed rows carrying their `why`,
// and the policy is HARD: the escape is re-deciding §12.1 for that store, never a comment at the call
// site. The raw-storage half, whose six file rows ARE recurring permissions, is `persistence-boundary`.
//
// TWO-SIDED, and the second side needs the whole client tree: a registered name with no call site left is
// a STALE row. That arm is gated on a real-tree anchor which is deliberately NOT a factory home — gating a
// row's staleness on the door being loaded would silence it inside every proof that resolves the door,
// which is exactly the mode-(B) blind spot §4.4a names.
//
// IDENTITY, NOT SPELLING: the factory is the EXPORTED DECLARATION in its own home, resolved through the
// shared project-home reader, so `createPersistedStore` imported under an alias is the same call and a
// same-named local function is not. The legacy check compared the callee's text. The home itself is bound
// through `ctx.files` and receipted: if either door moves or stops exporting its factory, the receipt
// REFUSES the run rather than reporting a silent zero.
//
// THE DOOR READING IS FAIL-CLOSED, AND THAT IS A THIRD ARM RATHER THAN AN ATTRIBUTION (#2022).
// `classifyProjectHomeOrigin` answers three ways and the door read is the ACCUSING direction — a `home`
// verdict is what makes a call a tracked persist mint — so the original `=== "home"` on both doors dropped an
// UNREADABLE callee out of the policy entirely and the store it persists was never judged against
// DEVICE_LOCAL_REGISTRY. That is the fail-open shape the three-answer classifier exists to prevent
// (`lib/origin-verdict.ts`, GATE-AUTHORING §5, #944), and it is the opposite of the ACQUITTING readers §4.6
// warns not to "fix": here only a PROVEN verdict accuses. It is NOT collapsed into either known door, because
// the door decides WHICH ARGUMENT holds the store name (bare arg 0 vs the draft factory's options bag), so an
// attribution-by-rule would read the wrong argument and emit the store-NAME refusal — an accusation about a
// name when the unknown is the DECLARATION, and a hard policy's message is a fix instruction. An unresolved
// fact stays its own arm rather than being folded into a resolved one, and it carries DISJOINT TEXT so a proof
// row can discriminate it by `messageIncludes` (§4.1).
//   PROVEN FIRST, unreadable only as a fallback: an absent home file makes EVERY callee `unreadable` for that
//   door, so checking the unreadable fallback before the sibling door's `home` would swallow a proven draft
//   mint whenever the persist home is out of the fileset.
//   FAIL-CLOSURE IS SAFE ONLY BEHIND THE NAME PREFILTER, and `FACTORY_NAMES`/`referenceNamesExport` still runs
//   BEFORE the first identity read in `factoryDoor` — keep it there. Applied to every CallExpression in the
//   client tree instead, fail-closure converts each unreadable callee into an accusation; that is measured, not
//   hypothetical (`lib/origin-verdict.ts` records `new TRPCError` accused of being node's `EventEmitter`).
//   Widening the candidate set without widening the prefilter turns this policy into an accusation machine.
//   `seen` is deliberately NOT harvested from an unreadable door: guessing the argument shape to salvage a name
//   would let a wrong guess ADD a name that suppresses a genuine STALE row — a fail-open on the other side of
//   this same module. An unreadable door leaves the stale arm at its safe over-reporting default; the run is
//   already red at the door, and the fix is to give the call a readable origin.
//
// §4.6 SPLIT DIFFERENTIAL (#2000, committed at `tests/tooling/verify/gates/split-arm-parity.test.ts`).
// LEGACY-SIDE COVERAGE, read first: the unregistered-name arm 2 of the parent's 5 examples; the STALE arm
// ZERO, because the legacy `finalize` self-guarded on `create-persisted-store.ts` being loaded and NO
// legacy example loads it. Its successor proof is therefore CONSTRUCTED, not replayed. Two classified
// differences, both invisible to a replay and both measured:
//   1. ANCHOR MOVE. Legacy gated staleness on the PERSIST DOOR; this policy gates on `main.tsx` (the
//      mode-(B) note above). So a doors-only fileset fires all 14 rows in legacy and none here. With each
//      engine's own anchor present the two verdicts are identical, including the one-name-persisted arm.
//   2. IDENTITY, NOT TEXT. Replaying the legacy rows over a fileset WITHOUT the factory home makes this
//      policy REFUSE (`persisted-store-registry/receipt`) where legacy reported — the designed answer, not
//      a lost catch. With the door present the catch is byte-identical, the ALIAS spelling is a catch the
//      conversion ADDED, and a same-named LOCAL function is a legacy false positive this policy drops.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import type { LocatedProjectHome } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { readStaticString } from "../lib/reference-fact.ts";

const PERSISTED_STORE_HOME = { path: "packages/client/src/state/create-persisted-store.ts", names: ["createPersistedStore"] } as const;
const ENTITY_DRAFT_HOME = { path: "packages/client/src/state/create-entity-draft-store.ts", names: ["createEntityDraftStore"] } as const;
/** The real-tree anchor for the stale arm — never a factory home (see the header's mode-(B) note). */
const STALE_ARM_ANCHOR = "packages/client/src/main.tsx";
const FACTORY_POPULATION = "persist store factories";

/** One device-local ruling. Deliberately NOT the legacy `ExemptionTable`: that type conflates allowlists,
 *  sanctioned homes and deferred debt, and these rows are none of those — they are the §12.1 decision that
 *  this state is per-device rather than synced. */
interface DeviceLocalClassification {
  readonly why: string;
}

/** Every persisted-store NAME the tree has ruled legitimately DEVICE-local, with its rationale. A new
 *  `createPersistedStore` / `createEntityDraftStore` name lands here IN THE SAME COMMIT. */
export const DEVICE_LOCAL_REGISTRY: Readonly<Record<string, DeviceLocalClassification>> = {
  shell: { why: "panel dock/collapse + active section — per-device layout chrome (§12.1 carve-out)" },
  "active-chat": {
    why:
      "the room currently open in this browser — per-device navigation continuity across reloads, never " +
      "shared chat state or a preference that should move another device's screen",
  },
  "composer-draft": {
    why:
      "unsent composer text per room, so a refresh/crash/tab-restore does not eat a message the user typed " +
      "(owner pick 2026-08-09). DEVICE-local on purpose: a half-written line is a THIS-tab artifact, and " +
      "syncing it would make two open devices fight over one composer — the user_settings blob is for " +
      "settled preferences, not for keystrokes (it also writes on every keypress, traffic that blob must " +
      "never carry). Bounded + sanitized at the persist seam (empty drafts dropped, MRU-capped) because a " +
      "scopeKey→text map is unbounded by construction",
  },
  "character-library": {
    why:
      "library sort/view/filter-chip/bulk-mode/spoiler-blur browse prefs — per-device LIST/editor chrome, " +
      "not a synced setting (a returning user on another device does not expect their tag-filter OR their " +
      "screen-share spoiler-blur to follow; FINAL-Character §4/§6.1/§12.1)",
  },
  "surface-box": {
    why:
      "the last SETTLED body height of each SURFACE (home's tiles first, the rpg HUD's waystone band since " +
      "#149 — it was keyed `home-tile-box` until #258 renamed it to what it holds), so a loading skeleton " +
      "reserves the box its content will occupy on the next boot (F14 boot-CLS: the tiles grew out of a " +
      "fixed 3-row skeleton and pushed the grid down +189px). A measurement of THIS device's viewport, " +
      "never a user preference — syncing one device's pixel heights to another would reserve the wrong " +
      "box (§12.1)",
  },
  "appearance-boot": {
    why:
      "the BOOT HINT for the four synced appearance axes a first paint needs — `appearance.reducedMotion` " +
      "(#188 N-1), `appearance.fontScale`, `appearance.density` and the selected theme's `[data-theme]` value " +
      "(#231). A CACHE over the confirmed server rows, the `character-card`/`preset-config` precedent, never " +
      "their home: the prefs stay in the user_settings blob and the server value always wins. It exists only " +
      "because none of them can be stamped until `getUserSettings` (and, for the theme, the CHAINED " +
      "`getTheme`) resolves, while the boot veil animates (two over-budget frames) and the shell takes its " +
      "first layout ~1.2s earlier — measured: the veil drops frames the motion pref would have silenced, " +
      "`--font-scale` re-flows every rem-derived shell dimension for a boot CLS of 0.20-0.34 at scale 1.25, " +
      "and a Light user cold-loads the dark palette then swaps. Read synchronously before React mounts, " +
      "written back only from the authoritative read, and an axis this device has never been told stamps " +
      "NOTHING (a fresh device boots exactly as it does today)",
  },
  "deployment-boot": {
    why:
      "the BOOT HINT for the deployment CAPABILITIES a first paint must answer — `multiHumanCapable` today " +
      "(#476). Device-local because it is not a preference at all: it is this browser's memory of what THIS " +
      "deployment last served at `/api/auth/config`, a CACHE over a server-derived per-request value (the " +
      "`appearance-boot` precedent), and it could not live in the synced user_settings blob even in " +
      "principle — that blob is read through tRPC, strictly later than the fetch this hint exists to cover. " +
      "It exists because `/api/auth/config` is fetched at app-root MOUNT, so a capability-gated slot reads " +
      "FALSE for the first frames of every boot and then mounts INTO the layout (measured on the topbar-trail " +
      "bell: 0.00015 layout shift, under the `[cls]` flagger's own reporting floor — that bell lost its gate " +
      "with #1627, and its two surviving readers are the /join dialog and the cast bar's People section). " +
      "A RENDER hint only, never an " +
      "authorization input: it decides whether a slot is drawn, while every read and verb behind that slot " +
      "still answers to the real config and the server's gates. The server value always wins the instant it " +
      "lands (so a capability flip corrects rather than being masked), and a device that has never been told " +
      "holds null — the pre-existing floor, i.e. exactly today's first-ever-visit behavior",
  },
  "config-group-open": {
    why: "which Configuration-roster GROUPS are expanded — a per-device working posture (a wide screen holds two libraries open where a laptop holds one), never a preference a user expects to follow them across devices; the `character-library` browse-prefs precedent (§12.1). Groups start COLLAPSED by owner ruling, so an absent entry is the honest default, not a lost setting",
  },
  "chat-context-sections": {
    why:
      "which sections of the 'This chat' CONTEXT tab are expanded (#830) — a per-device working posture " +
      "on THIS screen, exactly the `config-group-open` precedent (§12.1): a phone's fold is 300px shorter " +
      "than a desktop's, so 'Lorebooks open, Host controls closed' must not follow a user across devices. " +
      "Sparse by construction (only sections the user explicitly toggled), so an absent entry is the " +
      "section's own default, not a lost setting",
  },
  "tag-library": {
    why:
      "the tag roster's SORT MODE (most-used / A–Z / manual) in the Configuration workspace — a browse " +
      "posture on THIS screen, the `character-library` browse-prefs precedent (§12.1). It is not a synced " +
      "preference: 'I'm scanning alphabetically right now' does not follow a user to another device, and it " +
      "writes on every dropdown change, which is traffic the user_settings blob should not carry",
  },
  "recent-models": {
    why:
      "the per-source Recent-models MRU in the connections model picker — 'what I recently picked on THIS " +
      "machine' is a convenience affordance, never synced routing truth (the actual selection persists " +
      "server-side via the routing autosave form; CONNECTIONS-BUILD-SPEC §3 / §12.1)",
  },
  "character-card": {
    why:
      "the character-card editor's crash-survival draft (#73, CRITICAL tier) — an in-progress edit to " +
      "long free-text prose is THIS device's unsaved keystrokes, never a synced preference; it is CACHE " +
      "over the confirmed server row (baseline-hash-gated, cleared on save), not settled state",
  },
  "preset-config": {
    why:
      "the preset editor's crash-survival draft (#73, HIGH tier) — an in-progress multi-section prompt " +
      "edit is THIS device's unsaved keystrokes, never a synced preference; CACHE over the confirmed " +
      "server row (baseline-hash-gated, cleared on save), not settled state",
  },
  "world-info-entry": {
    why:
      "the lorebook entry editor's crash-survival draft (#73, HIGH tier) — an in-progress entry edit is " +
      "THIS device's unsaved keystrokes, never a synced preference; CACHE over the confirmed server row " +
      "(baseline-hash-gated, cleared on save), not settled state",
  },
};

const MESSAGE =
  "a persisted store name that is not in DEVICE_LOCAL_REGISTRY — a new device-local persist is a " +
  "deliberate act (UI-Theming-and-Content.md §12.1). Register the name with its why-device-local " +
  "rationale in tooling/src/verify/gates/persisted-store-registry.ts, or home the preference in the " +
  "synced user_settings blob instead.";
const FIX = "register the store name with a §12.1 rationale, or move the preference into the synced user_settings blob.";
const UNREADABLE_NAME =
  "a persist-factory call whose store NAME cannot be read statically — the registry ratchet cannot judge a name the workspace cannot resolve, so the call is reported rather than silently admitted.";
/** The FAIL-CLOSED DOOR arm's own text. Deliberately shares no sentence with `MESSAGE` or `UNREADABLE_NAME`:
 *  an unreadable message built from another one is a substring of both and neither arm is then pinnable by
 *  `messageIncludes` (§4.1). "FACTORY DECLARATION this run cannot read" appears here and nowhere else. */
const UNREADABLE_DOOR =
  "a call that SPELLS a persist-store factory but whose FACTORY DECLARATION this run cannot read — nothing " +
  "reachable declares it, so the call MIGHT enter createPersistedStore or createEntityDraftStore under a store " +
  "name no §12.1 ruling covers, and it is reported rather than admitted as an unjudged device-local persist " +
  "(GATE-AUTHORING §5, #944). Give the call a readable origin — import the factory from its home in " +
  "packages/client/src/state/ — and re-run; a same-named function that provably declares something else stays silent.";
const staleMessage = (name: string): string =>
  `DEVICE_LOCAL_REGISTRY names "${name}" but no createPersistedStore/createEntityDraftStore call site persists it — the ruling now classifies nothing, and a classification that outlives its subject is exactly the two-sided rot the ratchet exists to catch. Delete the stale row in tooling/src/verify/gates/persisted-store-registry.ts.`;

/** `createEntityDraftStore({ name: "<name>", … })` — the draft factory takes its name off an options bag. */
function draftStoreNameArgument(argument: MorphNode): MorphNode | undefined {
  if (!Node.isObjectLiteralExpression(argument)) {
    return;
  }
  const property = argument.getProperty("name");
  return Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

type FactoryDoor = "persisted" | "draft";
/** THREE answers, never two (`lib/origin-verdict.ts`, GATE-AUTHORING §5, #944): the callee enters a KNOWN
 *  door, or its declaration cannot be read at all. `undefined` stays reserved for "provably not this call". */
type DoorReading = FactoryDoor | "unreadable";

/** Every name a factory call could be SPELLED with — the prefilter that keeps the origin read off every
 *  call expression in the client tree. It follows import aliases and immutable const hops, so an aliased
 *  `createPersistedStore as persist` still names its export. Measured: resolving unfiltered cost 59 s over
 *  1,313 files, the same per-file prefilter lesson the composed baseline records. */
const FACTORY_NAMES: readonly string[] = [...PERSISTED_STORE_HOME.names, ...ENTITY_DRAFT_HOME.names];

/** Which persist door does this callee ENTER — by declaration, never by the name it is spelled with? The NAME
 *  PREFILTER runs FIRST and must stay first: fail-closure below is only safe inside a candidate set that
 *  already spells a factory (header). Proven doors are answered before the unreadable fallback, so an absent
 *  home file cannot swallow the sibling door's proven mint. */
function factoryDoor(callee: MorphNode, persisted: LocatedProjectHome, draft: LocatedProjectHome): DoorReading | undefined {
  if (!FACTORY_NAMES.some((name) => referenceNamesExport(callee, name))) {
    return;
  }
  const persistedVerdict = classifyProjectHomeOrigin(callee, persisted);
  if (persistedVerdict === "home") {
    return "persisted";
  }
  const draftVerdict = classifyProjectHomeOrigin(callee, draft);
  if (draftVerdict === "home") {
    return "draft";
  }
  return persistedVerdict === "unreadable" || draftVerdict === "unreadable" ? "unreadable" : undefined;
}

/** The static store NAME a factory call persists under, or undefined when it cannot be read. */
function persistedStoreName(call: MorphNode, door: FactoryDoor): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return;
  }
  const nameNode = door === "persisted" ? argument : draftStoreNameArgument(argument);
  if (nameNode === undefined) {
    return;
  }
  const name = readStaticString(nameNode);
  return name.kind === "resolved" ? name.value : undefined;
}

export const gate = defineGate({
  id: "persisted-store-registry",
  family: "persistence-boundary",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const persistedHome = locateProjectHome(ctx.files, ctx.relativePath, PERSISTED_STORE_HOME);
    const draftHome = locateProjectHome(ctx.files, ctx.relativePath, ENTITY_DRAFT_HOME);
    const seen = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            const callee = Node.isCallExpression(node) ? node.getExpression() : undefined;
            const door = callee === undefined ? undefined : factoryDoor(callee, persistedHome, draftHome);
            if (callee === undefined || door === undefined) {
              return;
            }
            if (door === "unreadable") {
              ctx.report.node(callee, { message: UNREADABLE_DOOR, fix: FIX });
              return;
            }
            const name = persistedStoreName(node, door);
            if (name === undefined) {
              ctx.report.node(callee, { message: UNREADABLE_NAME, fix: FIX });
              return;
            }
            seen.add(name);
            if (!Object.hasOwn(DEVICE_LOCAL_REGISTRY, name)) {
              ctx.report.node(callee, { message: `${MESSAGE} Store: "${name}".`, fix: FIX });
            }
          },
        },
      ],
      evaluate: (): void => {
        ctx.receipt({
          kind: "population",
          source: FACTORY_POPULATION,
          members: persistedHome.members + draftHome.members,
          unresolved: persistedHome.unresolved + draftHome.unresolved,
        });
        // The stale arm is a WHOLE-TREE claim. Without the anchor a fixture (or any partial fileset) would
        // report every registry row as stale — the misfire §4.5 warns about.
        if (!ctx.files.map(ctx.relativePath).includes(STALE_ARM_ANCHOR)) {
          return;
        }
        for (const name of Object.keys(DEVICE_LOCAL_REGISTRY)) {
          if (!seen.has(name)) {
            ctx.report.file(STALE_ARM_ANCHOR, { message: staleMessage(name), fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/x.ts":
          'import { createPersistedStore } from "./create-persisted-store.ts";\nexport const s = createPersistedStore("unregistered-name", () => ({}));\n',
      },
      expect: { count: 1, messageIncludes: "unregistered-name" },
      why: "the founding shape — a persisted store name that no §12.1 ruling covers, so the ratchet has never been asked whether it should be synced",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/x.ts":
          'import { createPersistedStore as persist } from "./create-persisted-store.ts";\nexport const s = persist("unregistered-name", () => ({}));\n',
      },
      expect: { count: 1, messageIncludes: "unregistered-name" },
      why: "THE ALIAS RED: the factory imported under another local name is the same mint. The legacy check compared the callee's TEXT, so every alias left the ratchet silently",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/x.ts":
          'import { createPersistedStore } from "./create-persisted-store.ts";\nexport const s = createPersistedStore("unregistered-name" as string, () => ({}));\n',
      },
      expect: { count: 1, messageIncludes: "unregistered-name" },
      why: 'the wrapped-literal shape (`"name" as string`) the plain StringLiteral reader silently PASSED before hardening — the static reader unwraps the cast',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/x.ts":
          'import { createEntityDraftStore } from "./create-entity-draft-store.ts";\nexport const s = createEntityDraftStore({ name: "unregistered-name" });\n',
      },
      expect: { count: 1, messageIncludes: "unregistered-name" },
      why: "the DRAFT factory takes its name off an options bag — the second door, judged by the same registry",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/main.tsx": "export const boot = null;\n",
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
      },
      expect: { messageIncludes: "classifies nothing" },
      why: "THE STALE ARM, mode (B): the real-tree anchor is loaded and NO call site persists any registered name — a ruling that outlives its subject must RED rather than sit there looking authoritative",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/x.ts": 'declare function opaque(): any;\nexport const s = opaque().createPersistedStore("shell", () => ({}));\n',
      },
      expect: { count: 1, messageIncludes: "FACTORY DECLARATION this run cannot read" },
      why:
        "THE FAIL-CLOSED DOOR ARM (§4.1's reusable falsifier). An opaque `any` receiver gives the callee no symbol and no " +
        'declaration, so BOTH homes answer `unreadable` and the old `=== "home"` attribution dropped the call out of the ' +
        "policy entirely — a persist-factory call the registry ratchet never judged, passing SILENTLY. The store name is the " +
        "REGISTERED `shell` on purpose, so the row cannot pass on the unregistered-name arm: attributing this call to the " +
        "persist door reads `shell`, finds it registered and reports NOTHING, and attributing it to the draft door finds no " +
        "options bag and reports the store-NAME message instead — each mis-attribution kills the row, which is what makes it a " +
        "proof of the third arm rather than of any finding at all",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/state/shell-store.ts":
          'import { createPersistedStore } from "./create-persisted-store.ts";\nexport const s = createPersistedStore("shell", () => ({}));\n',
      },
      why: "a REGISTERED name — the reviewed device-local persist the law wants, with no stale arm because the anchor is absent from this fileset",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/features/x/local.ts":
          'function createPersistedStore(name: string): string {\n  return name;\n}\nexport const s = createPersistedStore("unregistered-name");\n',
      },
      why: "THE COUNTERFACTUAL: a LOCAL function with the factory's name persists nothing, so its caller is not a mint. The legacy text compare accused it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
        "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
        "packages/client/src/features/x/lib/store-factory.ts":
          "export function createPersistedStore(name: string, initial: () => unknown): unknown {\n  return { name, initial };\n}\n",
        "packages/client/src/features/x/lib/consumer.ts":
          'import { createPersistedStore } from "./store-factory.ts";\nexport const s = createPersistedStore("unregistered-name", () => ({}));\n',
      },
      why:
        "THE OTHER POLARITY, pinned so fail-closure cannot become accuse-everything: a factory-named function IMPORTED from a " +
        "feature module resolves to a canonical declaration outside both homes and is PROVEN other, so it stays silent even " +
        "though it spells the factory and persists an unregistered name. It is the MODULE-ALIAS path, the one the local-function " +
        "counterfactual above cannot reach — `bindsProvenNonModuleDeclaration` answers FALSE on an import specifier, so this " +
        "verdict rests entirely on the origin resolver. If that resolver ever stopped reading the shape the verdict would be " +
        "`unreadable` and this row would RED, which is exactly the over-report a fail-closed door risks",
    },
  ],
});
