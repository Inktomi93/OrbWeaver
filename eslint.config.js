// ESLint supplements Biome with maintained plugins and self-contained syntax, scope and parser-checker rules.
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import vitest from "@vitest/eslint-plugin";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import drizzle from "eslint-plugin-drizzle";
import jsxA11y from "eslint-plugin-jsx-a11y";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import reactWebApi from "eslint-plugin-react-web-api";
import reactX from "eslint-plugin-react-x";
import reactNoEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import regexp from "eslint-plugin-regexp";
import tsdoc from "eslint-plugin-tsdoc";
import ts from "typescript";
import tseslint from "typescript-eslint";
import biomeConfig from "./biome.json" with { type: "json" };

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const SOURCE = ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.{ts,tsx}"];
const REACT_SOURCE = ["packages/client/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"];
const BROWSER_MOUNT_SOURCE = ["tests/**/*.tsx", "scripts/**/*.tsx", "playwright/**/*.{ts,tsx}"];
const REACT_TEST_SOURCE = [
  "tests/**/*.ct.tsx",
  "tests/{ui,client,showcase-plugins}/**/_*.tsx",
  "tests/ui/**/*.fixtures.tsx",
  "tests/ui/**/*.stories.tsx",
  "tests/client/**/*.fixtures.tsx",
  "tests/client/**/*-fixtures.tsx",
  "tests/tooling/**/_ct-stories.tsx",
  "tests/support/browser/**/*.tsx",
];
const REACT_HOOK_RULES = {
  ...reactHooks.configs["recommended-latest"].rules,
  "react-hooks/exhaustive-deps": "error",
  "react-hooks/unsupported-syntax": "error",
  "react-hooks/incompatible-library": "warn",
};
const PLAYWRIGHT_TESTS = ["tests/**/*.ct.tsx", "tests/**/*.spec.ts", "tests/e2e/**/*.{ts,tsx}"];
const INTERNAL_MODULE_MOCK_RESTRICTION = {
  selector: String.raw`CallExpression:matches([callee.name=/^(mock|doMock)$/], [callee.property.name=/^(mock|doMock)$/], [callee.property.value=/^(mock|doMock)$/]):matches([arguments.0.type='Literal'][arguments.0.value=/^(@orb\/|#|\.\.?\/)/], [arguments.0.type='ImportExpression'][arguments.0.source.value=/^(@orb\/|#|\.\.?\/)/])`,
  message: "Do not replace internal modules in product tests. Script external execution through the production test root.",
};

const TEST_PROJECTS = ["tsconfig.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"];
const NODE_TOOL_SOURCE = ["*.{ts,mts,cts}", "packages/*/*.{ts,mts,cts}", "scripts/**/*.{ts,mts,cts}"];
const ASYNC_SAFETY_RULES = {
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
  "@typescript-eslint/prefer-includes": "error",
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/no-unnecessary-type-conversion": "error",
  "@typescript-eslint/prefer-regexp-exec": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/prefer-string-starts-ends-with": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/restrict-template-expressions": "error",
  "@typescript-eslint/no-deprecated": "error",
};
const SETTINGS_TABLE_IMPORT = {
  regex: "^@orb/db(?:/(?:schema|index))?$",
  importNames: ["settings"],
  message: "The settings domain owns this table; inject its registered prefix-scoped KV port.",
};
const PNG_CHUNK_IMPORT = {
  regex: "^@orb/kit/png-card-chunk(?:/|$)",
  importNames: ["readCardChunk", "writeCardChunk", "isPng"],
  message: "Use the import or export domain for PNG card-chunk operations.",
};
const SERVER_SYNTAX = [
  {
    selector: String.raw`:matches(Literal[value=type(string)][raw=/corsproxy\.io/], TemplateElement[value.raw=/corsproxy\.io/])`,
    message: "D61 B5a: the rejected third-party CORS proxy cannot be spelled in server or inference literals; use the guarded network owner directly.",
  },
];

const LEGACY_TEST_ROOT = "tests/legacy";

const ROOT_SPAN_OPENERS = ["withRequestSpan", "superviseDetached", "superviseSettled"];

const PRODUCT_SOURCE = rootSources("@client", "@ui", "@server", "@db", "@contracts", "@kit", "@showcase", "@default-content", "@inference");

const CLIENT_SRC = "packages/client/src/**/*.{ts,tsx}";

function rootSources(...refs) {
  return refs.map((ref) => {
    const root =
      { "@tooling": "tooling/src", "@tests": "tests", "@scripts": "scripts", "@ui-authoring": "packages/ui", "@showcase": "packages/showcase-plugins/src" }[
        ref
      ] ?? `packages/${ref.slice(1)}/src`;
    return `${root}/**/*.{ts,tsx}`;
  });
}

const AUTHORED_SRC = rootSources(
  "@client",
  "@ui",
  "@ui-authoring",
  "@server",
  "@db",
  "@contracts",
  "@kit",
  "@showcase",
  "@plugin-toolchain",
  "@default-content",
  "@inference",
  "@tooling",
  "@tests",
  "@scripts",
);

const STRICT_SYNTAX_IGNORES = [`${LEGACY_TEST_ROOT}/**`];

const memberNamed = (name, prefix = "") =>
  `:matches([${prefix}computed=false][${prefix}property.name='${name}'], [${prefix}computed=true][${prefix}property.type='Literal'][${prefix}property.value='${name}'], [${prefix}computed=true][${prefix}property.type='TemplateLiteral'][${prefix}property.expressions.length=0][${prefix}property.quasis.0.value.cooked='${name}'])`;

const TEST_FILES = "**/*.test.{ts,tsx}";

const CLIENT_FEATURES = "packages/client/src/features/**/*.{ts,tsx}";

const CLIENT_FEATURES_TSX = "packages/client/src/features/**/*.tsx";

const SERVER_TRANSPORT = "packages/server/src/transport/**/*.{ts,tsx}";

const alternation = (names) => `/^(${names.join("|")})$/`;

const TANSTACK_FORM_MINTS = ["useForm", "createFormHook", "createFormHookContexts"];

const MATCH_MEDIA = "matchMedia";

const SESSION_CHANNEL_CONSTRUCTORS = new Set(["BroadcastChannel"]);

const SESSION_CHANNEL_MESSAGE =
  "A BroadcastChannel outside packages/client/src/lib/session-channel.ts: cross-tab messaging has one typed home that carries session lifecycle and durable-local pokes, never server truth (D138). Add the message kind to SessionMessage and post it through postSessionMessage.";

const FIREHOSE_SYMBOL = "subscribeAllChatEvents";

const POST_ROW_IDENTITY_NAMES = alternation([
  "Principal",
  "Can",
  "UserRole",
  "USER_ROLES",
  "ParticipantRole",
  "PARTICIPANT_ROLES",
  "ChatMembership",
  "ChatResource",
  "GlobalResource",
  "ResourceRef",
]);

const DIRECT_CLASS_LITERAL_TEMPLATE =
  "JSXAttribute[name.name=/^class(Name)?$/] > JSXExpressionContainer > TemplateLiteral[expressions.length=1][expressions.0.type='Literal'][expressions.0.value=type(string)]";

const INFRA_AUTH_RESTRICTIONS = [
  {
    id: "infra-auth-no-userid",
    scope: ["packages/server/src/infra/auth/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='userId']",
        message: "D40: infra/auth verifies pre-row identity; resolve userId through sessions at entry/auth/seam.ts.",
      },
    ],
  },
  {
    id: "infra-auth-pre-row-imports",
    scope: ["packages/server/src/infra/auth/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: `:matches(ImportDeclaration, ExportNamedDeclaration)[source.value='@orb/contracts/identity'] > :matches(ImportSpecifier[imported.name=${POST_ROW_IDENTITY_NAMES}], ImportSpecifier[imported.value=${POST_ROW_IDENTITY_NAMES}], ExportSpecifier[local.name=${POST_ROW_IDENTITY_NAMES}], ExportSpecifier[local.value=${POST_ROW_IDENTITY_NAMES}], ImportNamespaceSpecifier)`,
        message: "D1/D40: post-row identity and authorization belong above infra/auth; import only pre-row verification contracts here.",
      },
      {
        selector: "ExportAllDeclaration[source.value='@orb/contracts/identity']",
        message: "D1/D40: infra/auth cannot reexport post-row identity or authorization through a namespace or star door.",
      },
    ],
  },
];

const DB_MODULE_SOURCE = String.raw`/^@orb\/db(\/|$)|\/db\/src(\/|$)/`;

const SERVER_SRC = rootSources("@server");

const tableImportDoor = (names) => `ImportSpecifier:matches([imported.name=${names}], [imported.value=${names}])`;

const tableExportDoor = (names) => `ExportSpecifier:matches([local.name=${names}], [local.value=${names}])`;

const DB_STAR_EXPORT = `ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}]`;

const DB_WHOLE_MODULE_DOORS = `:matches(ImportDeclaration[source.value=${DB_MODULE_SOURCE}] > ImportNamespaceSpecifier, ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}], ImportExpression[source.value=${DB_MODULE_SOURCE}])`;

const STATS_ROLLUP_TABLES = alternation(["ownerStats", "characterStats", "dailyStats", "modelStats"]);

const VECTOR_TABLES = alternation(["characterEmbeddings", "imageEmbeddings", "chatDigests", "chatSegments", "chatDigestSpeakers", "documentChunks"]);

const VECTOR_WRITE_METHODS = alternation(["insert", "update", "delete"]);

const USERS_MESSAGE =
  "The users table is read and written only by domain/sessions and domain/admin (Spine-Identity-and-Auth §1, invariant 10). Take userId from the resolved Principal instead.";

const VECTOR_MESSAGE =
  "A vector table is named only by its import roles: embeddings (owner), search/persistence (retrieval), chat/memory/persistence (bookkeeping), discovery/persistence (analytics) and the debug probes (D20). Go through the search engine with a producer scope.";

const TABLE_IMPORT_RESTRICTIONS = [
  {
    // Knowledge-Cluster.md §7 #7: discovery is semantics; usage economics arrive only as injected stats ops.
    id: "discovery-no-stats-rollups",
    scope: ["packages/server/src/domain/discovery/**/*.{ts,tsx}"],
    homes: [],
    selectors: [tableImportDoor(STATS_ROLLUP_TABLES), tableExportDoor(STATS_ROLLUP_TABLES), DB_WHOLE_MODULE_DOORS].map((selector) => ({
      selector,
      message:
        "The stats rollup tables (ownerStats, characterStats, dailyStats, modelStats) are stats' alone; discovery computes no usage rollup (Knowledge-Cluster.md §7 #7). Consume the injected stats economics op instead.",
    })),
  },
  {
    id: "no-direct-users-read",
    scope: ["packages/server/src/domain/**/*.{ts,tsx}", "packages/server/src/entry/**/*.{ts,tsx}"],
    homes: [
      {
        path: "packages/server/src/domain/sessions/**",
        why: "the resolution tier: it upserts and reads the identity row that becomes the one Principal (Spine-Identity-and-Auth §1)",
      },
      {
        path: "packages/server/src/domain/admin/**",
        why: "user management: it owns a target user's identity row, which the caller's Principal does not describe (Spine-Identity-and-Auth §1)",
      },
    ],
    selectors: [tableImportDoor("'users'"), tableExportDoor("'users'"), DB_WHOLE_MODULE_DOORS].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "no-direct-users-read-reexport",
    scope: SERVER_SRC,
    homes: [],
    selectors: [tableExportDoor("'users'"), DB_STAR_EXPORT].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "vector-scope-derived",
    scope: SERVER_SRC,
    homes: [
      { path: "packages/server/src/domain/embeddings/**", why: "the vector substrate's owner: it stores and clears every vector row" },
      { path: "packages/server/src/domain/search/persistence/**", why: "the one top-k retrieval engine, which derives owner scope from the producer" },
      {
        path: "packages/server/src/domain/chat/memory/persistence/**",
        why: "digest bookkeeping: which segments are indexed; vector reads go through searchDigests",
      },
      { path: "packages/server/src/domain/discovery/persistence/**", why: "library analytics over loaded vectors with in-memory cosine" },
      { path: "packages/server/src/foundation/observability/debug/**", why: "the debug probes that count substrate rows" },
    ],
    selectors: [tableImportDoor(VECTOR_TABLES), tableExportDoor(VECTOR_TABLES), DB_WHOLE_MODULE_DOORS].map((selector) => ({
      selector,
      message: VECTOR_MESSAGE,
    })),
  },
  {
    id: "vector-scope-derived-reexport",
    scope: SERVER_SRC,
    homes: [],
    selectors: [tableExportDoor(VECTOR_TABLES), DB_STAR_EXPORT].map((selector) => ({ selector, message: VECTOR_MESSAGE })),
  },
  {
    id: "vector-scope-derived-write",
    scope: SERVER_SRC,
    homes: [
      { path: "packages/server/src/domain/embeddings/persistence/**", why: "the one vector writer: embeddings.store and its clear and restamp arms (D20)" },
    ],
    selectors: [
      `CallExpression:matches([callee.property.name=${VECTOR_WRITE_METHODS}], [callee.property.value=${VECTOR_WRITE_METHODS}], [callee.computed=true]:not([callee.property.type='Literal'])):matches([arguments.0.name=${VECTOR_TABLES}], [arguments.0.property.name=${VECTOR_TABLES}], [arguments.0.property.value=${VECTOR_TABLES}], [arguments.0.expression.name=${VECTOR_TABLES}])`,
      // Rebinding keeps the canonical name at every write position, which is what the write selector reads.
      `ImportSpecifier:matches([imported.name=${VECTOR_TABLES}], [imported.value=${VECTOR_TABLES}]):not([local.name=${VECTOR_TABLES}])`,
      `VariableDeclarator:matches([init.name=${VECTOR_TABLES}], [init.expression.name=${VECTOR_TABLES}])`,
      `AssignmentExpression:matches([right.name=${VECTOR_TABLES}], [right.expression.name=${VECTOR_TABLES}])`,
      // An import home's own namespace door would hide the table name from the write position.
      DB_WHOLE_MODULE_DOORS,
    ].map((selector) => ({
      selector,
      message:
        "Only domain/embeddings/persistence inserts, updates or deletes a vector table, under its canonical name (D20). Route the write through embeddings.store.",
    })),
  },
  {
    id: "vector-scope-derived-cosine",
    scope: SERVER_SRC,
    homes: [{ path: "packages/server/src/domain/search/persistence/**", why: "top-k retrieval is search's alone (Knowledge-Cluster inv 2)" }],
    selectors: [":matches(Literal[value=type(string)][value=/vector_distance_cos/], TemplateElement[value.raw=/vector_distance_cos/])"].map((selector) => ({
      selector,
      message:
        "vector_distance_cos is spelled only in domain/search/persistence; discovery uses in-memory cosine and memory delegates to the injected searchDigests op (D20).",
    })),
  },
];

const SESSIONS_SRC = "packages/server/src/domain/sessions";

const USERS_PERSISTENCE = `${SESSIONS_SRC}/persistence/users.ts`;

const LINK_CAPABILITY = `${SESSIONS_SRC}/verbs/link-external-id.ts`;

const PROVISION_CAPABILITY = `${SESSIONS_SRC}/verbs/provision-identity.ts`;

const PENDING_SIGNUP_CAPABILITY = `${SESSIONS_SRC}/verbs/pending-signup.ts`;

const CLAIM_WRITER = "claimExternalIdIfUnbound";

const PENDING_JOIN_WRITER = "insertPendingSignupUserStatement";

const SUBJECT_WRITER_NAMES = alternation([CLAIM_WRITER, PENDING_JOIN_WRITER]);

const SUBJECT_KEYS = alternation(["externalId", "external_id"]);

const IDENTITY_WRITER_MESSAGE =
  "Invariant 10: bind users.externalId only through the registered sessions capabilities (provisionIdentity, linkExternalId, the D259 pending-join confirm) and their writers in sessions/persistence/users.ts.";

const PLAIN_SPELLING_MESSAGE =
  "Spell the users table and its write chain plainly: an import alias, a type wrapper or a computed verb hides the write from the identity-writer rules.";

const memberAt = (path, name) => memberNamed(name, path === "" ? "" : `${path}.`);

const memberSpelledAt = (path, value) =>
  `:matches([${path}.computed=false][${path}.property.name=${value}], [${path}.computed=true][${path}.property.type='Literal'][${path}.property.value=${value}], [${path}.computed=true][${path}.property.type='TemplateLiteral'][${path}.property.expressions.length=0][${path}.property.quasis.0.value.cooked=${value}])`;

const keySpelled = (value) =>
  `:matches([computed=false][key.type='Identifier'][key.name=${value}], [key.type='Literal'][key.value=${value}], [computed=true][key.type='TemplateLiteral'][key.expressions.length=0][key.quasis.0.value.cooked=${value}])`;

const stringSpelled = (value) =>
  `:matches(Literal[value=${value}]:not(TSLiteralType > Literal), TemplateLiteral[expressions.length=0]:not(TSLiteralType > TemplateLiteral) > TemplateElement[value.cooked=${value}])`;

const TYPE_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSNonNullExpression, TSTypeAssertion)";

const DATA_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion)";

const usersTableAt = (path) => `:matches([${path}.type='Identifier'][${path}.name='users'], [${path}.type='MemberExpression']${memberAt(path, "users")})`;

const USERS_TABLE_CALL = `CallExpression:matches(${memberAt("callee", "insert")}, ${memberAt("callee", "update")})${usersTableAt("arguments.0")}`;

const USERS_INSERT_VALUES = `CallExpression${memberAt("callee", "values")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}`;

const USERS_UPDATE_SET = `CallExpression${memberAt("callee", "set")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "update")}${usersTableAt("callee.object.arguments.0")}`;

const USERS_ROW_WRITE = `:matches(${USERS_INSERT_VALUES}, ${USERS_UPDATE_SET})`;

const USERS_UPSERT = `CallExpression${memberAt("callee", "onConflictDoUpdate")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "values")}[callee.object.callee.object.type='CallExpression']${memberAt("callee.object.callee.object.callee", "insert")}${usersTableAt("callee.object.callee.object.arguments.0")}`;

const UPSERT_SET_KEY = `Property${keySpelled("'set'")}`;

const USERS_POSITIONAL_INSERT = `CallExpression${memberAt("callee", "select")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}[arguments.length>0]`;

const PERSISTENCE_VERB = (name) => `CallExpression:matches([callee.name='${name}'], ${memberAt("callee", name)})`;

const USERS_DATA_CALL = `:matches(${USERS_ROW_WRITE}, ${USERS_UPSERT}, ${PERSISTENCE_VERB("insertUser")}, ${PERSISTENCE_VERB("updateUser")})`;

const DYNAMIC_KEY = "Property[computed=true]:not([key.type='Literal'], [key.type='TemplateLiteral'][key.expressions.length=0])";

const DYNAMIC_KEY_WRITE = `${USERS_DATA_CALL} ObjectExpression > ${DYNAMIC_KEY}`;

const DYNAMIC_CALLEE =
  "[callee.type='MemberExpression'][callee.computed=true]:not([callee.property.type='Literal'], [callee.property.type='TemplateLiteral'][callee.property.expressions.length=0])";

const USERS_WRITE_CALL = `CallExpression:matches([callee.name=/^(insertUser|updateUser)$/], ${["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"].map((name) => memberAt("callee", name)).join(", ")})`;

const nonNullish = (path) =>
  `:not([${path}.type='Literal'][${path}.raw='null']):not([${path}.type='Identifier'][${path}.name='undefined']):not([${path}.type=/^TS(As|Satisfies)Expression$/][${path}.expression.raw='null'])`;

const SUBJECT_KEYED_WRITE = `${USERS_WRITE_CALL} ObjectExpression > Property${keySpelled(SUBJECT_KEYS)}${nonNullish("value")}`;

const SUBJECT_ASSIGNMENT = `AssignmentExpression:matches([operator='='], [operator='??='], [operator='||='], [operator='&&='])[left.type='MemberExpression']${memberSpelledAt("left", SUBJECT_KEYS)}${nonNullish("right")}`;

const INSIDE_SUBJECT_WRITER = `:matches(FunctionDeclaration[id.name=${SUBJECT_WRITER_NAMES}], VariableDeclarator[id.name=${SUBJECT_WRITER_NAMES}]) *`;

const SUBJECT_STRING_MESSAGE = `${IDENTITY_WRITER_MESSAGE} A string spelling of the subject column hides the bind from these rules.`;

const writerReference = (name) => [
  { selector: `Identifier[name='${name}']`, message: IDENTITY_WRITER_MESSAGE },
  { selector: stringSpelled(`'${name}'`), message: IDENTITY_WRITER_MESSAGE },
];

