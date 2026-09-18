// Minimal TCP forwarder: port 80 -> 127.0.0.1:<target>, so the app can be reached
// without a port number. Runs as a per-user LaunchAgent (no root): macOS lets any
// user bind a low port on the wildcard address, but not on 127.0.0.1 alone, so we
// bind the wildcard and refuse every client that is not on loopback.
import { createServer, connect } from "node:net";

export function isLoopback(addr) {
  if (!addr) return false;
  const a = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  return a === "::1" || a.startsWith("127.");
}

export function startForwarder({ listenPort, targetPort, log = console.log }) {
  const server = createServer((client) => {
    if (!isLoopback(client.remoteAddress)) { client.destroy(); return; }
    const upstream = connect({ host: "127.0.0.1", port: targetPort });
    const drop = () => { client.destroy(); upstream.destroy(); };
    client.on("error", drop); upstream.on("error", drop);
    client.pipe(upstream); upstream.pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, () => {
      log(`forwarding :${server.address().port} (loopback clients only) -> 127.0.0.1:${targetPort}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startForwarder({ listenPort: Number(process.argv[2] ?? 80), targetPort: Number(process.argv[3] ?? 4258) })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
