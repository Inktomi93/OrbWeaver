/** Remove every occurrence of one query key without reserializing unrelated query bytes. */
export function withoutUrlSearchParam(location: { readonly pathname: string; readonly search: string; readonly hash: string }, key: string): string {
  const fields = location.search.slice(1).split("&");
  const remainingFields = fields.filter((field) => {
    const equalsIndex = field.indexOf("=");
    const rawKey = equalsIndex === -1 ? field : field.slice(0, equalsIndex);
    // @orb-waive caught-failure-ownership(catch): malformed percent-encoding compares the raw key so a
    // garbled unrelated field cannot prevent the scrub. Ends if raw comparison changes valid-key behavior.
    try {
      return decodeURIComponent(rawKey.replaceAll("+", " ")) !== key;
    } catch {
      return rawKey !== key;
    }
  });
  const search = location.search === "" || remainingFields.length === 0 ? "" : `?${remainingFields.join("&")}`;
  return `${location.pathname}${search}${location.hash}`;
}
