import { SCRUBBER_FACTORY } from "./ambient.ts";
import { alternation, FIREHOSE_SYMBOL, memberNamed } from "./syntax.ts";

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

export const INFRA_AUTH_RESTRICTIONS = [
  {
    id: "infra-auth-no-userid",
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='userId']",
        message: "D40: infra/auth verifies pre-row identity; resolve userId through sessions at entry/auth/seam.ts.",
      },
    ],
  },
  {
    id: "infra-auth-pre-row-imports",
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

const tableImportDoor = (names: string): string => `ImportSpecifier:matches([imported.name=${names}], [imported.value=${names}])`;

const tableExportDoor = (names: string): string => `ExportSpecifier:matches([local.name=${names}], [local.value=${names}])`;

const DB_STAR_EXPORT = `ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}]`;

const DB_WHOLE_MODULE_DOORS = `:matches(ImportDeclaration[source.value=${DB_MODULE_SOURCE}] > ImportNamespaceSpecifier, ExportAllDeclaration[source.value=${DB_MODULE_SOURCE}], ImportExpression[source.value=${DB_MODULE_SOURCE}])`;

const STATS_ROLLUP_TABLES = alternation(["ownerStats", "characterStats", "dailyStats", "modelStats"]);

const VECTOR_TABLES = alternation(["characterEmbeddings", "imageEmbeddings", "chatDigests", "chatSegments", "chatDigestSpeakers", "documentChunks"]);

const VECTOR_WRITE_METHODS = alternation(["insert", "update", "delete"]);

const USERS_MESSAGE =
  "The users table is read and written only by domain/sessions and domain/admin (Spine-Identity-and-Auth §1, invariant 10). Take userId from the resolved Principal instead.";

const VECTOR_MESSAGE =
  "A vector table is named only by its import roles: embeddings (owner), search/persistence (retrieval), chat/memory/persistence (bookkeeping), discovery/persistence (analytics) and the debug probes (D20). Go through the search engine with a producer scope.";

export const TABLE_IMPORT_RESTRICTIONS = [
  {
    id: "discovery-no-stats-rollups",
    selectors: [tableImportDoor(STATS_ROLLUP_TABLES), tableExportDoor(STATS_ROLLUP_TABLES), DB_WHOLE_MODULE_DOORS].map((selector) => ({
      selector,
      message:
        "The stats rollup tables (ownerStats, characterStats, dailyStats, modelStats) are stats' alone; discovery computes no usage rollup (Knowledge-Cluster §7). Consume the injected stats economics op instead.",
    })),
  },
  {
    id: "no-direct-users-read",
    selectors: [tableImportDoor("'users'"), tableExportDoor("'users'"), DB_WHOLE_MODULE_DOORS].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "no-direct-users-read-reexport",
    selectors: [tableExportDoor("'users'"), DB_STAR_EXPORT].map((selector) => ({ selector, message: USERS_MESSAGE })),
  },
  {
    id: "vector-scope-derived",
    selectors: [tableImportDoor(VECTOR_TABLES), tableExportDoor(VECTOR_TABLES), DB_WHOLE_MODULE_DOORS].map((selector) => ({
      selector,
      message: VECTOR_MESSAGE,
    })),
  },
  {
    id: "vector-scope-derived-reexport",
    selectors: [tableExportDoor(VECTOR_TABLES), DB_STAR_EXPORT].map((selector) => ({ selector, message: VECTOR_MESSAGE })),
  },
  {
    id: "vector-scope-derived-write",
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
    selectors: [":matches(Literal[value=type(string)][value=/vector_distance_cos/], TemplateElement[value.raw=/vector_distance_cos/])"].map((selector) => ({
      selector,
      message:
        "vector_distance_cos is spelled only in domain/search/persistence; discovery uses in-memory cosine and memory delegates to the injected searchDigests op (D20).",
    })),
  },
];

const CLAIM_WRITER = "claimExternalIdIfUnbound";

const PENDING_JOIN_WRITER = "insertPendingSignupUserStatement";

const SUBJECT_WRITER_NAMES = alternation([CLAIM_WRITER, PENDING_JOIN_WRITER]);

const SUBJECT_KEYS = alternation(["externalId", "external_id"]);

const IDENTITY_WRITER_MESSAGE =
  "Invariant 10: bind users.externalId only through the registered sessions capabilities (provisionIdentity, linkExternalId, the D259 pending-join confirm) and their writers in sessions/persistence/users.ts.";

const PLAIN_SPELLING_MESSAGE =
  "Spell the users table and its write chain plainly: an import alias, a type wrapper or a computed verb hides the write from the identity-writer rules.";

const memberAt = (path: string, name: string): string => memberNamed(name, path === "" ? "" : `${path}.`);

const memberSpelledAt = (path: string, value: string): string =>
  `:matches([${path}.computed=false][${path}.property.name=${value}], [${path}.computed=true][${path}.property.type='Literal'][${path}.property.value=${value}], [${path}.computed=true][${path}.property.type='TemplateLiteral'][${path}.property.expressions.length=0][${path}.property.quasis.0.value.cooked=${value}])`;

const keySpelled = (value: string): string =>
  `:matches([computed=false][key.type='Identifier'][key.name=${value}], [key.type='Literal'][key.value=${value}], [computed=true][key.type='TemplateLiteral'][key.expressions.length=0][key.quasis.0.value.cooked=${value}])`;

const stringSpelled = (value: string): string =>
  `:matches(Literal[value=${value}]:not(TSLiteralType > Literal), TemplateLiteral[expressions.length=0]:not(TSLiteralType > TemplateLiteral) > TemplateElement[value.cooked=${value}])`;

const TYPE_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSNonNullExpression, TSTypeAssertion)";