const RAW_USERS_WRITE_TEXT = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?users[`\"']?(?!\\w)/i";

const RAW_USERS_WRITE_HEAD = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?$/i";

const HANDLE_WITHOUT_KEY = `ObjectExpression:has(> Property${keySpelled("'handle'")}):not(:has(> Property${keySpelled("'handleKey'")}))`;

const IDENTITY_WRITER_RESTRICTIONS = [
  {
    id: "external-id-claim-writer-callers",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [
      { path: LINK_CAPABILITY, why: "the admin link capability hands its caller the unexecuted atomic claim" },
      { path: PROVISION_CAPABILITY, why: "the SSO seam's owner-flip bind rides the same atomic claim" },
    ],
    selectors: writerReference(CLAIM_WRITER),
  },
  {
    id: "external-id-pending-join-writer-callers",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PENDING_SIGNUP_CAPABILITY, why: "the D259 pending-join confirm plans through decideProvision and binds through this one statement" }],
    selectors: writerReference(PENDING_JOIN_WRITER),
  },
  {
    id: "external-id-writer-home",
    scope: [USERS_PERSISTENCE],
    homes: [],
    selectors: [
      {
        selector: `Identifier[name=${SUBJECT_WRITER_NAMES}]:not(FunctionDeclaration > Identifier.id, VariableDeclarator > Identifier.id), ${stringSpelled(SUBJECT_WRITER_NAMES)}`,
        message: `${IDENTITY_WRITER_MESSAGE} A wrapper here would expose a registered writer under a name no caller registry names.`,
      },
      { selector: `${SUBJECT_KEYED_WRITE}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Only a registered writer may bind here.` },
      { selector: `${SUBJECT_ASSIGNMENT}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Only a registered writer may bind here.` },
      { selector: stringSpelled(SUBJECT_KEYS), message: SUBJECT_STRING_MESSAGE },
      { selector: `${DYNAMIC_KEY_WRITE}:not(${INSIDE_SUBJECT_WRITER})`, message: `${IDENTITY_WRITER_MESSAGE} Write users keys as plain names.` },
      {
        selector: `${USERS_POSITIONAL_INSERT}:has(Identifier[name=${SUBJECT_KEYS}]):not(${INSIDE_SUBJECT_WRITER})`,
        message: `${IDENTITY_WRITER_MESSAGE} A positional insert that reads a subject is a registered writer.`,
      },
    ],
  },
  {
    id: "external-id-subject-binds",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PROVISION_CAPABILITY, why: "provisionIdentity builds its users patch by hand, and its subject bind is the verb's bind-once decision" }],
    selectors: [
      { selector: SUBJECT_KEYED_WRITE, message: IDENTITY_WRITER_MESSAGE },
      { selector: SUBJECT_ASSIGNMENT, message: IDENTITY_WRITER_MESSAGE },
    ],
  },
  {
    id: "external-id-opaque-users-writes",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [{ path: PROVISION_CAPABILITY, why: "provisionIdentity builds its users patch by hand, and its subject bind is the verb's bind-once decision" }],
    selectors: [
      { selector: stringSpelled(SUBJECT_KEYS), message: SUBJECT_STRING_MESSAGE },
      {
        selector: `${USERS_ROW_WRITE}:matches([arguments.0.type!='ObjectExpression'], :has(> ObjectExpression:has(> SpreadElement)))`,
        message: `${IDENTITY_WRITER_MESSAGE} Write users data as a literal whose keys are visible.`,
      },
      { selector: DYNAMIC_KEY_WRITE, message: `${IDENTITY_WRITER_MESSAGE} Write users keys as plain names.` },
      {
        selector: `${USERS_UPSERT}:matches([arguments.0.type!='ObjectExpression'], :has(> ObjectExpression:not(:has(> ${UPSERT_SET_KEY}))), :has(> ObjectExpression:has(> ${UPSERT_SET_KEY}[value.type!='ObjectExpression'])), :has(> ObjectExpression:has(> ${UPSERT_SET_KEY}:has(> ObjectExpression:has(> SpreadElement)))))`,
        message: `${IDENTITY_WRITER_MESSAGE} Write the upsert set as a literal whose keys are visible.`,
      },
      {
        selector: `:matches(${PERSISTENCE_VERB("insertUser")}[arguments.1.type!='ObjectExpression'], ${PERSISTENCE_VERB("updateUser")}[arguments.2.type!='ObjectExpression'], ${PERSISTENCE_VERB("insertUser")}:has(> ObjectExpression:has(> SpreadElement)), ${PERSISTENCE_VERB("updateUser")}:has(> ObjectExpression:has(> SpreadElement)))`,
        message: `${IDENTITY_WRITER_MESSAGE} Pass the users row or patch as a literal whose keys are visible.`,
      },
    ],
  },
  {
    id: "external-id-raw-users-writes",
    scope: rootSources("@server"),
    notUnder: [USERS_PERSISTENCE],
    homes: [],
    selectors: [
      { selector: USERS_POSITIONAL_INSERT, message: `${IDENTITY_WRITER_MESSAGE} A positional users insert binds external_id by column order.` },
      {
        selector: `:matches(Literal[value=${RAW_USERS_WRITE_TEXT}], TemplateElement[value.raw=${RAW_USERS_WRITE_TEXT}])`,
        message: `${IDENTITY_WRITER_MESSAGE} Raw SQL cannot write users outside its persistence file.`,
      },
      {
        selector: `TemplateLiteral:has(> TemplateElement[value.raw=${RAW_USERS_WRITE_HEAD}]):has(> :matches(Identifier[name='users'], MemberExpression${memberAt("", "users")}))`,
        message: `${IDENTITY_WRITER_MESSAGE} Raw SQL cannot write users outside its persistence file.`,
      },
    ],
  },
  {
    id: "users-write-plain-spelling",
    scope: rootSources("@server"),
    homes: [],
    selectors: [
      {
        selector:
          "ImportDeclaration[source.value=/^@orb\\u002Fdb(\\u002F|$)/] > ImportSpecifier:matches([imported.name='users'], [imported.value='users'])[local.name!='users']",
        message: PLAIN_SPELLING_MESSAGE,
      },
      { selector: `${TYPE_WRAPPER}${usersTableAt("expression")}`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `${TYPE_WRAPPER} > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES})`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `MemberExpression > ChainExpression > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES})`, message: PLAIN_SPELLING_MESSAGE },
      { selector: `CallExpression${DYNAMIC_CALLEE}${usersTableAt("arguments.0")}`, message: PLAIN_SPELLING_MESSAGE },
      {
        selector: `CallExpression${DYNAMIC_CALLEE} > MemberExpression.callee > :matches(${USERS_TABLE_CALL}, ${USERS_INSERT_VALUES}).object`,
        message: PLAIN_SPELLING_MESSAGE,
      },
    ],
  },
  {
    id: "handle-key-writer",
    scope: rootSources("@server"),
    homes: [],
    selectors: [
      {
        selector: [
          `${USERS_ROW_WRITE} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_ROW_WRITE} > ${DATA_WRAPPER} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_INSERT_VALUES} > ArrayExpression > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ObjectExpression > ${UPSERT_SET_KEY} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ObjectExpression > ${UPSERT_SET_KEY} > ${DATA_WRAPPER} > ${HANDLE_WITHOUT_KEY}`,
          `${USERS_UPSERT} > ${DATA_WRAPPER} > ObjectExpression > ${UPSERT_SET_KEY} > ${HANDLE_WITHOUT_KEY}`,
        ].join(", "),
        message:
          "D257: a users write that sets handle also writes handleKey, or the row keeps a stale key that admits a look-alike of the new handle. Write through the sessions persistence verbs, which derive it with handleKey().",
      },
    ],
  },
];

const CLASS_LITERAL_START = String.raw`(?:^["']|\s)`;

const CLASS_LITERAL_END = String.raw`(?=\s|["']$)`;

const CLASS_SPAN_START = String.raw`(?:^|\s)`;

const CLASS_SPAN_END = String.raw`(?=\s|$)`;

const STATIC_CLASS_SPAN = "TemplateLiteral[expressions.length=0] > TemplateElement";

const ARBITRARY_CLASS = String.raw`(?:[^\s]*:)?(?:[whz]|min-w|min-h|max-w|max-h|size|p[xytrbles]?|m[xytrbles]?|gap(-x|-y)?|space-[xy]|inset(-x|-y)?|top|left|right|bottom|start|end|translate(-x|-y|-z)?|grid-(cols|rows)|text|leading|tracking|rounded)-\[(?!(?:--|var\(|calc\())[^\s:]+\]`;

const NAMED_COLOR = String.raw`\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b`;

const PALETTE_COLOR = String.raw`\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b`;

const HEX_COLOR = String.raw`-\[#[0-9a-fA-F]{3,8}\]`;

const VIEWPORT_CLASS = String.raw`(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\s\]]+\]):`;

const POINTER_CLASS = "(?:any-)?pointer-(?:coarse|fine):";

const CAPABILITY_MEDIA_CLASS = String.raw`\[@media\([^\s)]*(?:any-pointer|pointer|hover):[^\s)]*\)\]:`;

const WIDTH_CLASS = String.raw`(?:(?:max-|min-)?w-\[[^\s\]]+\]|(?:max-)?w-(?:[1-9]\d*|\d+\.\d+))`;

const CLASS_RESTRICTIONS = [
  {
    id: "ui-skin-fragment-purity",
    scope: rootSources("@ui"),
    homes: [{ path: "packages/ui/src/lib/**", why: "Canonical shared focus, scrim, arrow, touch-target and disabled recipe definitions live here." }],
    selectors: [
      "focus-visible:ring-",
      "before:size-touch-target",
      "rotate-45 border border-border bg-popover",
      "bg-backdrop",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "disabled:pointer-events-none disabled:opacity-50",
    ].map((signature) => ({
      selector: `:matches(Literal[value=type(string)][raw=/${signature}/], TemplateElement[value.raw=/${signature}/])`,
      message: "A string outside the canonical UI lib home hand-spells a skin fragment; compose the matching lib constant instead.",
    })),
  },
  {
    id: "no-arbitrary-tw-values",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${ARBITRARY_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${ARBITRARY_CLASS}${CLASS_SPAN_END}/])`,
        message: "Arbitrary Tailwind layout/size/type value bypasses the token scale; use a token utility or extend tokens.json.",
      },
    ],
  },
  {
    id: "no-color-literals",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${NAMED_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${NAMED_COLOR}/])`,
        message: "A named non-token color bypasses the theme; use a semantic token, or bg-backdrop for a scrim.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})[^\s]*${PALETTE_COLOR}/])`,
        message: "A palette-scale color bypasses the theme; use a semantic token such as text-destructive or bg-primary.",
      },
      {
        selector: String.raw`:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}(?![^\s]*${NAMED_COLOR})(?![^\s]*${PALETTE_COLOR})[^\s]*${HEX_COLOR}/])`,
        message: "An arbitrary hex color bypasses the theme; use a semantic color token from theme.css.",
      },
    ],
  },
  {
    id: "no-media-queries-in-features",
    scope: rootSources("@client", "@ui"),
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${VIEWPORT_CLASS}/], TemplateElement[value.raw=/${CLASS_SPAN_START}${VIEWPORT_CLASS}/])`,
        message: "Viewport breakpoints belong to app-shell; adapt to the pane with a container query or Container size.",
      },
    ],
  },
  {
    id: "no-pointer-variants-in-features",
    scope: [CLIENT_FEATURES],
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${POINTER_CLASS}|${CAPABILITY_MEDIA_CLASS}/])`,
        message: "Device capability adaptation belongs to shared tokens or app-shell, not feature-local pointer/hover capability variants.",
      },
    ],
  },
  {
    id: "no-raw-container-widths",
    scope: rootSources("@client", "@ui"),
    notUnder: ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"],
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${WIDTH_CLASS}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${WIDTH_CLASS}${CLASS_SPAN_END}/])`,
        message: "Raw content widths bypass the container scale; use Container size or a max-w-cq-* token utility.",
      },
    ],
  },
];

const ROLE_DATA_EXPORTS = [
  { path: "primitives/role-data/index.ts", names: ["captureUserRole", "captureParticipantRole"] },
  { path: "primitives/role-data/registry.ts", names: ["userRoleCodes", "participantRoleCodes"] },
  { path: "primitives/role-data/decode/index.ts", names: ["isUserRoleState", "isParticipantRoleState", "userRoleValue", "participantRoleValue"] },
  { path: "domain/admin/guard.ts", names: ["isBootstrapOwnerRole", "isBootstrapOwnerRoleCode", "can", "requireAdmin", "requireOwner", "isAdmin", "isOwner"] },
  { path: "domain/chat/substrate/participants-host.ts", names: ["hostSeatOf", "hostUserIdOf"] },
  {
    path: "domain/chat/substrate/member-visibility.ts",
    names: [
      "viewerHoldsHost",
      "viewerReadsHidden",
      "stripMessagesForViewer",
      "stripMemberCardForViewer",
      "projectViewReturnForViewer",
      "stripChatEventForMember",
      "scrubDeltaEventForMember",
      "createMemberDeltaStamper",
      "scrubStreamReplayForMember",
      "scrubChatEventReplayForMember",
    ],
  },
  { path: "domain/chat/persistence/role-encoding.ts", names: ["prepareContinueRestoreForRoleData"] },
  { path: "entry/http/auth-meta.ts", names: ["registerAuthMeta"] },
  {
    path: "transport/trpc/role-output.ts",
    names: [
      "viewerViewSchema",
      "adminUserViewSchema",
      "participantViewSchema",
      "chatDetailSchema",
      "chatListPageSchema",
      "chatLineageViewSchema",
      "startChatResultSchema",
      "forkResultSchema",
      "redeemInviteResultSchema",
    ],
  },
  {
    path: "domain/databank/persistence/scope.ts",
    names: [
      "requireIngestDestination",
      "attachIngestDestination",
      "insertIngestDocument",
      "resolveChatHiddenDocumentIds",
      "resolveChatDocumentSources",
      "resolveActiveDocumentScope",
      "resolveActiveDocumentIds",
    ],
  },
  { path: "domain/admin/persistence/queries.ts", names: ["userCols", "loadUser", "listUsers", "toAdminUserData"] },
  {
    path: "entry/compose/chat.ts",
    names: [
      "createSignupMinterCheck",
      "activePersonaIdFor",
      "voicePersonaFor",
      "createTurnPersonaResolver",
      "buildChatToolOps",
      "createRunChatTurnBridge",
      "createTaskWindowReaders",
      "createGeneratePictureOp",
      "speakerArbiterFor",
      "buildChatService",
    ],
  },
  { path: "domain/sessions/verbs/validate.ts", names: ["createValidate"] },
  { path: "domain/sessions/verbs/load-user-by-id.ts", names: ["createLoadUserById"] },
  { path: "domain/sessions/verbs/provision-identity.ts", names: ["createProvisionIdentity"] },
  { path: "entry/auth/seam.ts", names: ["readSessionCookie", "createHostPrincipalResolver", "createAuthSeam"] },
  {
    path: "domain/automation/persistence/canon-reads.ts",
    names: [
      "loadCallerRole",
      "isBookAttachedToChat",
      "countChatMessages",
      "loadPresentHumanMemberIds",
      "isDomainRowOwnedBy",
      "isBookOwnedBy",
      "listRuleEntryTitles",
      "listAnalysisWindow",
      "maxVisibleSeq",
      "latestAuditableReply",
      "hasActiveGame",
    ],
  },
  {
    path: "domain/chat/persistence/queries.ts",
    names: [
      "normalizeToolOrdinals",
      "loadChatRow",
      "loadPendingHandoff",
      "selectStandingNominationChatIds",
      "loadMemberChat",
      "listMemberChats",
      "countMemberChats",
      "loadViewerLastTurnAt",
      "loadForkChildren",
      "loadChatMessageStats",
      "loadViewerLastTurns",
      "loadChatLastMessages",
      "loadAncestorChain",
      "loadMaxMessageSeq",
      "loadPendingUserText",
      "loadIsReplyToLatestUserMessage",
      "loadCanonHistory",
      "loadRecordedSystemTokens",
      "loadCanonContentSignatures",
      "loadCanonReasoningParts",
      "loadCanonCues",
      "loadMessageView",
      "readRetainedCanonContributions",
      "loadCanonStatRows",
      "loadSwipeStatRows",
      "loadSlotTarget",
      "loadContinueSnapshot",
      "loadMessagesPage",
      "loadStreamReplay",
      "loadStreamBounds",
      "loadChatEventReplay",
      "loadChatEventById",
      "loadChatEventBounds",
      "loadMessageVariantSummaries",
      "loadVariantWire",
      "loadVariantMessageId",
      "loadMessageSeqs",
      "loadAuthoredUserMessageIds",
      "retainOpenGreetingWindow",
      "loadHasUserMessage",
      "loadHasSelectedCanonUserMessage",
      "loadCanonHistoryAfter",
      "loadStandaloneVariableDeltasWithRaw",
      "loadMessageVariableDeltas",
      "loadVariableDeltas",
      "toStandaloneFoldRow",
      "loadTurnOrigin",
      "loadVariantDelta",
      "loadStoredVariables",
      "loadRuntimeVariables",
      "loadStoredUserMacroValues",
      "loadChatInjections",
      "loadMessageSlots",
      "loadVariantsByMessageIds",
    ],
  },
  {
    path: "domain/chat/persistence/participants-read.ts",
    names: [
      "loadPresentRole",
      "loadPresentVisibilityRow",
      "loadPresentVisibilityRows",
      "loadPresentHumanUserIds",
      "loadPresentCharacterSeats",
      "isCharacterSeated",
      "isPresentParticipant",
      "loadParticipants",
      "characterSeatedInAnotherChat",
      "characterEverSeatedInChat",
      "buildInitialParticipantRows",
      "loadParticipantsBatch",
      "captureParticipantRow",
    ],
  },
  { path: "domain/chat/verbs/edit.ts", names: ["createEdit"] },
  { path: "domain/chat/verbs/read.ts", names: ["createRead"] },
  { path: "domain/chat/verbs/participants.ts", names: ["createParticipants", "setParticipantActivePersona"] },
];

const ROLE_DATA_RESTRICTIONS = ROLE_DATA_EXPORTS.map(({ path, names }, index) => ({
  id: `role-data-export-surface-${index}`,
  scope: [`packages/server/src/${path}`],
  homes: [],
  selectors: [
    {
      selector:
        ":matches(ExportAllDeclaration[exportKind!='type'], ExportDefaultDeclaration, TSExportAssignment), ExportNamedDeclaration[exportKind!='type'] > ExportSpecifier[exportKind!='type'], ExportNamedDeclaration > :matches(TSImportEqualsDeclaration, TSModuleDeclaration, TSDeclareFunction)",
      message: "Role codec owners expose only their canonical declared API, never an alias, namespace, default or reexport door.",
    },
    {
      selector: `ExportNamedDeclaration > :matches(FunctionDeclaration, ClassDeclaration, TSEnumDeclaration)[id.name!=${alternation(names)}], ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([id.type='Identifier'][id.name=${alternation(names)}])`,
      message: "Role data owners cannot add exported codec access outside their canonical API.",
    },
  ],
}));

const TURN_IDENTITY_RESTRICTIONS = [
  {
    id: "turn-identity-name",
    scope: ["packages/server/src/domain/chat/engine/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector:
          ":matches(Identifier[name='principal']:not(Property[shorthand=true] > Identifier.key):not(ImportSpecifier[imported.name='principal'][local.name='principal'] > Identifier.imported):not(ExportSpecifier[local.name='principal'][exported.name='principal'] > Identifier.exported), JSXIdentifier[name='principal'])",
        message: "D19: the turn engine receives frozen runAsUserId/funderUserId/triggeredBy facts, never a request principal binding.",
      },
    ],
  },
  {
    // Matching the imported name from any source also covers barrels, re-exports and an unresolvable door.
    id: "turn-identity-principal",
    scope: ["packages/server/src/domain/chat/engine/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector:
          // A heritage clause names a namespace member as a MemberExpression, which TSQualifiedName does not match.
          ":matches(ImportSpecifier[imported.name='Principal'], ImportSpecifier[imported.value='Principal'], ExportSpecifier[local.name='Principal'], ExportSpecifier[local.value='Principal'], TSQualifiedName[right.name='Principal'], TSImportType[qualifier.name='Principal'], :matches(TSInterfaceHeritage, TSClassImplements) > MemberExpression[property.name='Principal'])",
        message: "D19: the chat engine is Principal-blind; resolve the runAsUserId/triggeredBy triple at the verb layer and pass it down.",
      },
      {
        // `Parameters<typeof send>[0]` over a verb, or a verb module's renamed re-export, reaches the Principal unnamed.
        selector: ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration)[source.value=/(^|\\/)verbs(\\/|$)/]",
        message: "D19: the chat engine reads nothing from the verb layer, where the caller's Principal lives; the verb passes the resolved triple down.",
      },
    ],
  },
];

const PRINCIPAL_SCOPE = rootSources("@server", "@inference");

const PRINCIPAL_MINT_HOME = "packages/server/src/entry/auth/principal-mint.ts";

const AUTH_SEAM = "packages/server/src/entry/auth/seam.ts";

const HOST_BRIDGE = "packages/server/src/entry/compose/chat.ts";

const PRINCIPAL_MINT_NAME = "mintPrincipal";

const PRINCIPAL_CONSTRUCTOR = { path: PRINCIPAL_MINT_HOME, name: PRINCIPAL_MINT_NAME };

const ROW_MAPPER = { path: AUTH_SEAM, name: "principalFromRow" };

const HOST_FLOOR = { path: HOST_BRIDGE, name: "hostPrincipal" };

const PRINCIPAL_RETURN_SITES = [PRINCIPAL_CONSTRUCTOR, ROW_MAPPER, HOST_FLOOR];

const PRINCIPAL_MINT_CALLERS = [
  PRINCIPAL_CONSTRUCTOR,
  { path: AUTH_SEAM, name: "resolveCookiePrincipal" },
  { path: AUTH_SEAM, name: "resolveHeaderOrFallbackPrincipal" },
  ROW_MAPPER,
  HOST_FLOOR,
];

const PRINCIPAL_TYPE_REFERENCE = "TSTypeReference:matches([typeName.name='Principal'], [typeName.right.name='Principal'])";

const PRINCIPAL_FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const PRINCIPAL_CASTS = new Set(["TSAsExpression", "TSTypeAssertion"]);

const PRINCIPAL_WRAPPERS = new Set([...PRINCIPAL_CASTS, "TSSatisfiesExpression", "TSNonNullExpression"]);

const PRINCIPAL_VALUE_SOURCES = {
  TSAsExpression: ["expression"],
  TSSatisfiesExpression: ["expression"],
  TSTypeAssertion: ["expression"],
  TSNonNullExpression: ["expression"],
  TSInstantiationExpression: ["expression"],
  ChainExpression: ["expression"],
  AwaitExpression: ["argument"],
  AssignmentExpression: ["right"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  LogicalExpression: ["left", "right"],
  BinaryExpression: ["left"],
  MemberExpression: ["object"],
  CallExpression: ["callee"],
  TaggedTemplateExpression: ["tag"],
};

const PRINCIPAL_LITERAL_MESSAGE =
  "D1/D40: an object literal in a Principal position is a hand-built identity; tsc accepts it only when the literal is any-typed or asserted past the brand. Receive the caller's Principal or resolve one through the entry mint.";

const isPrincipalType = (type) =>
  type?.type === "TSTypeReference" &&
  ((type.typeName.type === "Identifier" && type.typeName.name === "Principal") ||
    (type.typeName.type === "TSQualifiedName" && type.typeName.right.name === "Principal"));

function principalFunctionName(fn) {
  if (fn.id?.type === "Identifier") {
    return fn.id.name;
  }
  const { parent } = fn;
  if (parent.type === "VariableDeclarator") {
    return parent.id.type === "Identifier" ? parent.id.name : null;
  }
  const keyed = ["Property", "MethodDefinition", "PropertyDefinition"].includes(parent.type);
  return keyed && parent.key.type === "Identifier" ? parent.key.name : null;
}

function inPrincipalSite(context, node, sites) {
  const path = relative(context.cwd, context.filename).replaceAll("\\", "/");
  const fn = PRINCIPAL_FUNCTIONS.has(node.type) ? node : context.sourceCode.getAncestors(node).findLast((ancestor) => PRINCIPAL_FUNCTIONS.has(ancestor.type));
  const name = fn === undefined ? null : principalFunctionName(fn);
  return sites.some((site) => site.path === path && site.name === name);
}

function principalLiterals(expression) {
  if (expression === null || expression === undefined) {
    return [];
  }
  if (expression.type === "ObjectExpression") {
    return [expression];
  }
  if (expression.type === "SequenceExpression") {
    return [...principalLiterals(expression.expressions[0]), ...principalLiterals(expression.expressions.at(-1))];
  }
  return (PRINCIPAL_VALUE_SOURCES[expression.type] ?? []).flatMap((key) => principalLiterals(expression[key]));
}

const principalAssertionRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      // Any Principal inside the asserted type counts: `as Principal[]`, `as Principal | null` and `satisfies` launder alike.
      [`:matches(TSAsExpression, TSTypeAssertion, TSSatisfiesExpression) > .typeAnnotation:matches(${PRINCIPAL_TYPE_REFERENCE}, :has(${PRINCIPAL_TYPE_REFERENCE}))`](
        node,
      ) {
        if (!inPrincipalSite(context, node, [PRINCIPAL_CONSTRUCTOR])) {
          context.report({
            node,
            message: "D1/D40: an asserted Principal skips the entry mint. Receive the caller's Principal or resolve one with createHostPrincipalResolver.",
          });
        }
      },
    };
  },
};

const principalReturnSiteRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction)"(fn) {
        const type = fn.returnType?.typeAnnotation;
        if (isPrincipalType(type) && !(PRINCIPAL_FUNCTIONS.has(fn.type) && inPrincipalSite(context, fn, PRINCIPAL_RETURN_SITES))) {
          context.report({
            node: type,
            message:
              "D1/D40: a function returning a bare Principal is a mint site. Receive the caller's Principal or resolve one with createHostPrincipalResolver.",
          });
        }
      },
    };
  },
};

const principalMintSiteRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => {
      if (!inPrincipalSite(context, node, PRINCIPAL_MINT_CALLERS)) {
        context.report({
          node,
          message: `D1/D40: only the registered entry mint sites (PRINCIPAL_MINT_CALLERS in eslint.config.js) name ${PRINCIPAL_MINT_NAME}. Receive the caller's Principal or resolve one with createHostPrincipalResolver.`,
        });
      }
    };
    return {
      [`Identifier[name='${PRINCIPAL_MINT_NAME}']`](node) {
        // A plain import is the edge dependency-cruiser's principal-mint-owners judges; an alias hides later calls.
        const plainImport =
          node.parent.type === "ImportSpecifier" && node.parent.imported.name === PRINCIPAL_MINT_NAME && node.parent.local.name === PRINCIPAL_MINT_NAME;
        if (!plainImport) {
          report(node);
        }
      },
      // A computed member or a string import name spells the constructor without an identifier.
      [`:matches(MemberExpression[computed=true] > Literal.property, ImportSpecifier > Literal.imported, ExportSpecifier > Literal.local)[value='${PRINCIPAL_MINT_NAME}']`]:
        report,
      [`MemberExpression[computed=true] > TemplateLiteral.property[expressions.length=0][quasis.0.value.cooked='${PRINCIPAL_MINT_NAME}']`]: report,
    };
  },
};

const principalLiteralRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const judge = (type, value) => {
      if (isPrincipalType(type)) {
        for (const node of principalLiterals(value)) {
          context.report({ node, message: PRINCIPAL_LITERAL_MESSAGE });
        }
      }
    };
    const enclosingReturnType = (node) =>
      context.sourceCode.getAncestors(node).findLast((ancestor) => PRINCIPAL_FUNCTIONS.has(ancestor.type))?.returnType?.typeAnnotation;
    return {
      "VariableDeclarator[init]"(node) {
        judge(node.id.typeAnnotation?.typeAnnotation, node.init);
      },
      "AssignmentPattern[right]"(node) {
        judge(node.left.typeAnnotation?.typeAnnotation, node.right);
      },
      // An `accessor` field is its own node type; abstract fields cannot carry an initializer (TS1267).
      ":matches(PropertyDefinition, AccessorProperty, TSAbstractPropertyDefinition, TSAbstractAccessorProperty)"(node) {
        judge(node.typeAnnotation?.typeAnnotation, node.value);
      },
      "ReturnStatement[argument]"(node) {
        judge(enclosingReturnType(node), node.argument);
      },
      "ArrowFunctionExpression[expression=true]"(node) {
        judge(node.returnType?.typeAnnotation, node.body);
      },
      "CallExpression:matches([callee.property.name='assign'], [callee.property.value='assign'])[callee.object.name='Object']"(node) {
        context.report({
          node,
          message:
            "D1/D40: Object.assign returns an intersection, so it can graft a new userId or role onto a minted Principal past the brand. Use an object spread, which the brand type-checks.",
        });
      },
    };
  },
};

const principalBrandLaunderRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      ":matches(TSAsExpression, TSTypeAssertion) > TSNeverKeyword.typeAnnotation"(node) {
        context.report({
          node,
          message:
            "D1/D40: `never` is assignable to every type, so this assertion would let a hand-built value pass for a Principal past the entry mint. Narrow the value to its real type instead.",
        });
      },
      ":matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion, TSNonNullExpression) > ObjectExpression.expression"(node) {
        let casts = 0;
        for (let child = node; PRINCIPAL_WRAPPERS.has(child.parent.type) && child.parent.expression === child; child = child.parent) {
          casts += PRINCIPAL_CASTS.has(child.parent.type) ? 1 : 0;
        }
        if (casts >= 2) {
          context.report({
            node,
            message:
              "D1/D40: an object literal asserted through a second assertion can pass for any type, the Principal brand included. Build the value with its real type, or receive the caller's Principal.",
          });
        }
      },
    };
  },
};

const PRINCIPAL_NAME = "Principal";

const PRINCIPAL_ALIAS_MESSAGE =
  "D1/D40: every Principal rule keys on the name `Principal`, so a renamed spelling would walk past all of them. Name the type `Principal` where it is used.";

const isPrincipalName = (node) => (node?.type === "Identifier" && node.name === PRINCIPAL_NAME) || (node?.type === "Literal" && node.value === PRINCIPAL_NAME);

const isPrincipalExpression = (node) => isPrincipalName(node) || (node?.type === "MemberExpression" && isPrincipalName(node.property));

function namesPrincipal(type) {
  switch (type?.type) {
    case "TSTypeReference":
      return isPrincipalType(type) || (type.typeArguments?.params ?? []).some(namesPrincipal);
    case "TSUnionType":
    case "TSIntersectionType":
      return type.types.some(namesPrincipal);
    case "TSTupleType":
      return type.elementTypes.some(namesPrincipal);
    case "TSArrayType":
    case "TSNamedTupleMember":
    case "TSOptionalType":
    case "TSRestType":
      return namesPrincipal(type.elementType ?? type.typeAnnotation);
    case "TSTypeOperator":
      return namesPrincipal(type.typeAnnotation);
    case "TSIndexedAccessType":
      return namesPrincipal(type.objectType);
    default:
      return false;
  }
}

function principalTypedBinding(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable.defs.some((def) => namesPrincipal(def.name.typeAnnotation?.typeAnnotation));
    }
  }
  return false;
}

const principalAliasRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => context.report({ node, message: PRINCIPAL_ALIAS_MESSAGE });
    return {
      "ImportSpecifier[imported]"(node) {
        if (isPrincipalName(node.imported) && node.local.name !== PRINCIPAL_NAME) {
          report(node);
        }
      },
      "ExportSpecifier[local]"(node) {
        if (isPrincipalName(node.local) && !isPrincipalName(node.exported)) {
          report(node);
        }
      },
      "TSTypeAliasDeclaration[typeAnnotation]"(node) {
        if (namesPrincipal(node.typeAnnotation)) {
          report(node.id);
        }
      },
      ":matches(TSInterfaceHeritage, TSClassImplements)"(node) {
        if (isPrincipalExpression(node.expression)) {
          report(node);
        }
      },
      "TSTypeParameter[constraint]"(node) {
        if (namesPrincipal(node.constraint)) {
          report(node);
        }
      },
      // `typeof caller` in any type position, an assertion included, is a Principal spelled through its binding.
      "TSTypeQuery > Identifier.exprName"(node) {
        if (principalTypedBinding(context, node)) {
          report(node.parent);
        }
      },
    };
  },
};

const PRINCIPAL_RULES = [
  { id: "principal-alias", rule: principalAliasRule },
  { id: "principal-assertion", rule: principalAssertionRule },
  { id: "principal-return-site", rule: principalReturnSiteRule },
  { id: "principal-mint-site", rule: principalMintSiteRule },
  { id: "principal-literal", rule: principalLiteralRule },
  { id: "principal-brand-launder", rule: principalBrandLaunderRule },
  {
    id: "principal-synthetic-role",
    notUnder: ["packages/server/src/entry/**"],
    rule: restrictionRule({
      selectors: [
        {
          selector:
            "ObjectExpression:has(> Property:matches([key.name='externalId'], [key.value='externalId'])):has(> Property:matches([key.name='via'], [key.value='via'])) > Property:matches([key.name='role'], [key.value='role'])[value.value='user']",
          message: 'D1: a Principal-shaped literal with a hardcoded role: "user" belongs only in the entry layer; receive the Principal from the caller.',
        },
      ],
    }),
  },
];

const MEMBER_CARD_VIEW = "MemberCardView";

const MEMBER_CARD_CLAMPS = alternation(["clampMemberCard", "resolveCardVisibility"]);

const SERVER_SCOPE_RESTRICTIONS = [
  {
    id: "member-card-clamped",
    scope: AUTHORED_SRC,
    notUnder: ["packages/contracts/**", `${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: `:matches(TSInterfaceDeclaration, TSTypeAliasDeclaration) > Identifier.id[name='${MEMBER_CARD_VIEW}']`,
        message: "D22: MemberCardView has one home, @orb/contracts/chat; a re-spelled projection is how the clamp levels diverged.",
      },
    ],
  },
  {
    id: "member-card-clamped-clamp",
    scope: SERVER_SRC,
    homes: [
      {
        path: "packages/server/src/domain/chat/substrate/auth/**",
        why: "the one D22 decision site: `clamp.ts` owns `clampMemberCard` and `resolveCardVisibility`",
      },
    ],
    selectors: [
      {
        selector: `:matches(FunctionDeclaration, TSDeclareFunction) > Identifier.id[name=${MEMBER_CARD_CLAMPS}], VariableDeclarator > Identifier.id[name=${MEMBER_CARD_CLAMPS}]`,
        message: "D22: the member-card clamp lives only in domain/chat/substrate/auth; a second clamp re-spells the visibility levels.",
      },
    ],
  },
  {
    id: "member-card-clamped-verb",
    scope: SERVER_SRC,
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='getRosterCardView']",
        message: "D22: getRosterCardView was the divergent second clamp; read a roster card through chat's getMemberCard.",
      },
    ],
  },
  {
    id: "membership-fan-guard",
    scope: ["packages/server/src/domain/chat/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='emitUserEvent']",
        message:
          "D16/D18: chat is membership-scoped; member-visible state rides emitChatChanged or the chat bus, never an actor-only emitUserEvent that can exclude a co-member.",
      },
    ],
  },
];

const AMBIENT_ROOTS = new Set(["globalThis", "global", "self", "window"]);

const VALUE_WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"]);

const RAW_FETCH = "fetch";

const RAW_EGRESS_PACKAGES = /^(?:undici|node-fetch|cross-fetch)$/u;

const NODE_HTTP_CLIENT_DOORS = new Map([
  ["http", new Set(["request", "get"])],
  ["https", new Set(["request", "get"])],
  ["http2", new Set(["connect"])],
]);

const PROCESS_MODULE = /^(?:node:)?process$/u;

const PROCESS_GLOBAL = "process";
const BROWSER_NODE_GLOBALS = new Set([
  ...Object.keys(
    biomeConfig.overrides.find(({ includes, linter }) => includes?.includes("packages/client/**") && linter?.rules?.style?.noRestrictedGlobals !== undefined)
      .linter.rules.style.noRestrictedGlobals.options.deniedGlobals,
  ),
  PROCESS_GLOBAL,
]);

const ENV_MEMBER = "env";

const MODULE_DEFAULT = "default";

const REFLECT_GLOBAL = "Reflect";

const REFLECT_GET = "get";

const SCRUBBER_FACTORY = "createHiddenSpanStreamScrubber";

const RAW_EGRESS_MESSAGE =
  "D61 B5a: server and inference egress goes through infra/network (`safeFetch` or the configured-endpoint capability); a raw fetch or HTTP client skips the scheme pin, host allowlist, resolve-validate-pin and deadline.";

const SOLE_ENV_MESSAGE = "Tier-2-Foundation.md invariant 1: foundation/env is the only process.env reader; import the frozen `env` and dot-access a typed key.";

function valueCarrier(node) {
  let carrier = node;
  for (;;) {
    const { parent } = carrier;
    const wraps =
      (VALUE_WRAPPERS.has(parent?.type) && parent.expression === carrier) ||
      (parent?.type === "ChainExpression" && parent.expression === carrier) ||
      (parent?.type === "AwaitExpression" && parent.argument === carrier) ||
      (parent?.type === "SequenceExpression" && parent.expressions.at(-1) === carrier) ||
      (parent?.type === "ConditionalExpression" && parent.test !== carrier) ||
      parent?.type === "LogicalExpression";
    if (!wraps) {
      return carrier;
    }
    carrier = parent;
  }
}

function staticSource(source) {
  if (source.type === "Literal" && typeof source.value === "string") {
    return source.value;
  }
  return source.type === "TemplateLiteral" && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined;
}

function writtenKeyName(key, computed) {
  if (key.type === "Literal") {
    return String(key.value);
  }
  if (!computed) {
    return key.type === "Identifier" ? key.name : undefined;
  }
  return key.type === "TemplateLiteral" && key.expressions.length === 0 ? key.quasis[0].value.cooked : undefined;
}

function memberKeyName(sourceCode, member) {
  const written = writtenKeyName(member.property, member.computed);
  return written !== undefined || !member.computed ? written : constKeyName(sourceCode, member.property, new Set());
}

function constKeyName(sourceCode, key, seen) {
  if (key.type !== "Identifier" || seen.has(key)) {
    return;
  }
  const variable = referencedVariable(sourceCode, key);
  const [definition] = variable?.defs ?? [];
  // A pattern default (`const { K = "x" } = v`) takes the source's value first, so only `const K = …` names K.
  const direct = variable?.defs.length === 1 && definition?.type === "Variable" && definition.parent.kind === "const" && definition.node.id === definition.name;
  const value = direct && definition.node.init !== null ? unwrapValue(definition.node.init) : undefined;
  if (value === undefined) {
    return;
  }
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : undefined;
  }
  return value.type === "Identifier" ? constKeyName(sourceCode, value, new Set(seen).add(key)) : writtenKeyName(value, true);
}

function patternTakes(pattern, name) {
  return (
    pattern.type === "ObjectPattern" &&
    pattern.properties.some((property) => {
      if (property.type === "RestElement") {
        return true;
      }
      const key = writtenKeyName(property.key, property.computed);
      return key === undefined || key === name;
    })
  );
}

function isTypeofOperand(node) {
  return node.parent?.type === "UnaryExpression" && node.parent.operator === "typeof";
}

function inTypeQuery(node) {
  let parent = node.parent;
  while (parent?.type === "TSQualifiedName") {
    parent = parent.parent;
  }
  return parent?.type === "TSTypeQuery";
}

function declaredOnly(variable) {
  return variable.defs.length > 0 && variable.defs.every(({ node, parent }) => node.declare === true || parent?.declare === true);
}

function isGlobalBinding(variable) {
  return variable === null || variable.defs.length === 0 || declaredOnly(variable);
}

function ambientReferences(sourceCode, names) {
  const { globalScope, scopes } = sourceCode.scopeManager;
  const references = globalScope.through.filter(({ identifier }) => names.has(identifier.name));
  for (const variable of scopes.flatMap((scope) => scope.variables)) {
    if (names.has(variable.name) && isGlobalBinding(variable)) {
      references.push(...variable.references.filter(({ isValueReference }) => isValueReference !== false));
    }
  }
  return references.map(({ identifier }) => identifier).filter((identifier) => !inTypeQuery(identifier));
}

function aliasReads(sourceCode, declarator) {
  return sourceCode
    .getDeclaredVariables(declarator)
    .flatMap(({ references }) =>
      references.filter((reference) => reference.identifier !== declarator.id && reference.isRead()).map(({ identifier }) => identifier),
    );
}

function boundReads(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable?.identifiers.includes(identifier)) {
      return variable.references.filter((reference) => reference.identifier !== identifier && reference.isRead()).map(({ identifier: read }) => read);
    }
  }
  return [];
}

function referencedVariable(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const reference = scope.references.find((candidate) => candidate.identifier === identifier);
    if (reference !== undefined) {
      return reference.resolved;
    }
  }
  return null;
}

function assignedReads(sourceCode, target) {
  const variable = referencedVariable(sourceCode, target);
  return (variable?.references ?? []).filter((reference) => reference.identifier !== target && reference.isRead()).map(({ identifier }) => identifier);
}

const DESTRUCTURES = new Set(["ObjectPattern", "ArrayPattern"]);

const ALIAS_ASSIGNMENTS = new Set(["=", "||=", "&&=", "??="]);

const FRESH_VALUES = new Set([
  "ArrayExpression",
  "ArrowFunctionExpression",
  "BinaryExpression",
  "ClassExpression",
  "FunctionExpression",
  "Literal",
  "NewExpression",
  "ObjectExpression",
  "TemplateLiteral",
  "UnaryExpression",
  "UpdateExpression",
]);

const OPAQUE_VALUES = new Set([
  "AwaitExpression",
  "CallExpression",
  "ConditionalExpression",
  "LogicalExpression",
  "NewExpression",
  "SequenceExpression",
  "TaggedTemplateExpression",
  "YieldExpression",
]);

function unwrapValue(node) {
  let value = node;
  while (VALUE_WRAPPERS.has(value.type) || value.type === "ChainExpression") {
    value = value.expression;
  }
  return value;
}

function patternNames(pattern, name) {
  return (
    pattern.type === "ObjectPattern" &&
    pattern.properties.some((property) => property.type === "Property" && writtenKeyName(property.key, property.computed) === name)
  );
}

function takesAmbientRoot(pattern) {
  return [...AMBIENT_ROOTS].some((root) => patternNames(pattern, root));
}

function unknowablyReassigned(variable) {
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  if (writes.every((reference) => reference.init === true)) {
    return false;
  }
  return writes.some(({ identifier, writeExpr }) => {
    const { parent } = identifier;
    const direct =
      (parent.type === "VariableDeclarator" && parent.id === identifier) ||
      (parent.type === "AssignmentExpression" && parent.left === identifier && ALIAS_ASSIGNMENTS.has(parent.operator));
    return !direct || writeExpr === undefined || writeExpr === null || !FRESH_VALUES.has(unwrapValue(writeExpr).type);
  });
}

function unknowableValue(sourceCode, expression) {
  const value = unwrapValue(expression);
  if (value.type === "Identifier") {
    const variable = referencedVariable(sourceCode, value);
    // The process and the global roots are followed precisely by the door judges.
    const ambient = isGlobalBinding(variable) && value.name !== PROCESS_GLOBAL && !AMBIENT_ROOTS.has(value.name);
    return ambient || unknowablyReassigned(variable);
  }
  if (value.type === "MemberExpression") {
    // An element index picks one of many values; only a named property is a static path.
    const { property } = value;
    const named =
      (property.type === "Literal" && typeof property.value === "string") || (property.type === "TemplateLiteral" && property.expressions.length === 0);
    return (value.computed && !named) || unknowableValue(sourceCode, value.object);
  }
  const namedModule = value.type === "AwaitExpression" && value.argument.type === "ImportExpression" && staticSource(value.argument.source) !== undefined;
  return OPAQUE_VALUES.has(value.type) && !namedModule;
}

function isReflectGet(sourceCode, node, target) {
  const callee = node.type === "CallExpression" && node.arguments[0] === target ? node.callee : undefined;
  return (
    callee?.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === REFLECT_GLOBAL &&
    isGlobalBinding(referencedVariable(sourceCode, callee.object)) &&
    memberKeyName(sourceCode, callee) === REFLECT_GET
  );
}

function reflectKeyName(sourceCode, call) {
  const [, key] = call.arguments;
  return key === undefined ? undefined : (writtenKeyName(key, true) ?? constKeyName(sourceCode, key, new Set()));
}

const CONSUMING_PARENTS = new Set([
  "BinaryExpression",
  "DoWhileStatement",
  "ExpressionStatement",
  "ForStatement",
  "IfStatement",
  "SwitchCase",
  "SwitchStatement",
  "UnaryExpression",
  "UpdateExpression",
  "WhileStatement",
]);

function consumesValue(carrier) {
  const { parent } = carrier;
  return (
    CONSUMING_PARENTS.has(parent.type) ||
    (parent.type === "ConditionalExpression" && parent.test === carrier) ||
    (parent.type === "SequenceExpression" && parent.expressions.at(-1) !== carrier) ||
    (parent.type === "TemplateLiteral" && parent.parent.type !== "TaggedTemplateExpression")
  );
}

function flowOf(sourceCode, carrier) {
  const { parent } = carrier;
  if (parent.type === "MemberExpression") {
    return parent.object === carrier ? { member: parent, name: memberKeyName(sourceCode, parent) } : {};
  }
  if (isReflectGet(sourceCode, parent, carrier)) {
    return { member: parent, name: reflectKeyName(sourceCode, parent) };
  }
  if (parent.type === "AssignmentExpression") {
    return parent.left === carrier ? {} : assignmentFlow(sourceCode, parent);
  }
  if (parent.type === "VariableDeclarator") {
    return declaratorFlow(sourceCode, parent);
  }
  if (parent.type === "AssignmentPattern" && parent.right === carrier) {
    return targetFlow(sourceCode, parent, parent.left, boundReads);
  }
  return inTypeQuery(carrier) || consumesValue(carrier) ? {} : { escape: parent };
}

function assignmentFlow(sourceCode, assignment) {
  return ALIAS_ASSIGNMENTS.has(assignment.operator) ? targetFlow(sourceCode, assignment, assignment.left, assignedReads) : {};
}

function targetFlow(sourceCode, parent, target, readsOf) {
  if (DESTRUCTURES.has(target.type)) {
    return { pattern: target };
  }
  return target.type === "Identifier" ? { aliases: readsOf(sourceCode, target) } : { escape: parent };
}

function declaratorFlow(sourceCode, declarator) {
  if (DESTRUCTURES.has(declarator.id.type)) {
    return { pattern: declarator.id };
  }
  if (declarator.parent.parent?.type === "ExportNamedDeclaration") {
    return { escape: declarator };
  }
  return { aliases: declarator.id.type === "Identifier" ? aliasReads(sourceCode, declarator) : [] };
}

function judgeDoorUses(sourceCode, start, judge) {
  const seen = new Set();
  const visit = (node) => {
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    const flow = flowOf(sourceCode, valueCarrier(node));
    if (flow.member !== undefined) {
      judge.member(flow.member, flow.name);
    }
    if (flow.pattern !== undefined) {
      judge.pattern(flow.pattern);
    }
    if (flow.escape !== undefined) {
      judge.escape(flow.escape);
    }
    for (const alias of flow.aliases ?? []) {
      visit(alias);
    }
  };
  visit(start);
}

function reportOnce(context, message) {
  const reported = new Set();
  return (node) => {
    if (!reported.has(node)) {
      reported.add(node);
      context.report({ node, message });
    }
  };
}

const browserNoNodeGlobalsRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const report = reportOnce(context, "Browser source cannot use Node globals, including global-object members and aliases; use browser APIs.");
    const fromGlobal = {
      member(member, name) {
        if (BROWSER_NODE_GLOBALS.has(name)) {
          report(member);
        } else if (AMBIENT_ROOTS.has(name)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        }
      },
      pattern(pattern) {
        if ([...BROWSER_NODE_GLOBALS].some((name) => patternNames(pattern, name)) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape() {
        // Passing the browser global object alone does not name a Node capability.
      },
    };
    return {
      "Program:exit"() {
        for (const reference of ambientReferences(sourceCode, BROWSER_NODE_GLOBALS)) {
          report(reference);
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
      },
    };
  },
};

function moduleExportName(node) {
  return node.type === "Identifier" ? node.name : String(node.value);
}

function httpClientDoors(source) {
  return NODE_HTTP_CLIENT_DOORS.get(source.replace(/^node:/u, ""));
}

function namesFetch(specifier) {
  return specifier.local.name === RAW_FETCH || (specifier.type === "ImportSpecifier" && moduleExportName(specifier.imported) === RAW_FETCH);
}

function egressImportDoors(node) {
  const values = node.specifiers.filter((specifier) => specifier.importKind !== "type");
  if (RAW_EGRESS_PACKAGES.test(String(node.source.value))) {
    return node.specifiers.length === 0 || values.length > 0 ? [node] : [];
  }
  return values.filter(namesFetch);
}

function processImportBindings(node) {
  const values = node.specifiers.filter((specifier) => specifier.importKind !== "type");
  const exportOf = (specifier) => (specifier.type === "ImportSpecifier" ? moduleExportName(specifier.imported) : MODULE_DEFAULT);
  return {
    env: values.filter((specifier) => exportOf(specifier) === ENV_MEMBER),
    process: values.filter((specifier) => specifier.type !== "ImportNamespaceSpecifier" && exportOf(specifier) === MODULE_DEFAULT),
    namespace: values.filter((specifier) => specifier.type === "ImportNamespaceSpecifier"),
  };
}

function reExportsDoor(node, doors) {
  if (node.exportKind === "type") {
    return false;
  }
  if (node.type === "ExportAllDeclaration") {
    return true;
  }
  return node.specifiers.some(
    ({ exportKind, local }) => exportKind !== "type" && (doors.has(moduleExportName(local)) || moduleExportName(local) === MODULE_DEFAULT),
  );
}

const rawEgressRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const report = reportOnce(context, RAW_EGRESS_MESSAGE);
    const fromGlobal = {
      member: (member, name) => {
        if (AMBIENT_ROOTS.has(name)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        } else if (name === undefined || (name === RAW_FETCH && !isTypeofOperand(member))) {
          report(member);
        }
      },
      pattern: (pattern) => {
        if (patternTakes(pattern, RAW_FETCH) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape: report,
    };
    return {
      "ImportDeclaration[importKind!='type']"(node) {
        for (const door of egressImportDoors(node)) {
          report(door);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(node) {
        const forwardsPackage = RAW_EGRESS_PACKAGES.test(String(node.source.value));
        const forwardsFetch = node.type === "ExportNamedDeclaration" && node.specifiers.some(({ local }) => moduleExportName(local) === RAW_FETCH);
        if (node.exportKind !== "type" && (forwardsPackage || forwardsFetch)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node) {
        if (RAW_EGRESS_PACKAGES.test(staticSource(node.source) ?? "")) {
          report(node);
        }
      },
      "Program:exit"() {
        for (const reference of ambientReferences(sourceCode, new Set([RAW_FETCH]))) {
          if (!isTypeofOperand(reference)) {
            report(reference);
          }
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
        for (const read of reassignedFetchReads(sourceCode)) {
          report(read);
        }
      },
    };
  },
};

function reassignedFetchReads(sourceCode) {
  return sourceCode.scopeManager.scopes
    .flatMap(({ variables }) => variables)
    .filter((variable) => variable.name === RAW_FETCH && unknowablyReassigned(variable))
    .flatMap(({ references }) => references.filter((reference) => reference.isRead() && !isTypeofOperand(reference.identifier)))
    .map(({ identifier }) => identifier);
}

const rawHttpClientRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = reportOnce(context, RAW_EGRESS_MESSAGE);
    return {
      "ImportDeclaration[importKind!='type']"(node) {
        const doors = httpClientDoors(String(node.source.value));
        const values = node.specifiers.filter((specifier) => specifier.importKind !== "type");
        for (const door of doors === undefined
          ? []
          : values.filter((specifier) => specifier.type !== "ImportSpecifier" || doors.has(moduleExportName(specifier.imported)))) {
          report(door);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(node) {
        const doors = httpClientDoors(String(node.source.value));
        if (doors !== undefined && reExportsDoor(node, doors)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node) {
        if (httpClientDoors(staticSource(node.source) ?? "") !== undefined) {
          report(node);
        }
      },
    };
  },
};

const DESTRUCTURE_CHILDREN = {
  AssignmentPattern: (node) => [node.left],
  RestElement: (node) => [node.argument],
  ArrayPattern: (node) => node.elements.filter((element) => element !== null),
  ObjectPattern: (node) => node.properties,
  Property: (node) => [node.value],
};

function destructureParts(target, parts = { envKeys: [], bound: [] }) {
  if (target.type === "Identifier") {
    parts.bound.push(target);
  } else if (target.type === "Property" && writtenKeyName(target.key, target.computed) === ENV_MEMBER) {
    parts.envKeys.push(target);
  } else {
    for (const child of DESTRUCTURE_CHILDREN[target.type]?.(target) ?? []) {
      destructureParts(child, parts);
    }
  }
  return parts;
}

function importedValueJudge(sourceCode, report) {
  const judge = {
    member: (member, name) => {
      if (name === ENV_MEMBER) {
        report(member);
      } else {
        judgeDoorUses(sourceCode, member, judge);
      }
    },
    pattern: (pattern) => {
      const parts = destructureParts(pattern);
      for (const property of parts.envKeys) {
        report(property);
      }
      for (const target of parts.bound) {
        for (const { identifier } of referencedVariable(sourceCode, target)?.references ?? []) {
          if (identifier !== target) {
            judgeDoorUses(sourceCode, identifier, judge);
          }
        }
      }
    },
    // Exporting it onward is judged where it is read.
    escape: () => undefined,
  };
  return judge;
}

const PROCESS_EXPORT_DOORS = new Set([ENV_MEMBER]);

const soleEnvReaderRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const report = reportOnce(context, SOLE_ENV_MESSAGE);
    const fromImported = importedValueJudge(sourceCode, report);
    const fromProcess = {
      member: (member, name) => {
        if (name === undefined || name === ENV_MEMBER) {
          report(member);
        }
      },
      pattern: (pattern) => {
        if (patternTakes(pattern, ENV_MEMBER)) {
          report(pattern);
        }
      },
      escape: report,
    };
    // `import * as proc from "node:process"`: `proc.env` is the bag and `proc.default` is the process.
    const fromNamespace = {
      member: (member, name) => {
        if (name === MODULE_DEFAULT) {
          judgeDoorUses(sourceCode, member, fromProcess);
        } else {
          fromProcess.member(member, name);
        }
      },
      pattern: (pattern) => {
        if (patternTakes(pattern, ENV_MEMBER) || patternNames(pattern, MODULE_DEFAULT)) {
          report(pattern);
        }
      },
      escape: report,
    };
    // `globalThis.process` is the same object as the bare global; any other member may be a global another
    // module assigned, so it is judged like an imported value.
    const fromGlobal = {
      member: (member, name) => {
        if (name === PROCESS_GLOBAL) {
          judgeDoorUses(sourceCode, member, fromProcess);
        } else if (AMBIENT_ROOTS.has(name)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        } else {
          fromImported.member(member, name);
        }
      },
      pattern: (pattern) => {
        if (patternTakes(pattern, PROCESS_GLOBAL) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape: report,
    };
    return {
      "ImportDeclaration[importKind!='type']"(node) {
        if (!PROCESS_MODULE.test(node.source.value)) {
          const values = node.specifiers.filter((specifier) => specifier.importKind !== "type");
          for (const read of values.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
            judgeDoorUses(sourceCode, read, fromImported);
          }
          return;
        }
        const bindings = processImportBindings(node);
        for (const specifier of bindings.env) {
          report(specifier);
        }
        for (const read of bindings.process.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
          judgeDoorUses(sourceCode, read, fromProcess);
        }
        for (const read of bindings.namespace.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
          judgeDoorUses(sourceCode, read, fromNamespace);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(node) {
        if (PROCESS_MODULE.test(node.source.value) && reExportsDoor(node, PROCESS_EXPORT_DOORS)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node) {
        if (PROCESS_MODULE.test(staticSource(node.source) ?? "")) {
          report(node);
        } else {
          judgeDoorUses(sourceCode, node, fromImported);
        }
      },
      // Fail closed on an `env` key taken off a value whose identity the rule cannot follow.
      "VariableDeclarator[id.type='ObjectPattern'][init], AssignmentExpression[left.type='ObjectPattern']"(node) {
        const [pattern, source] = node.type === "VariableDeclarator" ? [node.id, node.init] : [node.left, node.right];
        if (patternNames(pattern, ENV_MEMBER) && unknowableValue(sourceCode, source)) {
          report(pattern);
        }
      },
      [`MemberExpression[property.name='${ENV_MEMBER}'], MemberExpression[property.value='${ENV_MEMBER}'], MemberExpression[property.type='TemplateLiteral'], MemberExpression[computed=true][property.type='Identifier']`](
        node,
      ) {
        if (memberKeyName(sourceCode, node) === ENV_MEMBER && unknowableValue(sourceCode, node.object)) {
          report(node);
        }
      },
      "Program:exit"() {
        for (const reference of ambientReferences(sourceCode, new Set([PROCESS_GLOBAL]))) {
          judgeDoorUses(sourceCode, reference, fromProcess);
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
      },
    };
  },
};

const AMBIENT_GLOBAL_RESTRICTIONS = [
  {
    id: "no-raw-egress",
    scope: rootSources("@server", "@inference"),
    homes: [
      {
        path: "packages/server/src/infra/network/egress.ts",
        why: "the guard itself: `safeFetch`, the configured-endpoint capability and their pinned undici agents wrap the one physical request every other egress routes through",
      },
    ],
  },
  {
    id: "no-raw-http-client",
    scope: rootSources("@server", "@inference"),
    homes: [
      {
        path: "packages/server/src/infra/network/tls-terminator.ts",
        why: "the D275 TLS listener forwards each request to the app's own loopback listener; it never dials a caller-chosen host",
      },
    ],
  },
  {
    id: "sole-env-reader",
    scope: rootSources("@server", "@inference"),
    homes: [
      { path: "packages/server/src/foundation/env/index.ts", why: "the sole reader parses and freezes `env`, so it cannot import the object it produces" },
    ],
  },
  {
    id: "scrubber-home",
    scope: PRODUCT_SOURCE,
    homes: [
      {
        path: "packages/server/src/domain/chat/substrate/member-visibility.ts",
        why: "the producer stamp owns the one warm per-slot scrubber; the same module's token-log replay projection builds one per replayed generation",
      },
    ],
    selectors: [
      {
        selector: `:matches(${[
          `ImportSpecifier[imported.name='${SCRUBBER_FACTORY}']`,
          `ImportSpecifier[imported.value='${SCRUBBER_FACTORY}']`,
          `ExportSpecifier[local.name='${SCRUBBER_FACTORY}']`,
          `ExportSpecifier[local.value='${SCRUBBER_FACTORY}']`,
          `MemberExpression[computed=false][property.name='${SCRUBBER_FACTORY}']`,
          `MemberExpression[computed=true][property.value='${SCRUBBER_FACTORY}']`,
          `MemberExpression[computed=true][property.type='TemplateLiteral'][property.quasis.0.value.cooked='${SCRUBBER_FACTORY}']`,
          `ObjectPattern > Property[key.name='${SCRUBBER_FACTORY}']`,
          `ObjectPattern > Property[key.value='${SCRUBBER_FACTORY}']`,
        ].join(", ")})`,
        message:
          "D118: only the producer stamp (domain/chat/substrate/member-visibility.ts) constructs the hidden-span stream scrubber; read the stamped `memberText`, because a reader's cold scrubber forwards a hidden span's tail.",
      },
    ],
  },
];

const CLIENT_CONTEXT_RESTRICTIONS = [
  {
    id: "context-shell-chrome",
    scope: [CLIENT_FEATURES],
    notUnder: ["packages/client/src/features/app-shell/**"],
    homes: [],
    selectors: [
      {
        selector: ":matches(Literal[value=type(string)][raw=/shell-panel-header/], TemplateElement[value.raw=/shell-panel-header/])",
        message: "A feature must compose its own band, not paint the shell-panel-header chrome.",
      },
    ],
  },
  {
    id: "no-mutating-register-api",
    scope: [CLIENT_SRC],
    homes: [],
    selectors: [
      {
        selector:
          "FunctionDeclaration[id.name='register'], :matches(MethodDefinition, TSAbstractMethodDefinition)[computed=false][kind='method'][key.type='Identifier'][key.name='register'], Property[computed=false][method=true][key.type='Identifier'][key.name='register'], TSDeclareFunction[id.name='register']",
        message: "Export definition values for door assembly, not a mutating register API.",
      },
    ],
  },
];

const CLIENT_STYLE_RESTRICTIONS = [
  { id: "no-off-token-inline-style", scope: rootSources("@client", "@ui"), homes: [] },
  { id: "theme-override-only-via-scope", scope: rootSources("@client", "@ui"), homes: [] },
];

const CAST_ID_CALL = `CallExpression:matches([callee.name='castId'], [callee.computed=false][callee.property.name='castId'], [callee.computed=true][callee.property.value='castId'])`;

const EMPTY_ID_ARGUMENT =
  ":matches([arguments.0.value=''], [arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=''], [arguments.0.expression.value=''], " +
  "[arguments.0.expression.expressions.length=0][arguments.0.expression.quasis.0.value.cooked=''], [arguments.0.expression.expression.value=''], " +
  "[arguments.0.expression.expression.expressions.length=0][arguments.0.expression.expression.quasis.0.value.cooked=''])";

const ID_BRAND_RESTRICTIONS = [
  {
    id: "no-fake-disabled-id",
    scope: rootSources("@client"),
    homes: [],
    selectors: [
      {
        selector: `${CAST_ID_CALL}${EMPTY_ID_ARGUMENT}`,
        message:
          "An empty-string branded id is a fake disabled sentinel that can reach the server if its guard drifts; use useGatedQuery or skipToken so no key exists.",
      },
      {
        selector: "ImportSpecifier[imported.name='castId'][local.name!='castId']",
        message: "Import castId under its own name: the empty-sentinel ban reads the seam by spelling, and an alias would hide it.",
      },
    ],
  },
  { id: "no-raw-id", scope: AUTHORED_SRC, homes: [] },
  { id: "wire-json-parsed-at-consumer", scope: rootSources("@client", "@server", "@inference"), homes: [] },
];

const CLIENT_CONFIG_HOST = "packages/client/src/features/config/surfaces/config-content-surface.tsx";

const CLIENT_CONFIG_HOST_RESTRICTIONS = [
  {
    id: "config-host-no-feature-import",
    scope: [CLIENT_CONFIG_HOST],
    homes: [],
    selectors: [
      {
        // `#features` door, or two relative hops: the only ways to leave `features/config/` for a sibling feature.
        selector: "ImportDeclaration[source.value=/^(#features.|\\.\\.\\S\\.\\.\\S)/]",
        message: "The config content host reads bodies off the registries; it does not import another feature's internals.",
      },
    ],
  },
];

