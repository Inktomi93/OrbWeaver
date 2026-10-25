const labelled = (
  <Text voice="code" className="wrap-break-word min-inline-0" data-x="1">
    {a}
  </Text>
);
const bare = <Text voice="code" className="flex-1 truncate min-inline-0">{path}</Text>;
const onlyToken = <Text voice="code">{path}</Text>;
const labelOnly = <Text voice="code"  />;
const otherVoice = <Text voice="gloss" className="font-mono" />;
const conditional = <Text className={on ? "font-mono" : undefined} />;
const otherElement = <Row className="font-mono" />;
const noToken = <Text voice="label" className="min-inline-0" />;
export { labelled, bare, onlyToken, labelOnly, otherVoice, conditional, otherElement, noToken };
