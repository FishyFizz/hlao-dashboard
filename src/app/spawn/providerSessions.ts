import type { ProviderSessionView } from "../../wire/protocol";

/**
 * Case-insensitive match over the fields an operator can recognize a provider
 * session by. The provider id is included because it is the durable handle and
 * is often the only thing copied from a log or an earlier spawn.
 */
export function matchesProviderQuery(
  row: ProviderSessionView,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.title ?? "",
    row.sessionId,
    row.cwd,
    row.hlaoName ?? "",
    row.hlaoSessionId ?? "",
  ]
    .join("\n")
    .toLowerCase()
    .includes(needle);
}

/** A row is resumable only when the adapter advertised ACP loadSession. */
export function canResumeProviderRow(row: ProviderSessionView): boolean {
  return row.loadable;
}

/** A row is forkable only when the adapter advertised ACP session/fork. */
export function canForkProviderRow(row: ProviderSessionView): boolean {
  return row.forkable;
}
