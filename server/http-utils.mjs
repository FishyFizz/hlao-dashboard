/** Loopback HTTP helpers: JSON responses, bounded bodies, and static files. */

import {
  createReadStream,
  existsSync,
  statSync,
} from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

export function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export async function readBody(req, limit = 1_048_576) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Serve the built SPA. `/design` is the specimen route; unknown paths fall
 * back to index.html so client-side routes work. The resolved path must stay
 * inside the dist directory.
 */
export function serveStatic(req, res, url, { serve, dist }) {
  if (!serve) {
    sendJson(res, 404, { error: "static serving is disabled" });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "bad path" });
    return;
  }
  if (pathname === "/" || pathname === "" || pathname === "/design" || pathname === "/design/") {
    pathname = "/index.html";
  }
  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const candidate = resolve(dist, `.${normalize(pathname)}`);
  if (!candidate.startsWith(dist + sep) && candidate !== dist) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  let file = candidate;
  if (!existsSync(file) || (existsSync(file) && statSync(file).isDirectory())) {
    file = join(dist, "index.html");
  }
  if (!existsSync(file)) {
    sendJson(res, 404, {
      error: "dashboard build not found; run `npm run build` or use `npm run dev`",
    });
    return;
  }
  const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
    ...(file.endsWith("index.html")
      ? {
          "Content-Security-Policy":
            "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        }
      : {}),
  });
  createReadStream(file).pipe(res);
}
