// Gate: persistence-boundary (UI-Theming-and-Content.md §12.1 "PERSISTENCE" + UI-Arch §5 +
// UI-Gates-and-Lessons.md §11.5) — the device-local-vs-synced belt. The law: prefs that follow the
// user across devices live in the SERVER `user_settings` blob (settings-domain CRUD); browser storage
// (localStorage/sessionStorage/IndexedDB) is for DEVICE-LOCAL transient state ONLY (panel layout,
// drafts), and even that is minted ONLY through the two persist factories (which force
// version + partialize + total-migrate + the storage-key uniqueness registry). Multi-device
// correctness depends on this line holding: a synced-belonging pref that lands in a device-local
// store silently forks per device and never heals.
//
// TWO ARMS:
//   1. RAW-STORAGE arm: any `localStorage` / `sessionStorage` / `indexedDB` IDENTIFIER (AST — comments
//      don't count) in packages/client/src outside the ALLOWLIST below is RED. The factories are the
//      only persistence doors; a feature that "just needs one flag" uses a persisted store or the
//      synced blob, never a bare setItem.
//   2. REGISTRY arm (ratchet, both directions — the bus-coverage.ts pattern): every
//      `createPersistedStore("<name>", …)` / `createEntityDraftStore({ name: "<name>" … })` call site
//      must name a DEVICE_LOCAL_REGISTRY entry carrying the one-line WHY-device-local rationale —
//      an unregistered name is RED (a new persisted store is a deliberate, reviewed act), and a
//      registry entry with NO call site is RED (stale row — delete it).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC = "/packages/client/src/";

/** Files that may touch raw browser storage (each with its reason — keep this list SHORT). */
const RAW_STORAGE_ALLOWLIST = new Set([
  // the two persistence factories — the doors themselves
  "packages/client/src/state/create-persisted-store.ts",
  "packages/client/src/state/create-entity-draft-store.ts",
  // dev-only probe flag seeded by `pnpm snap --probe` BEFORE the app boots — not app state
  "packages/client/src/lib/probe-mode.ts",
  // the composition root's vite:preloadError reload-once guard — boot machinery, not app state
  "packages/client/src/main.tsx",
]);

const STORAGE_IDENTIFIER_RE = /^(?:localStorage|sessionStorage|indexedDB)$/u;

/** Every persisted-store NAME → why it is legitimately DEVICE-local (not synced). A new
 *  `createPersistedStore`/`createEntityDraftStore` name lands here IN THE SAME COMMIT, with the
 *  rationale reviewed against §12.1 (would a user expect this to follow them across devices? then
 *  it belongs in the synced `user_settings` blob instead, and this is the wrong tool). */
const DEVICE_LOCAL_REGISTRY: Record<string, string> = {
  shell: "panel dock/collapse + active section — per-device layout chrome (§12.1 carve-out)",
  "character-library":
    "library sort/view/filter-chip/bulk-mode/spoiler-blur browse prefs — per-device LIST/editor chrome, " +
    "not a synced setting (a returning user on another device does not expect their tag-filter OR their " +
    "screen-share spoiler-blur to follow; FINAL-Character §4/§6.1/§12.1)",
  "character-card-draft":
    "unsaved character-card editor draft — per-device crash-survival mirror (§13.4 obligation-5), never a " +
    "synced setting; a confirmed Save/Discard clears it (FINAL-Character §6.5)",
  "import-onboarding":
    "the first-run 'bring your SillyTavern stuff over' home-card dismiss — a purely presentational, " +
    "per-device latch (the server userSettings.onboarding namespace carries no import latch; a fresh " +
    "device re-showing the card is acceptable, the sanctioned client-persisted fallback)",
  "recent-models":
    "the per-source Recent-models MRU in the connections model picker — 'what I recently picked on THIS " +
    "machine' is a convenience affordance, never synced routing truth (the actual selection persists " +
    "server-side via the routing autosave form; CONNECTIONS-BUILD-SPEC §3 / §12.1)",
};

const RAW_STORAGE_MESSAGE =
  "raw browser storage outside the persistence doors (UI-Theming-and-Content.md §12.1: synced prefs → " +
  "the server user_settings blob; device-local state → createPersistedStore/createEntityDraftStore, " +
  "which force version/partialize/migrate). Add the file to persistence-boundary.ts's allowlist ONLY " +
  "with a boot/dev-tooling reason.";

const UNREGISTERED_MESSAGE_PREFIX =
  "persisted store name not in DEVICE_LOCAL_REGISTRY (persistence-boundary.ts) — a new device-local " +
  "persist is a deliberate act: register the name with its why-device-local rationale, or home the " +
  "pref in the synced user_settings blob (UI-Theming-and-Content.md §12.1): ";

const STALE_REGISTRY_MESSAGE_PREFIX =
  "DEVICE_LOCAL_REGISTRY entry has NO createPersistedStore/createEntityDraftStore call site — delete " +
  "the stale row in persistence-boundary.ts: ";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

