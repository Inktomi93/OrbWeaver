export function createDomainEventBus(deps: BusDeps): Bus {
  const deliver = (event: DomainEvent): void => {
    getLog(deps.logger).warn({ type: event.type }, "bus: delivery failed");
  };
  return {
    publish: (event) => deliver(event),
    report: (kind, fields) => securityEvent(kind, { ...fields }, undefined, deps.logger),
    refuse: (kind) => securityEvent(kind, {}, undefined, deps.logger),
  };
}
