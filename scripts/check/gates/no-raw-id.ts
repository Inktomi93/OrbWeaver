import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

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
    if (node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() === "triggerFactSchema") {
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
      why: "triggerFactSchema guest-marshalled ids are unbranded by design (allowlisted)",
      files: `
        import { z } from "zod";
        export const triggerFactSchema = z.object({
          chatId: z.string().nullable(),
          assetId: z.string().optional()
        });
      `,
    },
  ],
};
