class OpenWaMessagingAdapter {
  constructor(client) {
    if (!client) throw new TypeError("client is required");
    this.client = client;
  }

  async sendText({ connection, to, text }) {
    if (connection.provider !== "openwa") {
      const error = new Error("OpenWA adapter received a non-OpenWA connection");
      error.code = "PROVIDER_MISMATCH";
      throw error;
    }

    const recipient = String(to || "").replace(/\D/g, "") + "@c.us";
    if (!/^\d{8,15}@c\.us$/.test(recipient)) {
      const error = new Error("Invalid WhatsApp recipient");
      error.code = "INVALID_RECIPIENT";
      throw error;
    }

    const externalMessageId = await this.client.sendText(recipient, text);
    return {
      externalMessageId: String(externalMessageId || "") || null,
      rawStatus: "accepted"
    };
  }
}

module.exports = { OpenWaMessagingAdapter };
