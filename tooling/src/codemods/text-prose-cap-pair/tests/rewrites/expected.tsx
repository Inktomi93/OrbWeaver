export function Rewrites() {
  return (
    <div>
      <Text cap="prose" prose={true} voice="gloss">
        One
      </Text>
      <Text voice="gloss" cap="prose" prose={true} role="alert">
        Two
      </Text>
    </div>
  );
}
