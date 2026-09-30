/** Allow only http(s) hrefs. Rejects javascript:, data:, and relative URLs. */
export function safeHttpUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
