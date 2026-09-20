// The PARITY PIN for the hand-mirrored wire shapes in `./trpc.ts` — the type-level gate that kills the
// e2e-mirror-drift class. `trpc.ts` deliberately imports NOTHING from the package trees (its posture: the
// specs assert against the WIRE, not against the source's own types), so its shapes are hand-declared and
// nothing used to notice when the contract they mirror moved. TRK-2 is the cost: `max` landed on the
// tracked-value wire shape, the mirror never learned it, and a live spec's `toEqual` on a stored reading
// failed under an UNRELATED title.
//
// THIS file is the only place in the e2e tree that imports `@orb/contracts` — the mirror keeps its
// import-free posture and the coupling is expressed HERE instead of being expressed nowhere. Two axes per
// shape:
//
//  1. `pin<Expected>(keys<Mirror, Contract>())` — the KEY axis, and the one that catches a field ADDED to a
//     contract (the TRK-2 bite):
//     • `unmirrored` — keys the CONTRACT declares that the mirror does not, pinned to the literal union of
//       the fields the mirror deliberately skips (`Complete` when it skips none). A new contract field lands
//       in this union and fails the pin, forcing a decision: mirror it, or spell it in the skip list.
//     • `phantom` — keys the MIRROR declares that the contract does not. ALWAYS `never`: a phantom key is a
//       typo, a missed rename, or a field the contract deleted (this is how the retired `sheet.poolDefs`
//       surfaced when this file landed).
//     `keyof` over a UNION only sees the SHARED keys, so a union-typed contract is pinned ARM BY ARM
//     (`GroupConfig`, `RpgActorRef`).
//
//  2. The VALUE axis — a field whose TYPE drifted, checked structurally through the whole nested shape:
//     • READ views: `expectTypeOf<Contract>().toExtend<Mirror>()`. The mirror's deliberate widenings stay
//       legal (a homed string-union → `string`, a branded id → `string` — the `no-inline-union-redecl`
//       posture) because the contract's narrower type is assignable to them.
//     • INPUT / partial shapes (what a spec SENDS, or a settings blob whose sections are all optional): the
//       same check over `Total<…>`. The raw direction is meaningless there — the mirror declares as REQUIRED
//       the handful of knobs its callers always pass, while the contract has them optional — but normalizing
//       optionality still type-checks every shared field. `Total` is SHALLOW, so the two deeply-nested
//       optional shapes (`PromptConfig`, the settings blob) take leaf-level value pins instead.
//
// GROWING IT: a new hand-mirrored shape in `trpc.ts` gets a pin here in the same edit. Shapes whose wire
// source is a TRANSPORT-LOCAL or DEBUG-ROUTE view (no `@orb/contracts` home) are unpinnable from here and
// are listed at the bottom — that list is the honest scope statement, not an oversight.

import type { ContextFitPreview as ContractContextFitPreview, GroupConfig, GuidedSteer, MessageView, ParticipantView, ShapeTrace } from "@orb/contracts/chat";
import type { ConnectionBinding, ResolvedConnectionView, RoutableTask, UnavailableCause, UserConnection } from "@orb/contracts/inference";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import type {
  RpgActorIdentity,
  RpgActorRef,
  RpgActorVolatile,
  RpgClockTime,
  RpgConfigView,
  RpgGameView,
  RpgInventoryItem,
  RpgJournalEntryView,
  RpgPlot,
  RpgPlotAct,
  RpgQuestView,
  RpgRevealedSpan,
  RpgRevealView,
  RpgTrackerDef,
  RpgTrackerEntry,
  RpgTrackerOrb,
  RpgTrackerValue,
  RpgTrackerView,
  RpgWeather,
} from "@orb/contracts/rpg";
import type { UserSettings as ContractUserSettings, UserSettingsSection } from "@orb/contracts/settings";
import { expectTypeOf, test } from "vitest";
import type {
  ActivePresetConfig,
  ActorRefInput,
  AppearanceThemeSettings,
  CanonMessage,
  CompactionIntent,
  ConfigView,
  ConnectionRow,
  ContextFitPreview,
  GameView,
  GroupConfigView,
  GuidedSteerInput,
  JournalEntry,
  NewConnection,
  RevealView,
  RosterSeat,
  ShapeTraceView,
  TaskBinding,
  TrackerActor,
  TrackerView,
  UserSettings,
} from "./trpc.ts";

