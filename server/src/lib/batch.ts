/**
 * Reads a large result set in pages. SQLite caps bound parameters per query,
 * and relation includes expand into IN (...) lists — paging keeps every query
 * comfortably under the limit no matter how much history a store has.
 */
export async function findAllInPages<T>(fetchPage: (args: { skip: number; take: number }) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const all: T[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = await fetchPage({ skip, take: pageSize });
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}
