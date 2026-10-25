const alone = (
  <Row align="center" className="text-warning" gap="row">
    <Icon icon={AlertTriangle} size="sm" />
    <Text voice="label">Careful</Text>
  </Row>
);
const mixed = (
  <Row className="min-inline-0 text-destructive">
    <Icon icon={AlertTriangle} />
    <Text voice="label">Failed</Text>
  </Row>
);
const wrapped = (
  <Row className="text-muted-foreground">
    <Icon icon={Search} size="sm" />
  </Row>
);
export { alone, mixed, wrapped };