/** The two drift axes of one hand-mirrored shape against its contract source, pinned as ONE object so a
 *  failure's diff names both the fields the contract grew and the keys the mirror invented. */
interface Drift<Mirror, Contract> {
  readonly unmirrored: Exclude<keyof Contract, keyof Mirror>;
  readonly phantom: Exclude<keyof Mirror, keyof Contract>;
}

/** A mirror that carries EVERY key of its contract source (the `toEqual`-safe shapes). */
interface Complete {
  readonly unmirrored: never;
  readonly phantom: never;
}

/** A mirror carrying a spelled-out SUBSET of its source's keys — `Omitted` is the deliberate skip list. */
interface Subset<Omitted extends PropertyKey> {
  readonly unmirrored: Omitted;
  readonly phantom: never;
}

/** Optionality-normalized: every key present, `undefined` stripped from every value. The value-axis form for
 *  an INPUT / partial shape — `Required<T>` alone is not enough under `exactOptionalPropertyTypes`, where a
 *  zod `.optional()` infers `k?: T | undefined` and keeps the `undefined` after `-?`. */
type Total<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/** The computed drift of one shape pair, as a value — the input half of the key-axis pin. TYPE-ONLY: this
 *  lane never executes (the `types` project is `typecheck.only`), and a cast-shaped fabrication would (a)
 *  trip the `no-test-fabrication` gate and (b) quietly hand a caller a lie. It throws instead. */
function keys<Mirror, Contract>(): Drift<Mirror, Contract> {
  throw new Error("mirror-parity: `keys()` is a type-level pin, never executed");
}

/** The key-axis pin: `pin<Complete>(keys<Mirror, Contract>())`. Deliberately an ARGUMENT-position check
 *  rather than `expectTypeOf(…).toEqualTypeOf(…)` — expect-type's mismatch is an opaque `TS2554: Expected 1
 *  arguments, but got 0`, while this reds with the offending key spelled out:
 *    Argument of type 'Drift<…>' is not assignable to parameter of type 'Complete'.
 *      Types of property 'unmirrored' are incompatible. Type '"max"' is not assignable to type 'never'.
 *  The direction (actual assignable to expected) makes `phantom` exact and `unmirrored` a subset of the
 *  declared skip list: a contract that GROWS a field reds, a stale skip-list entry does not. */
function pin<Expected>(actual: Expected): Expected {
  return actual;
}

// ── The tracked-field plane (TRK-2's blast radius) ────────────────────────────────────────────────────
// The mirror's per-shape interfaces are module-local by design (only the shapes a spec names are exported),
// so each is reached through its exported carrier by indexed access rather than by growing that export set.

type MirrorVolatile = NonNullable<TrackerActor["volatile"]>;
type MirrorTrackerValue = MirrorVolatile["trackerValues"][string];
type MirrorTrackerDef = TrackerView["trackerDefs"][number];
type MirrorTrackerEntry = TrackerView["gameTrackers"][number];
type MirrorTrackerOrb = TrackerView["trackerOrbs"][number];
type MirrorIdentity = NonNullable<TrackerActor["identity"]>;
type MirrorTrackerQuest = TrackerView["quests"][number];
type MirrorTrackerPlot = NonNullable<TrackerView["plot"]>;
type MirrorAmbient = NonNullable<TrackerView["ambient"]>;
type ContractActorView = RpgTrackerView["actors"][number];
type ContractAmbient = NonNullable<RpgTrackerView["ambient"]>;

test("TrackerValue mirrors RpgTrackerValue COMPLETELY (the TRK-2 `max` bite — specs `toEqual` a whole reading)", () => {
  pin<Complete>(keys<MirrorTrackerValue, RpgTrackerValue>());
  expectTypeOf<RpgTrackerValue>().toExtend<MirrorTrackerValue>();
});

