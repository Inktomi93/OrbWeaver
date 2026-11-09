export function Untouched() {
  return (
    <div>
      <Text cap="prose" prose={true} voice="gloss">
        Already paired
      </Text>
      <Text cap="reading" prose={true}>
        Another measure
      </Text>
      <Text voice="gloss">No prose size</Text>
      <Other prose={true}>Not a Text</Other>
    </div>
  );
}
