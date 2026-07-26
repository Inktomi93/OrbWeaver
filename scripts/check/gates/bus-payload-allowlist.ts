// Gate: bus-payload-allowlist (Core-Laws-and-Precedents.md D16) — the FIELD-NAME arm of the bus-payload
// firewall. A bus event is room-public (chat bus fans to every subscriber of an OPEN room) / per-user /
// durable-inbox; D16 requires credentials/secrets be TYPE-LEVEL UNREPRESENTABLE in bus payloads. The
// dep-cruiser `bus-contract-no-credentials` rule shuts the resolve-time path (a bus module can't import the
// secret-bearing `@orb/contracts/credentials` shapes). This gate is the compile-adjacent backstop: it reads
// the DIRECT field names of the bus event UNION members (the named declarations below — NOT transitively
// into referenced shapes like MessageView, which are separately-homed and carry economics/content, not
// secrets) and flags a credential-SMELLING field name. A producer that adds `apiKey`/`password`/`secret`
// to a bus member trips here even if the field's type is an innocent `string`.
//
// SANCTIONED FIELDS: `credentialId` (user-bus `credentialsChanged`) is a branded `UserCredentialId` — an
// ID, not a secret. D16's SAFE pattern is exactly id-only re-read: the subscriber re-reads canon by id,
// never trusting event-carried data. It is listed below with its cite, NOT excused by weakening the word
// predicate.
//
// REAL-PAYLOAD SWEEP (2026-07-17): the four bus unions were swept field-by-field; the ONLY credential-word
// hit in bus scope is `credentialId` (sanctioned). The raw invite `token` lives on REQUEST schemas
// (`redeemInviteSchema`/`previewInviteSchema`, inbound `/join/:token`), never on a bus/notification payload
// (those carry `inviteId`, an id) — so no invite/join token trips this gate. No actual secret-bearing bus
// field exists today; D16 holds.
import type { Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

// The bus event UNION declarations, by their one-home paths. The gate reads these files and picks out the
// named declarations below — it does NOT flag every property in these large contract files.
const BUS_FILES = new Set([
  "packages/contracts/src/chat/bus.ts",
  "packages/contracts/src/user-bus/index.ts",
  "packages/contracts/src/notifications/index.ts",
  "packages/contracts/src/events/index.ts",
  "packages/contracts/src/world-info/index.ts",
]);

// The type-alias / interface declaration names that ARE bus event payload shapes (or their members). A
// field on any of these is on-the-wire. `*Event` interfaces (events/index.ts) + the two union aliases +
// WiBusEvent + the DomainEvent alias. The notification zod schema is matched separately (see below).
const BUS_DECL_NAMES = new Set([
  "ChatBusEvent",
  "UserBusEvent",
  "WiBusEvent",
  "DomainEvent",
  "CharacterUpdatedEvent",
  "AssetCreatedEvent",
  "CrewKeeperRanEvent",
  "CrewEditProposalCreatedEvent",
  "CrewCardProposalCreatedEvent",
  "CrewDirectorPassCompletedEvent",
]);
const NOTIFICATION_SCHEMA_NAME = "notificationEventSchema";

// The credential-smell tokens (lowercased substring match on a field name). `key` catches apiKey/secretKey;
// `credential` catches credentialId (sanctioned below). Substring, not \b-word — camelCase field names have
// no word boundary before an embedded token (`apiKey`, `xApiKey`).
const SMELL_TOKENS = ["secret", "token", "apikey", "password", "credential", "key"] as const;

// Sanctioned field names: a credential-word field that is provably an ID / safe scalar, each with its cite.
// This list is the ONLY sanctioned exit — the predicate is NEVER weakened to let a field through.
const SANCTIONED_FIELDS = new Map<string, string>([
  // user-bus `credentialsChanged.credentialId` — a branded UserCredentialId (an id, not a secret). D16's
  // safe id-only re-read pattern; the subscriber re-reads canon by id. (Core-Laws-and-Precedents.md D16.)
  ["credentialId", "credentialId is a branded UserCredentialId — an id, not a secret (D16 id-only re-read)."],
]);

const MESSAGE =
  "a bus-event payload field name smells like a credential/secret — bus events are room-public / durable " +
  "(D16): credentials/secrets are TYPE-LEVEL UNREPRESENTABLE on the wire. Carry a branded ID and have the " +
  "subscriber re-read canon by id; never place a secret on a bus member. If this field IS a safe id/scalar, " +
  "add it to SANCTIONED_FIELDS with its D-cite — do NOT weaken the predicate. See Core-Laws-and-Precedents.md D16.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The lowercased credential-token a field name matches, or undefined. */
function smellToken(fieldName: string): string | undefined {
  const lower = fieldName.toLowerCase();
  return SMELL_TOKENS.find((t) => lower.includes(t));
}

/** Report a property node whose name smells, unless it is a sanctioned field. */
function checkFieldName(name: string, node: Node, ctx: GateRunCtx): void {
  if (smellToken(name) === undefined || SANCTIONED_FIELDS.has(name)) {
    return;
  }
  ctx.report(node, { token: name, offset: 0 });
}

/** Walk a type node's DIRECT object-literal members (a union arm `{ ... }` or a bare `{ ... }`), reporting
 *  smelly property-signature names. Does NOT descend into referenced type names (MessageView etc.). */
function scanTypeNode(typeNode: Node | undefined, ctx: GateRunCtx): void {
  if (typeNode === undefined) {
    return;
  }
  if (N.isUnionTypeNode(typeNode)) {
    for (const arm of typeNode.getTypeNodes()) {
      scanTypeNode(arm, ctx);
    }
    return;
  }
  if (N.isParenthesizedTypeNode(typeNode)) {
    scanTypeNode(typeNode.getTypeNode(), ctx);
    return;
  }
  if (N.isTypeLiteral(typeNode)) {
    for (const prop of typeNode.getProperties()) {
      checkFieldName(prop.getName(), prop, ctx);
    }
  }
  // A bare TypeReference arm (e.g. `| WiBusEvent`) is scanned via its OWN declaration (WiBusEvent is in
  // BUS_DECL_NAMES) — not descended here, so a referenced non-bus shape is out of scope by design.
}

/** Scan a bus type-alias (`type ChatBusEvent = …`) or interface (`interface CharacterUpdatedEvent { … }`). */
function scanBusDecl(node: Node, ctx: GateRunCtx): void {
  if (N.isTypeAliasDeclaration(node)) {
    scanTypeNode(node.getTypeNode(), ctx);
    return;
  }
  if (N.isInterfaceDeclaration(node)) {
    for (const prop of node.getProperties()) {
      checkFieldName(prop.getName(), prop, ctx);
    }
  }
}

/** Scan the notification zod schema: every `z.object({ … })` arm's property keys are wire fields. */
function scanNotificationSchema(init: Node, ctx: GateRunCtx): void {
  for (const call of init.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(N.isPropertyAccessExpression(callee) && callee.getName() === "object")) {
      continue;
    }
    const [arg] = call.getArguments();
    if (arg === undefined || !N.isObjectLiteralExpression(arg)) {
      continue;
    }
    for (const prop of arg.getProperties()) {
      if (N.isPropertyAssignment(prop) || N.isShorthandPropertyAssignment(prop)) {
        checkFieldName(prop.getName(), prop, ctx);
      }
    }
  }
}

