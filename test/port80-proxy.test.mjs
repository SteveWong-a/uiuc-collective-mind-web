import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import { isLoopback, startForwarder } from "../scripts/port80-proxy.mjs";

test("isLoopback accepts only loopback addresses", () => {
  for (const a of ["127.0.0.1", "127.5.6.7", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopback(a), true, a);
  for (const a of ["192.168.1.20", "10.0.0.5", "::ffff:192.168.1.20", "fe80::1", undefined, ""]) assert.equal(isLoopback(a), false, String(a));
});

test("forwarder pipes loopback connections to the target port", async () => {
  const target = createServer((s) => s.on("data", (d) => s.end(`echo:${d}`)));
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  const fwd = await startForwarder({ listenPort: 0, targetPort: target.address().port, log: () => {} });
  const reply = await new Promise((resolve, reject) => {
    const c = connect({ host: "127.0.0.1", port: fwd.address().port }, () => c.write("hi"));
    let buf = ""; c.on("data", (d) => (buf += d)); c.on("end", () => resolve(buf)); c.on("error", reject);
  });
  assert.equal(reply, "echo:hi");
  fwd.close(); target.close();
});
