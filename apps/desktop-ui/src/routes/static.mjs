import { readFile } from "node:fs/promises";
import path from "node:path";

export async function serveStatic(pathname, response, publicRoot) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const filePath = path.resolve(publicRoot, relativePath);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) && filePath !== publicRoot) {
    response.writeHead(403, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }
  try {
    const body = await readFile(filePath);
    const contentType = pathname.endsWith(".css")
      ? "text/css; charset=utf-8"
      : pathname.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  }
}
