// domain/tool-use/contract/errors — the two THROWN errors (everything per-call is errors-as-data,
// 01 §5; throwing is reserved for wiring bugs):
//   • ToolNameCollisionError — register() hit a duplicate name. BOOT-FATAL by design (the env-spine
//     superRefine precedent): a duplicate is a wiring bug or, later, a plugin squatting on a builtin
//     name — fail at compose, never at turn time. Never last-write-wins.
//   • ToolNotFoundError — resolveTools() was handed an unknown name. Thrown (not data) because at
//     ATTACH time an unknown name is OUR bug (registrants attach names they registered); contrast the
//     execute-time unknown, which is the MODEL's bug and stays errors-as-data.

import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";

export class ToolNameCollisionError extends DomainConflictError {
  public readonly toolName: string;
  constructor(toolName: string) {
    super(`tool name already registered: ${toolName}`);
    this.toolName = toolName;
    this.name = this.constructor.name;
  }
}

export class ToolNotFoundError extends DomainNotFoundError {
  public readonly toolName: string;
  constructor(toolName: string) {
    super("tool", toolName);
    this.toolName = toolName;
    this.name = this.constructor.name;
  }
}
