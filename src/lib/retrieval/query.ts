export function processQuery(original: string): { displayQuery: string; retrievalQuery: string } {
  const displayQuery = original.trim();
  const retrievalQuery = displayQuery.replace(/\s+/g, " ");
  return { displayQuery, retrievalQuery };
}
