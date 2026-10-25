const notLeadingIcon = (
  <Row className="text-warning">
    <Text voice="label">Careful</Text>
    <Icon icon={AlertTriangle} />
  </Row>
);
const hasTone = (
  <Row className="text-warning">
    <Icon icon={AlertTriangle} tone="info" />
  </Row>
);
const notARow = (
  <Stack className="text-warning">
    <Icon icon={AlertTriangle} />
  </Stack>
);
const built = (
  <Row className={cx("text-warning")}>
    <Icon icon={AlertTriangle} />
  </Row>
);
const twoInks = (
  <Row className="text-warning text-info">
    <Icon icon={AlertTriangle} />
  </Row>
);
export { notLeadingIcon, hasTone, notARow, built, twoInks };