const DATA_WRAPPER = ":matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion)";

const usersTableAt = (path: string): string =>
  `:matches([${path}.type='Identifier'][${path}.name='users'], [${path}.type='MemberExpression']${memberAt(path, "users")})`;

const USERS_TABLE_CALL = `CallExpression:matches(${memberAt("callee", "insert")}, ${memberAt("callee", "update")})${usersTableAt("arguments.0")}`;

const USERS_INSERT_VALUES = `CallExpression${memberAt("callee", "values")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}`;

const USERS_UPDATE_SET = `CallExpression${memberAt("callee", "set")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "update")}${usersTableAt("callee.object.arguments.0")}`;

const USERS_ROW_WRITE = `:matches(${USERS_INSERT_VALUES}, ${USERS_UPDATE_SET})`;

const USERS_UPSERT = `CallExpression${memberAt("callee", "onConflictDoUpdate")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "values")}[callee.object.callee.object.type='CallExpression']${memberAt("callee.object.callee.object.callee", "insert")}${usersTableAt("callee.object.callee.object.arguments.0")}`;

const UPSERT_SET_KEY = `Property${keySpelled("'set'")}`;

const USERS_POSITIONAL_INSERT = `CallExpression${memberAt("callee", "select")}[callee.object.type='CallExpression']${memberAt("callee.object.callee", "insert")}${usersTableAt("callee.object.arguments.0")}[arguments.length>0]`;

const PERSISTENCE_VERB = (name: string): string => `CallExpression:matches([callee.name='${name}'], ${memberAt("callee", name)})`;

const USERS_DATA_CALL = `:matches(${USERS_ROW_WRITE}, ${USERS_UPSERT}, ${PERSISTENCE_VERB("insertUser")}, ${PERSISTENCE_VERB("updateUser")})`;

const DYNAMIC_KEY = "Property[computed=true]:not([key.type='Literal'], [key.type='TemplateLiteral'][key.expressions.length=0])";

const DYNAMIC_KEY_WRITE = `${USERS_DATA_CALL} ObjectExpression > ${DYNAMIC_KEY}`;

const DYNAMIC_CALLEE =
  "[callee.type='MemberExpression'][callee.computed=true]:not([callee.property.type='Literal'], [callee.property.type='TemplateLiteral'][callee.property.expressions.length=0])";

const USERS_WRITE_CALL = `CallExpression:matches([callee.name=/^(insertUser|updateUser)$/], ${["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"].map((name) => memberAt("callee", name)).join(", ")})`;

const nonNullish = (path: string): string =>
  `:not([${path}.type='Literal'][${path}.raw='null']):not([${path}.type='Identifier'][${path}.name='undefined']):not([${path}.type=/^TS(As|Satisfies)Expression$/][${path}.expression.raw='null'])`;

const SUBJECT_KEYED_WRITE = `${USERS_WRITE_CALL} ObjectExpression > Property${keySpelled(SUBJECT_KEYS)}${nonNullish("value")}`;

const SUBJECT_ASSIGNMENT = `AssignmentExpression:matches([operator='='], [operator='??='], [operator='||='], [operator='&&='])[left.type='MemberExpression']${memberSpelledAt("left", SUBJECT_KEYS)}${nonNullish("right")}`;

const INSIDE_SUBJECT_WRITER = `:matches(FunctionDeclaration[id.name=${SUBJECT_WRITER_NAMES}], VariableDeclarator[id.name=${SUBJECT_WRITER_NAMES}]) *`;

const SUBJECT_STRING_MESSAGE = `${IDENTITY_WRITER_MESSAGE} A string spelling of the subject column hides the bind from these rules.`;

