import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TEST_FILE_REGEX = /\.(test|spec)\.tsx?$/;

export const gate: GateDescriptor = {
  name: "no-mint-via-cast",
  docRow: "Spine-TypeScript-and-Patterns.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "castId(<generator>) MINTS an id by laundering a fresh value through the RE-BRAND helper — castId is for re-branding a value that already IS an id, NEVER for minting. Mint with mintTypeId(ID_PREFIX.x) (TypeID) or newId<T>() (nanoid) from @orb/kit/ids so the value matches typeIdSchema at the wire. See Spine-TypeScript-and-Patterns.md.",
  scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/") || TEST_FILE_REGEX.test(p)),
  kinds: [SyntaxKind.CallExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (expr.getText() !== "castId") {
      return;
    }

    const args = node.getArguments();
    if (args.length !== 1) {
      return;
    }

    const arg = args[0];
    if (!Node.isCallExpression(arg)) {
      return;
    }

    const argExpr = arg.getExpression().getText();
    const bannedGenerators = ["crypto.randomUUID", "randomUUID", "nanoid", "createId", "uuidv4", "uuidV4", "uuid"];

    if (bannedGenerators.includes(argExpr)) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "castId with randomUUID",
      files: `
        const id = castId(crypto.randomUUID());
      `,
    },
    {
      why: "castId with nanoid",
      files: `
        const id = castId<UserId>(nanoid());
      `,
    },
  ],
  mustPass: [
    {
      why: "castId with valid variable",
      files: `
        const id = castId<UserId>(row.id);
      `,
    },
    {
      why: "castId with generator in tests",
      files: {
        "src/foo.test.ts": "const id = castId(nanoid());",
      },
    },
  ],
};
