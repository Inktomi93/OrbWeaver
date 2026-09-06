import type { NotificationEvent, NotificationType, PresenceSnapshot, PresenceView } from "@orb/contracts/notifications";
import { AUTOMATION_NOTICE_MESSAGE_MAX, NOTIFICATION_RECIPIENTS, notificationEventSchema, PLUGIN_NOTIFICATION_RECIPIENTS } from "@orb/contracts/notifications";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// Sample values: TypeID ids are MINTED (valid prefix + suffix, so they pass the prefix-checking
// `typeIdSchema`); plain brands use the sanctioned `castId`. No pasted random-looking literals (noSecrets).
const SAMPLE_RECIPIENT = castId<UserId>("user-bob");
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_INVITE_ID = mintTypeId(ID_PREFIX.chatInvite);
const SAMPLE_HOST_HANDLE = castId<Handle>("alice");
const SAMPLE_NOMINEE_HANDLE = castId<Handle>("carol");
const SAMPLE_AUTOMATION_RULE_ID = mintTypeId(ID_PREFIX.automationRule);
const SAMPLE_PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

// One fixture per closed variant. The compile-time `Record<NotificationType, …>` below makes this list
// EXHAUSTIVE: add a union member without a fixture and `tsc` goes red (the closed-union invariant).
const FIXTURES: Record<NotificationType, NotificationEvent> = {
  invite: {
    type: "invite",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    inviteId: SAMPLE_INVITE_ID,
    invitedByHandle: SAMPLE_HOST_HANDLE,
  },
  kicked: {
    type: "kicked",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
  },
  "handoff-nominated": {
    type: "handoff-nominated",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    // The #1762 disclosure: what accepting would copy into the recipient's library, counted at nominate.
    offer: { characters: 2, worldBooks: 1, regexScripts: 1, gmPreset: true },
  },
  "handoff-accepted": {
    type: "handoff-accepted",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    newHostHandle: SAMPLE_NOMINEE_HANDLE,
  },
  "deferred-turn-dropped": {
    type: "deferred-turn-dropped",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    reason: "consent",
  },
  // The automation `post_notification` arm (automation-design/03 §1.5) — the ONE member carrying a rendered
  // (capped) `message` string; still secret-unrepresentable (a capped string, not a handle).
  "automation-notice": {
    type: "automation-notice",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    source: { kind: "rule", ruleId: SAMPLE_AUTOMATION_RULE_ID },
    message: "the tavern grows quiet",
  },
  // The plugin auto-disable notice (plugin-design/03 §4) — ids only, deep-links the owner's plugin surface.
  "plugin-disabled": {
    type: "plugin-disabled",
    recipientUserId: SAMPLE_RECIPIENT,
    pluginId: SAMPLE_PLUGIN_ID,
  },
  // The aggregate consent ask (#1041) — a count and nothing else: what each plugin wants is read on the
  // consent screen, never copied into the inbox row.
  "plugins-awaiting-consent": {
    type: "plugins-awaiting-consent",
    recipientUserId: SAMPLE_RECIPIENT,
    pendingCount: 9,
  },
};

const EXPECTED_VARIANT_COUNT = 8;

// CLOSED PIN: the union has EXACTLY the eight delivery reasons and no more. `.options.length` catches a
// stray added member; the FIXTURES Record key set is the type-checked mirror.
test("NotificationEvent is the closed 8-member delivery union", () => {
  expect(notificationEventSchema.options).toHaveLength(EXPECTED_VARIANT_COUNT);
  expect(Object.keys(FIXTURES).sort()).toEqual(
    [
      "automation-notice",
      "deferred-turn-dropped",
      "handoff-accepted",
      "handoff-nominated",
      "invite",
      "kicked",
      "plugin-disabled",
      "plugins-awaiting-consent",
    ].sort(),
  );
});