test("TrackerDef / TrackerEntry / TrackerOrb mirror the tracker def + reading surfaces", () => {
  pin<Subset<"appliesTo" | "color" | "icon" | "sort">>(keys<MirrorTrackerDef, RpgTrackerDef>());
  expectTypeOf<RpgTrackerDef>().toExtend<MirrorTrackerDef>();
  pin<Complete>(keys<MirrorTrackerEntry, RpgTrackerEntry>());
  expectTypeOf<RpgTrackerEntry>().toExtend<MirrorTrackerEntry>();
  pin<Subset<"color">>(keys<MirrorTrackerOrb, RpgTrackerOrb>());
  expectTypeOf<RpgTrackerOrb>().toExtend<MirrorTrackerOrb>();
});

test("the per-actor volatile plane mirrors RpgActorVolatile (trackers + conditions + wallet + inventory rows)", () => {
  pin<Complete>(keys<MirrorVolatile, RpgActorVolatile>());
  pin<Subset<"stat" | "modifier" | "turnsLeft">>(keys<MirrorVolatile["conditions"][number], RpgActorVolatile["conditions"][number]>());
  pin<Complete>(keys<MirrorVolatile["wallet"][number], RpgActorVolatile["wallet"][number]>());
  pin<Subset<"id" | "description" | "location" | "type" | "icon">>(keys<MirrorVolatile["inventory"][number], RpgInventoryItem>());
  expectTypeOf<RpgActorVolatile>().toExtend<MirrorVolatile>();
});

test("TrackerActor + its identity SHEET mirror RpgActorView (the retired `poolDefs` class)", () => {
  pin<Subset<"avatar">>(keys<TrackerActor, ContractActorView>());
  pin<Complete>(keys<TrackerActor["sheet"], ContractActorView["sheet"]>());
  expectTypeOf<ContractActorView>().toExtend<TrackerActor>();
});

// R2 — a cast NPC is an ACTOR, so her identity half is pinned as part of the one actor row above (there is no
// separate cast shape to mirror any more; `TrackerView.cast` is a bare key list, pinned with the view).
test("TrackerActor's identity half mirrors RpgActorIdentity (the cast NPC's own plane)", () => {
  pin<Subset<"characterId" | "appearance" | "outfit" | "thoughts">>(keys<MirrorIdentity, RpgActorIdentity>());
  pin<Complete>(keys<MirrorIdentity["relationship"], RpgActorIdentity["relationship"]>());
  expectTypeOf<RpgActorIdentity>().toExtend<MirrorIdentity>();
});

test("TrackerQuest / TrackerPlot mirror the quest + plot planes", () => {
  pin<Complete>(keys<MirrorTrackerQuest, RpgQuestView>());
  pin<Complete>(keys<MirrorTrackerQuest["objectives"][number], RpgQuestView["objectives"][number]>());
  expectTypeOf<RpgQuestView>().toExtend<MirrorTrackerQuest>();
  pin<Complete>(keys<MirrorTrackerPlot, RpgPlot>());
  pin<Complete>(keys<MirrorTrackerPlot["acts"][number], RpgPlotAct>());
  expectTypeOf<RpgPlot>().toExtend<MirrorTrackerPlot>();
});

test("TrackerView + its ambient plane mirror RpgTrackerView (the whole persisted-snapshot projection)", () => {
  pin<Complete>(keys<TrackerView, RpgTrackerView>());
  pin<Complete>(keys<MirrorAmbient, ContractAmbient>());
  pin<Subset<"minute">>(keys<NonNullable<MirrorAmbient["clock"]>, RpgClockTime>());
  pin<Subset<"temperatureC" | "wind" | "visibility">>(keys<NonNullable<MirrorAmbient["weather"]>, RpgWeather>());
  expectTypeOf<RpgTrackerView>().toExtend<TrackerView>();
});

// ── The rest of the rpg wire surface ──────────────────────────────────────────────────────────────────

