export function createRunEvent(runId, type, payload = {}) {
  return {
    id: crypto.randomUUID(),
    runId,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}