// THE ZERO RULE IS AT THE TYPE, not in the producer's head (#1041). A standing ask that says "0 plugins are
// waiting" is a lie the reader can only discover by acting on it, so the count is `.min(1)` and the
// all-answered case has to reach for `notifications.retract` instead of recording a zero. A fractional or
// negative count is refused by the same line.
test("plugins-awaiting-consent refuses a count that is not a positive integer", () => {
  const base = FIXTURES["plugins-awaiting-consent"];
  expect(notificationEventSchema.safeParse({ ...base, pendingCount: 0 }).success).toBe(false);
  expect(notificationEventSchema.safeParse({ ...base, pendingCount: -1 }).success).toBe(false);
  expect(notificationEventSchema.safeParse({ ...base, pendingCount: 1.5 }).success).toBe(false);
  expect(notificationEventSchema.safeParse({ ...base, pendingCount: 1 }).success).toBe(true);
});

// IDS-ONLY, like `plugin-disabled` one member up: the aggregate is a POINTER to the consent surface, and a
// payload that grew a plugin name or a capability list would be a second home for consent copy that can
// disagree with the screen the answer is actually given on.
test("plugins-awaiting-consent carries the count and the recipient, nothing else", () => {
  expect(Object.keys(FIXTURES["plugins-awaiting-consent"]).sort()).toEqual(["pendingCount", "recipientUserId", "type"]);
  const parsed = notificationEventSchema.parse({
    ...FIXTURES["plugins-awaiting-consent"],
    pluginName: "Oracle Deck",
    apiKey: "sk-not-a-real-key",
  });
  expect(parsed).toEqual(FIXTURES["plugins-awaiting-consent"]);
});

// ROUND-TRIP: the representative `invite` variant (the richest payload) survives parse unchanged.
test("notificationEventSchema round-trips a representative variant unchanged", () => {
  const event = FIXTURES.invite;
  expect(notificationEventSchema.parse(event)).toEqual(event);
});

test("notificationEventSchema accepts every closed variant", () => {
  for (const event of Object.values(FIXTURES)) {
    expect(notificationEventSchema.parse(event)).toEqual(event);
  }
});

// MANDATORY recipient (invariant: every variant names its single recipient): strip recipientUserId from
// each fixture and assert the schema rejects it — a notification with no recipient is unrepresentable.
test("every variant REQUIRES recipientUserId", () => {
  for (const event of Object.values(FIXTURES)) {
    const { recipientUserId: _dropped, ...withoutRecipient } = event;
    expect(notificationEventSchema.safeParse(withoutRecipient).success).toBe(false);
  }
});

// CLOSED discriminant: an unknown `type` is rejected (no open/catch-all arm).
test("an unknown discriminant is rejected", () => {
  const unknownReason = {
    type: "credential-leaked",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
  };
  expect(notificationEventSchema.safeParse(unknownReason).success).toBe(false);
});

// SECRET-UNREPRESENTABLE (`bus-payload-allowlist`): the members are plain
// `z.object` (NOT `.loose()`), so an injected secret-bearing field is STRIPPED at parse — it can never
// ride through into the durable row or the stream. If someone loosens the schema, this goes red. The value
// is an obvious non-secret literal (noSecrets) — the field NAME is what an exfil attempt would use.
test("an injected secret field is stripped at the schema boundary", () => {
  const withInjectedSecret = {
    ...FIXTURES.kicked,
    apiKey: "injected-extra-field",
    baseUrl: "injected-extra-field",
  };
  const parsed = notificationEventSchema.parse(withInjectedSecret);
  expect("apiKey" in parsed).toBe(false);
  expect("baseUrl" in parsed).toBe(false);
  expect(parsed).toEqual(FIXTURES.kicked);
});

// Compile-time belt backing the secret-unrepresentable rule: a secret-bearing field is not part of ANY variant's declared
// shape. Narrowing to `invite` then indexing a non-existent `apiKey` would be a `tsc` error — we instead
// assert the key set is finite/known by exhaustively listing it (an index signature would defeat this).
test("NotificationEvent variants expose only the allowlisted fields", () => {
  const inviteKeys = Object.keys(FIXTURES.invite).sort();
  expect(inviteKeys).toEqual(["chatId", "inviteId", "invitedByHandle", "recipientUserId", "type"].sort());
  const kickedKeys = Object.keys(FIXTURES.kicked).sort();
  expect(kickedKeys).toEqual(["chatId", "recipientUserId", "type"].sort());
  // The automation-notice carries ids + the ONE rendered `message` (the argued capped-string exception,
  // automation-design/03 §1.5) — never a credential/handle.
  const automationNoticeKeys = Object.keys(FIXTURES["automation-notice"]).sort();
  expect(automationNoticeKeys).toEqual(["chatId", "message", "recipientUserId", "source", "type"].sort());
  // The plugin-disabled notice carries ONLY ids (no free error string — the detail lives on the plugin row).
  const pluginDisabledKeys = Object.keys(FIXTURES["plugin-disabled"]).sort();
  expect(pluginDisabledKeys).toEqual(["pluginId", "recipientUserId", "type"].sort());
});

