const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "public");
const PORT = 3001;

function isPrivateIPv4(ip) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1" || ip === "127.0.0.1") return true;
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (!isPrivateIPv4(req.socket.remoteAddress || "")) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname === "/api/wallet") {
    try {
      const upstream = await fetch("http://127.0.0.1:3000/api/wallet");
      const body = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": "application/json; charset=utf-8"
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Wallet API unavailable" }));
    }
    return;
  }

  const files = {
    "/": ["mobile.html", "text/html; charset=utf-8"],
    "/mobile.html": ["mobile.html", "text/html; charset=utf-8"],
    "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"]
  };
  const entry = files[pathname];
  if (!entry) {
    res.writeHead(404).end("Not found");
    return;
  }

  fs.readFile(path.join(ROOT, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(500).end("File unavailable");
      return;
    }
    res.writeHead(200, { "Content-Type": entry[1] });
    res.end(req.method === "HEAD" ? undefined : data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Sethelion read-only mobile: http://192.168.1.28:" + PORT);
  console.log("Yalnızca özel ağ adreslerine izin verilir; transfer API'si sunulmaz.");
});
