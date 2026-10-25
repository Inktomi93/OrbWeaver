const alone = (
  <Row align="center" gap="row">
    <Icon icon={AlertTriangle} size="sm" tone="warning" />
    <Text voice="label">Careful</Text>
  </Row>
);
const mixed = (
  <Row className="min-inline-0">
    <Icon icon={AlertTriangle} tone="destructive" />
    <Text voice="label">Failed</Text>
  </Row>
);
const wrapped = (
  <Row>
    <Icon icon={Search} size="sm" tone="muted" />
  </Row>
);
export { alone, mixed, wrapped };