const BOUND_FIELDS_ROOT = "packages/client/src/forms/editor/bound-fields";

const STATE_ROOT = "packages/client/src/state";

const REGISTRY_FACTORY_NAMES = ["createRegistry", "createContributorRegistry"];

const REGISTRY_FACTORIES = alternation(REGISTRY_FACTORY_NAMES);

const sealedName = (name) =>
  `ImportSpecifier[imported.name='${name}'], MemberExpression${memberNamed(name)}, ObjectPattern > Property[computed=false][key.name='${name}']`;

const REGISTRY_CONTEXT_MESSAGE =
  "A createContext typed over a registry belongs in the createRegistryContext mint (packages/client/src/lib/create-registry-context.tsx); a hand-rolled context, hook and provider trio drifts from the one shape.";

const REGISTRY_CONTEXT_UNREADABLE =
  "This createContext call is on a receiver that is not an import, so whether it is React's context constructor cannot be established. Reported rather than passed; call createContext through a named React import.";

const REGISTRY_NAME = /Registry$/u;

const REGISTRY_ALIAS_HOPS = 8;

function writtenTypeNames(type) {
  if (type.type === "TSUnionType") {
    return type.types.flatMap(writtenTypeNames);
  }
  return type.type === "TSTypeReference" ? [type.typeName] : [];
}

function namesRegistry(typeName, registryNames) {
  if (typeName.type === "Identifier") {
    return registryNames.has(typeName.name);
  }
  return typeName.type === "TSQualifiedName" && REGISTRY_NAME.test(typeName.right.name);
}

const PROJECT_MODULE = /^(?:\.|#|@orb\/)/u;

function recordRegistryImport(node, imports) {
  const react = node.source.value === "react" || PROJECT_MODULE.test(node.source.value);
  for (const specifier of node.specifiers) {
    const named = specifier.type === "ImportSpecifier";
    const local = specifier.local.name;
    if (react && named && specifier.imported.name === "createContext") {
      imports.constructors.add(local);
    } else if (react && !named) {
      imports.namespaces.add(local);
    } else {
      imports.others.add(local);
    }
    if (named && REGISTRY_NAME.test(specifier.imported.name)) {
      imports.registryNames.add(local);
    }
  }
}

function isCreateContextMember(callee) {
  if (callee.type !== "MemberExpression") {
    return false;
  }
  if (!callee.computed) {
    return callee.property.name === "createContext";
  }
  const { property } = callee;
  if (property.type === "TemplateLiteral") {
    return property.expressions.length === 0 && property.quasis[0].value.cooked === "createContext";
  }
  return property.type === "Literal" && property.value === "createContext";
}

function createContextVerdict(callee, imports) {
  if (callee.type === "Identifier") {
    return imports.constructors.has(callee.name) ? "react" : "other";
  }
  if (!isCreateContextMember(callee)) {
    return "other";
  }
  const receiver = callee.object.type === "Identifier" ? callee.object.name : undefined;
  if (receiver !== undefined && imports.namespaces.has(receiver)) {
    return "react";
  }
  return receiver !== undefined && imports.others.has(receiver) ? "other" : "unreadable";
}

function closeRegistryAliases(aliases, registryNames) {
  for (let hop = 0; hop < REGISTRY_ALIAS_HOPS; hop += 1) {
    const known = registryNames.size;
    for (const { name, refs } of aliases) {
      if (refs.some((ref) => namesRegistry(ref, registryNames))) {
        registryNames.add(name);
      }
    }
    if (registryNames.size === known) {
      return;
    }
  }
}

const registryContextRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const imports = { constructors: new Set(), namespaces: new Set(), others: new Set(), registryNames: new Set() };
    const aliases = [];
    const calls = [];
    return {
      "ImportDeclaration:exit"(node) {
        recordRegistryImport(node, imports);
      },
      "TSTypeAliasDeclaration:exit"(node) {
        aliases.push({ name: node.id.name, refs: writtenTypeNames(node.typeAnnotation) });
      },
      "CallExpression:exit"(node) {
        const argument = (node.typeArguments ?? node.typeParameters)?.params[0];
        if (argument !== undefined) {
          calls.push({ callee: node.callee, argument });
        }
      },
      "Program:exit"() {
        closeRegistryAliases(aliases, imports.registryNames);
        for (const { callee, argument } of calls) {
          const verdict = createContextVerdict(callee, imports);
          if (verdict === "unreadable") {
            context.report({ node: argument, message: REGISTRY_CONTEXT_UNREADABLE });
          } else if (verdict === "react" && writtenTypeNames(argument).some((ref) => namesRegistry(ref, imports.registryNames))) {
            context.report({ node: argument, message: REGISTRY_CONTEXT_MESSAGE });
          }
        }
      },
    };
  },
};

const STATE_MINT_NAMES = ["create", "createStore", "createGatedStore", "createEntityDraftStore"];

const STATE_MINT = alternation(STATE_MINT_NAMES);

const STATE_MAX_FIELDS = 10;

const STATE_FIELD_CAP_MESSAGE = `A state store initializer declares more than ${STATE_MAX_FIELDS} top-level fields; the store is doing several jobs, so split it.`;

const STATE_FILES_SELECTORS = [
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > ArrowFunctionExpression[body.type='ObjectExpression'][body.properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
  {
    selector: `CallExpression[callee.name=${STATE_MINT}] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement > ReturnStatement > ObjectExpression[properties.length>${STATE_MAX_FIELDS}]`,
    message: STATE_FIELD_CAP_MESSAGE,
  },
];

const stateFilesRule = (() => {
  const selectorRule = restrictionRule({ selectors: STATE_FILES_SELECTORS });
  return {
    meta: selectorRule.meta,
    create(context) {
      let mints = 0;
      return {
        ...selectorRule.create(context),
        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
          for (let cursor = node.init; cursor?.type === "CallExpression"; cursor = cursor.callee) {
            if (cursor.callee.type === "Identifier" && STATE_MINT_NAMES.includes(cursor.callee.name)) {
              context.report({
                node,
                message:
                  "The minted store handle is exported. Export intent-named actions and narrow read hooks, never a raw set/getState handle across the module boundary.",
              });
              return;
            }
          }
        },
        [`CallExpression[callee.name=${STATE_MINT}]`](node) {
          mints += 1;
          if (mints > 1) {
            context.report({ node, message: "A second store-minting call in one state file; one store per file, so split them." });
          }
        },
      };
    },
  };
})();

const CLIENT_SEAL_RESTRICTIONS = [
  {
    id: "bound-field-via-hook",
    scope: [`${BOUND_FIELDS_ROOT}/**/*.{ts,tsx}`],
    homes: [
      {
        path: `${BOUND_FIELDS_ROOT}/use-bound-field.ts`,
        why: "useBoundField is the one home for the bound-field wiring; it reads the raw form context once, so the seal cannot be built without the read it seals",
      },
    ],
    selectors: [
      {
        selector: sealedName("useFieldContext"),
        message:
          "A bound field reaches the raw useFieldContext form context directly. Use useBoundField<T>(shell) from ./use-bound-field; every bound field's context read, touch-gated error and Field prop bundle live in that one hook.",
      },
    ],
  },
  {
    id: "chat-stream-writes-in-bus-only",
    scope: AUTHORED_SRC,
    notUnder: [TEST_FILES, "**/*.spec.{ts,tsx}", ...STRICT_SYNTAX_IGNORES],
    homes: [
      {
        path: "packages/client/src/data/bus/chat-bus-writes.ts",
        why: "the bus applier is the one writer the rule exists to make singular: it turns bus events into turn-slot writes",
      },
    ],
    selectors: [
      {
        selector: sealedName("chatStream"),
        message:
          "The chatStream write api is taken outside the bus applier. Turn slots are driven by bus events through applyChatBusEvent only; components read with useTurnSlot and useTurnPhase.",
      },
    ],
  },
  {
    id: "bus-on-data-no-store-write",
    scope: ["packages/client/src/data/bus/**/*.{ts,tsx}"],
    homes: [],
    selectors: [
      {
        selector:
          ":matches(Property, MethodDefinition)[key.name=/^(onData|onConnectionStateChange)$/] CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.name='setState']",
        message:
          "A raw store write (.setState) inside a bus onData or onConnectionStateChange body forks canon into a second store. Route into the pure reducer (apply-chat-bus-event.ts), buffer through the chatStream api, or drive the invalidation seam.",
      },
    ],
  },
  {
    id: "selection-store-via-factory",
    scope: [`${STATE_ROOT}/*-selection-store.ts`],
    homes: [
      {
        path: `${STATE_ROOT}/create-drill-selection-store.ts`,
        why: "the drill factory composes the raw createGatedStore door on purpose; that composition is the seal every per-section selection store mints through",
      },
      {
        path: `${STATE_ROOT}/create-kinded-selection-store.ts`,
        why: "the kinded-selection factory is the same composition one shape over",
      },
      {
        path: `${STATE_ROOT}/message-selection-store.ts`,
        why: "message selection is a bulk multi-select (presence in a Set keyed by message id), a shape the drill factory does not model",
      },
    ],
    selectors: [
      {
        selector: sealedName("createGatedStore"),
        message:
          "A *-selection-store.ts mints the raw createGatedStore door directly. Mint it with createDrillSelectionStore(name, { secondary? }); the per-section drill stores are one shape.",
      },
    ],
  },
  {
    id: "registry-assembly-at-door-only",
    scope: [CLIENT_SRC],
    notUnder: ["packages/client/src/main.tsx", "packages/client/src/**/compose/**"],
    homes: [],
    selectors: [
      {
        selector: `ImportSpecifier[imported.name=${REGISTRY_FACTORIES}], ${REGISTRY_FACTORY_NAMES.map((name) => `MemberExpression${memberNamed(name)}`).join(", ")}, ObjectPattern > Property[computed=false][key.name=${REGISTRY_FACTORIES}]`,
        message:
          "createRegistry and createContributorRegistry are called only at the composition root (main.tsx) or in a compose/ module; any other call site is a private assembly outside the one registration door.",
      },
    ],
  },
  {
    id: "registry-context-via-mint",
    scope: [CLIENT_SRC],
    homes: [],
    selectors: [],
  },
  {
    id: "state-files",
    scope: [`${STATE_ROOT}/*.{ts,tsx}`],
    notUnder: [`${STATE_ROOT}/index.ts`],
    homes: [],
    selectors: STATE_FILES_SELECTORS,
  },
];

const BANNED_UTILITY = String.raw`(?:[^\s]*:)?!?max-w-prose!?`;

const CLASS_TOKEN_RESTRICTIONS = [
  {
    id: "no-banned-tw-utility",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `:matches(Literal[value=type(string)][raw=/${CLASS_LITERAL_START}${BANNED_UTILITY}${CLASS_LITERAL_END}/], ${STATIC_CLASS_SPAN}[value.raw=/${CLASS_SPAN_START}${BANNED_UTILITY}${CLASS_SPAN_END}/])`,
        message:
          "Tailwind's max-w-prose matches no house reading measure. Body/teaching prose takes max-w-(--reading-measure-prose) on the paragraph; editor content takes max-w-(--width-content-col).",
      },
    ],
  },
];

const TRPC_ROUTE_PATTERN = String.raw`/^\*\*\/api\/trpc/`;

const PAGE_ROUTE_CALL = "CallExpression[callee.object.name='page'][callee.property.name='route']";

const TRPC_PAGE_ROUTES = [
  `${PAGE_ROUTE_CALL}[arguments.0.value=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=${TRPC_ROUTE_PATTERN}]`,
  `${PAGE_ROUTE_CALL}[arguments.0.expression.value=${TRPC_ROUTE_PATTERN}]`,
];

const leadingCallStatements = (calls) =>
  `:matches(${calls
    .flatMap((call) => [
      `:matches(ExpressionStatement, ReturnStatement):has(> ${call})`,
      `:matches(ExpressionStatement, ReturnStatement):has(> AwaitExpression:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> ${call}))`,
      `VariableDeclaration:has(> VariableDeclarator:has(> AwaitExpression:has(> ${call})))`,
    ])
    .join(", ")})`;

const CT_SPEC_RESTRICTIONS = [
  {
    id: "testid-typed-only-stories",
    scope: ["tests/**/_*stories.tsx", "tests/**/*.stories.tsx"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
  },
  {
    id: "route-trpc-lifo-order",
    scope: ["tests/**/*.ct.tsx"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: `${leadingCallStatements(TRPC_PAGE_ROUTES)} ~ ${leadingCallStatements(["CallExpression[callee.name='routeTrpc']"])}`,
        message:
          'A `page.route("**/api/trpc...")` registered before this routeTrpc never runs: Playwright resolves routes LIFO and routeTrpc answers every trpc request. Register the override after routeTrpc, or use trpcHold() and barrier on hold.requested.',
      },
    ],
  },
];

const SERDE_CARD_MAPPERS = alternation(["cardContentHash", "cardFromJson", "buildCardV3"]);

const SERDE_CARD_HOME = "packages/server/src/primitives/serde/card/index.ts";

const SERDE_CARD_MESSAGE = `A second declaration of a serde-core card mapper; each of cardContentHash, cardFromJson and buildCardV3 is declared once, in ${SERDE_CARD_HOME}. Import it from #primitives/serde/card.`;

