const labelled = (
  <Text voice="label" className="font-mono wrap-break-word min-inline-0" data-x="1">
    {a}
  </Text>
);
const bare = <Text className="flex-1 truncate font-mono min-inline-0">{path}</Text>;
const onlyToken = <Text className="font-mono">{path}</Text>;
const labelOnly = <Text voice="label" className="font-mono" />;
const otherVoice = <Text voice="gloss" className="font-mono" />;
const conditional = <Text className={on ? "font-mono" : undefined} />;
const otherElement = <Row className="font-mono" />;
const noToken = <Text voice="label" className="min-inline-0" />;
export { labelled, bare, onlyToken, labelOnly, otherVoice, conditional, otherElement, noToken };
