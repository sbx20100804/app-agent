import { createModelAdapter } from "../model-adapters/factory.mjs";

export function getConfig() {
  const configured = Boolean(process.env.TARGET_API_KEY && process.env.TARGET_BASE_URL);
  const adapter = createModelAdapter();
  const chatModel = adapter.getDefaultModel();
  const reasonerModel = adapter.getReasonerModel?.() ?? process.env.TARGET_REASONER_MODEL ?? "";
  return {
    configured,
    provider: adapter.config.provider,
    model: chatModel,
    reasonerModel,
    modelCapabilities: adapter.getCapabilities(chatModel),
    reasonerCapabilities: reasonerModel ? adapter.getCapabilities(reasonerModel) : null,
    baseUrl: process.env.TARGET_BASE_URL ?? "",
    tokenRequired: Boolean(process.env.AGENT_UI_TOKEN),
  };
}

export function handleConfig(_request, response, { sendJson }) {
  return sendJson(response, 200, getConfig());
}
