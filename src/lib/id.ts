/** A local correlation id: toasts, retry keys, and idempotency attempts. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);
  return `${prefix}-${random}`;
}
