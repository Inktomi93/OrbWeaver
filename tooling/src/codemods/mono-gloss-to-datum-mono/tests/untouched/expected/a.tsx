const otherVoice = <Text className="font-mono" voice="label">{count}</Text>;
const noVoice = <Text className="font-mono">{count}</Text>;
const noMono = <Text className="truncate" voice="gloss">{count}</Text>;
const otherElement = <Badge className="font-mono" voice="gloss" />;
const inExpression = <Text className={wide ? "font-mono" : undefined} voice="gloss">{count}</Text>;
export { otherVoice, noVoice, noMono, otherElement, inExpression };