const writerReference = (name: string): { selector: string; message: string }[] => [
  { selector: `Identifier[name='${name}']`, message: IDENTITY_WRITER_MESSAGE },
  { selector: stringSpelled(`'${name}'`), message: IDENTITY_WRITER_MESSAGE },
];

const RAW_USERS_WRITE_TEXT = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?users[`\"']?(?!\\w)/i";

const RAW_USERS_WRITE_HEAD = "/\\b(?:insert(?:\\s+or\\s+\\w+)?\\s+into|replace\\s+into|update(?:\\s+or\\s+\\w+)?)\\s+[`\"']?$/i";

const HANDLE_WITHOUT_KEY = `ObjectExpression:has(> Property${keySpelled("'handle'")}):not(:has(> Property${keySpelled("'handleKey'")}))`;

export const IDENTITY_WRITER_RESTRICTIONS = [
  {
    id: "external-id-claim-writer-callers",
    selectors: writerReference(CLAIM_WRITER),
  },
  {
    id: "external-id-pending-join-writer-callers",
    selectors: writerReference(PENDING_JOIN_WRITER),
  },
  {
    id: "external-id-writer-home",
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
    selectors: [
      { selector: SUBJECT_KEYED_WRITE, message: IDENTITY_WRITER_MESSAGE },
      { selector: SUBJECT_ASSIGNMENT, message: IDENTITY_WRITER_MESSAGE },
    ],
  },
  {
    id: "external-id-opaque-users-writes",
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

export const ROLE_DATA_RESTRICTIONS = ROLE_DATA_EXPORTS.map(({ names }, index) => ({
  id: `role-data-export-surface-${index}`,
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

export const TURN_IDENTITY_RESTRICTIONS = [
  {
    id: "turn-identity-name",
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

const MEMBER_CARD_VIEW = "MemberCardView";

const MEMBER_CARD_CLAMPS = alternation(["clampMemberCard", "resolveCardVisibility"]);

export const SERVER_SCOPE_RESTRICTIONS = [
  {
    id: "member-card-clamped",
    selectors: [
      {
        selector: `:matches(TSInterfaceDeclaration, TSTypeAliasDeclaration) > Identifier.id[name='${MEMBER_CARD_VIEW}']`,
        message: "D22: MemberCardView has one home, @orb/contracts/chat; a re-spelled projection is how the clamp levels diverged.",
      },
    ],
  },
  {
    id: "member-card-clamped-clamp",
    selectors: [
      {
        selector: `:matches(FunctionDeclaration, TSDeclareFunction) > Identifier.id[name=${MEMBER_CARD_CLAMPS}], VariableDeclarator > Identifier.id[name=${MEMBER_CARD_CLAMPS}]`,
        message: "D22: the member-card clamp lives only in domain/chat/substrate/auth; a second clamp re-spells the visibility levels.",
      },
    ],
  },
  {
    id: "member-card-clamped-verb",
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='getRosterCardView']",
        message: "D22: read roster cards through chat's getMemberCard so every reader uses the same clamp.",
      },
    ],
  },
  {
    id: "membership-fan-guard",
    selectors: [
      {
        selector: ":matches(Identifier, JSXIdentifier)[name='emitUserEvent']",
        message:
          "D16/D18: chat is membership-scoped; member-visible state rides emitChatChanged or the chat bus, never an actor-only emitUserEvent that can exclude a co-member.",
      },
    ],
  },
];

export const AMBIENT_GLOBAL_RESTRICTIONS = [
  {
    id: "no-raw-egress",
  },
  {
    id: "no-raw-http-client",
  },
  {
    id: "sole-env-reader",
  },
  {
    id: "scrubber-home",
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

export const PLUGIN_DUMP_SELECTORS = [
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

export const SERVER_EVENT_RESTRICTIONS = [
  {
    id: "firehose-import-allowlist",
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
    selectors: [
      {
        selector:
          ":matches(ImportDeclaration[source.value=/^(node:)?events$/] > ImportSpecifier[imported.name='EventEmitter'], ExportNamedDeclaration[source.value=/^(node:)?events$/] > ExportSpecifier[local.name='EventEmitter'])",
        message:
          "`EventEmitter` under packages/server/src/transport/ outside the mint — `defineBusChannel` (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home; a bespoke emitter bypasses that shared lifecycle.",
      },
      {
        selector: "NewExpression[callee.type='MemberExpression'][callee.property.name='EventEmitter']",
        message:
          "`new events.EventEmitter()` under packages/server/src/transport/ outside the mint — route the bus through `defineBusChannel` (transport/trpc/bus-channel.ts).",
      },
    ],
  },
];