test("GameView / ConfigView mirror the member + host game reads", () => {
  pin<Subset<"chatId" | "canPopulate" | "effectiveDelivery" | "publicConfig">>(keys<GameView, RpgGameView>());
  expectTypeOf<RpgGameView>().toExtend<GameView>();
  pin<
    Subset<
      | "statProfile"
      | "gmPresetId"
      | "extractionContext"
      | "extractionWindowTokens"
      | "reconcileEveryBeats"
      | "dateMode"
      | "journalTypeHints"
      | "userMacros"
      | "presetMacroNames"
      | "recentBeatsKeepLast"
      | "immersiveHtmlInteractive"
      | "ruleset"
    >
  >(keys<ConfigView, RpgConfigView>());
  expectTypeOf<RpgConfigView>().toExtend<ConfigView>();
});

test("ActorRefInput mirrors RpgActorRef ARM BY ARM (a union's `keyof` only sees the shared keys)", () => {
  pin<Complete>(keys<Extract<ActorRefInput, { kind: "character" }>, Extract<RpgActorRef, { kind: "character" }>>());
  pin<Complete>(keys<Extract<ActorRefInput, { kind: "user" }>, Extract<RpgActorRef, { kind: "user" }>>());
  pin<Complete>(keys<Extract<ActorRefInput, { kind: "npc" }>, Extract<RpgActorRef, { kind: "npc" }>>());
  // Every contract arm is representable by the mirror input (the branded ids widen to `string`), and the arm
  // vocabulary itself is pinned — a NEW ref arm (full's reserved `{kind:"libraryNpc"}`) fails here, not in a
  // live spec.
  expectTypeOf<RpgActorRef>().toExtend<ActorRefInput>();
  expectTypeOf<ActorRefInput["kind"]>().toEqualTypeOf<RpgActorRef["kind"]>();
});

test("JournalEntry / RevealView mirror the journal + host-reveal reads", () => {
  pin<Subset<"label" | "createdAt">>(keys<JournalEntry, RpgJournalEntryView>());
  expectTypeOf<RpgJournalEntryView>().toExtend<JournalEntry>();
  pin<Complete>(keys<RevealView, RpgRevealView>());
  pin<Complete>(keys<RevealView["messages"][number]["spans"][number], RpgRevealedSpan>());
  pin<Complete>(keys<RevealView["standingLies"][number]["lies"][number], RpgRevealView["standingLies"][number]["lies"][number]>());
  expectTypeOf<RpgRevealView>().toExtend<RevealView>();
});

// ── The chat / preset / settings mirrors ──────────────────────────────────────────────────────────────

test("CanonMessage mirrors MessageView (the canon rows every honesty spec reads)", () => {
  pin<
    Subset<
      | "chatId"
      | "authorUserId"
      // The row-PURPOSE axis: chrome vocabulary the e2e honesty specs have no assertion for (they read
      // content/economics/ordering). A spec that starts asserting narrator/comment chrome adds it to
      // `CanonMessage` then, and this drift entry goes away.
      | "kind"
      | "excludedFromPrompt"
      | "createdAt"
      | "editedAt"
      | "selectedVariantId"
      | "reasoning"
      | "finishReason"
      | "stopReason"
      | "terminalReason"
      | "tokensOut"
      | "tokenProvenance"
      | "cacheReadTokens"
      | "cacheWriteTokens"
      | "contextWindow"
      | "costUsd"
      | "ttftMs"
      | "genStartedAt"
      | "genFinishedAt"
      | "generationId"
      | "toolCalls"
      | "connectionId"
    >
  >(keys<CanonMessage, MessageView>());
  expectTypeOf<MessageView>().toExtend<CanonMessage>();
});

test("ContextFitPreview / ShapeTraceView mirror the assemble-layer reads", () => {
  pin<Subset<"ceilingEstimated">>(keys<ContextFitPreview, ContractContextFitPreview>());
  expectTypeOf<ContractContextFitPreview>().toExtend<ContextFitPreview>();
  // `rows` (the DELIVERED wire-row projection) is deliberately outside the e2e view: the live harness asserts
  // that the stage COUNTS move with the config, and mirroring a per-row list here would pin ordering facts the
  // assembly suite already owns (`tests/server/domain/chat/assembly/shape.test.ts`, "the delivered-row trace").
  pin<Subset<"squashMerges" | "cacheBreakpointFromEnd" | "breakpointDecision" | "rows">>(keys<ShapeTraceView, ShapeTrace>());
  pin<Complete>(keys<ShapeTraceView["stageCounts"], ShapeTrace["stageCounts"]>());
  expectTypeOf<ShapeTrace>().toExtend<ShapeTraceView>();
});

