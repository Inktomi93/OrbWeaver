import { DomainNotFoundError } from "@orb/kit/errors";

const ENTITY = "workload";

export function labels(chatId: string, sessionId: string, toolName: string, objectiveId: string): never {
  if (chatId === "") {
    throw new DomainNotFoundError({ kind: "chat", id: chatId });
  }
  if (sessionId === "") {
    throw new DomainNotFoundError({ kind: "refinery_session", id: sessionId });
  }
  if (toolName === "") {
    throw new DomainNotFoundError({ kind: "tool", key: toolName });
  }
  if (objectiveId === "") {
    throw new DomainNotFoundError({ kind: "quest objective", key: objectiveId });
  }
  throw new DomainNotFoundError({ kind: ENTITY, id: chatId });
}

export function target(args: { readonly targetType: string; readonly targetId: string }): never {
  throw new DomainNotFoundError({ kind: args.targetType, id: args.targetId });
}

export function bare(): never {
  throw new DomainNotFoundError({ kind: "invite" });
}

export function word(): never {
  throw new DomainNotFoundError("workload admission", "user");
}

export class ChatNotFoundError extends DomainNotFoundError {
  constructor(chatId: string) {
    super({ kind: "chat", id: chatId });
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
