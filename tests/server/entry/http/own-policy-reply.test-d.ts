// @subject packages/server/src/entry/http/security-headers.ts
// Only the own-policy registrar turns a policy into a response: a plain route's handler cannot answer with an own-policy
// reply, and an own-policy handler cannot answer with a response it could carry a policy on.
import type { Env, Hono } from "hono";
import type { OwnPolicyHandler, OwnPolicyReply } from "#server/entry/http/security-headers.ts";

declare const app: Hono;
declare const reply: OwnPolicyReply;

// @ts-expect-error A plain route answers with a Response, never with a policy beside a body.
app.get("/plain", async () => reply);

// @ts-expect-error An own-policy handler answers with a reply the registrar builds, never with its own Response.
export const handsBackAResponse: OwnPolicyHandler<Env> = async () => new Response(null);

export const handsBackAReply: OwnPolicyHandler<Env> = async () => reply;
