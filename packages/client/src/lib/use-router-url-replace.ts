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
    // @orb-waive caught-failure-ownership(router.commitLocation): false positive: the original rejection is rethrown on the queued microtask error surface, proved by tests/client/lib/use-router-url-replace.dom.test.ts. The classifier excludes nested callbacks. Ends when it recognizes native queued throws.
    router.commitLocation({ ...next, href, publicHref: href, searchStr: url.search, replace: true, resetScroll: false }).catch((error) => {
      queueMicrotask(() => {
        throw error;
      });
    });
  };
}
