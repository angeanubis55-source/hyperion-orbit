import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const PUBLIC_DIRS = new Set(["ASSETS", "AUDIO", "COMBAT", "DRONE", "MAPS", "NPC", "PET", "PUBLIC", "QUEST", "SHIP", "SRC", "UI"]);
const PUBLIC_FILES = new Set(["index.html", "admin.html", "style.css", "ASSETS_MANIFEST.json"]);

function publicRelativePath(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return "index.html";
  if (!PUBLIC_FILES.has(parts[0]) && !PUBLIC_DIRS.has(parts[0])) throw new Error("Private path");
  if (parts.some((part) => part.startsWith(".") || part === "node_modules" || part === "SERVER_DATA" || part === "SCRIPTS")) throw new Error("Private path");
  return relative;
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("cross-origin-resource-policy", "same-origin");
}
const requestedPort = Number(process.argv.find((arg) => arg.startsWith("--port="))?.slice(7) || 0);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = publicRelativePath(pathname);
    const file = normalize(join(root, relative));
    if (file !== root && !file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) throw new Error("Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    // Revalidate on refresh: unchanged resources return 304 without their body.
    // Changed files remain immediately visible during local development.
    response.setHeader("etag", etag);
    response.setHeader("cache-control", "no-cache");
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Fichier introuvable");
  }
});

server.listen(Number.isFinite(requestedPort) ? requestedPort : 0, "127.0.0.1", () => {
  const { port } = server.address();
  console.log(`http://127.0.0.1:${port}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