const SERVER_HARD_RESTRICTIONS = [
  {
    id: "types-in-contract",
    scope: ["packages/server/src/domain/*/contract/service.ts"],
    homes: [],
    selectors: [
      {
        selector: "Program:not(:has(:matches(ExportNamedDeclaration, ExportDefaultDeclaration) > TSInterfaceDeclaration))",
        message:
          "contract/service.ts must declare the exported <Feature>Service interface (the feature's typed API surface, Spine-TypeScript-and-Patterns.md §7.4).",
      },
    ],
  },
  {
    id: "serde-core-definition-uniqueness",
    scope: rootSources("@server"),
    notUnder: [SERDE_CARD_HOME],
    homes: [],
    selectors: [
      `ExportNamedDeclaration > FunctionDeclaration[id.name=${SERDE_CARD_MAPPERS}]`,
      `ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.type='Identifier'][id.name=${SERDE_CARD_MAPPERS}]`,
    ].map((selector) => ({ selector, message: SERDE_CARD_MESSAGE })),
  },
];

const DB_SCHEMA_RESTRICTIONS = [
  {
    id: "db-enum-from-tuple",
    scope: ["packages/db/src/schema/**/*.ts"],
    homes: [],
    selectors: [
      {
        selector: "Property:matches([key.name='enum'], [key.value='enum']) :matches(ArrayExpression, CallExpression)",
        message:
          "A Drizzle column enum derives from a named tuple (an @orb/contracts or @orb/kit export, or a local `as const satisfies` tuple), never an inline array or a call result (D34).",
      },
    ],
  },
];

const CT_COLOR_LINE = /(?:oklch|\brgba?)\\?\((?=[^)\n]*\d)|#[0-9a-fA-F]{3,8}\b/u;

const CT_NARRATION_CALLEES = new Set(["test", "it", "describe", "suite", "bench"]);

const calleeRoot = (callee) => {
  let node = callee;
  while (node.type === "MemberExpression" && !node.computed) {
    node = node.object;
  }
  return node.type === "Identifier" ? node.name : undefined;
};

const narrationArgIndex = (root) => {
  if (root === "expect") {
    return 1;
  }
  return CT_NARRATION_CALLEES.has(root) ? 0 : -1;
};

const uiCtColorRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const blanked = sourceCode.getAllComments().map(({ range }) => range);
    return {
      "CallExpression[arguments.length>0]"(call) {
        const arg = call.arguments[narrationArgIndex(calleeRoot(call.callee))];
        if (arg?.type === "Literal" && typeof arg.value === "string") {
          blanked.push(arg.range);
        } else if (arg?.type === "TemplateLiteral") {
          blanked.push(...arg.quasis.map(({ range }) => range));
        }
      },
      "Program:exit"() {
        let text = sourceCode.text;
        for (const [start, end] of blanked) {
          text = text.slice(0, start) + text.slice(start, end).replace(/[^\r\n]/gu, " ") + text.slice(end);
        }
        text.split(/\r?\n/u).forEach((line, index) => {
          const column = line.search(CT_COLOR_LINE);
          if (column >= 0) {
            context.report({ loc: { line: index + 1, column }, message: "A hardcoded color in a CT: assert colors through TOKENS." });
          }
        });
      },
    };
  },
};

const OVERLAY_PART = (part) => `:matches(MemberExpression[computed=false], JSXMemberExpression)[property.name='${part}']`;

const OVERLAY_DIRS = { anchored: ["popover", "menu", "select", "autocomplete", "tooltip"], modal: ["dialog", "alert-dialog", "drawer"] };

const overlayScope = (names) => names.map((name) => `packages/ui/src/primitives/${name}/${name}.tsx`);

const UI_PRIMITIVE_RESTRICTIONS = [
  {
    id: "ui-variants-barrel-private",
    scope: ["packages/ui/src/**/index.ts"],
    homes: [],
    selectors: [
      {
        selector: ":matches(ExportAllDeclaration, ExportNamedDeclaration)[source.value=/(^|\\u002F)variants$/]",
        message: "A barrel never re-exports its private variants: a feature composing raw variants bypasses the component skin.",
      },
    ],
  },
  {
    id: "ui-no-inline-svg",
    scope: ["packages/ui/src/**/*.tsx"],
    notUnder: ["packages/ui/src/**/charts/**"],
    homes: [],
    selectors: [
      {
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='svg']",
        message: "No inline <svg> outside the chart layer: render the governed Icon component.",
      },
    ],
  },
];

const UI_HARD_RESTRICTIONS = [
  {
    id: "ui-ct-no-inline-provider",
    scope: ["tests/ui/**/*.ct.tsx", "tests/ui/**/*.fixtures.tsx"],
    homes: [],
    selectors: [
      {
        selector:
          "JSXOpeningElement:matches([name.type='JSXIdentifier'][name.name=/Provider$/], [name.type='JSXMemberExpression'][name.property.name=/Provider$/])",
        message: "An inline provider in a test: global providers live in CtProviders.",
      },
    ],
  },
  {
    id: "ui-overlay-anchored-anatomy",
    scope: overlayScope(OVERLAY_DIRS.anchored),
    homes: [],
    selectors: [
      {
        selector: `Program:has(${OVERLAY_PART("Popup")}):not(:has(${OVERLAY_PART("Positioner")}))`,
        message: "An anchored overlay with a .Popup needs its .Positioner.",
      },
    ],
  },
  {
    id: "ui-overlay-modal-anatomy",
    scope: overlayScope(OVERLAY_DIRS.modal),
    homes: [],
    selectors: [
      { selector: `Program:not(:has(${OVERLAY_PART("Backdrop")}):has(${OVERLAY_PART("Popup")}))`, message: "A modal overlay must use .Backdrop + .Popup." },
      { selector: `Program:has(${OVERLAY_PART("Positioner")})`, message: "A modal overlay must NOT have a .Positioner." },
    ],
  },
];

const STRING_LITERAL_MEMBER = "TSLiteralType[literal.type='Literal'][literal.value=type(string)]";

const TYPE_SHAPE_RESTRICTIONS = [
  {
    id: "no-inline-union-alias",
    scope: AUTHORED_SRC,
    // Every gate module's proof fixtures re-spell axes by design.
    notUnder: [...STRICT_SYNTAX_IGNORES, "tooling/src/verify/gates/**"],
    homes: [],
    selectors: [
      {
        selector: `TSTypeAliasDeclaration > TSUnionType[types.length>=3]:not(:has(> :not(${STRING_LITERAL_MEMBER})))`,
        message:
          "A string-union axis is declared once as an `as const` tuple and the union derived with `(typeof X)[number]`, never re-spelled as an inline alias (Spine-TypeScript-and-Patterns.md §7.5).",
      },
    ],
  },
];

