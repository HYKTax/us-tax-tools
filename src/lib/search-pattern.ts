/** Escape LIKE metacharacters before adding the contains-search wildcards. */
export function searchPattern(query: string) {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

/** Values inside a PostgREST .or() expression need their own quoting. */
export function quoteSearchPattern(pattern: string) {
  return `"${pattern.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