// The `message` cap (automation-design/03 §1.5): a rendered string past the cap is rejected — the wire never
// carries an unbounded blob (the exact belt that keeps the argued exception closed).
test("automation-notice message is length-capped", () => {
  const over = { ...FIXTURES["automation-notice"], message: "x".repeat(AUTOMATION_NOTICE_MESSAGE_MAX + 1) };
  expect(notificationEventSchema.safeParse(over).success).toBe(false);
});

// The recipient AXIS (C6) — the tuple every producer resolves through, and the SUBSET a guest may name.
test("NOTIFICATION_RECIPIENTS pins the three-member recipient axis", () => {
  expect(NOTIFICATION_RECIPIENTS).toEqual(["host", "all_members", "all_members_except_actor"]);
});

test("the PLUGIN subset excludes the actor-excluding member — a guest call carries no actor to exclude", () => {
  expect(PLUGIN_NOTIFICATION_RECIPIENTS).toEqual(["host", "all_members"]);
  // Stated as a relation rather than a second literal list: the subset must stay a SUBSET (a member here that
  // the axis dropped would be a guest naming a selector no resolver handles), and it must keep excluding the
  // one member that resolves against a triggering fact a plugin `notify` does not have.
  //
  // Both halves are read through WIDENED views on purpose, and the reason is itself the strongest pin here:
  // comparing a member of the subset against the string "all_members_except_actor" DIRECTLY is a `tsc` error
  // (TS2367, no overlap) — the exclusion is enforced at the TYPE, so a plugin seam can never name the member.
  // These runtime lines exist for the other direction: a future edit that adds it to the subset tuple would
  // make that comparison legal again, and this assertion is what goes red then.
  const axis: readonly string[] = NOTIFICATION_RECIPIENTS;
  const guestVocabulary: readonly string[] = PLUGIN_NOTIFICATION_RECIPIENTS;
  expect(guestVocabulary.filter((member) => !axis.includes(member))).toEqual([]);
  expect(guestVocabulary.includes("all_members_except_actor")).toBe(false);
});

// PresenceView shape pin: per-user, read-only, server-derived (no schema — presence is never client-asserted).
test("PresenceView pins the per-user presence shape", () => {
  const presentView: PresenceView = {
    userId: SAMPLE_RECIPIENT,
    online: true,
    lastSeenAt: null,
  };
  expect(Object.keys(presentView).sort()).toEqual(["lastSeenAt", "online", "userId"].sort());
  const offlineView: PresenceView = {
    userId: SAMPLE_RECIPIENT,
    online: false,
    lastSeenAt: 0,
  };
  expect(offlineView.online).toBe(false);
});

// PresenceSnapshot shape pin (#1039) — the DISCLOSURE projection, and the whole point of it being a
// projection rather than `PresenceView[]`. `PresenceView` carries `lastSeenAt` (WHEN a user's last device
// went dark); the wire shape has no field it could ride on, so widening the disclosure has to be an explicit
// contract change with its own review rather than a struct that quietly grew a member.
test("PresenceSnapshot discloses ONE key — ids only, and no seat for the activity timestamp", () => {
  const snapshot: PresenceSnapshot = { onlineUserIds: [SAMPLE_RECIPIENT] };

  expect(Object.keys(snapshot)).toEqual(["onlineUserIds"]);
  // A user id that is OFFLINE (or undisclosed) is simply ABSENT — the empty answer is a real answer, not a
  // per-user `{online:false}` record that a later field could hitch a ride on.
  const noneOnline: PresenceSnapshot = { onlineUserIds: [] };
  expect(noneOnline.onlineUserIds).toEqual([]);
  expect(JSON.stringify(noneOnline)).not.toContain("lastSeenAt");
});