const RESTRICTIONS = [
  {
    id: "no-test-fabrication",
    scope: ["tests/**/*.{ts,tsx}"],
    notUnder: [`${LEGACY_TEST_ROOT}/**`],
    homes: [],
    selectors: [
      {
        selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
        message: "An assertion to any erases the test contract; build a real value or keep deliberate invalid-input evidence beside its boundary.",
      },
      {
        selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
        message: "An unknown double cast fabricates the target contract; build a real value or narrow it instead (D325).",
      },
    ],
  },
  {
    id: "class-token-splice",
    scope: rootSources("@client", "@ui"),
    homes: [],
    selectors: [
      {
        selector: `${DIRECT_CLASS_LITERAL_TEMPLATE}:matches([quasis.0.value.cooked=/\\S$/][expressions.0.value=/^\\S/], [expressions.0.value=/\\S$/][quasis.1.value.cooked=/^\\S/])`,
        message: "A literal interpolation splits a class token; spell the complete class as one source literal.",
      },
    ],
  },
  {
    id: "no-raw-zustand-persist",
    scope: rootSources("@client"),
    homes: [
      {
        path: "packages/client/src/state/entity-draft-store-implementation.ts",
        why: "the draft-store factory bakes partialize / version+total-migrate / key uniqueness in; its `persist(` call and its registered `reset` closure ARE the seal every draft store mints through",
      },
      { path: "packages/client/src/state/persisted-store-implementation.ts", why: "the general persisted-store factory, the same seal one shape over" },
    ],
    selectors: [
      {
        selector: "ImportDeclaration[source.value='zustand/middleware'] > ImportSpecifier[imported.name='persist']",
        message:
          "Raw zustand `persist` outside its sealed homes — partialize / version+total-migrate / key uniqueness are baked into `createEntityDraftStore` / `createPersistedStore` (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector: "ExportNamedDeclaration[source.value='zustand/middleware'] > ExportSpecifier[local.name='persist']",
        message: "Raw zustand `persist` re-exported outside its sealed homes (UI-Gates-and-Lessons.md §11.5).",
      },
      {
        selector:
          "CallExpression[callee.property.name='setState'][arguments.1.value=true]:has(> CallExpression.arguments[callee.property.name='getInitialState'])",
        message:
          "`setState(store.getInitialState(), true)` on a persist-minted store writes the emptied state THROUGH to durable storage (#879, from #837); it belongs to the two mint factories, whose `reset` closures the durable-local registry drives behind the storage blindfold.",
      },
    ],
  },
  {
    // The registry's own `reset()` may only run in the function that installs the storage blindfold.
    id: "no-raw-zustand-persist-registry",
    scope: ["packages/client/src/state/durable-local.ts"],
    homes: [],
    selectors: [
      {
        selector: "CallExpression[callee.property.name='reset']:not(FunctionDeclaration[id.name='resetWithoutPersisting'] CallExpression)",
        message:
          "A registered store's `reset()` inside the durable-local registry may only run from `resetWithoutPersisting`, which blindfolds the store's storage first — anywhere else drops a store WITHOUT the blindfold (#837 one layer up).",
      },
    ],
  },
  {
    id: "no-direct-useform",
    scope: AUTHORED_SRC,
    homes: [
      {
        path: "packages/client/src/forms/editor/contexts.ts",
        why: "the ONE `createFormHookContexts()` call the whole form toolkit is built on, split from use-app-form.ts only so bound components can import the contexts without a cycle",
      },
      {
        path: "packages/client/src/forms/editor/use-app-form.ts",
        why: "the single `createFormHook` instance every multi-field form builds from — `useAppForm` IS this call",
      },
    ],
    selectors: [
      {
        selector: `ImportDeclaration[source.value='@tanstack/react-form'] > ImportSpecifier[imported.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message:
          "TanStack Form's raw mint is used outside the shared form toolkit — use `useAppForm` (and `withForm` / `withFieldGroup`) from `#forms/editor`; the raw mints bypass the bound @orb/ui Field components.",
      },
      {
        selector: `CallExpression[callee.type='MemberExpression'][callee.property.name=${alternation(TANSTACK_FORM_MINTS)}]`,
        message: "TanStack Form's raw mint is called through a namespace outside the shared form toolkit — use `useAppForm` from `#forms/editor`.",
      },
    ],
  },
  {
    id: "firehose-import-allowlist",
    scope: rootSources("@server"),
    homes: [
      {
        path: "packages/server/src/entry/compose/automation-watcher.ts",
        why: "the server composition root is the sole HOST-authority consumer of the unclamped all-chat stream; it injects the bounded automation operation instead of exposing the stream to a user surface",
      },
      {
        path: "packages/server/src/transport/trpc/index.ts",
        why: "the transport barrel republishes the canonical firehose only so the composition root can wire the HOST-authority consumer",
      },
    ],
    selectors: [
      {
        selector: `:matches(ImportSpecifier[imported.name='${FIREHOSE_SYMBOL}'], ExportSpecifier[local.name='${FIREHOSE_SYMBOL}'])`,
        message: `The all-chats firehose \`${FIREHOSE_SYMBOL}\` is importable ONLY by the composition root (entry/compose). It is unclamped by type — no chatId, no caller, no per-member history-floor verdict — so any per-user surface fed from it ships a join-history leak (D162). Tail \`subscribeChatEvents\` behind the member-gated \`chatEventBounds\` probe instead.`,
      },
      {
        selector: `:matches(MemberExpression[computed=false][property.name='${FIREHOSE_SYMBOL}'], MemberExpression[computed=true][property.value='${FIREHOSE_SYMBOL}'])`,
        message: `The all-chats firehose \`${FIREHOSE_SYMBOL}\` is importable ONLY by the composition root (entry/compose) (D162).`,
      },
    ],
  },
  {
    id: "bus-channel-primitive",
    scope: [SERVER_TRANSPORT],
    homes: [
      {
        path: "packages/server/src/transport/trpc/bus-channel.ts",
        why: "`defineBusChannel`'s own module — the node EventEmitter it wraps is constructed HERE, which is the point of the mint (M9, client-architecture-state-and-gates.md §13/§16 G10)",
      },
    ],
    selectors: [
      {
        selector:
          ":matches(ImportDeclaration[source.value=/^(node:)?events$/] > ImportSpecifier[imported.name='EventEmitter'], ExportNamedDeclaration[source.value=/^(node:)?events$/] > ExportSpecifier[local.name='EventEmitter'])",
        message:
          "`EventEmitter` under packages/server/src/transport/ outside the mint — `defineBusChannel` (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home; a bespoke emitter re-introduces the machinery M9 unified.",
      },
      {
        selector: "NewExpression[callee.type='MemberExpression'][callee.property.name='EventEmitter']",
        message:
          "`new events.EventEmitter()` under packages/server/src/transport/ outside the mint — route the bus through `defineBusChannel` (transport/trpc/bus-channel.ts).",
      },
    ],
  },
  {
    id: "no-raw-matchmedia",
    scope: rootSources("@client", "@ui"),
    homes: [
      {
        path: "packages/ui/src/lib/coarse-pointer-now.ts",
        why: "the ONE `(pointer: coarse)` / `(pointer: fine)` home (`coarsePointerNow()`, `finePointerNow()`, `useCoarsePointer()`)",
      },
      { path: "packages/ui/src/lib/reduced-motion-now.ts", why: "the imperative reduced-motion one-home (`prefersReducedMotionNow()`)" },
      {
        path: "packages/client/src/features/app-shell/hooks/use-is-mobile-viewport.ts",
        why: "the shell's viewport one-home: the ONE place the mobile-viewport fact is read; the rest of the client reads it off `#state`",
      },
      { path: "packages/ui/src/lib/use-prefers-light-color-scheme.ts", why: "the canonical OS color-scheme query and subscription" },
      {
        path: "packages/ui/src/lib/use-prefers-reduced-motion.ts",
        why: "the render-time reduced-motion one-home: one `matchMedia` + `useSyncExternalStore` subscription for every non-CSS motion path",
      },
    ],
    globals: [{ name: MATCH_MEDIA, message: "A bare `matchMedia` read outside the named media-query one-homes (UI-Gates-and-Lessons.md §11)." }],
    selectors: [
      {
        // `typeof x.matchMedia` is a capability probe, not a read of the api, and every one-home does it first.
        selector: `MemberExpression[computed=false][property.name='${MATCH_MEDIA}']:not(UnaryExpression[operator='typeof'] > MemberExpression)`,
        message:
          "A raw `matchMedia` read outside the named media-query one-homes — use `usePrefersReducedMotion()` / `usePrefersLightColorScheme()` (render), `prefersReducedMotionNow()` / `coarsePointerNow()` / `finePointerNow()` (imperative) from `@orb/ui`'s `#lib`, or the shell's viewport hook (UI-Gates-and-Lessons.md §11).",
      },
      {
        selector: `MemberExpression[computed=true][property.value='${MATCH_MEDIA}']:not(UnaryExpression[operator='typeof'] > MemberExpression)`,
        message: "A raw `matchMedia` read outside the named media-query one-homes (UI-Gates-and-Lessons.md §11).",
      },
    ],
  },
  {
    id: "fetch-fn-in-features",
    scope: [CLIENT_FEATURES],
    homes: [],
    globals: [
      {
        name: "fetch",
        message:
          "A client feature never writes `fetch(` — HTTP-route egress gets ONE data/ fetch fn each (beside upload-asset.ts / auth-session.ts / post-bug-report.ts), imported via #data; everything else is tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
    selectors: [
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|window|self)$/]:matches([callee.property.name='fetch'], [callee.property.value='fetch'])",
        message: "A client feature never writes `fetch(` — use the data/ fetch fn for the route, or tRPC (client-architecture-state-and-gates.md §10/§16 R5).",
      },
    ],
  },
  {
    id: "windowed-infinite-query",
    scope: rootSources("@client"),
    homes: [],
    selectors: [
      {
        selector: `Property:matches([key.type='Identifier'][key.name='maxPages'], [key.type='Literal'][key.value='maxPages'])`,
        message:
          "`maxPages` windows an infinite query's cache: evicted head pages cannot be re-fetched and a client lens searches only the window. Delete the cap and push search, sort and filter server-side onto the keyset (client-architecture-lockdown.md).",
      },
    ],
  },
  {
    id: "dialog-via-composite",
    scope: [CLIENT_FEATURES_TSX],
    homes: [],
    selectors: [
      {
        selector: "ImportDeclaration[source.value='@orb/ui/dialog'] > ImportSpecifier[imported.name='Dialog']",
        message: "A features/** file imports the raw `Dialog` root from @orb/ui/dialog — use FormDialog for a form/prompt or ConfirmDialog for an alert.",
      },
    ],
  },
  {
    id: "no-raw-interactive-intrinsics",
    scope: [CLIENT_FEATURES_TSX],
    homes: [
      {
        path: "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
        why: "the shell scrim is part of the app frame an @orb/ui Button is rendered inside — a borderless pointer-only backdrop painted by shell.css, not a feature affordance",
      },
    ],
    selectors: [
      {
        selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=${alternation(["button", "input", "select", "textarea"])}]`,
        message:
          "A raw interactive intrinsic in a feature (D62) — interactivity comes from an @orb/ui primitive (Button, TextField, Select, TextArea, Link), never a hand-rolled <button>/<input>/<select>/<textarea>.",
      },
      {
        // An `<a>` with no href is an anchor TARGET, not a control.
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='a']:has(> JSXAttribute[name.name='href'])",
        message: "A raw `<a href>` in a feature (D62) — use the @orb/ui Link primitive.",
      },
    ],
  },
  {
    id: "no-static-staletime",
    scope: AUTHORED_SRC,
    notNamed: [TEST_FILES],
    homes: [],
    selectors: [
      {
        selector: "Property[computed=false][key.name='staleTime'][value.value='static']",
        message:
          "`staleTime: 'static'` silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a green check. Use Infinity (invalidation still overrides it).",
      },
      {
        selector: "Property[computed=false][key.name='staleTime'] > TemplateLiteral[expressions.length=0][quasis.0.value.cooked='static']",
        message: "`staleTime: 'static'` silently ignores invalidateQueries. Use Infinity.",
      },
    ],
  },
  {
    id: "no-legacy-react-api",
    scope: AUTHORED_SRC,
    homes: [
      {
        path: "packages/ui/src/markdown/dialogue-paragraph.tsx",
        why: "the markdown seal transforms ALREADY-RENDERED children in a `components.p` override running after sanitize, so `Children` is the library's own interface here; there is no data array to map instead",
      },
    ],
    selectors: [
      {
        selector: `ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=${alternation(["cloneElement", "createRef", "Children", "PureComponent"])}]`,
        message: "A legacy React API (cloneElement, createRef, Children, PureComponent) — use the React 19 function-component equivalent.",
      },
      {
        selector: `ImportDeclaration[source.value='react-dom'] > ImportSpecifier[imported.name=${alternation(["useFormState", "flushSync"])}]`,
        message: "A retired react-dom API (useFormState, flushSync) — use `useActionState`, and let React schedule the flush.",
      },
    ],
  },
];

function restrictionRule({ selectors = [], globals = [] }) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const listeners = Object.fromEntries(selectors.map(({ selector, message }) => [selector, (node) => context.report({ node, message })]));
      if (globals.length > 0) {
        listeners["Program:exit"] = (program) => {
          const globalScope = context.sourceCode.getScope(program);
          // typescript-eslint declares lib classes such as BroadcastChannel as source-less global variables, so
          // their references resolve there and never reach `through`.
          const libReferences = globalScope.variables.filter(({ defs }) => defs.length === 0).flatMap(({ references }) => references);
          for (const reference of [...globalScope.through, ...libReferences]) {
            const banned = globals.find(({ name }) => name === reference.identifier.name);
            if (banned !== undefined && reference.isValueReference !== false) {
              context.report({ node: reference.identifier, message: banned.message });
            }
          }
        };
      }
      return listeners;
    },
  };
}

const sessionChannelBoundaryRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const { sourceCode } = context;
    const report = reportOnce(context, SESSION_CHANNEL_MESSAGE);
    return {
      MemberExpression: (node) => {
        const receiver = unwrapValue(node.object);
        if (
          receiver.type === "Identifier" &&
          AMBIENT_GLOBAL_RECEIVERS.has(receiver.name) &&
          isGlobalBinding(referencedVariable(sourceCode, receiver)) &&
          SESSION_CHANNEL_CONSTRUCTORS.has(memberKeyName(sourceCode, node))
        ) {
          report(node);
        }
      },
      "Program:exit"() {
        for (const reference of ambientReferences(sourceCode, SESSION_CHANNEL_CONSTRUCTORS)) {
          report(reference);
        }
      },
    };
  },
};

const TS_VALUE_WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"]);

const unwrapTsValue = (node) => {
  let current = node;
  while (TS_VALUE_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
};

const STATIC_CONST_DEPTH = 8;

const variableNamed = (scope, name) => (scope === null ? undefined : (scope.set.get(name) ?? variableNamed(scope.upper, name)));

const STABLE_DECLARATION_KINDS = new Set(["const", "let"]);

function constantInitializer(context, identifier) {
  const variable = variableNamed(context.sourceCode.getScope(identifier), identifier.name);
  const [definition] = variable?.defs ?? [];
  const declared =
    variable?.defs.length === 1 &&
    definition.type === "Variable" &&
    STABLE_DECLARATION_KINDS.has(definition.parent.kind) &&
    definition.node.id.type === "Identifier";
  const unwritten = declared && variable.references.every((reference) => !reference.isWrite() || reference.init === true);
  return unwritten && definition.node.init ? definition.node.init : undefined;
}

const SIGNED = new Map([
  ["-", (value) => -value],
  ["+", (value) => value],
]);

const joinStatic = (left, right) => (typeof left === "number" && typeof right === "number" ? left + right : `${left}${right}`);

const STATIC_TEXT_READERS = new Map([
  ["Literal", (expression) => (typeof expression.value === "string" || typeof expression.value === "number" ? expression.value : undefined)],
  [
    "TemplateLiteral",
    (expression, next) => {
      const parts = expression.expressions.map(next);
      return parts.includes(undefined) ? undefined : expression.quasis.map((quasi, index) => quasi.value.cooked + String(parts[index] ?? "")).join("");
    },
  ],
  [
    "UnaryExpression",
    (expression, next) => {
      const operand = next(expression.argument);
      const sign = SIGNED.get(expression.operator);
      return typeof operand === "number" && sign !== undefined ? sign(operand) : undefined;
    },
  ],
  [
    "BinaryExpression",
    (expression, next) => {
      const left = expression.operator === "+" ? next(expression.left) : undefined;
      const right = left === undefined ? undefined : next(expression.right);
      return right === undefined ? undefined : joinStatic(left, right);
    },
  ],
  [
    "Identifier",
    (expression, next, initializerOf) => {
      const initializer = initializerOf(expression);
      return initializer === undefined ? undefined : next(initializer);
    },
  ],
]);

function staticTextValue(context, node, depth = 0) {
  const expression = unwrapTsValue(node);
  const read = STATIC_TEXT_READERS.get(expression.type);
  const next = (child) => staticTextValue(context, child, depth + 1);
  const initializerOf = (identifier) => (depth >= STATIC_CONST_DEPTH ? undefined : constantInitializer(context, identifier));
  return read === undefined ? undefined : read(expression, next, initializerOf);
}

const spelledName = (value) => (value === undefined ? undefined : String(value));

function accessedName(context, member) {
  const { property } = member;
  if (!member.computed) {
    return property.type === "Identifier" ? property.name : undefined;
  }
  return spelledName(staticTextValue(context, property));
}

function isStyleMember(context, node) {
  const member = unwrapTsValue(node);
  return member.type === "MemberExpression" && accessedName(context, member) === "style";
}

function staticKeyName(context, property) {
  const { key } = property;
  if (property.computed) {
    return spelledName(staticTextValue(context, key));
  }
  return key.type === "Identifier" ? key.name : spelledName(key.value);
}

const TOKEN_BACKED_STYLE_PROPS = new Set(
  [
    "borderRadius",
    "boxShadow",
    "color",
    "background",
    "backgroundColor",
    "transition",
    "transitionDuration",
    "transitionTimingFunction",
    "animation",
    "gap",
    "rowGap",
    "columnGap",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ].flatMap((name) => [name, name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)]),
);

const RAW_STYLE_UNIT = /\d(?:\.\d+)?\s*(?:px|rem|em|%|ms|s|vh|vw|vmin|vmax|ch|cqh|cqw|fr|deg)\b/u;

const RAW_STYLE_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/u;

const RAW_STYLE_EASING = /\b(?:ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier)\b/u;

const BARE_STYLE_NUMBER = /^-?\d+(?:\.\d+)?$/u;

function isRawStyleValue(value) {
  const text = value === undefined ? "" : String(value).trim();
  if (text.includes("var(--")) {
    return false;
  }
  if (BARE_STYLE_NUMBER.test(text)) {
    return Number(text) !== 0;
  }
  return RAW_STYLE_UNIT.test(text) || RAW_STYLE_COLOR.test(text) || RAW_STYLE_EASING.test(text);
}

const OFF_TOKEN_STYLE_MESSAGE =
  "A token-backed CSS property (radius, shadow, colour, motion, spacing) is written as a raw literal inline; use a Tailwind token utility or reference a var(--…) token from tokens.json.";

const styleObjectOf = (container) => {
  const expression = container.expression.type === "JSXEmptyExpression" ? undefined : unwrapTsValue(container.expression);
  return expression?.type === "ObjectExpression" ? expression : undefined;
};

const offTokenInlineStyleRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const flagWhenRaw = (node, value) => {
      if (isRawStyleValue(staticTextValue(context, value))) {
        context.report({ node, message: OFF_TOKEN_STYLE_MESSAGE });
      }
    };
    const tokenBacked = (name) => name !== undefined && TOKEN_BACKED_STYLE_PROPS.has(name);
    return {
      "JSXAttribute[name.name='style'] > JSXExpressionContainer": (container) => {
        for (const property of styleObjectOf(container)?.properties ?? []) {
          const plain = property.type === "Property" && property.kind === "init" && !property.method;
          if (plain && tokenBacked(staticKeyName(context, property))) {
            flagWhenRaw(property, property.value);
          }
        }
      },
      "AssignmentExpression[operator='='][left.type='MemberExpression']": (assignment) => {
        if (tokenBacked(accessedName(context, assignment.left)) && isStyleMember(context, assignment.left.object)) {
          flagWhenRaw(assignment, assignment.right);
        }
      },
      "CallExpression[callee.type='MemberExpression']": (call) => {
        const [property, value] = call.arguments;
        const setsStyle = accessedName(context, call.callee) === "setProperty" && isStyleMember(context, call.callee.object);
        if (setsStyle && value !== undefined && tokenBacked(staticTextValue(context, property))) {
          flagWhenRaw(call, value);
        }
      },
    };
  },
};

const COLOR_TOKEN_PREFIX = "--color-";

const keyHead = (context, property) =>
  property.computed && property.key.type === "TemplateLiteral" ? property.key.quasis[0]?.value.cooked : staticKeyName(context, property);

function overridesColorToken(context, node, depth = 0) {
  const expression = unwrapTsValue(node);
  const initializer = expression.type === "Identifier" && depth < STATIC_CONST_DEPTH ? constantInitializer(context, expression) : undefined;
  if (initializer !== undefined) {
    return overridesColorToken(context, initializer, depth + 1);
  }
  return (
    expression.type === "ObjectExpression" &&
    depth < STATIC_CONST_DEPTH &&
    expression.properties.some((property) => overridesColorKey(context, property, depth))
  );
}

function overridesColorKey(context, property, depth) {
  if (property.type === "SpreadElement") {
    return overridesColorToken(context, property.argument, depth + 1);
  }
  return property.type === "Property" && (keyHead(context, property) ?? "").startsWith(COLOR_TOKEN_PREFIX);
}

const themeOverrideRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "JSXAttribute[name.name='style']": (attribute) => {
        const container = attribute.value;
        const read = container?.type === "JSXExpressionContainer" && container.expression.type !== "JSXEmptyExpression";
        if (read && overridesColorToken(context, container.expression)) {
          context.report({
            node: attribute,
            message:
              "An inline style prop overrides a --color-* design token; token overrides go through <ThemeScope>, where the value is clamped at the boundary.",
          });
        }
      },
    };
  },
};

const VARIANT_CLOSERS = new Map([
  ["]", "["],
  [")", "("],
  ["}", "{"],
]);

function consumesQuoteOrEscape(state, char) {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote !== "") {
    state.quote = char === state.quote ? "" : state.quote;
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state, char) {
  if (char === "[" || char === "(" || char === "{") {
    state.open.push(char);
    return true;
  }
  const opener = VARIANT_CLOSERS.get(char);
  if (opener !== undefined && state.open.at(-1) === opener) {
    state.open.pop();
  }
  return opener !== undefined;
}

function topLevelVariantParts(candidate) {
  const state = { open: [], quote: "", escaped: false };
  const parts = [];
  let start = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.open.length === 0) {
      parts.push(candidate.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(candidate.slice(start));
  return parts;
}

const UNREAD_TEXT = "\u0000";

function spellsDarkVariant(text) {
  return text
    .split(/\s+/u)
    .filter((candidate) => candidate !== "")
    .some((candidate) =>
      candidate.split(UNREAD_TEXT).some((piece, index, pieces) => {
        const parts = topLevelVariantParts(piece);
        return parts.slice(0, -1).includes("dark") && (parts.at(-1) !== "" || index < pieces.length - 1);
      }),
    );
}

const JOINED_TEXT_READERS = new Map([
  ["Literal", (expression) => (typeof expression.value === "string" || typeof expression.value === "number" ? String(expression.value) : UNREAD_TEXT)],
  [
    "TemplateLiteral",
    (expression, next) =>
      expression.quasis.map((quasi, index) => quasi.value.cooked + (expression.expressions[index] ? next(expression.expressions[index]) : "")).join(""),
  ],
  ["BinaryExpression", (expression, next) => (expression.operator === "+" ? next(expression.left) + next(expression.right) : UNREAD_TEXT)],
  [
    "Identifier",
    (expression, next, initializerOf) => {
      const initializer = initializerOf(expression);
      const text = initializer === undefined ? UNREAD_TEXT : next(initializer);
      // A name standing for text that is a finding on its own is reported at that declaration, not again at each use.
      return spellsDarkVariant(text) ? UNREAD_TEXT : text;
    },
  ],
]);

function joinedText(context, node, depth = 0) {
  const expression = unwrapTsValue(node);
  const read = JOINED_TEXT_READERS.get(expression.type);
  const next = (child) => joinedText(context, child, depth + 1);
  const initializerOf = (identifier) => (depth >= STATIC_CONST_DEPTH ? undefined : constantInitializer(context, identifier));
  return read === undefined ? UNREAD_TEXT : read(expression, next, initializerOf);
}

function isOutermostText(node) {
  let current = node;
  let parent = current.parent;
  while (TS_VALUE_WRAPPERS.has(parent.type) && parent.expression === current) {
    current = parent;
    parent = current.parent;
  }
  const joined = (parent.type === "BinaryExpression" && parent.operator === "+") || (parent.type === "TemplateLiteral" && parent.expressions.includes(current));
  return !joined;
}

const darkVariantRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const judge = (node) => {
      if (isOutermostText(node) && spellsDarkVariant(joinedText(context, node))) {
        context.report({ node, message: "Use a polarity-aware light-dark() token; dark: cannot follow ThemeScope-derived custom-theme polarity." });
      }
    };
    return { "Literal[value=type(string)]": judge, TemplateLiteral: judge, "BinaryExpression[operator='+']": judge };
  },
};

const STORE_HOOK_RE = /^use[A-Z].*Store$/u;

const STORE_ARRAY_REBUILDS = new Set(["map", "filter", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"]);

const STORE_OBJECT_DERIVATIONS = new Set(["keys", "values", "entries"]);

function storeSelector(call, sourceCode) {
  if (call.callee.type !== "Identifier" || call.range[0] !== call.callee.range[0]) {
    return;
  }
  const hook = sourceCode.getText(call.callee);
  if (!STORE_HOOK_RE.test(hook) && hook !== "useStore") {
    return;
  }
  const selector = call.arguments[hook === "useStore" ? 1 : 0];
  return selector !== undefined &&
    ["ArrowFunctionExpression", "FunctionExpression"].includes(selector.type) &&
    contextDirectArgument(call, selector, sourceCode)
    ? selector
    : undefined;
}

function storeCallDerivation(call, sourceCode) {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" || callee.computed || call.range[0] !== callee.range[0]) {
    return;
  }
  const name = callee.property.type === "Identifier" ? callee.property.name : undefined;
  if (
    callee.object.type === "Identifier" &&
    callee.range[0] === callee.object.range[0] &&
    sourceCode.getText(callee.object) === "Object" &&
    STORE_OBJECT_DERIVATIONS.has(name)
  ) {
    return `Object.${name}(...) derivation`;
  }
  return STORE_ARRAY_REBUILDS.has(name) ? `array-rebuilding .${name}(...) call` : undefined;
}

function storeFreshDerivation(raw, sourceCode) {
  let node = raw;
  while (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    node = node.expression;
  }
  if (node.type === "ObjectExpression" || node.type === "ArrayExpression") {
    return node.type === "ObjectExpression" ? "object literal" : "array literal";
  }
  if (node.type === "ConditionalExpression") {
    return storeFreshDerivation(node.consequent, sourceCode) ?? storeFreshDerivation(node.alternate, sourceCode);
  }
  if (node.type === "LogicalExpression") {
    return storeFreshDerivation(node.left, sourceCode) ?? storeFreshDerivation(node.right, sourceCode);
  }
  const call = node.type === "ChainExpression" ? node.expression : node;
  return call.type === "CallExpression" ? storeCallDerivation(call, sourceCode) : undefined;
}

function storeReturnOwner(node, sourceCode) {
  return sourceCode.getAncestors(node).findLast((ancestor) => {
    if (ancestor.type === "ArrowFunctionExpression" || ancestor.type === "FunctionDeclaration") {
      return true;
    }
    // The original output grammar excludes accessor and constructor boundaries, unlike ordinary methods.
    return ancestor.type === "FunctionExpression" && !["get", "set", "constructor"].includes(ancestor.parent.kind);
  });
}

const storeDerivedRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const returns = new Map();
    return {
      "ReturnStatement[argument]"(node) {
        if (node.argument === null) {
          return;
        }
        const owner = storeReturnOwner(node, context.sourceCode);
        const outputs = returns.get(owner) ?? [];
        outputs.push(node.argument);
        returns.set(owner, outputs);
      },
      "CallExpression:exit"(node) {
        const selector = storeSelector(node, context.sourceCode);
        if (selector === undefined) {
          return;
        }
        const outputs = selector.body.type === "BlockStatement" ? (returns.get(selector) ?? []) : [selector.body];
        const kind = outputs.map((output) => storeFreshDerivation(output, context.sourceCode)).find((value) => value !== undefined);
        if (kind !== undefined) {
          context.report({
            node: node.callee,
            message: `Store selector returns a fresh reference; use useShallow or a stable field/default. DERIVATION: ${kind}.`,
          });
        }
      },
    };
  },
};

function baseUiBindings(program) {
  return program.body.flatMap((node) =>
    node.type !== "ImportDeclaration" || !node.source.value.startsWith("@base-ui/react/")
      ? []
      : node.specifiers
          .filter((specifier) => specifier.type === "ImportSpecifier")
          .map((specifier) => ({
            local: specifier.local.name,
            exported: specifier.imported.name ?? specifier.imported.value,
            typeOnly: node.importKind === "type" || specifier.importKind === "type",
          })),
  );
}

function contextLiteral(node) {
  let value = node;
  while (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression" || value?.type === "TSNonNullExpression") {
    value = value.expression;
  }
  if (value?.type === "Literal" && typeof value.value === "string") {
    return value.value;
  }
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0) {
    return value.quasis[0].value.cooked;
  }
}

function contextDirectArgument(call, argument, sourceCode) {
  const index = call.arguments.indexOf(argument);
  const before = sourceCode.getTokenBefore(argument);
  return index === 0
    ? before === sourceCode.getTokenAfter(call.typeArguments ?? call.callee, { filter: (token) => token.value !== "?." })
    : index > 0 && before.value === ",";
}

const registerApiRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const entry = CLIENT_CONTEXT_RESTRICTIONS.find(({ id }) => id === "no-mutating-register-api");
    return {
      ...restrictionRule(entry).create(context),
      "VariableDeclarator[id.type='Identifier'][id.name='register']:exit"(node) {
        if (
          (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression") &&
          context.sourceCode.getTokenBefore(node.init).value === "="
        ) {
          context.report({ node: node.id, message: "Export definition values for door assembly, not a mutating register API." });
        }
      },
    };
  },
};

const typedTestIdRule = (message) => ({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "JSXAttribute[name.type='JSXIdentifier'][name.name='data-testid']"(node) {
        const value = node.value;
        const literal = value?.type === "Literal" && typeof value.value === "string";
        if (literal || (value?.type === "JSXExpressionContainer" && contextLiteral(value.expression) !== undefined)) {
          context.report({ node: node.name, message });
        }
      },
    };
  },
});

const POLL_SCHEDULE_MESSAGE =
  "A poll `intervals` schedule shared by identifier is drained by the first poll; mint it inline (`intervals: [50, 100]`) or from a factory call such as evidencePoll().";

function moduleScopeIntervalsObject(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable === undefined) {
      continue;
    }
    const init = variable.defs.length === 1 && variable.defs[0].type === "Variable" ? variable.defs[0].node.init : null;
    return (
      (scope.type === "module" || scope.type === "global") &&
      init?.type === "ObjectExpression" &&
      init.properties.some(
        (property) => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "intervals",
      )
    );
  }
  return false;
}

const ctPollIntervalsSharedRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => context.report({ node, message: POLL_SCHEDULE_MESSAGE });
    const judgeProperty = (property) => {
      if (property.type === "SpreadElement") {
        if (property.argument.type === "Identifier" && moduleScopeIntervalsObject(context.sourceCode, property.argument)) {
          report(property.argument);
        }
      } else if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "intervals") {
        if (property.shorthand) {
          report(property);
        } else if (property.value.type === "Identifier") {
          report(property.value);
        }
      }
    };
    const judgeOptions = (options) => {
      if (options?.type === "Identifier") {
        if (moduleScopeIntervalsObject(context.sourceCode, options)) {
          report(options);
        }
      } else if (options?.type === "ObjectExpression") {
        options.properties.forEach(judgeProperty);
      }
    };
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.type='Identifier']"(call) {
        const { callee } = call;
        if (callee.property.name === "toPass") {
          judgeOptions(call.arguments[0]);
        } else if (callee.property.name === "poll" && callee.object.type === "Identifier" && callee.object.name === "expect") {
          judgeOptions(call.arguments[1]);
        }
      },
    };
  },
};

const FLOORLESS_BUTTON_SIZES = new Set(
  Object.entries(BUTTON_SIZE_OVERFLOW)
    .filter(([, overflows]) => overflows)
    .map(([size]) => size),
);

const FLOORLESS_WRAP = /\bflex-wrap\b/u;

const FLOORLESS_ROW_FLOOR = /\bmin-h-touch-target\b|\bmin-h-control-[a-z]+\b|pointer-coarse:min-h-[a-z-]+/u;

const FLOORLESS_STACK_CONTROL = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

function floorlessVariableBody(declaration, sourceCode) {
  const init = declaration.init;
  if (init === null || !["ArrowFunctionExpression", "FunctionExpression"].includes(init.type) || sourceCode.getTokenBefore(init)?.value !== "=") {
    return;
  }
  return init.body;
}

function floorlessComponentBodies(program, sourceCode) {
  const declarations = program.body.map((node) => (node.type.startsWith("Export") ? node.declaration : node)).filter(Boolean);
  const bodies = new Map();
  for (const node of declarations) {
    if (node.type === "FunctionDeclaration" && node.id !== null && !bodies.has(node.id.name)) {
      bodies.set(node.id.name, node.body);
    }
  }
  for (const node of declarations.filter((declaration) => declaration.type === "VariableDeclaration")) {
    for (const declaration of node.declarations) {
      if (declaration.id.type !== "Identifier" || bodies.has(declaration.id.name)) {
        continue;
      }
      bodies.set(declaration.id.name, floorlessVariableBody(declaration, sourceCode));
    }
  }
  return bodies;
}

function floorlessMapCall(node, sourceCode) {
  const call = node?.type === "ChainExpression" ? node.expression : node;
  if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.computed) {
    return;
  }
  return sourceCode.getText(call.callee).endsWith(".map") && sourceCode.getFirstToken(call).range[0] === call.callee.range[0] ? call : undefined;
}

function floorlessDirectCallback(callback, call, sourceCode) {
  const before = sourceCode.getTokenBefore(callback);
  const afterCallee = sourceCode.getTokenAfter(call.typeArguments ?? call.callee);
  const opening = afterCallee.value === "?." ? sourceCode.getTokenAfter(afterCallee) : afterCallee;
  return before?.value === "," || before?.range[0] === opening.range[0];
}

function floorlessMappedRow(child, sourceCode) {
  if (child.type !== "JSXExpressionContainer") {
    return;
  }
  const call = floorlessMapCall(child.expression, sourceCode);
  if (call === undefined || sourceCode.getTokenAfter(sourceCode.getFirstToken(child)).range[0] !== call.range[0]) {
    return;
  }
  const callback = call.arguments[0];
  if (callback?.type !== "ArrowFunctionExpression" || !floorlessDirectCallback(callback, call, sourceCode) || callback.body.type !== "JSXElement") {
    return;
  }
  // ESTree erases parentheses; the declared map-row grammar unwraps exactly one return wrapper.
  const beforeBody = sourceCode.getTokenBefore(callback.body);
  const direct = beforeBody.value === "=>" || (beforeBody.value === "(" && sourceCode.getTokenBefore(beforeBody).value === "=>");
  return direct ? callback.body : undefined;
}

const floorlessControlRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const counts = new Map();
    const sizes = [];
    const stacks = [];
    let bodies;
    const rowIsFloorless = (element) => {
      const opening = element.openingElement;
      const ownClass = opening.attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "className");
      if (ownClass !== undefined && FLOORLESS_ROW_FLOOR.test(sourceCode.getText(ownClass))) {
        return false;
      }
      return (counts.get(element) ?? 0) > 0 || (counts.get(bodies.get(sourceCode.getText(opening.name))) ?? 0) > 0;
    };
    const mappedWithin = (owner, container) => {
      let current = owner.parent;
      while (current !== null && current !== undefined && current !== container) {
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(current.type)) {
          const call = floorlessMapCall(current.parent, sourceCode);
          if (call !== undefined && floorlessDirectCallback(current, call, sourceCode)) {
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    };
    const wrapContainer = (opening) => {
      let current = opening.selfClosing ? opening.parent.parent : opening.parent;
      while (current !== null && current !== undefined) {
        if (current.type === "JSXElement" && !current.openingElement.selfClosing && FLOORLESS_WRAP.test(sourceCode.getText(current.openingElement))) {
          return current;
        }
        current = current.parent;
      }
    };
    const report = (start, token) =>
      context.report({
        loc: { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(start + token.length) },
        message: 'Floorless Button controls repeat at a wrapping or vertical pitch; use a control size, Stack rows="control", or an explicit row floor.',
      });
    const rowWeight = (child) => {
      const mapped = floorlessMappedRow(child, sourceCode);
      const row = child.type === "JSXElement" ? child : mapped;
      if (row === undefined || !rowIsFloorless(row)) {
        return 0;
      }
      return mapped === undefined ? 1 : 2;
    };
    const judgeStack = (stack) => {
      if (FLOORLESS_STACK_CONTROL.test(sourceCode.getText(stack.openingElement))) {
        return;
      }
      if (stack.children.reduce((weight, child) => weight + rowWeight(child), 0) >= 2) {
        report(stack.openingElement.name.range[0], "Stack");
      }
    };
    const judgeSize = ({ node, token }) => {
      const container = wrapContainer(node.parent);
      if (container !== undefined && (mappedWithin(node.parent, container) || (counts.get(container) ?? 0) >= 2)) {
        report(node.value.range[0] + 1, token);
      }
    };
    return {
      Program: (program) => {
        bodies = floorlessComponentBodies(program, sourceCode);
      },
      "JSXElement:exit"(node) {
        if (!node.openingElement.selfClosing && sourceCode.getText(node.openingElement.name) === "Stack") {
          stacks.push(node);
        }
      },
      "JSXAttribute:exit"(node) {
        if (node.name.name !== "size" || node.value?.type !== "Literal" || sourceCode.getText(node.parent.name) !== "Button") {
          return;
        }
        const token = sourceCode.getText(node.value).slice(1, -1);
        if (!FLOORLESS_BUTTON_SIZES.has(token)) {
          return;
        }
        sizes.push({ node, token });
        let ancestor = node.parent;
        while (ancestor !== null && ancestor !== undefined) {
          counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
          ancestor = ancestor.parent;
        }
      },
      "Program:exit"() {
        stacks.forEach(judgeStack);
        sizes.forEach(judgeSize);
      },
    };
  },
};

function nativeDeclarationContext(context) {
  const services = context.sourceCode.parserServices;
  if (
    services.program === undefined ||
    services.program === null ||
    services.esTreeNodeToTSNodeMap === undefined ||
    services.tsNodeToESTreeNodeMap === undefined
  ) {
    throw new Error("Native declaration contracts require the parser's owning TypeScript Program and node maps");
  }
  return { ...services, checker: services.program.getTypeChecker() };
}

function nativeAliasFlag(symbol) {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0;
}

function nativeDeclarationExported(node, checker) {
  if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return true;
  }
  if (node.name === undefined) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(node.name);
  const module = checker.getSymbolAtLocation(node.getSourceFile());
  return (
    symbol !== undefined &&
    module !== undefined &&
    checker.getExportsOfModule(module).some((exported) => exported === symbol || (nativeAliasFlag(exported) && checker.getAliasedSymbol(exported) === symbol))
  );
}

const testFactoryContractRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      if (!ts.isFunctionDeclaration(declaration) || declaration.name === undefined || !nativeDeclarationExported(declaration, native.checker)) {
        return;
      }
      const name = declaration.name.text;
      const parameters = declaration.parameters;
      const typeFlags =
        // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript formatting options compose a compiler-owned bitfield.
        ts.TypeFormatFlags.UseTypeOfFunction |
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseFullyQualifiedType |
        ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;
      const pure =
        name.startsWith("make") &&
        parameters.some(
          (parameter) =>
            parameter.name.getText() === "db" ||
            native.checker.typeToString(native.checker.getTypeAtLocation(parameter), parameter, typeFlags).includes("Database"),
        );
      if (pure) {
        context.report({
          node: native.tsNodeToESTreeNodeMap.get(declaration.name),
          message: "a `make*` PURE builder accepts a db — a pure builder must stay db-free; persistence belongs to a `seed*` builder (Spine-Testing §4).",
        });
      }
    };
    return { FunctionDeclaration: check, TSDeclareFunction: check };
  },
};

const contextReturnTypeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const check = (node) => {
      if (node.name !== "ReturnType") {
        return;
      }
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const symbol = native.checker.getSymbolAtLocation(declaration);
      const declarations = symbol?.declarations ?? [];
      if (declarations.length > 0) {
        if (
          declarations.some(
            (item) =>
              native.program.isSourceFileDefaultLibrary(item.getSourceFile()) ||
              item.getSourceFile().fileName.replaceAll("\\", "/").includes("/node_modules/@types/"),
          ) &&
          declarations.every((item) => {
            const source = item.getSourceFile();
            let current = item.parent;
            while (current !== undefined && !ts.isModuleDeclaration(current)) {
              current = current.parent;
            }
            return (
              source.isDeclarationFile &&
              (!source.statements.some((statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
                (current !== undefined && current.name.getText().replaceAll(/["']/gu, "") === "global"))
            );
          })
        ) {
          context.report({ node, message: "The DI bundle type must be an explicit, hand-written interface, never reflected off a builder with ReturnType." });
        }
        return;
      }
      context.report({
        node,
        message: "Whether this ReturnType is TypeScript's reflected utility or a local type CANNOT be established: the checker binds it to no declaration.",
      });
    };
    return { Identifier: check };
  },
};

const AMBIENT_GLOBAL_RECEIVERS = new Set(["globalThis", "self", "window"]);

function nativeUnwrapExpression(raw) {
  let node = raw;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  return node;
}

function nativeSubtreeSome(node, predicate) {
  return predicate(node) || ts.forEachChild(node, (child) => nativeSubtreeSome(child, predicate) || undefined) === true;
}

function nativeOwningCallable(node) {
  let callable = node.parent;
  while (callable !== undefined) {
    if (ts.isFunctionDeclaration(callable) || ts.isArrowFunction(callable) || ts.isFunctionExpression(callable) || ts.isMethodDeclaration(callable)) {
      return callable;
    }
    callable = callable.parent;
  }
}

function nativePortalExpression(attribute) {
  const initializer = attribute?.initializer;
  return initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined
    ? nativeUnwrapExpression(initializer.expression)
    : undefined;
}

const baseUiPortalContainerRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const native = nativeDeclarationContext(context);
    const tags = new Set(
      baseUiBindings(context.sourceCode.ast)
        .filter((binding) => !binding.typeOnly)
        .map((binding) => `${binding.local}.Portal`),
    );
    const declarations = (node) => native.checker.getSymbolAtLocation(node)?.declarations ?? [];
    const check = (node) => {
      if (!tags.has(context.sourceCode.getText(node.name))) {
        return;
      }
      const portal = native.esTreeNodeToTSNodeMap.get(node);
      const callable = nativeOwningCallable(portal);
      const parameters = callable?.parameters ?? [];
      const present = parameters.some((parameter) => native.checker.getTypeAtLocation(parameter).getProperty("container") !== undefined);
      if (!present) {
        context.report({
          node: node.name,
          message: "The owning callable accepts no `container` prop at all; the caller cannot place this sealed Base UI portal.",
        });
        return;
      }
      const attribute = portal.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === "container");
      const expression = nativePortalExpression(attribute);
      const parameterRead = (value) => ts.isIdentifier(value) && declarations(value).some((declaration) => parameters.includes(declaration));
      const bindingFromParameter = (binding) => {
        let ancestor = binding.parent;
        while (ancestor !== undefined && !ts.isParameter(ancestor)) {
          ancestor = ancestor.parent;
        }
        if (ancestor !== undefined) {
          return parameters.includes(ancestor);
        }
        ancestor = binding.parent;
        while (ancestor !== undefined && !ts.isVariableDeclaration(ancestor)) {
          ancestor = ancestor.parent;
        }
        return ancestor?.initializer !== undefined && parameterRead(nativeUnwrapExpression(ancestor.initializer));
      };
      const forbidden =
        expression === undefined ||
        (ts.isIdentifier(expression) && expression.text === "undefined") ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        nativeSubtreeSome(
          expression,
          (value) => ts.isPropertyAccessExpression(value) && value.name.text === "body" && value.expression.getText() === "document",
        );
      const consumes =
        !forbidden &&
        nativeSubtreeSome(
          expression,
          (value) =>
            (ts.isPropertyAccessExpression(value) && value.name.text === "container" && parameterRead(nativeUnwrapExpression(value.expression))) ||
            (ts.isIdentifier(value) &&
              value.text === "container" &&
              declarations(value).some((declaration) => ts.isBindingElement(declaration) && bindingFromParameter(declaration))),
        );
      if (!consumes) {
        context.report({
          node: attribute === undefined ? node.name : native.tsNodeToESTreeNodeMap.get(attribute.name),
          message: "The container prop exists but this Base UI Portal target does not consume it; the caller seam is a dead wire.",
        });
      }
    };
    return { JSXOpeningElement: check };
  },
};

const COMMENTED_CODE = /^\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

const commentedCodeRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program: () => {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === "Line" && COMMENTED_CODE.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message: "Commented-out code; delete it (git history keeps it). Comments are for prose, not parked code (.claude/rules/comments.md).",
            });
          }
        }
      },
    };
  },
};

const EVALUATE_METHODS = new Set(["evaluate", "evaluateAll"]);

const FUNCTION_NODES = new Set(["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"]);

function evaluateMethodName(callee) {
  if (callee.type !== "MemberExpression") {
    return "";
  }
  if (callee.computed) {
    return callee.property.type === "Literal" ? String(callee.property.value) : "";
  }
  return callee.property.type === "Identifier" ? callee.property.name : "";
}

function isModuleScoped(scope) {
  for (let current = scope; current !== null; current = current.upper) {
    if (current.type === "function" || current.type === "function-expression-name") {
      return false;
    }
  }
  return true;
}

function isModuleCapture(reference, self) {
  const variable = reference.resolved;
  return variable !== null && variable !== self && variable.defs.length > 0 && reference.isValueReference && isModuleScoped(variable.scope);
}

const evaluateNoScopeCaptureRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const callbacks = [];
    const lookup = (from, name) => {
      let scope = from;
      while (scope !== null && !scope.set.has(name)) {
        scope = scope.upper;
      }
      return scope?.set.get(name);
    };
    const captureWithin = (fn, self) => {
      for (const reference of sourceCode.getScope(fn).through.filter((candidate) => isModuleCapture(candidate, self))) {
        if (!sourceCode.getAncestors(reference.identifier).some(({ type }) => type === "TSTypeQuery")) {
          context.report({
            node: reference.identifier,
            message: `The .evaluate() callback references the module-scope binding \`${reference.resolved.name}\`, which does not exist in the page. Thread it through the evaluate argument or move it inside the callback.`,
          });
        }
      }
    };
    // A callback imported from another module is out of per-file reach: its declaring file is not parsed here, and an
    // import binding may as well be a script string. Only a callback declared in this file is judged.
    const judgeReference = (arg) => {
      const variable = lookup(sourceCode.getScope(arg), arg.name);
      for (const def of variable?.defs ?? []) {
        const fn = def.type === "FunctionName" ? def.node : def.node.init;
        if (FUNCTION_NODES.has(fn?.type)) {
          captureWithin(fn, variable);
        }
      }
    };
    return {
      CallExpression: (node) => {
        const [arg] = node.arguments;
        if (arg !== undefined && EVALUATE_METHODS.has(evaluateMethodName(node.callee))) {
          callbacks.push(arg);
        }
      },
      "Program:exit"() {
        for (const arg of callbacks) {
          if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
            captureWithin(arg, null);
          } else if (arg.type === "Identifier") {
            judgeReference(arg);
          }
        }
      },
    };
  },
};

