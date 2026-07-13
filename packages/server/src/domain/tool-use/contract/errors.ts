// domain/tool-use/contract/errors — the two thrown errors (everything per-call is errors-as-data;
// throwing is reserved for wiring bugs). ToolNameCollisionError: register() hit a duplicate name,
// boot-fatal by design. ToolNotFoundError: resolveTools() was handed an unknown name — at attach time
// that's our bug, unlike the model's execute-time unknown which stays errors-as-data.

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
