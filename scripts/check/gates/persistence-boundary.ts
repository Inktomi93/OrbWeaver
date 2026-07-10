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
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

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
    "library sort/view/filter-chip/bulk-mode browse prefs — per-device LIST chrome, not a synced " +
    "setting (a returning user on another device does not expect their tag-filter to follow; " +
    "FINAL-Character §4/§12.1)",
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

interface FactorySite {
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

/** Every persist-factory call site in one file (name + location). */
function factorySitesOf(sf: SourceFile, rel: string): FactorySite[] {
  const sites: FactorySite[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = persistedNameOf(call);
    if (name !== undefined) {
      sites.push({ name, file: rel, line: call.getStartLineNumber() });
    }
  }
  return sites;
}

function rawStorageViolations(sf: SourceFile, rel: string): Violation[] {
  const violations: Violation[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (STORAGE_IDENTIFIER_RE.test(id.getText())) {
      violations.push({ file: rel, line: id.getStartLineNumber(), message: RAW_STORAGE_MESSAGE });
    }
  }
  return violations;
}

export const persistenceBoundary: Check = {
  name: "persistence-boundary",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    const sites: FactorySite[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = clientRel(sf.getFilePath());
      if (rel === undefined) {
        continue;
      }
      if (!RAW_STORAGE_ALLOWLIST.has(rel)) {
        violations.push(...rawStorageViolations(sf, rel));
      }
      sites.push(...factorySitesOf(sf, rel));
    }
    for (const site of sites) {
      if (site.name in DEVICE_LOCAL_REGISTRY) {
        continue;
      }
      violations.push({
        file: site.file,
        line: site.line,
        message: `${UNREGISTERED_MESSAGE_PREFIX}"${site.name}" — register it in scripts/check/gates/persistence-boundary.ts`,
      });
    }
    const seen = new Set(sites.map((s) => s.name));
    for (const registered of Object.keys(DEVICE_LOCAL_REGISTRY)) {
      if (!seen.has(registered)) {
        violations.push({
          file: "scripts/check/gates/persistence-boundary.ts",
          line: 1,
          message: `${STALE_REGISTRY_MESSAGE_PREFIX}"${registered}" — scripts/check/gates/persistence-boundary.ts`,
        });
      }
    }
    return violations;
  },
};
