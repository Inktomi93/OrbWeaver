export function Titled({ title }: { title: string }) {
  return <form aria-label={title} id="titled" noValidate={true} />;
}