const SINGLE_REPLICA_ANNOTATION = "ASSUMES(single-replica)";

const STATE_CONSTRUCTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

const ARRAY_MUTATORS = new Set(["push", "shift", "splice", "unshift"]);

function singleReplicaConstruction(init, classes) {
  if (init.callee.type !== "Identifier") {
    return "";
  }
  const name = init.callee.name;
  if (STATE_CONSTRUCTORS.has(name)) {
    const seededByLiteral = init.arguments.length === 1 && init.arguments[0].type === "ArrayExpression";
    return seededByLiteral ? "" : `a \`new ${name}()\``;
  }
  const mutable = classes
    .get(name)
    ?.body.body.some((member) => (member.type === "PropertyDefinition" || member.type === "AccessorProperty") && !member.readonly);
  return mutable === true ? `an instance of the locally-declared class \`${name}\` with a non-readonly field` : "";
}

const assumesSingleReplicaRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const isMutated = (declarator) =>
      sourceCode
        .getDeclaredVariables(declarator)
        .flatMap(({ references }) => references)
        .some(({ identifier }) => {
          const member = identifier.parent;
          return (
            member.type === "MemberExpression" &&
            member.object === identifier &&
            !member.computed &&
            ARRAY_MUTATORS.has(member.property.name) &&
            member.parent.type === "CallExpression" &&
            member.parent.callee === member
          );
        });
    const detailOf = (declarator, classes) => {
      const init = declarator.init;
      if (init?.type === "ArrayExpression") {
        return isMutated(declarator) ? "an array accumulator mutated via push/shift/splice/unshift" : "";
      }
      return init?.type === "NewExpression" ? singleReplicaConstruction(init, classes) : "";
    };
    return {
      Program: (program) => {
        if (sourceCode.getAllComments().some(({ value }) => value.includes(SINGLE_REPLICA_ANNOTATION))) {
          return;
        }
        const statements = program.body.map((statement) =>
          statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement,
        );
        const classes = new Map(statements.filter((s) => s?.type === "ClassDeclaration" && s.id !== null).map((s) => [s.id.name, s]));
        const declarators = statements.flatMap((statement) => (statement?.type === "VariableDeclaration" ? statement.declarations : []));
        for (const declarator of declarators) {
          const detail = detailOf(declarator, classes);
          if (detail !== "") {
            const id = declarator.id;
            // An annotated identifier's range includes `: Type`; the bare name is the position that carries the finding.
            const loc =
              id.type === "Identifier" ? { start: id.loc.start, end: { line: id.loc.start.line, column: id.loc.start.column + id.name.length } } : id.loc;
            context.report({
              loc,
              message: `Module-scope mutable per-process state (${detail}); annotate the file with ASSUMES(single-replica) naming a DB-backed replacement seam, or move the state out of module scope.`,
            });
          }
        }
      },
    };
  },
};

function lexicalVariable(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
  }
}

const SIDE_GEN_KNOBS = new Set(["temperature", "maxOutputTokens", "topP"]);

const SIDE_GEN_SHARED_KNOB = "maxTokens";

const SIDE_GEN_MESSAGE =
  "Hardcoded side-gen sampling value: resolve the posture through resolveSideGenSampling and SIDE_GEN_POSTURES from @orb/contracts/preset; a buried constant is a value the user's preset params can never override.";

function authoredNumber(context, node, hops = 4) {
  if (node.type === "Literal") {
    return typeof node.value === "number";
  }
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
    return authoredNumber(context, node.argument, hops);
  }
  if (node.type !== "Identifier" || hops === 0) {
    return false;
  }
  const definition = lexicalVariable(context, node)?.defs[0];
  return (
    definition?.type === "Variable" &&
    definition.parent.kind === "const" &&
    definition.node.init !== null &&
    authoredNumber(context, definition.node.init, hops - 1)
  );
}

const sideGenSamplingRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "ObjectExpression > Property[kind='init']"(property) {
        const name = staticKeyName(context, property);
        const knob =
          SIDE_GEN_KNOBS.has(name) ||
          (name === SIDE_GEN_SHARED_KNOB &&
            property.parent.properties.some((sibling) => sibling.type === "Property" && SIDE_GEN_KNOBS.has(staticKeyName(context, sibling))));
        if (knob && authoredNumber(context, property.value)) {
          context.report({ node: property.key, message: SIDE_GEN_MESSAGE });
        }
      },
    };
  },
};

const RECEDED_INK_NAME = "RECEDED_INK";

const VARIANT_PREFIX_END = /\S:$/u;

function importedRecededInk(context, expression) {
  if (expression.type === "Identifier") {
    return expression.name === RECEDED_INK_NAME && lexicalVariable(context, expression)?.defs[0]?.node.type === "ImportSpecifier";
  }
  return (
    staticMemberName(expression) === RECEDED_INK_NAME &&
    expression.object.type === "Identifier" &&
    lexicalVariable(context, expression.object)?.defs[0]?.node.type === "ImportNamespaceSpecifier"
  );
}

const recededInkRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "TemplateLiteral[expressions.length>0]"(template) {
        template.expressions.forEach((expression, index) => {
          if (importedRecededInk(context, expression) && VARIANT_PREFIX_END.test(template.quasis[index].value.raw)) {
            context.report({
              node: expression,
              message:
                "RECEDED_INK behind a Tailwind variant states nothing about the control's rest state, the only state the recession ruling governs. Carry it unprefixed on the composite's own control, or author the colour directly when the control recedes only in a variant state (packages/ui/src/lib/receded-ink.ts).",
            });
          }
        });
      },
    };
  },
};

function staticMemberName(member) {
  if (member.type !== "MemberExpression") {
    return;
  }
  if (!member.computed) {
    return member.property.type === "Identifier" ? member.property.name : undefined;
  }
  if (member.property.type === "Literal" && typeof member.property.value === "string") {
    return member.property.value;
  }
  return member.property.type === "TemplateLiteral" && member.property.expressions.length === 0 ? member.property.quasis[0].value.cooked : undefined;
}

const ZOD_MODULE = /^zod(?:\/|$)/u;

const ZOD_STRING_BUILDER = "string";

const ZOD_COERCE = "coerce";

const ZOD_OBJECT_NAMES = new Set(["z", "*", "default"]);

function zodImportName(context, identifier) {
  const definition = lexicalVariable(context, identifier)?.defs[0];
  if (definition?.type !== "ImportBinding" || !ZOD_MODULE.test(definition.parent.source.value)) {
    return;
  }
  const specifier = definition.node;
  if (specifier.type === "ImportNamespaceSpecifier") {
    return "*";
  }
  return specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : "default";
}

function singleInitializer(context, identifier) {
  const variable = identifier.type === "Identifier" ? lexicalVariable(context, identifier) : undefined;
  const declarator = variable?.defs.length === 1 && variable.defs[0].type === "Variable" ? variable.defs[0].node : undefined;
  const unwritten = variable?.references.every((reference) => !reference.isWrite() || reference.init === true) === true;
  return declarator?.id.type === "Identifier" && declarator.init !== null && unwritten ? declarator.init : undefined;
}

function isZodObject(context, node) {
  if (node.type === "Identifier") {
    return ZOD_OBJECT_NAMES.has(zodImportName(context, node));
  }
  return staticMemberName(node) === "z" && node.object.type === "Identifier" && ZOD_OBJECT_NAMES.has(zodImportName(context, node.object));
}

function isZodCoerce(context, node) {
  if (node.type === "Identifier") {
    return zodImportName(context, node) === ZOD_COERCE;
  }
  return staticMemberName(node) === ZOD_COERCE && isZodObject(context, node.object);
}

const ZOD_ALIAS_HOPS = 4;

function isZodStringBuilder(context, node, hops = ZOD_ALIAS_HOPS) {
  if (node.type === "Identifier") {
    if (zodImportName(context, node) === ZOD_STRING_BUILDER) {
      return true;
    }
    const initializer = hops > 0 ? singleInitializer(context, node) : undefined;
    return initializer !== undefined && isZodStringBuilder(context, initializer, hops - 1);
  }
  return staticMemberName(node) === ZOD_STRING_BUILDER && (isZodObject(context, node.object) || isZodCoerce(context, node.object));
}

function builderRoot(node) {
  let current = node;
  while (current.type === "CallExpression") {
    const receiver = current.callee.type === "MemberExpression" ? current.callee.object : undefined;
    if (receiver?.type !== "CallExpression") {
      return current;
    }
    current = receiver;
  }
}

function staticPropertyKey(property) {
  if (property.computed) {
    return "";
  }
  if (property.key.type === "Identifier") {
    return property.key.name;
  }
  return property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : "";
}

const rawIdRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      "ObjectExpression > Property"(property) {
        const name = staticPropertyKey(property);
        const root = name.endsWith("Id") ? builderRoot(property.value) : undefined;
        if (root !== undefined && isZodStringBuilder(context, root.callee)) {
          context.report({
            node: property.key,
            message: "An id-named Zod field is a raw string; use typeIdSchema(ID_PREFIX.x) or brandedId<T>() so the validated output preserves identity.",
          });
        }
      },
    };
  },
};

const JSON_METHOD = "json";

const TEXT_METHOD = "text";

const THEN_METHOD = "then";

const PARSE_METHOD = "parse";

function keepsUnknown(type) {
  if (type.type === "TSUnknownKeyword") {
    return true;
  }
  if (type.type === "TSTypeReference") {
    const params = (type.typeArguments ?? type.typeParameters)?.params ?? [];
    return params.length === 1 && keepsUnknown(params[0]);
  }
  return (
    type.type === "TSTypeLiteral" &&
    type.members.every(
      (member) => member.type === "TSPropertySignature" && member.typeAnnotation !== undefined && keepsUnknown(member.typeAnnotation.typeAnnotation),
    )
  );
}

function unwrapBody(node) {
  let current = node;
  for (;;) {
    if (current.type === "AwaitExpression") {
      current = current.argument;
    } else if (current.type === "ChainExpression") {
      current = current.expression;
    } else if ((current.type === "TSAsExpression" || current.type === "TSSatisfiesExpression") && keepsUnknown(current.typeAnnotation)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

const wireJsonRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const bodyExpression = (node) => {
      const current = unwrapBody(node);
      const initializer = singleInitializer(context, current);
      return initializer === undefined ? current : unwrapBody(initializer);
    };
    // `<x>.<method>()` with no arguments: the method's name node.
    const bodyRead = (node, method) => {
      const callee = node.type === "CallExpression" ? node.callee : undefined;
      return callee !== undefined && node.arguments.length === 0 && staticMemberName(callee) === method ? callee.property : undefined;
    };
    // The value a `.then` callback resolves to: its expression body, or its block's final `return`.
    const callbackResult = (callback) => {
      if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") {
        return;
      }
      if (callback.body.type !== "BlockStatement") {
        return callback.body;
      }
      const last = callback.body.body.at(-1);
      return last?.type === "ReturnStatement" ? (last.argument ?? undefined) : undefined;
    };
    const bodyReadUnder = (operand) => {
      const current = bodyExpression(operand);
      const json = bodyRead(current, JSON_METHOD);
      if (json !== undefined || current.type !== "CallExpression") {
        return json;
      }
      const name = staticMemberName(current.callee);
      const [first] = current.arguments;
      if (name === THEN_METHOD) {
        const result = callbackResult(first);
        return result === undefined ? undefined : bodyRead(bodyExpression(result), JSON_METHOD);
      }
      const parsesText = name === PARSE_METHOD && current.callee.object.type === "Identifier" && current.callee.object.name === "JSON" && first !== undefined;
      return parsesText && bodyRead(bodyExpression(first), TEXT_METHOD) !== undefined ? current.callee.property : undefined;
    };
    const check = (cast) => {
      if (keepsUnknown(cast.typeAnnotation)) {
        return;
      }
      const name = bodyReadUnder(cast.expression);
      if (name !== undefined) {
        context.report({
          node: name,
          message:
            "A response body is cast instead of parsed: `.json()` returns unknown and the cast trusts a shape the peer can change without the consumer compiling differently. Parse it with the boundary's canonical schema (`schema.parse(await res.json())`).",
        });
      }
    };
    return { TSAsExpression: check, TSSatisfiesExpression: check };
  },
};

const ROOT_SPAN_OPENER_NAMES = new Set(ROOT_SPAN_OPENERS);

const PROMISE_LINKS = new Set(["then", "catch", "finally"]);

const REJECTION_HANDLER_ARGUMENT = new Map([
  ["catch", 0],
  ["then", 1],
]);

const DISCARD_BODIES = new Set(["undefined", "null", "void 0"]);

const DETACHED_MESSAGES = {
  untraced:
    "Fire-and-forget work with a discarded rejection is invisible: the request root has sealed, so the failure reaches no log, trace or caller. " +
    "Await it so the caller owns completion, or start it with `superviseDetached(<ownRequestId>, <spanName>, <attrs>, () => work())`. " +
    "Work that has nothing to trace and no caller to inform takes `// eslint-disable-next-line orb/detached-work-traced -- <why it is invisible on purpose and what would end the exemption>`.",
  swallowed:
    "A catch inside a detached root span that does not rethrow seals the span `ok` on every failure. Warn or emit, then rethrow so the span marks ERROR; the supervisor owns the terminal rejection.",
  blinded:
    "A discarding `.catch` nested inside a detached root callback blinds the span: it can mark ERROR only if the rejection reaches it. Attach the absorber to the opener call, outside the callback.",
};

function unwrapTransparent(node) {
  let current = node;
  while (
    current.type === "ChainExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }
  return current;
}

function staticDetachedKey(context, node, hops = 4) {
  const value = unwrapTransparent(node);
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : undefined;
  }
  if (value.type === "TemplateLiteral") {
    return value.expressions.length === 0 ? value.quasis[0].value.cooked : undefined;
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    const left = staticDetachedKey(context, value.left, hops);
    const right = staticDetachedKey(context, value.right, hops);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const initializer = value.type === "Identifier" && hops > 0 ? singleInitializer(context, value) : undefined;
  return initializer === undefined ? undefined : staticDetachedKey(context, initializer, hops - 1);
}

function literalMember(context, node) {
  const member = unwrapTransparent(node);
  if (member.type !== "MemberExpression") {
    return;
  }
  const name = member.computed ? staticDetachedKey(context, member.property) : member.property.name;
  return name === undefined ? undefined : { name, receiver: unwrapTransparent(member.object) };
}

function isOpenerCall(context, node) {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = unwrapTransparent(node.callee);
  return ROOT_SPAN_OPENER_NAMES.has(callee.type === "Identifier" ? callee.name : literalMember(context, callee)?.name);
}

function isDiscardingHandler(context, node) {
  const handler = node === undefined ? undefined : unwrapTransparent(node);
  if (handler?.type !== "ArrowFunctionExpression" && handler?.type !== "FunctionExpression") {
    return false;
  }
  return handler.body.type === "BlockStatement"
    ? handler.body.body.length === 0
    : DISCARD_BODIES.has(context.sourceCode.getText(unwrapTransparent(handler.body)));
}

function discardsRejection(context, call) {
  const link = literalMember(context, call.callee);
  const index = link === undefined ? undefined : REJECTION_HANDLER_ARGUMENT.get(link.name);
  return index !== undefined && isDiscardingHandler(context, call.arguments[index]);
}

function hasAbsorbingLink(context, expression) {
  let current = unwrapTransparent(expression);
  while (current.type === "CallExpression") {
    if (discardsRejection(context, current)) {
      return true;
    }
    const link = literalMember(context, current.callee);
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return false;
    }
    current = link.receiver;
  }
  return false;
}

const COLLECTING_MEMBERS = new Set(["add", "push", "set", "unshift"]);

const COLLECTION_READ_MEMBERS = new Set(["values", "entries", "forEach"]);

const COMBINATOR_MEMBERS = new Set(["all", "allSettled", "race", "any", "from"]);

function chainRootName(context, expression) {
  let current = unwrapTransparent(expression);
  while (current.type === "CallExpression") {
    const link = literalMember(context, current.callee);
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return;
    }
    current = link.receiver;
  }
  return current.type === "Identifier" ? current : undefined;
}

const PROMISE_CHAIN_MEMBERS = new Set(["then", "catch", "finally"]);

const FLOW_DEPTH = 4;

const TRANSPARENT_PARENTS = new Set(["ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"]);

function bindingConsumed(context, id, depth) {
  const variable = lexicalVariable(context, id);
  return variable?.references.some((reference) => reference.isRead() && flowConsumed(context, reference.identifier, depth)) === true;
}

function loopConsumes(context, loop, depth) {
  const declarator = loop.left.type === "VariableDeclaration" ? loop.left.declarations[0] : undefined;
  return loop.await || declarator?.id.type !== "Identifier" || bindingConsumed(context, declarator.id, depth);
}

function callbackConsumes(context, callback, depth) {
  if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") {
    return callback !== undefined;
  }
  const [first] = callback.params;
  return first !== undefined && (first.type !== "Identifier" || bindingConsumed(context, first, depth));
}

function callFlowConsumed(context, parent, current, depth) {
  if (parent.callee === current) {
    return false;
  }
  return COMBINATOR_MEMBERS.has(staticMemberName(parent.callee)) ? flowConsumed(context, parent, depth) : true;
}

function memberFlowConsumed(context, parent, current, depth) {
  const call = parent.object === current && parent.parent.type === "CallExpression" && parent.parent.callee === parent ? parent.parent : undefined;
  const member = staticMemberName(parent);
  if (call === undefined) {
    return false;
  }
  if (member === "forEach") {
    return callbackConsumes(context, call.arguments[0], depth - 1);
  }
  return (COLLECTION_READ_MEMBERS.has(member) || PROMISE_CHAIN_MEMBERS.has(member)) && flowConsumed(context, call, depth);
}

function boundFlowConsumed(context, parent, current, depth) {
  const target = parent.type === "VariableDeclarator" ? parent.id : parent.left;
  const source = parent.type === "VariableDeclarator" ? parent.init : parent.right;
  return source === current && target.type === "Identifier" && bindingConsumed(context, target, depth - 1);
}

