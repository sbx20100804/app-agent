export function isAuthorized(request) {
  const token = process.env.AGENT_UI_TOKEN;
  if (!token) return true;
  const headerToken = request.headers["x-agent-ui-token"];
  const auth = request.headers.authorization ?? "";
  return headerToken === token || auth === `Bearer ${token}`;
}

export function requireAuthorized(request, response) {
  if (isAuthorized(request)) return true;
  response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "未授权" }));
  return false;
}
