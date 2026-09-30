import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function safeHttpUrl(u) {
  if (typeof u !== "string") return null;
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

test("safeHttpUrl allows only http and https hrefs", () => {
  const src = readFileSync(join(root, "web/src/lib/safe-url.ts"), "utf8");
  assert.match(src, /export function safeHttpUrl/);
  assert.match(src, /\/\^https\?:\\\/\\\//i);

  assert.equal(safeHttpUrl("https://canvas.illinois.edu/courses/1"), "https://canvas.illinois.edu/courses/1");
  assert.equal(safeHttpUrl("http://localhost:3000/hw"), "http://localhost:3000/hw");
  assert.equal(safeHttpUrl("  HTTPS://cs128.org/mp1  "), "HTTPS://cs128.org/mp1");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("JAVASCRIPT:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeHttpUrl("vbscript:msgbox(1)"), null);
  assert.equal(safeHttpUrl("file:///etc/passwd"), null);
  assert.equal(safeHttpUrl("//evil.example/phish"), null);
  assert.equal(safeHttpUrl("/relative"), null);
  assert.equal(safeHttpUrl("#"), null);
  assert.equal(safeHttpUrl(""), null);
  assert.equal(safeHttpUrl(null), null);
  assert.equal(safeHttpUrl(undefined), null);
});

test("Assignment rows are keyed by user, not a global externalId", () => {
  const schema = readFileSync(join(root, "web/dataconnect/schema/schema.gql"), "utf8");
  assert.match(schema, /type Assignment @table\(key: \["user", "externalId"\]\)/);
  assert.match(schema, /type Assignment[\s\S]*user: User!/);
});

test("UpsertAssignment binds owner to auth.uid and rejects non-http(s) urls", () => {
  const mutations = readFileSync(join(root, "web/dataconnect/connector/mutations.gql"), "utf8");
  const upsert = mutations.split("mutation UpsertAssignment")[1]?.split("mutation ")[0] ?? "";
  assert.match(upsert, /user:\s*\{\s*uid_expr:\s*"auth\.uid"\s*\}/);
  assert.match(upsert, /vars\.url\.lowerAscii\(\)\.startsWith\('https:\/\/'\)/);
  assert.match(upsert, /vars\.url\.lowerAscii\(\)\.startsWith\('http:\/\/'\)/);
  assert.match(upsert, /auth != null/);

  const userAssignment = mutations.split("mutation UpsertUserAssignment")[1] ?? "";
  assert.match(userAssignment, /user:\s*\{\s*uid_expr:\s*"auth\.uid"\s*\}/);
  assert.match(userAssignment, /assignment:\s*\{\s*userUid_expr:\s*"auth\.uid"/);
});

test("MyAssignments only returns the caller's rows", () => {
  const queries = readFileSync(join(root, "web/dataconnect/connector/queries.gql"), "utf8");
  const mine = queries.split("query MyAssignments")[1] ?? "";
  assert.match(mine, /user:\s*\{\s*uid:\s*\{\s*eq_expr:\s*"auth\.uid"\s*\}\s*\}/);
  assert.match(mine, /\burl\b/);
  assert.match(mine, /\bsource\b/);
});
