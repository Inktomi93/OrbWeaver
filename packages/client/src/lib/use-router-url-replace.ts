import { useRouter } from "@tanstack/react-router";

/** Replace an inbound handoff URL through the router, preserving its unrelated query bytes and hash. */
export function useRouterUrlReplace(): (href: string) => void {
  const router = useRouter();
  return (href): void => {
    const browser = globalThis as typeof globalThis & { readonly location: { readonly origin: string } };
    const url = new URL(href, browser.location.origin);
    const next = router.buildLocation({
      to: url.pathname,
      search: router.options.parseSearch(url.search),
      hash: url.hash.slice(1),
    });
    // navigate's href door parses and stringifies search; this handoff must retain the surviving bytes.
    router.commitLocation({ ...next, href, publicHref: href, searchStr: url.search, replace: true, resetScroll: false }).catch((error) => {
      queueMicrotask(() => {
        throw error;
      });
    });
  };
}
