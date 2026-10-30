import type { RequireParticipantOp } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { TagStatus, TagTargetRef } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import type { TagId, UserId } from "@orb/kit/ids";

interface JunctionContext {
  readonly db: Db;
}

export type TargetAccessParams = JunctionContext &
  TagTargetRef & {
    readonly principal: Principal;
    readonly requireParticipant: RequireParticipantOp;
  };

export type InsertJunctionParams = JunctionContext &
  TagTargetRef & {
    readonly tagId: TagId;
    readonly taggerId: UserId;
    readonly status: TagStatus;
    readonly at: number;
  };

export type BulkInsertJunctionParams = JunctionContext &
  TagTargetRef & {
    readonly tagIds: readonly TagId[];
    readonly taggerId: UserId;
    readonly status: TagStatus;
    readonly at: number;
  };

export type DeleteJunctionParams = JunctionContext &
  TagTargetRef & {
    readonly tagId: TagId;
    readonly taggerId: UserId;
  };
