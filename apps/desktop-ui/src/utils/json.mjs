export function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export async function readJsonBody(request, maxBytes = 1_000_000) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBytes) throw new Error("请求体过大");
  }
  return body ? JSON.parse(body) : {};
}
