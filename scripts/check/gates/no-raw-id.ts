// Gate: no-raw-id (Spine-TypeScript-and-Patterns.md §1) — an `*Id` field typed as a bare `z.string()` drops
// the brand that makes FK drift a compile error.
//
// TWO-SIDED (gate-hub #10): the ONE exemption is keyed on a SYMBOL (`triggerFactSchema`, the guest-
// marshalling contract), so its stale arm is symbol existence — if no declaration by that name is left in
// the project, the carve-out is a dead name that silently exempts nothing (and would quietly re-attach if a
// future unrelated declaration reused the name). The arm self-guards on a REAL-TREE ANCHOR (gate-hub #11):
// the kit ids home whose `brandedId` the message prescribes.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const EXEMPT_SYMBOL = "triggerFactSchema";
const GATE_SELF = "scripts/check/gates/no-raw-id.ts";
/** Real-tree anchor (gate-hub #11): the id-brand home this gate's message prescribes. */
const ANCHOR = "packages/kit/src/ids/index.ts";
const STALE_MESSAGE =
  `stale exemption — no \`${EXEMPT_SYMBOL}\` declaration is left in the project, so the guest-marshalling ` +
  "carve-out exempts nothing and would silently re-attach to any future declaration that reuses the name " +
  "(ratchet down): delete it in scripts/check/gates/no-raw-id.ts";

export const gate: GateDescriptor = {
  name: "no-raw-id",
  docRow: "Spine-TypeScript-and-Patterns.md §1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "id field typed as a raw z.string() — use brandedId<T>() (nanoid) or typeIdSchema(ID_PREFIX.x) (TypeID). The brand flows through the contract surface into services + client, so swapping a ChatId for a CharacterId becomes a type error instead of silent FK drift. (Spine-TypeScript-and-Patterns.md §1)",
  kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.PropertySignature],
  visit(node, _sf, ctx): void {
    let nameNode: Node | undefined;
    let valueNode: Node | undefined;

    if (Node.isPropertyAssignment(node)) {
      nameNode = node.getNameNode();
      valueNode = node.getInitializer();
    } else if (Node.isPropertySignature(node)) {
      nameNode = node.getNameNode();
      valueNode = node.getTypeNode();
    }

    if (!(nameNode && valueNode)) {
      return;
    }

    const keyName = nameNode.getText().replace(/['"]/g, "");
    if (!keyName.endsWith("Id")) {
      return;
    }

    // ALLOWLIST — `triggerFactSchema` (contracts/automation). Its ids (chatId, message.authorUserId /
    // characterId, turn.speakerCharacterId, top-level characterId, assetId) are UNBRANDED z.string() BY DESIGN:
    // this schema IS the guest-marshalling contract for the QuickJS plugin realm — a read-only predicate
    // value-bag structure-cloned into an untrusted guest, NOT an FK surface. A branded id would survive the
    // structured-clone as a bare string but LIE about its type across the realm boundary (the
    // tool-schema-no-branded-transform lesson applies to guest-marshalled shapes), and branding a field whose
    // whole point is to cross the membrane as a plain scalar breaks the boundary. Keyed on the enclosing
    // declaration name so the gate stays LIVE for every other id field in the same file.
    if (node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() === EXEMPT_SYMBOL) {
      return;
    }

    const valText = valueNode.getText();
    const isRawString = valText.includes("z.string()");
    const brands = ["brandedId", "typeIdSchema", "castId"];
    const isBranded = brands.some((b) => valText.includes(b));

    if (isRawString && !isBranded) {
      ctx.report(node);
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    const declared = ctx.project.getSourceFiles().some((sf) => sf.getVariableDeclaration(EXEMPT_SYMBOL) !== undefined);
    if (!declared) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_MESSAGE });
    }
  },
  mustFlag: [
    {
      why: "raw string Zod schema for an Id field",
      files: `
        import { z } from "zod";
        const schema = z.object({
          userId: z.string()
        });
      `,
    },
    {
      files: {
        [ANCHOR]: "export const brandedId = null;\n",
        "packages/contracts/src/automation/index.ts": 'import { z } from "zod";\nexport const otherSchema = z.object({});\n',
      },
      expect: { count: 1, messageIncludes: "stale exemption" },
      why: "THE STALE ARM: the anchor (the id-brand home) is loaded and no `triggerFactSchema` declaration exists any more — a symbol-keyed carve-out that names nothing must ratchet down before an unrelated future declaration inherits it",
    },
  ],
  mustPass: [
    {
      why: "branded nanoid",
      files: `
        import { z } from "zod";
        import { brandedId } from "@orb/kit/ids";
        const schema = z.object({
          userId: brandedId<UserId>()
        });
      `,
    },
    {
      why: "non-id field as raw string",
      files: `
        import { z } from "zod";
        const schema = z.object({
          username: z.string()
        });
      `,
    },
    {
      why: "triggerFactSchema guest-marshalled ids are unbranded by design (allowlisted); with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
      files: `
        import { z } from "zod";
        export const triggerFactSchema = z.object({
          chatId: z.string().nullable(),
          assetId: z.string().optional()
        });
      `,
    },
    {
      files: {
        [ANCHOR]: "export const brandedId = null;\n",
        "packages/contracts/src/automation/index.ts":
          'import { z } from "zod";\nexport const triggerFactSchema = z.object({\n  chatId: z.string().nullable(),\n});\n',
      },
      why: "the carve-out STILL EARNED, judged against the real-tree anchor: the guest-marshalling schema exists, so its unbranded ids pass and the stale arm stays quiet",
    },
  ],
};
