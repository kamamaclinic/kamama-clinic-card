const {
  cardMail,
  getSettings,
  giftMail,
  json,
  requireAdmin,
  rest,
  sendOnce
} = require("./card-email");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
  if (!(await requireAdmin(request))) return json(response, 401, { error: "Unauthorized" });

  try {
    const { event, id, transactionId } = request.body || {};
    const settings = await getSettings();

    if (["card-purchase", "card-transaction"].includes(event)) {
      const cards = await rest("clients", `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const card = cards?.[0];
      if (!card) return json(response, 404, { error: "Card not found" });
      if (event === "card-purchase" && !settings.notify_card_purchase) return json(response, 200, { status: "skipped", reason: "disabled" });
      if (event === "card-transaction" && !settings.notify_card_transactions) return json(response, 200, { status: "skipped", reason: "disabled" });

      let transaction = null;
      if (event === "card-transaction" && transactionId) {
        const transactions = await rest("transactions", `?id=eq.${encodeURIComponent(transactionId)}&select=*&limit=1`);
        transaction = transactions?.[0] || null;
      }
      const type = event === "card-purchase" ? "purchase" : "transaction";
      const cycle = event === "card-purchase" ? (card.current_cycle_started_at || card.expires_at || "initial") : transactionId;
      const message = cardMail(card, type, transaction);
      const result = await sendOnce({
        resourceType: "card",
        resourceId: card.id,
        notificationType: type,
        dedupeKey: `card:${card.id}:${type}:${cycle}`,
        recipient: card.email,
        message
      });
      return json(response, 200, result);
    }

    if (event === "gift-purchase") {
      if (!settings.notify_gift_purchase) return json(response, 200, { status: "skipped", reason: "disabled" });
      const gifts = await rest("gift_vouchers", `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const gift = gifts?.[0];
      if (!gift) return json(response, 404, { error: "Gift not found" });
      const result = await sendOnce({
        resourceType: "gift",
        resourceId: gift.id,
        notificationType: "purchase",
        dedupeKey: `gift:${gift.id}:purchase`,
        recipient: gift.recipient_email,
        message: giftMail(gift, "purchase")
      });
      return json(response, 200, result);
    }

    return json(response, 400, { error: "Unknown event" });
  } catch (error) {
    return json(response, 500, { error: error.message || "Notification failed" });
  }
};
