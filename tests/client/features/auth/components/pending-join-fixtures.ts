import { authConfigSchema } from "@orb/contracts/auth-config";
import { pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import { authErrorResponseSchema } from "@orb/contracts/identity";
import { joinerPersonaSchema } from "@orb/contracts/persona";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso/ids.ts";

export const JOIN_DESTINATION_LABEL = "Signed-in destination";
export const JOIN_CONFIRM_LABEL = "Create account and join";
export const JOIN_NAME_LABEL = "Your name in the story";
export const PENDING_PREVIEW_PATH = "**/api/auth/oidc/pending/preview";
export const PENDING_CONFIRM_PATH = "**/api/auth/oidc/pending/confirm";

export const PENDING_AUTH_CONFIG = authConfigSchema.parse({
  mode: "oidc",
  localEnabled: false,
  oidcEnabled: true,
  oidcProviderName: "Test IdP",
  localFirstRun: false,
  discreetLogin: false,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  uploads: DEFAULT_UPLOAD_CAPS,
  transport: "https",
  clientScope: "private",
  share: { state: "off", url: null },
});

export const PENDING_ROOM = signedOutInvitePreviewSchema.parse({
  chatId: mintTypeId(ID_PREFIX.chat, createSeededIds(FIXTURE_ID_CURSOR).next),
  roomName: "The quiet observatory",
  hostHandle: "guide",
  memberCount: 2,
  modeLabel: "The host guides the story.",
});

export const JOIN_PERSONA = joinerPersonaSchema.parse({ name: "Mira", description: "Watching the stars." });
export const JOINED_RESPONSE = pendingJoinConfirmResultSchema.parse({ signedIn: true, chatId: PENDING_ROOM.chatId });
export const APPROVAL_RESPONSE = pendingJoinConfirmResultSchema.parse({ signedIn: false, chatId: PENDING_ROOM.chatId });
export const UNAVAILABLE_RESPONSE = authErrorResponseSchema.parse({ error: "join_unavailable" });
export const REFUSED_RESPONSE = authErrorResponseSchema.parse({ error: "account_exists" });