/** `createPersistedStore("<name>", …)` → the name literal. */
function nameFromPersistedStore(arg: Node | undefined): string | undefined {
  if (arg === undefined || !Node.isStringLiteral(arg)) {
    return;
  }
  return arg.getLiteralText();
}

/** `createEntityDraftStore({ name: "<name>", … })` → the name literal. */
function nameFromDraftStore(arg: Node | undefined): string | undefined {
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return;
  }
  const nameProp = arg.getProperty("name");
  if (nameProp === undefined || !Node.isPropertyAssignment(nameProp)) {
    return;
  }
  const value = nameProp.getInitializer();
  if (value === undefined || !Node.isStringLiteral(value)) {
    return;
  }
  return value.getLiteralText();
}

/** The literal name a factory call persists under, or undefined if `call` isn't a factory call. */
function persistedNameOf(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  if (!Node.isIdentifier(callee)) {
    return;
  }
  const first = call.getArguments()[0];
  if (callee.getText() === "createPersistedStore") {
    return nameFromPersistedStore(first);
  }
  if (callee.getText() !== "createEntityDraftStore") {
    return;
  }
  return nameFromDraftStore(first);
}

// TWO arms. RAW-STORAGE (per-Identifier, file-allowlist-scoped) is incremental-safe. REGISTRY (collect
// every persist-factory call site in `visit`, judge in `finalize`): an unregistered name is per-site; a
// stale registry entry (registered but no call site) is a whole-tree claim → finalize, guarded on (a)
// project scope and (b) the persist-factory door file being loaded — a synthetic tree that omits the
// real call sites must not fire the stale arm. The door file is loaded on every real full-tree run.
const PERSIST_DOOR_FILE = "packages/client/src/state/create-persisted-store.ts";
const seenPersistNames = new Set<string>();

export const gate: GateDescriptor = {
  name: "persistence-boundary",
  docRow: "UI-Theming-and-Content.md §12.1 (UI-Gates-and-Lessons.md §11.5)",
  status: "active",
  scopeSafety: "whole-project", // the registry stale arm needs the full tree
  message: RAW_STORAGE_MESSAGE,
  fix: "synced prefs → the server user_settings blob; device-local state → createPersistedStore/createEntityDraftStore (which force version/partialize/migrate).",
  scanRoot: (p) => p.includes("packages/client/src/"),
  kinds: [SyntaxKind.Identifier, SyntaxKind.CallExpression],
  begin: () => {
    seenPersistNames.clear();
  },
  visit: (node, sf, ctx) => {
    const rel = clientRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    // RAW-STORAGE arm: a storage identifier outside the file allowlist.
    if (
      node.isKind(SyntaxKind.Identifier) &&
      STORAGE_IDENTIFIER_RE.test(node.getText()) &&
      !RAW_STORAGE_ALLOWLIST.has(rel)
    ) {
      ctx.report(node, { token: node.getText(), offset: 0 });
      return;
    }
    // REGISTRY arm — collect the factory call site; an unregistered name fires here (per-site).
    if (node.isKind(SyntaxKind.CallExpression)) {
      const name = persistedNameOf(node);
      if (name === undefined) {
        return;
      }
      seenPersistNames.add(name);
      if (!(name in DEVICE_LOCAL_REGISTRY)) {
        ctx.report({
          file: rel,
          line: node.getStartLineNumber(),
          column: node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column,
          message: `${UNREGISTERED_MESSAGE_PREFIX}"${name}" — register it in scripts/check/gates/persistence-boundary.ts`,
          token: `persist "${name}"`,
        });
      }
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, PERSIST_DOOR_FILE)) {
      return; // not the real full client tree — the name-keyed stale arm would misfire (§4.4)
    }
    for (const registered of Object.keys(DEVICE_LOCAL_REGISTRY)) {
      if (!seenPersistNames.has(registered)) {
        ctx.report({
          file: "scripts/check/gates/persistence-boundary.ts",
          line: 1,
          column: 0,
          message: `${STALE_REGISTRY_MESSAGE_PREFIX}"${registered}" — scripts/check/gates/persistence-boundary.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export const x = localStorage.getItem("k");\n',
      at: "packages/client/src/features/x/x.ts",
      expect: { messageIncludes: "raw browser storage" },
      why: "a raw localStorage identifier outside the persistence doors (§12.1)",
    },
    {
      files: 'export const s = createPersistedStore("unregistered-name", () => ({}));\n',
      at: "packages/client/src/state/x.ts",
      expect: { messageIncludes: "not in DEVICE_LOCAL_REGISTRY" },
      why: "a persisted store name not in the registry — a new device-local persist is a reviewed act",
    },
  ],
  mustPass: [
    {
      files: 'export const x = localStorage.getItem("k");\n',
      at: "packages/client/src/main.tsx",
      why: "the composition root — allowlisted for raw storage (boot machinery, not app state)",
    },
    {
      files: 'export const s = createPersistedStore("shell", () => ({}));\n',
      at: "packages/client/src/state/shell-store.ts",
      why: "a REGISTERED persisted store name (shell) — a reviewed device-local persist, passes",
    },
  ],
};
