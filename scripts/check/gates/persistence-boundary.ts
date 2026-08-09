// Gate: persistence-boundary (UI-Theming-and-Content.md §12.1, UI-Arch §5, UI-Gates-and-Lessons.md
// §11.5) — the device-local-vs-synced belt: synced prefs live in the server `user_settings` blob;
// browser storage is for DEVICE-LOCAL transient state only, minted ONLY through the two persist
// factories. Two arms: (1) RAW-STORAGE — a bare localStorage/sessionStorage/indexedDB identifier in
// packages/client/src outside ALLOWLIST is RED. (2) REGISTRY — a ratchet: every persist-factory call site must name a DEVICE_LOCAL_REGISTRY entry.
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
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
  "composer-draft":
    "unsent composer text per room, so a refresh/crash/tab-restore does not eat a message the user typed " +
    "(owner pick 2026-08-09). DEVICE-local on purpose: a half-written line is a THIS-tab artifact, and " +
    "syncing it would make two open devices fight over one composer — the user_settings blob is for " +
    "settled preferences, not for keystrokes (it also writes on every keypress, traffic that blob must " +
    "never carry). Bounded + sanitized at the persist seam (empty drafts dropped, MRU-capped) because a " +
    "scopeKey→text map is unbounded by construction",
  "character-library":
    "library sort/view/filter-chip/bulk-mode/spoiler-blur browse prefs — per-device LIST/editor chrome, " +
    "not a synced setting (a returning user on another device does not expect their tag-filter OR their " +
    "screen-share spoiler-blur to follow; FINAL-Character §4/§6.1/§12.1)",
  "home-tile-box":
    "the last SETTLED body height of each home tile, so the tile's loading skeleton reserves the box its " +
    "content will occupy on the next boot (F14 boot-CLS: the tiles grew out of a fixed 3-row skeleton and " +
    "pushed the grid down +189px). A measurement of THIS device's viewport, never a user preference — " +
    "syncing one device's pixel heights to another would reserve the wrong box (§12.1)",
  "config-group-open":
    "which Configuration-roster GROUPS are expanded — a per-device working posture (a wide screen holds two libraries open where a laptop holds one), never a preference a user expects to follow them across devices; the `character-library` browse-prefs precedent (§12.1). Groups start COLLAPSED by owner ruling, so an absent entry is the honest default, not a lost setting",
  "tag-library":
    "the tag roster's SORT MODE (most-used / A–Z / manual) in the Configuration workspace — a browse " +
    "posture on THIS screen, the `character-library` browse-prefs precedent (§12.1). It is not a synced " +
    "preference: 'I'm scanning alphabetically right now' does not follow a user to another device, and it " +
    "writes on every dropdown change, which is traffic the user_settings blob should not carry",
  "recent-models":
    "the per-source Recent-models MRU in the connections model picker — 'what I recently picked on THIS " +
    "machine' is a convenience affordance, never synced routing truth (the actual selection persists " +
    "server-side via the routing autosave form; CONNECTIONS-BUILD-SPEC §3 / §12.1)",
};

// THE ONE REASON, carrying BOTH source arms by token. The REGISTRY arm's own message folded in here when it
// stopped riding the Finding overload (which bypasses `hasGateIgnore` — GATE-AUTHORING §1 — so a marker
// worked on the raw-storage arm and silently did nothing on this one). The stale-registry arm in `finalize`
// keeps its message: it anchors on the GATE FILE, the sanctioned Finding-overload use.
const RAW_STORAGE_MESSAGE =
  "persistence outside the doors (UI-Theming-and-Content.md §12.1: synced prefs → the server user_settings " +
  "blob; device-local state → createPersistedStore/createEntityDraftStore, which force " +
  "version/partialize/migrate). A `localStorage`/`sessionStorage` token: raw browser storage outside the " +
  "persistence doors — add the file to persistence-boundary.ts's allowlist ONLY with a boot/dev-tooling " +
  'reason. An `unregistered persist "<name>"` token: a persisted store name not in DEVICE_LOCAL_REGISTRY — ' +
  "a new device-local persist is a deliberate act, so register the name with its why-device-local " +
  "rationale, or home the pref in the synced user_settings blob.";

const STALE_REGISTRY_MESSAGE_PREFIX =
  "DEVICE_LOCAL_REGISTRY entry has NO createPersistedStore/createEntityDraftStore call site — delete the stale row in persistence-boundary.ts: ";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

/** `createPersistedStore("<name>", …)` → the name literal (through any as/satisfies/paren wrapper). */
function nameFromPersistedStore(arg: Node | undefined): string | undefined {
  return arg === undefined ? undefined : readStringValue(arg);
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
  return value === undefined ? undefined : readStringValue(value);
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
    if (node.isKind(SyntaxKind.Identifier) && STORAGE_IDENTIFIER_RE.test(node.getText()) && !RAW_STORAGE_ALLOWLIST.has(rel)) {
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
        // The store NAME rides the TOKEN, not a per-finding message: `render.ts` prints the token and
        // never the message when both are present, so the name was already the only rendered half.
        ctx.report(node, { token: `unregistered persist "${name}"`, offset: 0 });
      }
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, PERSIST_DOOR_FILE)) {
      return; // not the real full client tree — the name-keyed stale arm would misfire (§4.4)
    }
    // THE SANCTIONED Finding overload (§1): anchored on the GATE FILE, no source node, and a stale registry
    // row must not be suppressible.
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
      expect: { token: "localStorage" },
      why: "a raw localStorage identifier outside the persistence doors (§12.1)",
    },
    {
      files: 'export const s = createPersistedStore("unregistered-name", () => ({}));\n',
      at: "packages/client/src/state/x.ts",
      expect: { token: 'unregistered persist "unregistered-name"' },
      why: "a persisted store name not in the registry — a new device-local persist is a reviewed act",
    },
    {
      files: 'export const s = createPersistedStore("unregistered-name" as string, () => ({}));\n',
      at: "packages/client/src/state/x.ts",
      expect: { token: 'unregistered persist "unregistered-name"' },
      why: 'the same unregistered name written `"unregistered-name" as string` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED (skipping the ratchet) before hardening',
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
