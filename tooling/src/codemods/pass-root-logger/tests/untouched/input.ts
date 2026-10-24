// No binder in scope: a module helper, a top-level statement and a function whose context is named otherwise.
function logRoundFailure(round: Round): void {
  getLog().warn({ round: round.id }, "rpg: round failed");
}

getLog().info({}, "module scope");

export function observe(context: ObserverContext, c: HonoContext): void {
  securityEvent("host_not_allowed", { host: c.req.header("host") }, "security: host refused");
}

// Lookalikes: a base already passed, another object's method, and a four-argument event.
export function verb(ctx: VerbContext): void {
  getLog(ctx.logger).info({}, "already based");
  telemetry.getLog().info({}, "not the observability getLog");
  securityEvent("egress_blocked", {}, "security: egress blocked", ctx.logger);
}