test("RosterSeat mirrors ParticipantView (the group specs' roster ground truth)", () => {
  pin<
    Subset<
      | "chatId"
      | "userId"
      | "role"
      | "activePersonaId"
      | "joinedAt"
      | "joinSeq"
      | "joinHistoryVisibility"
      | "handle"
      | "avatarAssetId"
      | "avatarHash"
      | "renderPolicy"
      | "themeOverride"
      | "backgroundOverride"
    >
  >(keys<RosterSeat, ParticipantView>());
  expectTypeOf<ParticipantView>().toExtend<RosterSeat>();
});

test("GroupConfigView mirrors BOTH GroupConfig arms (the narrator arm omits `cardScope`)", () => {
  // The narrator arm OMITS `cardScope` (narrator ⇒ merged is unrepresentable), so the mirror's optional
  // `cardScope` is a phantom key against THAT arm alone — it is real on the per-speaker arm below.
  pin<{
    readonly unmirrored: never;
    readonly phantom: "cardScope";
  }>(keys<GroupConfigView, Extract<GroupConfig, { output: "narrator" }>>());
  pin<Complete>(keys<GroupConfigView, Extract<GroupConfig, { output: "per-speaker" }>>());
  expectTypeOf<GroupConfig>().toExtend<GroupConfigView>();
});

test("the SEND-side inputs mirror their contract shapes (optionality-normalized — the mirror declares what a spec always passes)", () => {
  // `rewriteToggles` (the templating fork's ARM B) is deliberately unmirrored: the e2e harness fires steers
  // by TEXT, and the toggle picks are a modal affordance the CT lane proves at the wire.
  pin<Subset<"placement" | "person" | "gameSteer" | "rewriteToggles">>(keys<GuidedSteerInput, GuidedSteer>());
  expectTypeOf<Total<GuidedSteer>>().toExtend<Total<GuidedSteerInput>>();
  pin<Subset<"verbatimTail">>(keys<CompactionIntent, NonNullable<UserIntent["compaction"]>>());
  expectTypeOf<Total<NonNullable<UserIntent["compaction"]>>>().toExtend<Total<CompactionIntent>>();
});

test("ActivePresetConfig mirrors PromptConfig (the FE-layer round-trip read)", () => {
  pin<
    Subset<
      | "schemaVersion"
      | "continuePostfix"
      | "customParameters"
      | "formatStrings"
      | "guidedActions"
      | "postProcess"
      // The turn-wire framings (2026-08-07). Deliberately unmirrored: `ActivePresetConfig` is the SPEC-side
      // read of "what will this chat assemble against", and no e2e spec drives a framing — the framings'
      // proof is the CT (authoring) plus the assembly suites (delivery). A spec that starts asserting one
      // adds the key here, exactly like every other row in this list.
      | "prose"
      | "reasoningParse"
      | "regexScripts"
      | "userMacros"
      | "variables"
    >
  >(keys<ActivePresetConfig, PromptConfig>());
  // `trigger` joined the omitted list on 2026-09-05 (#1462): the plain markers gained ST's `injection_trigger`
  // gate, so it is now a key EVERY contract section arm carries — the active-preset view still reads only
  // `id` + `enabled` (no e2e spec asserts a section's generation gate; the assembly suites own that).
  pin<Subset<"type" | "name" | "role" | "trigger">>(keys<ActivePresetConfig["sections"][number], PromptConfig["sections"][number]>());
  pin<
    Subset<
      | "advanced"
      | "compaction"
      | "effort"
      | "frequencyPenalty"
      | "logitBias"
      | "minP"
      | "presencePenalty"
      | "providerContextCompression"
      | "quality"
      | "repetitionPenalty"
      | "replyMedia"
      | "seed"
      | "stop"
      | "temperature"
      | "thinkingBudgetTokens"
      | "thinkingDisplay"
      | "topA"
      | "topK"
      | "topP"
      | "verbosity"
    >
  >(keys<ActivePresetConfig["params"], PromptConfig["params"]>());
  // Value axis at the LEAVES the harness reads: `Total` is shallow, and both of these shapes nest optional
  // objects several deep, so the whole-shape form would compare `{a?: {b?: …}}` spellings instead of the
  // fields a spec touches. The key axis above is what catches a grown contract; these catch a drifted type.
  expectTypeOf<PromptConfig["namesBehavior"]>().toExtend<ActivePresetConfig["namesBehavior"]>();
  expectTypeOf<PromptConfig["sections"][number]["id"]>().toExtend<ActivePresetConfig["sections"][number]["id"]>();
  expectTypeOf<PromptConfig["sections"][number]["enabled"]>().toExtend<ActivePresetConfig["sections"][number]["enabled"]>();
  expectTypeOf<PromptConfig["params"]["maxOutputTokens"]>().toExtend<ActivePresetConfig["params"]["maxOutputTokens"]>();
  expectTypeOf<PromptConfig["params"]["maxContextTokens"]>().toExtend<ActivePresetConfig["params"]["maxContextTokens"]>();
});

