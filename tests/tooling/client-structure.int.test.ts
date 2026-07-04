// Self-test for the LIVE `client-structure` gate's ADDED rules (2 mirror, 5 surface-naming, 6 hook/
// anchor-naming, 7 surface-purity) — ported from neo in W1-0c. The gate reads the real feature +
// domain dirs via fs, so it self-tests over a REAL temp-dir fixture tree (root swapped to the temp
// dir), never the real repo, proving each rule FIRES on a violation AND stays clean on a well-formed
// slice. (Rules 1/3/4 — front-door/no-stray-root/buckets — predate W1-0c; the shared
// check-gates.int.test.ts fixture already proves client-structure fires overall.)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { clientStructure } from "../../scripts/check/gates/client-structure.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

// The gate is pure fs over ctx.root — a throwaway in-memory project satisfies the type.
function ctxAt(root: string): CheckContext {
  return { root, project: new Project({ useInMemoryFileSystem: true }) };
}

function withTree(files: Record<string, string>, fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "orb-cstruct-"));
  try {
    // Always give the gate a domain to mirror against + a valid built feature scaffold.
    const all: Record<string, string> = {
      "packages/server/src/domain/character/index.ts": "export const x = 1;\n",
      ...files,
    };
    for (const [rel, text] of Object.entries(all)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, text);
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const F = "packages/client/src/features";
const idx = "export const x = 1;\n";

test("rule 2 — a built feature that mirrors no domain and isn't reserved fires", () => {
  withTree({ [`${F}/nodomain/index.ts`]: idx }, (root) => {
    const v = clientStructure.run(ctxAt(root));
    expect(v.some((x) => x.message.includes("neither a reserved UI-only slice"))).toBe(true);
  });
});

test("rule 2 — a built feature mirroring a real domain is clean", () => {
  withTree({ [`${F}/character/index.ts`]: idx }, (root) => {
    expect(clientStructure.run(ctxAt(root))).toEqual([]);
  });
});

test("rule 2 — a reserved UI-only slice (prompt-manager) is clean", () => {
  withTree({ [`${F}/prompt-manager/index.ts`]: idx }, (root) => {
    expect(clientStructure.run(ctxAt(root))).toEqual([]);
  });
});

test("rule 5 — a surface not ending in -surface.tsx fires", () => {
  withTree(
    { [`${F}/character/index.ts`]: idx, [`${F}/character/surfaces/card.tsx`]: idx },
    (root) => {
      const v = clientStructure.run(ctxAt(root));
      expect(v.some((x) => x.message.includes("end in -surface.tsx"))).toBe(true);
    },
  );
});

test("rule 5 — a correctly-named -surface.tsx is clean", () => {
  withTree(
    { [`${F}/character/index.ts`]: idx, [`${F}/character/surfaces/card-surface.tsx`]: idx },
    (root) => {
      expect(clientStructure.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("rule 5 — app-shell surfaces are exempt from the -surface.tsx naming contract", () => {
  withTree(
    { [`${F}/app-shell/index.ts`]: idx, [`${F}/app-shell/surfaces/rail.tsx`]: idx },
    (root) => {
      expect(clientStructure.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("rule 7 — a surface rendering its own outer Dialog fires (surface purity)", () => {
  withTree(
    {
      [`${F}/character/index.ts`]: idx,
      [`${F}/character/surfaces/edit-surface.tsx`]: "export const E = () => <Dialog>x</Dialog>;\n",
    },
    (root) => {
      const v = clientStructure.run(ctxAt(root));
      expect(v.some((x) => x.message.includes("must not render its own outer Dialog"))).toBe(true);
    },
  );
});

test("rule 7 — a surface composing a Dialog PART (DialogTrigger) is clean (not the bare root)", () => {
  withTree(
    {
      [`${F}/character/index.ts`]: idx,
      [`${F}/character/surfaces/edit-surface.tsx`]:
        "export const E = () => <DialogTrigger>x</DialogTrigger>;\n",
    },
    (root) => {
      expect(clientStructure.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("rule 6 — a hooks/ file not named use-* fires", () => {
  withTree(
    { [`${F}/character/index.ts`]: idx, [`${F}/character/hooks/helpers.ts`]: idx },
    (root) => {
      const v = clientStructure.run(ctxAt(root));
      expect(v.some((x) => x.message.includes("hooks/ files are use-*"))).toBe(true);
    },
  );
});

test("rule 6 — a use-*.ts hook + a .gitkeep in hooks/ are clean", () => {
  withTree(
    {
      [`${F}/character/index.ts`]: idx,
      [`${F}/character/hooks/use-card.ts`]: idx,
      [`${F}/character/hooks/.gitkeep`]: "",
    },
    (root) => {
      expect(clientStructure.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("rule 6 — an anchor without a container-type suffix fires; a -dialog anchor is clean", () => {
  withTree(
    { [`${F}/character/index.ts`]: idx, [`${F}/character/anchors/thing.tsx`]: idx },
    (root) => {
      const v = clientStructure.run(ctxAt(root));
      expect(v.some((x) => x.message.includes("container-type suffix"))).toBe(true);
    },
  );
  withTree(
    { [`${F}/character/index.ts`]: idx, [`${F}/character/anchors/edit-dialog.tsx`]: idx },
    (root) => {
      expect(clientStructure.run(ctxAt(root))).toEqual([]);
    },
  );
});