export const gate: GateDescriptor = {
  name: "bus-payload-allowlist",
  docRow: "Core-Laws-and-Precedents.md D16",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "carry a branded id (re-read canon by id) instead of a secret; or, for a proven-safe id/scalar, add the field to SANCTIONED_FIELDS in bus-payload-allowlist.ts with its D-cite.",
  scanRoot: (p) => BUS_FILES.has(p),
  kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.VariableDeclaration],
  visit: (node, sf, ctx) => {
    if (!BUS_FILES.has(relPath(ctx.root, sf.getFilePath()))) {
      return;
    }
    if (N.isTypeAliasDeclaration(node) || N.isInterfaceDeclaration(node)) {
      if (BUS_DECL_NAMES.has(node.getName())) {
        scanBusDecl(node, ctx);
      }
      return;
    }
    if (N.isVariableDeclaration(node) && node.getName() === NOTIFICATION_SCHEMA_NAME) {
      const init = node.getInitializer();
      if (init !== undefined) {
        scanNotificationSchema(init, ctx);
      }
    }
  },
  mustFlag: [
    {
      files: 'export type ChatBusEvent = { type: "x"; chatId: string; apiKey: string };\n',
      at: "packages/contracts/src/chat/bus.ts",
      expect: { messageIncludes: "TYPE-LEVEL UNREPRESENTABLE" },
      why: "a ChatBusEvent member carrying `apiKey` — the exact D16 leak the allowlist forbids",
    },
    {
      files: 'export interface CharacterUpdatedEvent {\n  type: "character.updated";\n  secretToken: string;\n}\n',
      at: "packages/contracts/src/events/index.ts",
      expect: { messageIncludes: "credential/secret" },
      why: "a DomainEvent member interface with a `secretToken` field — flags (interface arm)",
    },
    {
      files:
        'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("invite"), password: z.string() }),\n]);\n',
      at: "packages/contracts/src/notifications/index.ts",
      expect: { messageIncludes: "credential/secret" },
      why: "a notification z.object arm with a `password` key — the zod-schema arm flags too",
    },
  ],
  mustPass: [
    {
      files: 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n',
      at: "packages/contracts/src/user-bus/index.ts",
      why: "`credentialId` is the sanctioned branded-id field (D16 id-only re-read) — passes",
    },
    {
      files: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string; model: string; source: string };\n',
      at: "packages/contracts/src/chat/bus.ts",
      why: "no credential-smell field (model/source/chatId are safe scalars/ids) — passes",
    },
    {
      files: "export interface MessageView {\n  cacheReadTokens: number;\n  maxOutputTokens: number;\n}\n",
      at: "packages/contracts/src/chat/bus.ts",
      why: "MessageView is NOT a bus-union declaration name — its `*Tokens` economics fields are out of scope (not scanned), passes",
    },
    {
      files: "export type SomeOtherThing = { apiKey: string };\n",
      at: "packages/contracts/src/settings/index.ts",
      why: "scope: a non-bus contract file is not scanned at all — passes",
    },
  ],
};
