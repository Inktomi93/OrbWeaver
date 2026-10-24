export function createDomainEventBus(deps: BusDeps): Bus {
  const deliver = (event: DomainEvent): void => {
    getLog().warn({ type: event.type }, "bus: delivery failed");
  };
  return {
    publish: (event) => deliver(event),
    report: (kind, fields) => securityEvent(kind, { ...fields }),
    refuse: (kind) => securityEvent(kind),
  };
}
