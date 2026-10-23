// Server-only role codecs preserve canonical wire shapes without making raw role values public to domains.
import {
  chatDetailSchema as wireChatDetailSchema,
  chatLineageViewSchema as wireChatLineageViewSchema,
  chatListPageSchema as wireChatListPageSchema,
  chatSummarySchema as wireChatSummarySchema,
  forkResultSchema as wireForkResultSchema,
  participantViewSchema as wireParticipantViewSchema,
  redeemInviteResultSchema as wireRedeemInviteResultSchema,
  startChatResultSchema as wireStartChatResultSchema,
} from "@orb/contracts/chat";
import type { ParticipantRoleState, UserRoleState } from "@orb/contracts/identity";
import { adminUserViewSchema as wireAdminUserViewSchema, viewerViewSchema as wireViewerViewSchema } from "@orb/contracts/identity";
import { z } from "zod";
import { isParticipantRoleState, isUserRoleState, participantRoleValue, userRoleValue } from "#primitives/role-data/decode";

// Decoding checks the private registry, so fabricated objects and raw strings fail rather than becoming wire roles.
const userRole = z.custom<UserRoleState>(isUserRoleState, { error: "expected captured global role data" }).transform(userRoleValue);
const participantRole = z
  .custom<ParticipantRoleState>(isParticipantRoleState, { error: "expected captured participant role data" })
  .transform(participantRoleValue);

export const viewerViewSchema = wireViewerViewSchema.extend({ globalRole: userRole });
export const adminUserViewSchema = wireAdminUserViewSchema.extend({ role: userRole });
export const participantViewSchema = wireParticipantViewSchema.extend({ role: participantRole });
export const chatDetailSchema = wireChatDetailSchema.extend({ participants: z.array(participantViewSchema).readonly() });
const chatSummarySchema = wireChatSummarySchema.in.extend({ viewerRole: participantRole }).transform((summary, ctx) => {
  const parsed = wireChatSummarySchema.safeParse(summary);
  if (parsed.success) {
    return parsed.data;
  }
  for (const issue of parsed.error.issues) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
  return z.NEVER;
});
export const chatListPageSchema = wireChatListPageSchema.extend({ items: z.array(chatSummarySchema).readonly() });
export const chatLineageViewSchema = wireChatLineageViewSchema.extend({ chain: z.array(chatSummarySchema).readonly() });
export const startChatResultSchema = wireStartChatResultSchema.extend({ chat: chatDetailSchema });
export const forkResultSchema = wireForkResultSchema.extend({ chat: chatDetailSchema });
export const redeemInviteResultSchema = wireRedeemInviteResultSchema.extend({ chat: chatDetailSchema, participant: participantViewSchema });
