export class BaseModelAdapter {
  constructor(config) {
    this.config = config;
  }

  createClient() {
    throw new Error("createClient() must be implemented by subclasses");
  }

  getDefaultModel() {
    return this.config.model;
  }

  getCapabilities(model = this.getDefaultModel()) {
    return {
      model,
      provider: this.config.provider,
      reasoning: false,
      tools: true,
      maxContext: null,
    };
  }
}
