// Gate: contract-structural-copy (Spine-TypeScript-and-Patterns.md §7.4) — a hand-written object shape in
// server, inference or client code whose own data fields (`MIN_COPY_FIELDS` or more) are a subset of one
// contract export's, with `TYPE_AGREEMENT_FLOOR` of the shared types agreeing. Subjects: interfaces, object-literal
// aliases and inline type literals, exported or local, in every client tier. Skipped: a shape that derives
// (`extends`), `*Props`, callable and indexed-access members. Agreement is the checker's, per field, never type text.
// Reader: `lib/contract-structural-copy.ts`.
// FAMILY `contract-derives-not-respells`: arm C beside the name-collision and table-row arms, split off because it
// needs a wider population, a type graph and ordinary authority. Both read `DOMAIN_CONTRACT_RE` for the domain home.
import type { InterfaceDeclaration, Node, SourceFile, TypeLiteralNode } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { indexByField } from "../../floor/code-facts/shape-copy.ts";
import type { ShapeCopySource as ContractFieldShape, ShapeCopyCandidate as CopyCandidate } from "../../floor/code-facts/shape-copy-contract.ts";
import { defineGate } from "../contract/policy.ts";
import { DOMAIN_CONTRACT_RE } from "../lib/contract-derives-not-respells.ts";
import { bestCopyMatch, candidateFields, contractFields, createFieldAgreement, isAliasBody } from "../lib/contract-structural-copy.ts";

const CONTRACTS_SRC = "packages/contracts/src/";
const INFERENCE_CONTRACT = "packages/inference/src/contract/";
const PROPS_SUFFIX = "Props";

const MESSAGE =
  "hand-written shape re-spells a contract export — its fields are the contract's fields, so a renamed or " +
  "retyped field compiles on both sides and drifts silently. Derive it: import the export, `Pick<Contract, …>`, " +
  "`z.infer`/`z.input<typeof schema>`, or an indexed access per field. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "import or derive the named contract shape instead of declaring the fields. A baselined site is waived with " +
  "`@orb-waive contract-structural-copy(<position>): <reason naming its burn-down item>` on the line above, where " +
  "<position> is the shape's declared name, or for an inline type literal its first field name.";

function isContractHome(rel: string): boolean {
  return rel.startsWith(CONTRACTS_SRC) || rel.startsWith(INFERENCE_CONTRACT) || DOMAIN_CONTRACT_RE.test(rel);
}

interface Candidate extends CopyCandidate {
  readonly anchor: Node;
  readonly token: string;
}

function contractShapesOf(sf: SourceFile, rel: string): ContractFieldShape[] {
  const shapes: ContractFieldShape[] = [];
  for (const [name, decls] of sf.getExportedDeclarations()) {
    for (const decl of decls) {
      if ((N.isInterfaceDeclaration(decl) || N.isTypeAliasDeclaration(decl)) && decl.getSourceFile() === sf) {
        const fields = contractFields(decl);
        if (fields !== undefined) {
          shapes.push({ name, file: rel, decl, fields });
        }
      }
    }
  }
  return shapes;
}

function interfaceCandidate(node: InterfaceDeclaration): Candidate | undefined {
  const name = node.getName();
  if (node.getHeritageClauses().length > 0 || name.endsWith(PROPS_SUFFIX)) {
    return;
  }
  const fields = candidateFields(node);
  return fields === undefined ? undefined : { anchor: node.getNameNode(), token: name, decl: node, fields };
}

function literalCandidate(node: TypeLiteralNode): Candidate | undefined {
  const parent = node.getParent();
  if (N.isTypeAliasDeclaration(parent)) {
    const name = parent.getName();
    const fields = name.endsWith(PROPS_SUFFIX) ? undefined : candidateFields(node);
    return fields === undefined ? undefined : { anchor: parent.getNameNode(), token: name, decl: parent, fields };
  }
  const fields = candidateFields(node);
  const first = node.getProperties()[0];
  return fields === undefined || first === undefined ? undefined : { anchor: first.getNameNode(), token: first.getName(), decl: node, fields };
}

