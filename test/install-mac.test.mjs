import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const rel of ["web/public/install.sh", "scripts/install-mac.sh"]) {
  test(`${rel} does not strip Gatekeeper quarantine`, () => {
    const sh = readFileSync(join(ROOT, rel), "utf8");
    assert.doesNotMatch(sh, /xattr\s+-cr/);
    assert.doesNotMatch(sh, /xattr\s+-d\s+.*quarantine/);
  });
}

test("download page does not tell users to strip quarantine", () => {
  const page = readFileSync(join(ROOT, "web/src/app/download/page.tsx"), "utf8");
  assert.doesNotMatch(page, /xattr\s+-cr/);
  assert.doesNotMatch(page, /Bypasses Browser Quarantine/i);
});
