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
  ],
};