export const gate = defineGate({
  id: "contract-structural-copy",
  family: "contract-derives-not-respells",
  authority: "ordinary",
  severity: "error",
  // Contract homes are read for the index and never judged; ui and kit sit below contracts and cannot import them.
  population: ["@client", "@server", "@inference", "@contracts"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: Candidate[] = [];
    const collect = (candidate: Candidate | undefined): void => {
      if (candidate !== undefined) {
        candidates.push(candidate);
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeLiteral],
          visit: (node, sourceFile): void => {
            if (isContractHome(ctx.relativePath(sourceFile))) {
              return;
            }
            if (N.isInterfaceDeclaration(node)) {
              collect(interfaceCandidate(node));
            } else if (N.isTypeLiteral(node) && (isAliasBody(node) || !N.isTypeAliasDeclaration(node.getParent()))) {
              collect(literalCandidate(node));
            }
          },
        },
      ],
      evaluate: () => {
        const shapes = ctx.files.flatMap((sf) => {
          const rel = ctx.relativePath(sf);
          return isContractHome(rel) ? contractShapesOf(sf, rel) : [];
        });
        ctx.receipt({ kind: "population", source: "contract-export-shapes", members: shapes.length });
        const index = indexByField(shapes);
        const agree = createFieldAgreement("contract-structural-copy", ctx.checker());
        for (const candidate of candidates) {
          const match = bestCopyMatch(candidate, index, agree);
          if (match !== undefined) {
            const relation = match.exact ? "the same fields as" : `${match.shared} of the ${match.contract.fields.size} fields of`;
            ctx.report.node(candidate.anchor, {
              token: candidate.token,
              offset: 0,
              message: `It declares ${relation} \`${match.contract.name}\` (${match.contract.file}), ${match.agreeing} of ${match.shared} types agreeing. ${MESSAGE}`,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/plugin/results.ts":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/client/src/features/plugin/hooks/use-plugin-commands.ts":
          "export interface CommandRow {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
      },
      expect: { count: 1, token: "CommandRow", messageIncludes: "the same fields as `PluginCommandView`" },
      why: "the founding copy: a client interface under a DIFFERENT name declaring exactly a contract export's fields, which the name-collision arm cannot see",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/messages.ts":
          "export interface MessageView {\n  readonly id: string;\n  readonly tokens: number;\n  readonly cost: number;\n  readonly model: string;\n  readonly role: string;\n}\n",
        "packages/server/src/domain/chat/persistence/canon-write.ts":
          "interface VariantEconomics {\n  readonly tokens: number;\n  readonly cost: number;\n  readonly model: string;\n  readonly role: string;\n}\nexport const read = (row: VariantEconomics): number => row.cost;\n",
      },
      expect: { count: 1, token: "VariantEconomics", messageIncludes: "4 of the 5 fields of `MessageView`" },
      why: "a LOCAL hand `Pick`: a proper field subset of a contract export, unexported, in a server domain",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/search/contract/views.ts":
          "export type DiscoverCharacter = {\n  readonly id: string;\n  readonly name: string;\n  readonly avatar: string;\n  readonly tags: readonly string[];\n};\n",
        "packages/client/src/lib/group.ts":
          "export const group = (value: { id: string; name: string; avatar: string; tags: readonly string[] }): string => value.id;\n",
      },
      expect: { count: 1, token: "id", messageIncludes: "`DiscoverCharacter`" },
      why: "an INLINE annotation in a client home tier copying a domain contract alias; `readonly` differences do not hide the copy and the position is the literal's first field",
    },
    {
      mode: "types",
      files: {
        "packages/inference/src/contract/chat.ts":
          "export interface ChatRequest {\n  readonly model: string;\n  readonly prompt: string;\n  readonly maxTokens: number;\n  readonly stream: boolean;\n  readonly seed: number;\n}\n",
        "packages/inference/src/backends/probe.ts":
          "export type ProbeShape = {\n  readonly model: string;\n  readonly prompt: string;\n  readonly maxTokens: number;\n  readonly stream: string;\n  readonly seed: number;\n};\n",
      },
      expect: { count: 1, token: "ProbeShape", messageIncludes: "4 of 5 types agreeing" },
      why: "an object-literal ALIAS in inference copying the package contract with one field retyped: four of five types agree, exactly the 80% floor, so the floor is inclusive",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/settings/view.ts":
          'type Infer<S extends { readonly _output: unknown }> = S["_output"];\ndeclare const settingsSchema: {\n  readonly _output: { id: string; name: string; mode: "fast" | "slow"; enabled: boolean };\n};\nexport type SettingsView = Infer<typeof settingsSchema>;\n',
        "packages/client/src/features/settings/row.ts":
          'type Mode = "fast" | "slow";\nexport interface SettingsRow {\n  readonly id: string;\n  readonly name: string;\n  readonly mode: Mode;\n  readonly enabled: boolean;\n}\n',
      },
      expect: { count: 1, token: "SettingsRow", messageIncludes: "the same fields as `SettingsView`" },
      why: "a CONTRACT WITH NO FIELD NODES: its fields come from a derived type, and the hand copy spells the mode union through an alias, so only resolution sees the copy",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/ids.ts":
          'type TypeIdOf<K extends string> = string & { readonly __kind: K };\nexport type CharacterId = TypeIdOf<"character">;\nexport interface Seat {\n  readonly id: CharacterId;\n  readonly label: string;\n  readonly order: number;\n  readonly muted: boolean;\n}\n',
        "packages/server/src/domain/chat/seat.ts":
          'type TypeIdOf<K extends string> = string & { readonly __kind: K };\nexport interface SeatCopy {\n  readonly id: TypeIdOf<"character">;\n  readonly label: string;\n  readonly order: number;\n  readonly muted: boolean;\n}\n',
      },
      expect: { count: 1, token: "SeatCopy", messageIncludes: "the same fields as `Seat`" },
      why: 'TWO FIELDS THAT AGREE ONLY AFTER ALIAS RESOLUTION: `CharacterId` and `TypeIdOf<"character">` print differently and are one type, which type text cannot see',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/seat.ts":
          "export interface Seat {\n  readonly id: string;\n  readonly label: string;\n  readonly order: number;\n  readonly muted: boolean;\n}\n",
        "packages/client/src/features/chat/seat-copy.ts":
          "export interface SeatCopy {\n  readonly id: string;\n  readonly label?: string;\n  readonly order: number;\n  readonly muted: boolean;\n}\n",
      },
      expect: { count: 1, token: "SeatCopy", messageIncludes: "the same fields as `Seat`" },
      why: "an OPTIONAL field is still the contract's field: `label?: string` and `label: string` differ only in whether undefined is allowed, and the copy drifts the same way",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/seat.ts":
          "type Tag = { readonly value: string };\nexport interface Seat {\n  readonly a: Tag;\n  readonly b: Tag;\n  readonly c: Tag;\n  readonly d: Tag;\n}\n",
        "packages/client/src/features/chat/seat-copy.ts":
          "type Tag = { readonly value: number };\nexport interface SeatCopy {\n  readonly a: Tag;\n  readonly b: Tag;\n  readonly c: Tag;\n  readonly d: Tag;\n}\n",
      },
      why: "SAME NAMES AND SAME TYPE TEXT, DIFFERENT TYPES: two local aliases both called `Tag` print alike and resolve to different object types, so no field agrees",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/seat.ts":
          'export interface Seat {\n  readonly id: string;\n  readonly name: string;\n  readonly mode: "fast" | "slow";\n  readonly size: number;\n}\n',
        "packages/client/src/features/chat/seat-copy.ts":
          "export interface SeatCopy {\n  readonly id: string;\n  readonly name: string;\n  readonly mode: string;\n  readonly size: string;\n}\n",
      },
      why: "SHARED NAMES, DISAGREEING TYPES: a widened union and a retyped number leave two of four fields agreeing, under the floor",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/plugin/results.ts":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/client/src/features/plugin/a.ts":
          "export interface CommandRowProps {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/client/src/features/plugin/b.ts":
          'import type { PluginCommandView } from "../../../../contracts/src/plugin/results.ts";\nexport interface Extended extends PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n',
        "packages/client/src/features/plugin/c.ts":
          'import type { PluginCommandView } from "../../../../contracts/src/plugin/results.ts";\nexport interface Derived {\n  readonly id: PluginCommandView["id"];\n  readonly name: PluginCommandView["name"];\n  readonly label: string;\n  readonly enabled: boolean;\n}\n',
        "packages/client/src/features/plugin/d.ts":
          "export interface Ops {\n  readonly id: string;\n  readonly name: string;\n  readonly label: () => string;\n  readonly enabled: boolean;\n}\n",
      },
      why: "the skips, one file each: component props by name, an `extends` derive, indexed-access members (two of four derive, leaving too few own fields) and a callable member (behaviour, not data)",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/plugin/results.ts":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/client/src/features/plugin/a.ts":
          "export interface Three {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n}\n",
        "packages/client/src/features/plugin/b.ts":
          "export interface Wider {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n  readonly extra: number;\n}\n",
        "packages/client/src/features/plugin/c.ts":
          "export interface Retyped {\n  readonly id: number;\n  readonly name: number;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
      },
      why: "the match boundaries: three fields is under the floor, a field the contract lacks breaks the subset, and two of four types agreeing is under the 80% floor",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/plugin/results.ts":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/contracts/src/plugin/other.ts":
          "export interface PluginCommandCopy {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/server/src/domain/plugin/contract/views.ts":
          "export interface DomainCopy {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/ui/src/x.ts":
          "export interface UiCopy {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
      },
      why: "contract homes are the index, never candidates, and ui sits below contracts outside the population",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/plugin/results.ts":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
        "packages/client/src/features/plugin/hooks/use-plugin-commands.ts":
          "// @orb-waive contract-structural-copy(CommandRow): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface CommandRow {\n  readonly id: string;\n  readonly name: string;\n  readonly label: string;\n  readonly enabled: boolean;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the position is the shape's declared name, built on the founding one-finding row",
    },
  ],
});
