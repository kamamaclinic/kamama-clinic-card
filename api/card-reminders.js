const {
  cardMail,
  cardRemaining,
  cronAuthorized,
  getSettings,
  giftMail,
  json,
  rest,
  sendOnce,
  validEmail
} = require("./card-email");

function israelDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

function daysUntil(date) {
  const today = new Date(`${israelDate()}T00:00:00Z`);
  const target = new Date(`${date}T00:00:00Z`);
  return Math.round((target - today) / 86400000);
}

module.exports = async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Method not allowed" });
  if (!cronAuthorized(request)) return json(response, 401, { error: "Unauthorized" });

  try {
    const settings = await getSettings();
    const [cards, gifts] = await Promise.all([
      rest("clients", "?archived_at=is.null&select=*&limit=5000"),
      rest("gift_vouchers", "?redeemed=eq.false&select=*&limit=5000")
    ]);
    const results = [];

    for (const card of cards || []) {
      const remaining = cardRemaining(card);
      const days = daysUntil(card.expires_at);
      if (!validEmail(card.email) || !card.expires_at || days < 0 || remaining <= 0) continue;

      const halfYearDays = Number(settings.card_half_year_days || 183);
      if (remaining > Number(card.total_minutes || 0) / 2 && days >= halfYearDays - 1 && days <= halfYearDays) {
        const result = await sendOnce({
          resourceType: "card",
          resourceId: card.id,
          notificationType: "half_year",
          dedupeKey: `card:${card.id}:half_year:${card.expires_at}`,
          recipient: card.email,
          message: cardMail(card, "half_year")
        });
        results.push({ type: "card-half-year", id: card.id, ...result });
      }

      if (days <= Number(settings.card_expiry_days || 30)) {
        const result = await sendOnce({
          resourceType: "card",
          resourceId: card.id,
          notificationType: "expiry",
          dedupeKey: `card:${card.id}:expiry:${card.expires_at}`,
          recipient: card.email,
          message: cardMail(card, "expiry")
        });
        results.push({ type: "card-expiry", id: card.id, ...result });
      }
    }

    for (const gift of gifts || []) {
      const days = daysUntil(gift.expiry_date);
      if (!validEmail(gift.recipient_email) || !gift.expiry_date || days < 0 || days > Number(settings.gift_expiry_days || 30)) continue;
      const result = await sendOnce({
        resourceType: "gift",
        resourceId: gift.id,
        notificationType: "expiry",
        dedupeKey: `gift:${gift.id}:expiry:${gift.expiry_date}`,
        recipient: gift.recipient_email,
        message: giftMail(gift, "expiry")
      });
      results.push({ type: "gift-expiry", id: gift.id, ...result });
    }

    return json(response, 200, { checked: { cards: cards?.length || 0, gifts: gifts?.length || 0 }, results });
  } catch (error) {
    return json(response, 500, { error: error.message || "Reminder job failed" });
  }
};
