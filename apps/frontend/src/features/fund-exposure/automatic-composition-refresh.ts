const attemptedAutomaticRefreshes = new Set<string>();

/**
 * Refreshes missing fund compositions once per application session. Provider
 * failures are isolated so one unsupported fund never blocks the remaining
 * funds or the direct-holdings view.
 */
export async function refreshMissingFundCompositions(
  assetIds: readonly string[],
  refresh: (assetId: string) => Promise<unknown>,
  attempted = attemptedAutomaticRefreshes,
  concurrency = 3,
): Promise<number> {
  const pending = [...new Set(assetIds)].filter((assetId) => {
    if (attempted.has(assetId)) return false;
    attempted.add(assetId);
    return true;
  });
  if (pending.length === 0) return 0;

  let next = 0;
  let succeeded = 0;
  const workerCount = Math.max(1, Math.min(concurrency, pending.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < pending.length) {
      const assetId = pending[next];
      next += 1;
      try {
        await refresh(assetId);
        succeeded += 1;
      } catch {
        // Unsupported funds remain visible as unexpanded. Manual issuer-file
        // import is still available and takes priority over provider data.
      }
    }
  });
  await Promise.all(workers);
  return succeeded;
}