/** The blob keys that are NOT registered `USER_SETTINGS_SECTIONS` members: the version stamp only (`prose`
 *  joined the tuple with its edit surface at PROSE-1 S2). A key that appears in the blob without joining the
 *  tuple reds the settings pins, which is how this was found. */
type NonSectionKeys = "schemaVersion";

/** Every key the settings blob may carry, DERIVED from the homed section tuple (never a second spelling of
 *  the axis — `no-inline-union-redecl` is the enforcer) plus the two non-section keys above. */
type SettingsBlobKeys = UserSettingsSection | NonSectionKeys;

test("the settings mirrors project the ONE UserSettings config blob", () => {
  // Two readers, two projections of the SAME blob: `getUserSettings` reads seeds (it read `routing` too until
  // that section left the tuple with the inference program — a model pick is a `connection_bindings` row now,
  // pinned below, not a settings leaf), the #16 render-truth spec's reader reads appearance + theme (the
  // add-only support rule). Each skip list is
  // "the declared blob keys minus the ones THIS reader projects" — so a new SECTION is out of scope by
  // construction (correct: a reader projects what its specs assert), while a key that appears in the blob
  // WITHOUT joining the tuple, or a renamed section the mirror still spells, reds.
  pin<Subset<Exclude<SettingsBlobKeys, keyof UserSettings["config"]>>>(keys<UserSettings["config"], ContractUserSettings>());
  pin<Subset<Exclude<SettingsBlobKeys, keyof AppearanceThemeSettings["config"]>>>(keys<AppearanceThemeSettings["config"], ContractUserSettings>());
  // Value axis at the LEAVES each reader actually asserts on (the sections nest optional objects several
  // deep — see the ActivePresetConfig note): the seed default preset id and the four appearance/theme knobs
  // the #16 render-truth spec drives + restores. A renamed or retyped knob is red HERE.
  expectTypeOf<ContractUserSettings["seeds"]["defaultPresetId"]>().toExtend<UserSettings["config"]["seeds"]["defaultPresetId"]>();
  expectTypeOf<ContractUserSettings["appearance"]["elevation"]>().toExtend<AppearanceThemeSettings["config"]["appearance"]["elevation"]>();
  expectTypeOf<ContractUserSettings["appearance"]["backgroundImageKind"]>().toExtend<AppearanceThemeSettings["config"]["appearance"]["backgroundImageKind"]>();
  expectTypeOf<ContractUserSettings["appearance"]["backgroundAssetHash"]>().toExtend<AppearanceThemeSettings["config"]["appearance"]["backgroundAssetHash"]>();
  expectTypeOf<ContractUserSettings["theme"]["selectedThemeId"]>().toExtend<AppearanceThemeSettings["config"]["theme"]["selectedThemeId"]>();
});

