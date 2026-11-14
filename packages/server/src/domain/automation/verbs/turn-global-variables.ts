// ops: the chat turn's half of the per-user global plane (D46) — the read cache a turn's macros read, and the upserts
// for a turn's `{{setglobalvar}}` writes, unexecuted, for chat's reply commit batch (D337). Principal-free: chat
// gated the turn and chose whose plane it is. Card and preset text is untrusted, so the writes are capped: the plane's
// own key and value checks, GLOBAL_VARIABLE_TURN_WRITES_MAX distinct keys a turn, and no new key once the owner holds
// GLOBAL_VARIABLE_MACRO_KEYS_MAX. A refused write is dropped and named, never a failed turn. The key total is read
// before the batch, so two turns racing past the cap can each add their keys: the batch's own latency is the window.

import type { GlobalVariableDropReason, LoadGlobalVariablesOp } from "@orb/contracts/automation";
import { GLOBAL_VARIABLE_MACRO_KEYS_MAX, GLOBAL_VARIABLE_TURN_WRITES_MAX } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { DbAssemblyInput, StatementToken } from "@orb/db/wiring";
import { databaseForOwner, statementToken } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import { writeOwnKey } from "@orb/kit/objects";
import type { Clock } from "@orb/kit/time";
import { globalVariableRefusal, listGlobalVariables, loadGlobalVariableHoldings, upsertGlobalVariableStatement } from "../persistence/queries.ts";

interface Dropped {
  readonly key: string;
  readonly reason: GlobalVariableDropReason;
}

interface WriteStatements {
  readonly statements: readonly StatementToken[];
  readonly dropped: readonly Dropped[];
}

interface TurnGlobalVariableOps {
  readonly loadGlobalVariables: LoadGlobalVariablesOp;
  readonly globalVariableWriteStatements: (ownerId: UserId, writes: readonly { readonly key: string; readonly value: string }[]) => Promise<WriteStatements>;
}

// The last write of a key wins, the keys keep the order they were first written in, and the turn cap keeps the first.
function storableTurnWrites(writes: readonly { readonly key: string; readonly value: string }[]): {
  readonly storable: readonly (readonly [string, string])[];
  readonly dropped: Dropped[];
} {
  const latest = new Map<string, string>();
  for (const { key, value } of writes) {
    latest.set(key, value);
  }
  const storable: (readonly [string, string])[] = [];
  const dropped: Dropped[] = [];
  for (const [key, value] of latest) {
    if (globalVariableRefusal(key, value) !== null) {
      dropped.push({ key, reason: "invalid" });
    } else if (storable.length >= GLOBAL_VARIABLE_TURN_WRITES_MAX) {
      dropped.push({ key, reason: "turn_cap" });
    } else {
      storable.push([key, value]);
    }
  }
  return { storable, dropped };
}

export function createTurnGlobalVariableOps(input: DbAssemblyInput<{ readonly db: Db; readonly now: Clock }>): TurnGlobalVariableOps {
  const db = databaseForOwner(input.db);
  return {
    loadGlobalVariables: async (ownerId): Promise<Record<string, string>> => {
      const values: Record<string, string> = {};
      for (const { key, value } of await listGlobalVariables(db, ownerId)) {
        writeOwnKey(values, key, value);
      }
      return values;
    },
    globalVariableWriteStatements: async (ownerId, writes): Promise<WriteStatements> => {
      const { storable, dropped } = storableTurnWrites(writes);
      const holdings = await loadGlobalVariableHoldings(
        db,
        ownerId,
        storable.map(([key]) => key),
      );
      let room = Math.max(0, GLOBAL_VARIABLE_MACRO_KEYS_MAX - holdings.count);
      const updatedAt = input.now();
      const statements: StatementToken[] = [];
      for (const [key, value] of storable) {
        const isNew = !holdings.held.has(key);
        if (isNew && room === 0) {
          dropped.push({ key, reason: "owner_cap" });
          continue;
        }
        room -= isNew ? 1 : 0;
        statements.push(statementToken(upsertGlobalVariableStatement(db, { ownerId, key, value, updatedAt })));
      }
      return { statements, dropped };
    },
  };
}