function flowConsumed(context, node, depth = FLOW_DEPTH) {
  let current = node;
  while (TRANSPARENT_PARENTS.has(current.parent?.type)) {
    current = current.parent;
  }
  const parent = current.parent;
  if (depth === 0 || parent === undefined || parent === null) {
    return false;
  }
  switch (parent.type) {
    case "AwaitExpression":
    case "ReturnStatement":
      return true;
    case "ArrowFunctionExpression":
      return parent.body === current;
    case "ArrayExpression":
    case "ConditionalExpression":
    case "LogicalExpression":
      return flowConsumed(context, parent, depth);
    case "SpreadElement":
      return parent.parent.type === "ArrayExpression" ? flowConsumed(context, parent.parent, depth) : true;
    case "ForOfStatement":
      return parent.right === current && loopConsumes(context, parent, depth - 1);
    case "VariableDeclarator":
    case "AssignmentExpression":
      return boundFlowConsumed(context, parent, current, depth);
    case "CallExpression":
      return callFlowConsumed(context, parent, current, depth);
    case "MemberExpression":
      return memberFlowConsumed(context, parent, current, depth);
    default:
      return false;
  }
}

function readsWhole(context, collection) {
  const variable = lexicalVariable(context, collection);
  return variable?.references.some(({ identifier }) => identifier !== collection && flowConsumed(context, identifier)) === true;
}

function isRetainedPromise(context, name) {
  const variable = lexicalVariable(context, name);
  return (
    variable?.references.some(({ identifier }) => {
      const call = identifier.parent;
      const collecting = call.type === "CallExpression" && call.arguments.includes(identifier) ? call.callee : undefined;
      return (
        collecting?.type === "MemberExpression" &&
        collecting.object.type === "Identifier" &&
        COLLECTING_MEMBERS.has(staticMemberName(collecting)) &&
        readsWhole(context, collecting.object)
      );
    }) === true
  );
}

function escapedCatchClause(thrown) {
  for (let node = thrown.parent; node !== null && node !== undefined; node = node.parent) {
    if (node.type === "CatchClause") {
      return node;
    }
    const guardedTry = node.type === "BlockStatement" && node.parent?.type === "TryStatement" && node.parent.block === node && node.parent.handler !== null;
    if (FUNCTION_NODES.has(node.type) || guardedTry) {
      return;
    }
  }
}

const detachedWorkRule = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const insideOpener = (node) => context.sourceCode.getAncestors(node).some((ancestor) => isOpenerCall(context, ancestor));
    const statements = [];
    const openers = [];
    const clauses = [];
    const rethrowing = new Set();
    return {
      ExpressionStatement: (statement) => {
        const raw = unwrapTransparent(statement.expression);
        const expression = raw.type === "UnaryExpression" && raw.operator === "void" ? raw.argument : raw;
        const root = chainRootName(context, expression);
        const retained = root !== undefined && isRetainedPromise(context, root);
        if (hasAbsorbingLink(context, expression) && !retained && !insideOpener(statement)) {
          statements.push(statement);
        }
      },
      CallExpression: (call) => {
        if (isOpenerCall(context, call)) {
          openers.push(call);
        } else if (discardsRejection(context, call) && insideOpener(call)) {
          context.report({ node: call, message: DETACHED_MESSAGES.blinded });
        }
      },
      CatchClause: (clause) => {
        if (insideOpener(clause)) {
          clauses.push(clause);
        }
      },
      ThrowStatement: (thrown) => {
        const clause = escapedCatchClause(thrown);
        if (clause !== undefined) {
          rethrowing.add(clause);
        }
      },
      "Program:exit": () => {
        // "Traced" is any opener call anywhere in the statement: proving the opener wraps the work needs types.
        for (const statement of statements) {
          if (!openers.some(({ range }) => range[0] >= statement.range[0] && range[1] <= statement.range[1])) {
            context.report({ node: statement, message: DETACHED_MESSAGES.untraced });
          }
        }
        // Reported at the owning `try`, so a waiver sits above the statement a reader sees.
        for (const clause of clauses.filter((candidate) => !rethrowing.has(candidate))) {
          context.report({ node: clause.parent, message: DETACHED_MESSAGES.swallowed });
        }
      },
    };
  },
};

const PLUGIN_MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";

const PLUGIN_DUMP_HELPER = "Program > FunctionDeclaration[id.name='tryDumpGuestValue']";

const PLUGIN_DUMP_GUARD_EXIT =
  "IfStatement[test.operator='!'][test.argument.type='CallExpression'][test.argument.callee.name='handleSafeToDump']" +
  ":has(> BlockStatement.consequent:has(> :matches(ReturnStatement, ThrowStatement)))";

const PLUGIN_DUMP_SPELLINGS = [
  "MemberExpression[property.name='dump']",
  "Property[key.name='dump']",
  ":matches(Literal[value='dump'], TemplateElement[value.cooked='dump'])",
];

const PLUGIN_DUMP_MESSAGE =
  "A QuickJS membrane `dump` outside `tryDumpGuestValue` can materialize guest-controlled recursive structure without the iterative handle depth/node guard; the walk runs on the HOST stack, so an overflow corrupts the shared WASM runtime for every plugin in the process (D46). Route guest values through `tryDumpGuestValue`.";

const PLUGIN_DUMP_ORDER_MESSAGE =
  "Inside `tryDumpGuestValue`, `dump` may appear only after `if (!handleSafeToDump(ctx, handle)) { return ... }`: a guard after the materialization cannot stop the host-stack walk that already ran (D46).";

const PLUGIN_DUMP_SELECTORS = [
  ...PLUGIN_DUMP_SPELLINGS.map((spelling) => ({ selector: `${spelling}:not(${PLUGIN_DUMP_HELPER} *)`, message: PLUGIN_DUMP_MESSAGE })),
  ...PLUGIN_DUMP_SPELLINGS.flatMap((spelling) => [
    { selector: `${PLUGIN_DUMP_HELPER} > BlockStatement > :not(${PLUGIN_DUMP_GUARD_EXIT} ~ *) ${spelling}`, message: PLUGIN_DUMP_ORDER_MESSAGE },
    // A parameter default or destructure runs before the body, so the guard cannot precede it.
    { selector: `${PLUGIN_DUMP_HELPER} > :not(BlockStatement) ${spelling}`, message: PLUGIN_DUMP_ORDER_MESSAGE },
  ]),
  {
    selector: ":matches(ImportSpecifier, ImportDefaultSpecifier, ImportNamespaceSpecifier)[local.name='handleSafeToDump']",
    message: "`handleSafeToDump` is the membrane's own iterative guard; an imported same-named function is not that walk (D46).",
  },
];

const LOCAL_RESTRICTIONS = [
  RESTRICTIONS,
  INFRA_AUTH_RESTRICTIONS,
  TABLE_IMPORT_RESTRICTIONS,
  IDENTITY_WRITER_RESTRICTIONS,
  CLASS_RESTRICTIONS,
  ROLE_DATA_RESTRICTIONS,
  TURN_IDENTITY_RESTRICTIONS,
  SERVER_SCOPE_RESTRICTIONS,
  AMBIENT_GLOBAL_RESTRICTIONS,
  CLIENT_CONTEXT_RESTRICTIONS,
  CLIENT_STYLE_RESTRICTIONS,
  CLIENT_CONFIG_HOST_RESTRICTIONS,
  CLIENT_SEAL_RESTRICTIONS,
  CLASS_TOKEN_RESTRICTIONS,
  CT_SPEC_RESTRICTIONS,
  SERVER_HARD_RESTRICTIONS,
  DB_SCHEMA_RESTRICTIONS,
  UI_PRIMITIVE_RESTRICTIONS,
  UI_HARD_RESTRICTIONS,
  ID_BRAND_RESTRICTIONS,
  TYPE_SHAPE_RESTRICTIONS,
].flat();
const localPlugin = {
  rules: {
    ...Object.fromEntries(LOCAL_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)])),
    ...Object.fromEntries(PRINCIPAL_RULES.map(({ id, rule }) => [id, rule])),
    "ui-ct-no-color-literal": uiCtColorRule,
    "no-raw-egress": rawEgressRule,
    "no-raw-http-client": rawHttpClientRule,
    "sole-env-reader": soleEnvReaderRule,
    "baseui-portal-container-seam": baseUiPortalContainerRule,
    "test-factory-contract": testFactoryContractRule,
    "no-context-returntype": contextReturnTypeRule,
    "no-raw-id": rawIdRule,
    "wire-json-parsed-at-consumer": wireJsonRule,
    "no-off-token-inline-style": offTokenInlineStyleRule,
    "theme-override-only-via-scope": themeOverrideRule,
    "no-tailwind-dark-variant": darkVariantRule,
    "zustand-selector-derived": storeDerivedRule,
    "no-mutating-register-api": registerApiRule,
    "state-files": stateFilesRule,
    "registry-context-via-mint": registryContextRule,
    "testid-typed-only": typedTestIdRule('Freeform data-testid string; use the typed registry via testId("key").'),
    "testid-typed-only-stories": typedTestIdRule(
      'Freeform data-testid string in a CT story; use storyTestId("key") for a story-only id or testId("key") for a production id.',
    ),
    "ct-poll-intervals-shared": ctPollIntervalsSharedRule,
    "no-floorless-control-in-wrap": floorlessControlRule,
    "evaluate-no-scope-capture": evaluateNoScopeCaptureRule,
    "assumes-single-replica": assumesSingleReplicaRule,
    "no-hardcoded-side-gen-sampling": sideGenSamplingRule,
    "session-channel-boundary": sessionChannelBoundaryRule,
    "receded-ink-integrity": recededInkRule,
    "detached-work-traced": detachedWorkRule,
    "commented-code": commentedCodeRule,
    "plugin-dump-guard": restrictionRule({ selectors: PLUGIN_DUMP_SELECTORS }),
    "browser-no-node-globals": browserNoNodeGlobalsRule,
  },
};
const LOCAL_RULE_BLOCKS = LOCAL_RESTRICTIONS.map(({ id, scope, notNamed = [], notUnder = [], homes = [] }) => ({
  files: scope,
  ...(notNamed.length + notUnder.length + homes.length === 0 ? {} : { ignores: [...notNamed, ...notUnder, ...homes.map(({ path }) => path)] }),
  plugins: { orb: localPlugin },
  rules: { [`orb/${id}`]: "error" },
}));

const NATIVE_CONFIG = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.claude/worktrees/**",
      "reports/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",

      "packages/ui/src/tokens/index.ts",
      "scripts/probes/st-goldens/sillytavern-runtime/**",
      "tooling/src/snap/lib/devtools-frontend/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-extend-native": "error",
      "no-proto": "error",
      "no-restricted-properties": [
        "error",
        { object: "Object", property: "setPrototypeOf", message: "Create the intended object without replacing its prototype." },
        { object: "Reflect", property: "setPrototypeOf", message: "Create the intended object without replacing its prototype." },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, tsdoc },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false }],
      "tsdoc/syntax": "error",
    },
  },
  {
    files: ["tests/**/*.test-d.ts"],
    rules: {
      // Negative type assertions must fail compilation when the expected error disappears.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true, "ts-check": false, minimumDescriptionLength: 10 },
      ],
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}", ...AUTHORED_SRC, ...NODE_TOOL_SOURCE],
    plugins: { regexp },
    rules: {
      ...Object.fromEntries(
        Object.entries(regexp.configs["flat/recommended"].rules)
          .filter(([id]) => id.startsWith("regexp/"))
          .map(([id, setting]) => [id, Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error"]),
      ),
      // Spelling and unused-capture suggestions are not semantic correctness policies.
      "regexp/prefer-w": "off",
      "regexp/use-ignore-case": "off",
      "regexp/no-unused-capturing-group": "off",
    },
  },
  {
    files: [".claude/**", "tooling/**", "tests/**", "scripts/**"],
    rules: { "regexp/no-super-linear-backtracking": "off" },
  },
  { files: SOURCE, languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: ROOT } } },
  {
    files: SOURCE,
    ignores: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      // JSX event handlers may return a Promise; non-JSX void callbacks still require correct handling.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/require-array-sort-compare": ["error", { ignoreStringArrays: true }],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-unnecessary-type-conversion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-deprecated": "error",
    },
  },
  ...["main", "ui", "frame"].map((runtime) => ({
    files: [`packages/showcase-plugins/bundles/*/${runtime}.ts`],
    languageOptions: {
      parserOptions: { project: [`packages/showcase-plugins/tsconfig.author-${runtime}.json`], projectService: false, tsconfigRootDir: ROOT },
    },
    rules: {
      ...ASYNC_SAFETY_RULES,
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "never" }],
    },
  })),
  {
    files: ["tests/**/*.{ts,tsx,mts,cts}", "scripts/**/*.tsx", "playwright/**/*.{ts,tsx}"],
    ignores: ["**/*.d.{ts,mts,cts}"],
    languageOptions: { parserOptions: { project: TEST_PROJECTS, projectService: false, tsconfigRootDir: ROOT } },
    // Async test doubles implement Promise contracts without asynchronous work.
    rules: ASYNC_SAFETY_RULES,
  },
  {
    files: NODE_TOOL_SOURCE,
    ignores: ["**/*.d.{ts,mts,cts}"],
    languageOptions: { parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: ROOT } },
    rules: ASYNC_SAFETY_RULES,
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx,mts,cts}", "tooling/src/**/*.{ts,tsx,mts,cts}", "tests/**/*.{ts,mts,cts}", ...NODE_TOOL_SOURCE],
    ignores: [...REACT_SOURCE, ...PLAYWRIGHT_TESTS, "tests/**/*.dom.test.ts", "tests/**/*.dom.test-d.ts", "tests/support/browser/**"],
    rules: { "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "never" }] },
  },
  {
    files: ["packages/plugin-sdk/main.d.ts", "packages/plugin-sdk/ui.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", types: "never", path: "always" }] },
  },
  {
    files: REACT_SOURCE,
    plugins: {
      "react-hooks": reactHooks,
      "react-web-api": reactWebApi,
      "react-x": reactX,
      "react-you-might-not-need-an-effect": reactNoEffect,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      "jsx-a11y": {
        components: {
          Button: "button",
          IconButton: "button",
          Toggle: "button",
          // Field context supplies the accessible name of these composite input controls at runtime.
          Switch: "input",
          Checkbox: "input",
          Input: "input",
          CommandInput: "input",
          Textarea: "textarea",
          Slider: "input",
          Select: "select",
        },
      },
    },
    rules: {
      ...REACT_HOOK_RULES,
      "react-web-api/no-leaked-event-listener": "error",
      "react-web-api/no-leaked-fetch": "error",
      "react-web-api/no-leaked-intersection-observer": "error",
      "react-web-api/no-leaked-interval": "error",
      "react-web-api/no-leaked-resize-observer": "error",
      "react-web-api/no-leaked-timeout": "error",
      "react-x/no-forward-ref": "error",
      "react-x/no-use-context": "error",
      "react-x/no-context-provider": "error",
      "react-x/no-clone-element": "error",
      "react-x/no-create-ref": "error",
      "react-x/no-children-count": "error",
      "react-x/no-children-for-each": "error",
      "react-x/no-children-map": "error",
      "react-x/no-children-only": "error",
      "react-x/no-class-component": "error",
      "react-you-might-not-need-an-effect/no-derived-state": "error",
      "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
      "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-initialize-state": "error",
      "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
      ...jsxA11y.flatConfigs.strict.rules,
      "jsx-a11y/control-has-associated-label": [
        "error",
        { labelAttributes: ["label"], ignoreElements: ["audio", "canvas", "embed", "input", "textarea", "tr", "video"] },
      ],
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Checkbox", "Switch", "Toggle", "Input"], assert: "either" }],
    },
  },
  {
    files: REACT_TEST_SOURCE,
    plugins: { "react-hooks": reactHooks },
    rules: REACT_HOOK_RULES,
  },
  {
    // The React compiler deliberately skips these third-party virtualizer wrappers.
    files: [
      "packages/ui/src/primitives/virtual-list/virtual-list.tsx",
      "packages/ui/src/primitives/message-list/message-list.tsx",
      "packages/ui/src/primitives/media-grid/media-grid.tsx",
    ],
    rules: { "react-hooks/incompatible-library": "off" },
  },
  {
    files: ["packages/client/src/**/*.{ts,tsx}"],
    plugins: { "@tanstack/query": pluginQuery, "@tanstack/router": pluginRouter },
    rules: {
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/prefer-query-options": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/infinite-query-property-order": "error",
      "@tanstack/router/create-route-property-order": "error",
    },
  },
  ...["ui", "client"].map((name) => ({
    files: [`packages/${name}/src/**/*.{ts,tsx}`],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: { "better-tailwindcss": { entryPoint: fileURLToPath(new URL(`./packages/${name}/src/styles/globals.css`, import.meta.url)) } },
    rules: {
      "better-tailwindcss/enforce-consistent-variable-syntax": ["error", { syntax: "shorthand" }],
      "better-tailwindcss/no-deprecated-classes": "error",
    },
  })),
  {
    files: ["packages/server/src/**/*.ts", "packages/db/src/**/*.ts"],
    plugins: { drizzle },
    rules: {
      "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
      "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: PLAYWRIGHT_TESTS,
    plugins: { vitest },
    settings: {
      vitest: {
        vitestImports: [
          "@orb/testkit/node/fixtures.ts",
          "@orb/testkit/node/tool-fixtures.ts",
          /(?:^|\/)(?:_fixtures|_support|fixtures|tool-fixtures|[\w-]+\.fixtures)\.ts$/u,
        ],
      },
    },
    rules: {
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"], additionalTestBlockFunctions: ["auditRuleTest", "cellTest"] }],
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      "vitest/no-standalone-expect": ["error", { additionalTestBlockFunctions: ["auditRuleTest", "cellTest"] }],
      "vitest/valid-title": ["error", { allowArguments: true }],
    },
  },
  {
    files: PLAYWRIGHT_TESTS,
    plugins: { playwright },
    rules: {
      "playwright/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf"] }],
      "playwright/no-skipped-test": ["error", { allowConditional: true }],
      "playwright/prefer-to-have-count": "error",
    },
  },
];

export default [
  ...NATIVE_CONFIG.map((block) =>
    block.files === undefined || block.rules === undefined ? block : { ...block, ignores: [...(block.ignores ?? []), "**/*.gen.{ts,tsx}"] },
  ),
  ...LOCAL_RULE_BLOCKS,
  {
    files: ["packages/server/src/**/*.{ts,tsx}"],
    ignores: ["packages/server/src/domain/import/**", "packages/server/src/domain/export/**", "packages/server/src/domain/settings/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT, PNG_CHUNK_IMPORT] }] },
  },
  {
    files: ["packages/server/src/domain/import/**/*.{ts,tsx}", "packages/server/src/domain/export/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [SETTINGS_TABLE_IMPORT] }] },
  },
  { files: ["packages/server/src/domain/settings/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: [PNG_CHUNK_IMPORT] }] } },
  { files: rootSources("@server", "@inference"), rules: { "no-restricted-syntax": ["error", ...SERVER_SYNTAX] } },
  {
    files: ["packages/server/src/domain/settings/seed-themes.ts", "packages/server/src/domain/preset/seed.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...SERVER_SYNTAX,
        {
          selector:
            "Program > :matches(ExportAllDeclaration, ExportDefaultDeclaration, ExportNamedDeclaration[exportKind!='type'][declaration.type!='FunctionDeclaration'])",
          message:
            "System seed roots cannot forward exports through specifiers, defaults, stars or non-function value declarations; keep the declared seed functions. Function-return escape is outside this syntax claim (D328).",
        },
      ],
    },
  },
  ...PRINCIPAL_RULES.map(({ id, notUnder }) => ({
    files: PRINCIPAL_SCOPE,
    ...(notUnder === undefined ? {} : { ignores: notUnder }),
    plugins: { orb: localPlugin },
    rules: { [`orb/${id}`]: "error" },
  })),
  {
    files: ["**/*.{ts,tsx}", "tests/support/node/**/*.mjs"],
    ignores: ["tests/legacy/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/commented-code": "error" },
  },
  {
    files: rootSources("@server", "@inference"),
    ignores: ["packages/server/src/**/persistence/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/assumes-single-replica": "error" },
  },
  { files: rootSources("@server", "@inference"), plugins: { orb: localPlugin }, rules: { "orb/detached-work-traced": "error" } },
  { files: rootSources("@tooling"), plugins: { orb: localPlugin }, rules: { "orb/evaluate-no-scope-capture": "error" } },
  {
    files: ["packages/server/src/domain/**/*.{ts,tsx}", "packages/server/src/entry/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/no-hardcoded-side-gen-sampling": "error" },
  },
  {
    files: rootSources("@client", "@ui"),
    plugins: { orb: localPlugin },
    rules: {
      "orb/receded-ink-integrity": "error",
      "orb/no-tailwind-dark-variant": "error",
      "orb/no-floorless-control-in-wrap": "error",
      "orb/browser-no-node-globals": "error",
    },
  },
  {
    files: BROWSER_MOUNT_SOURCE,
    ignores: ["tests/**/*.ct.tsx", "{tests,scripts}/support/{iso,node}/**"],
    plugins: { orb: localPlugin },
    rules: { "orb/browser-no-node-globals": "error" },
  },
  { files: [CLIENT_SRC], plugins: { orb: localPlugin }, rules: { "orb/zustand-selector-derived": "error", "orb/testid-typed-only": "error" } },
  {
    files: [CLIENT_SRC],
    ignores: ["packages/client/src/lib/session-channel.ts"],
    plugins: { orb: localPlugin },
    rules: { "orb/session-channel-boundary": "error" },
  },
  { files: ["tests/**/*.{ts,tsx}"], plugins: { orb: localPlugin }, rules: { "orb/ct-poll-intervals-shared": "error" } },
  { files: ["tests/ui/**/*.ct.tsx"], plugins: { orb: localPlugin }, rules: { "orb/ui-ct-no-color-literal": "error" } },
  { files: [PLUGIN_MEMBRANE], plugins: { orb: localPlugin }, rules: { "orb/plugin-dump-guard": "error" } },
  { files: ["packages/ui/src/**/*.{ts,tsx}"], plugins: { orb: localPlugin }, rules: { "orb/baseui-portal-container-seam": "error" } },
  {
    files: ["tests/support/node/factories/**/*.{ts,tsx}", "**/tests/support/node/factories/**/*.{ts,tsx}"],
    plugins: { orb: localPlugin },
    rules: { "orb/test-factory-contract": "error" },
  },
  {
    files: AUTHORED_SRC.map((glob) => [glob, "**/context.ts"]),
    plugins: { orb: localPlugin },
    rules: { "orb/no-context-returntype": "error" },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: ["tests/support/**", "tests/tooling/**", "**/*.test-d.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "vitest", importNames: ["test", "it"], message: "Use the shared @orb/testkit/node/fixtures.ts test entry." }],
          patterns: [
            {
              regex: "^(@orb/server(?:/|$)|#server/|.*packages/server/)",
              importNamePattern: "^create(?:Services|.*(?:Service|Context))$",
              allowTypeImports: true,
              message: "Use the production graph from testkit; application tests must not assemble replacement services or contexts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    ignores: ["tests/tooling/**", "**/*.test-d.ts"],
    rules: {
      "no-restricted-syntax": ["error", INTERNAL_MODULE_MOCK_RESTRICTION],
    },
  },
  {
    files: ["tests/**/*.ct.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        INTERNAL_MODULE_MOCK_RESTRICTION,
        { selector: "JSXElement, JSXFragment", message: "Keep component composition in browser stories; CT specs call native mount with data props." },
        {
          selector: "CallExpression[callee.name='mount']:not([typeArguments])",
          message: "Use mount<typeof Story> so the compiler checks mount and update props.",
        },
        {
          selector:
            "CallExpression:matches([callee.name='mount'], [callee.property.name='update']) > ObjectExpression.arguments Property > :matches(ArrowFunctionExpression, FunctionExpression)",
          message: "Create callbacks inside the browser story; mount props carry data, not Node callbacks.",
        },
        {
          selector: String.raw`ImportDeclaration[importKind!='type'][source.value=/(?:-stories|-fixtures|\.stories|\.fixtures)(?:\.tsx)?$/] > :matches(ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier[importKind!='type'])`,
          message: "Import story types only in CT specs; the gallery loads the browser implementation.",
        },
      ],
    },
  },
];