test("the connection + Model-roles mirrors track `@orb/contracts/inference`", () => {
  // The harness authors ONE connection (globalSetup's local engine; the local mode's fixture provider) and
  // re-points ONE binding, so each mirror carries the handful of fields a spec matches or asserts on. The
  // skip lists are therefore long BY DESIGN — what matters is that a RENAMED or RETYPED field reds, which is
  // exactly what `phantom: never` + the value axis below do.
  pin<Subset<Exclude<keyof UserConnection, keyof ConnectionRow>>>(keys<ConnectionRow, UserConnection>());
  expectTypeOf<UserConnection["id"]>().toExtend<ConnectionRow["id"]>();
  expectTypeOf<UserConnection["label"]>().toExtend<ConnectionRow["label"]>();
  expectTypeOf<UserConnection["providerId"]>().toExtend<ConnectionRow["providerId"]>();
  expectTypeOf<UserConnection["model"]>().toExtend<ConnectionRow["model"]>();

  // The INPUT half — what `connection.create` is SENT. `Total` normalizes the two flags the mirror leaves
  // optional and the contract states outright; the key axis is what catches a writable field being renamed.
  pin<Subset<Exclude<keyof UserConnection, keyof NewConnection>>>(keys<NewConnection, UserConnection>());
  expectTypeOf<Total<UserConnection>["baseUrl"]>().toExtend<Total<NewConnection>["baseUrl"]>();
  expectTypeOf<Total<UserConnection>["credentialId"]>().toExtend<Total<NewConnection>["credentialId"]>();
  expectTypeOf<Total<UserConnection>["modelListed"]>().toExtend<Total<NewConnection>["modelListed"]>();
  expectTypeOf<Total<UserConnection>["allowBackground"]>().toExtend<Total<NewConnection>["allowBackground"]>();

  // `TaskBinding.binding` mirrors the ROW (`ConnectionBinding`) and `.resolved` the persisted-resolve view.
  // The ENVELOPE around them (`BindingView` — `{ task, binding, resolved, unavailableCause }`) is a
  // `domain/connection` result shape with no `@orb/contracts` home, so it is listed as unpinnable below.
  type MirrorBindingRow = NonNullable<TaskBinding["binding"]>;
  type MirrorResolved = NonNullable<TaskBinding["resolved"]>;
  pin<Subset<Exclude<keyof ConnectionBinding, "connectionId">>>(keys<MirrorBindingRow, ConnectionBinding>());
  expectTypeOf<ConnectionBinding["connectionId"]>().toExtend<MirrorBindingRow["connectionId"]>();
  pin<Subset<Exclude<keyof ResolvedConnectionView, keyof MirrorResolved>>>(keys<MirrorResolved, ResolvedConnectionView>());
  expectTypeOf<ResolvedConnectionView["connectionId"]>().toExtend<MirrorResolved["connectionId"]>();
  expectTypeOf<ResolvedConnectionView["providerId"]>().toExtend<MirrorResolved["providerId"]>();
  expectTypeOf<ResolvedConnectionView["api"]>().toExtend<MirrorResolved["api"]>();
  expectTypeOf<ResolvedConnectionView["model"]>().toExtend<MirrorResolved["model"]>();
  // `task` / `unavailableCause` are deliberately widened to `string` (the `no-inline-union-redecl` posture),
  // so the homed unions must stay ASSIGNABLE to them — a member turned non-string reds here.
  expectTypeOf<RoutableTask>().toExtend<TaskBinding["task"]>();
  expectTypeOf<UnavailableCause>().toExtend<NonNullable<TaskBinding["unavailableCause"]>>();
});

// ── UNPINNABLE HERE (no `@orb/contracts` home — the honest scope statement) ───────────────────────────
// `WireCapture` / `ChatDbInspection` / the debug-error ring read `/api/_debug/*` routes whose payloads are
// foundation-local shapes, and `MessagesPage` / `CharacterListPage` / `ChatDetail` / `StartedChat` /
// `PresetRow` / `ThemeRow` / `CheckpointRow` / `AssemblyPreview` mirror tRPC ENVELOPES assembled in the
// transport tier rather than a contracts type. Pinning them would mean importing `@orb/server` into the e2e
// type program; their drift stays caught the old way (a red spec).
