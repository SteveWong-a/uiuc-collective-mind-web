import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSmartPhysics } from "../lib/sources/smartphysics.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("parseSmartPhysics", () => {
  const html = readFileSync(join(ROOT, "test", "fixtures", "smartphysics-assignments.html"), "utf-8");
  const ctx = {
    course: "PHYS 212",
    source: "smartphysics",
    enrollmentId: "164636",
    now: new Date("2026-09-04T12:00:00Z")
  };
  
  const items = parseSmartPhysics(html, ctx);

  assert.equal(items.length, 106, "should parse 106 assignments");

  const pl = items.find((a) => a.title === "Coulomb's Law: Prelecture");
  assert.ok(pl, "Coulomb's Law Prelecture found");
  assert.equal(pl.id, "smartphysics:164636:coulomb-s-law:prelecture");
  assert.equal(pl.status, "graded");
  assert.equal(pl.grade, "100.0%");
  assert.equal(pl.url, "https://smart.physics.illinois.edu/Course/ViewItem?unitItemID=438506&enrollmentID=164636");
  assert.equal(pl.dueAt, "2026-08-25T13:00:00.000Z"); // Aug 25 at 8:00 AM CDT

  const hw = items.find((a) => a.title === "Coulomb's Law: Homework");
  assert.ok(hw, "Coulomb's Law Homework found");
  assert.equal(hw.status, "submitted"); // 98.7%
  assert.equal(hw.grade, "98.7%");
  assert.equal(hw.dueAt, "2026-09-09T13:00:00.000Z");

  const clicker = items.find((a) => a.title === "Electric Fields: I>Clicker");
  assert.ok(clicker, "Electric Fields I>Clicker found");
  assert.equal(clicker.status, "closed"); // 0.0%, past due (Aug 27)
  assert.equal(clicker.grade, null);
  assert.equal(clicker.dueAt, "2026-08-27T19:55:00.000Z"); // Aug 27 at 2:55 PM CDT -> 19:55 UTC
});
