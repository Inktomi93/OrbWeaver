import { DomainNotFoundError } from "@orb/kit/errors";

const ENTITY = "workload";

export function labels(chatId: string, sessionId: string, toolName: string, objectiveId: string): never {
  if (chatId === "") {
    throw new DomainNotFoundError("chat", chatId);
  }
  if (sessionId === "") {
    throw new DomainNotFoundError("refinery session", sessionId);
  }
  if (toolName === "") {
    throw new DomainNotFoundError("tool", toolName);
  }
  if (objectiveId === "") {
    throw new DomainNotFoundError("quest objective", objectiveId);
  }
  throw new DomainNotFoundError(ENTITY, chatId);
}

export function target(args: { readonly targetType: string; readonly targetId: string }): never {
  throw new DomainNotFoundError(args.targetType, args.targetId);
}

export function bare(): never {
  throw new DomainNotFoundError("invite", "");
}

export function word(): never {
  throw new DomainNotFoundError("workload admission", "user");
}

export class ChatNotFoundError extends DomainNotFoundError {
  constructor(chatId: string) {
    super("chat", chatId);
  }
}

export class NotANotFound extends Error {
  constructor(chatId: string) {
    super("chat", chatId);
  }
}

export function unrelated(chatId: string): Error {
  return new Error("chat", { cause: chatId });
}
