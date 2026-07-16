import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE_REGEX = /\/packages\/client\/src\//u;
const ALLOWLIST_REGEX = /\/packages\/client\/src\/state\/(?:create-entity-draft-store\.ts|create-persisted-store\.ts)$/u;
const TEST_REGEX = /\.test\.tsx?$/u;

const MESSAGE =
  "raw zustand persist() outside the draft-store factory — persistence footguns (partialize / version+total-migrate / key uniqueness) are baked into createEntityDraftStore; use it (or extend it), never a bare persist. See UI-Gates-and-Lessons.md §11.5.";

export const gate: GateDescriptor = {
  name: "no-raw-zustand-persist",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use createEntityDraftStore or createPersistedStore instead of bare persist().",
  scanRoot: (p) => {
    const path = `/${p}`;
    if (!SCOPE_REGEX.test(path)) {
      return false;
    }
    if (ALLOWLIST_REGEX.test(path) || TEST_REGEX.test(path)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (node.getExpression().getText() === "persist") {
      ctx.report(node, { token: "persist(", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/feature/store.ts",
      why: "bare persist call in client",
    },
  ],
  mustPass: [
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/state/create-persisted-store.ts",
      why: "allowlisted factory",
    },
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/feature/store.test.ts",
      why: "allowlisted test file",
    },
  ],
};
