const nodemailer = require("nodemailer");

const REST = "/rest/v1";
const DEFAULT_APP_URL = "https://kamama-clinic-card.vercel.app";
const DEFAULT_BOOKING_URL = "https://kamama-booking.vercel.app";

function clean(value) {
  return String(value || "").trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function environment() {
  return {
    url: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    secret: clean(process.env.SUPABASE_SECRET_KEY),
    publicKey: clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    gmailUser: clean(process.env.GMAIL_USER || process.env.ADMIN_EMAIL),
    gmailPassword: clean(process.env.GMAIL_APP_PASSWORD),
    gmailFrom: clean(process.env.GMAIL_FROM),
    appUrl: clean(process.env.APP_BASE_URL) || DEFAULT_APP_URL,
    bookingUrl: clean(process.env.BOOKING_URL) || DEFAULT_BOOKING_URL
  };
}

function headers(extra = {}) {
  const { secret } = environment();
  return {
    apikey: secret,
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
    ...extra
  };
}

async function rest(table, path = "", options = {}) {
  const { url, secret } = environment();
  if (!url || !secret) throw new Error("Supabase is not configured");
  const response = await fetch(`${url}${REST}/${table}${path}`, {
    ...options,
    headers: headers(options.headers)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || body?.error || "Supabase request failed");
  return body;
}

async function getSettings() {
  const rows = await rest("notification_settings", "?id=eq.main&select=*&limit=1");
  return rows?.[0] || {
    card_half_year_days: 183,
    card_expiry_days: 30,
    gift_expiry_days: 30,
    notify_card_purchase: true,
    notify_gift_purchase: true,
    notify_card_transactions: false,
    notify_card_inactivity: false,
    card_inactivity_months: 2
  };
}

function minutesToText(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} שעות ו-${rest} דקות`;
  if (hours) return hours === 1 ? "שעה" : `${hours} שעות`;
  return `${rest} דקות`;
}

function formatDate(date) {
  if (!date) return "לא הוגדר";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function cardRemaining(card) {
  return Math.max(0, Number(card.total_minutes || 0) - Number(card.used_minutes || 0));
}

function cardLink(card) {
  const { appUrl } = environment();
  return `${appUrl.replace(/\/$/, "")}/card/${encodeURIComponent(card.view_token)}`;
}

function giftLink(gift) {
  const { appUrl } = environment();
  return `${appUrl.replace(/\/$/, "")}/gift/${encodeURIComponent(gift.code)}`;
}

function emailHtml({ eyebrow, title, intro, details, linkLabel, link, secondaryLinkLabel = "", secondaryLink = "" }) {
  const lines = details.filter(Boolean).map(item => `<li style="margin:0 0 7px;">${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body dir="rtl" style="margin:0;padding:24px;background:#f7f5ef;color:#1f2a26;font-family:Arial,'Helvetica Neue',sans-serif;text-align:right;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e1dbcf;border-radius:10px;overflow:hidden;">
    <div style="padding:22px 24px;background:#177d6b;color:#fff;">
      <div style="font-size:13px;opacity:.88;">${escapeHtml(eyebrow)}</div>
      <div style="font-size:25px;font-weight:700;margin-top:5px;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:26px 24px;line-height:1.75;font-size:16px;">
      <p style="margin-top:0;">${escapeHtml(intro)}</p>
      <ul style="padding-right:20px;margin:18px 0 24px;">${lines}</ul>
      <div style="text-align:center;margin:26px 0 20px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#177d6b;color:#fff;text-decoration:none;border-radius:7px;padding:12px 20px;font-weight:700;">${escapeHtml(linkLabel)}</a>
        ${secondaryLink && secondaryLinkLabel ? `<div style="margin-top:12px;"><a href="${escapeHtml(secondaryLink)}" style="display:inline-block;color:#176b5d;text-decoration:none;border:1px solid #9fcfc4;border-radius:7px;padding:10px 18px;font-weight:700;">${escapeHtml(secondaryLinkLabel)}</a></div>` : ""}
      </div>
      <p style="margin:26px 0 0;color:#64706b;font-size:13px;">Kamama Clinic</p>
    </div>
  </div>
</body></html>`;
}

function cardMail(card, type, transaction) {
  const remaining = cardRemaining(card);
  const bookingUrl = environment().bookingUrl;
  const labels = {
    purchase: ["כרטיסייה עודכנה", "הכרטיסייה שלך עודכנה", "כרטיסייה חדשה או חידוש נקלטו בהצלחה."],
    half_year: ["תזכורת לכרטיסייה", "נותרה חצי שנה לתוקף הכרטיסייה", "הכרטיסייה עדיין פעילה, ונשארה בה יותר ממחצית היתרה."],
    expiry: ["תזכורת לכרטיסייה", "הכרטיסייה עומדת לפוג בקרוב", "נשאר חודש או פחות עד לסיום תוקף הכרטיסייה."],
    inactivity: ["תזכורת לכרטיסייה", "זמן לטיפול הבא שלך", "נשארה לך יתרה בכרטיסיית הטיפולים, ונשמח לראותך לטיפול נוסף."],
    transaction: ["עדכון כרטיסייה", "היתרה בכרטיסייה עודכנה", "בוצעה פעולה חדשה בכרטיסיית הטיפולים שלך."]
  };
  const [eyebrow, title, intro] = labels[type];
  const details = [
    type === "inactivity" ? `יתרה זמינה: ${remaining} דקות (${minutesToText(remaining)})` : `יתרה זמינה: ${minutesToText(remaining)}`,
    `בתוקף עד: ${formatDate(card.expires_at)}`,
    transaction ? `פעולה: ${transaction.description || "עדכון כרטיסייה"}` : ""
  ];
  return {
    subject: `${title} | Kamama Clinic`,
    html: emailHtml({ eyebrow, title, intro, details, linkLabel: "לקביעת טיפול", link: bookingUrl, secondaryLinkLabel: "לכרטיסייה האישית שלך", secondaryLink: cardLink(card) }),
    text: `${title}\n\n${intro}\n${details.filter(Boolean).join("\n")}\n\nלקביעת טיפול: ${bookingUrl}\n\nכרטיסייה: ${cardLink(card)}`
  };
}

function giftMail(gift, type) {
  const bookingUrl = environment().bookingUrl;
  const isPurchase = type === "purchase";
  const title = isPurchase ? "שובר המתנה שלך מחכה לך" : "תזכורת: שובר המתנה עומד לפוג";
  const intro = isPurchase
    ? "נרכש עבורך שובר מתנה לטיפול בקממה."
    : "נשאר חודש או פחות עד לסיום תוקף שובר המתנה שלך.";
  const details = [
    `משך הטיפול: ${minutesToText(gift.minutes)}`,
    `בתוקף עד: ${formatDate(gift.expiry_date)}`,
    gift.from_name ? `המתנה מאת: ${gift.from_name}` : ""
  ];
  return {
    subject: `${title} | Kamama Clinic`,
    html: emailHtml({ eyebrow: "שובר מתנה", title, intro, details, linkLabel: "לקביעת טיפול", link: bookingUrl, secondaryLinkLabel: "לצפייה בשובר", secondaryLink: giftLink(gift) }),
    text: `${title}\n\n${intro}\n${details.filter(Boolean).join("\n")}\n\nלקביעת טיפול: ${bookingUrl}\n\nלצפייה בשובר: ${giftLink(gift)}`
  };
}

async function sendMail({ to, subject, text, html }) {
  const { gmailUser, gmailPassword, gmailFrom } = environment();
  if (!validEmail(to)) return { status: "skipped", reason: "missing_email" };
  if (!validEmail(gmailUser) || !gmailPassword) throw new Error("Gmail is not configured");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPassword }
  });
  const result = await transporter.sendMail({
    from: gmailFrom || `Kamama Clinic <${gmailUser}>`,
    to,
    subject,
    text,
    html
  });
  return { status: "sent", id: result.messageId || null };
}

async function notificationExists(dedupeKey) {
  const rows = await rest("notification_log", `?dedupe_key=eq.${encodeURIComponent(dedupeKey)}&select=id&limit=1`);
  return Boolean(rows?.length);
}

async function recordNotification({ resourceType, resourceId, notificationType, dedupeKey, recipient, subject }) {
  await rest("notification_log", "", {
    method: "POST",
    body: JSON.stringify({
      resource_type: resourceType,
      resource_id: resourceId,
      notification_type: notificationType,
      dedupe_key: dedupeKey,
      recipient,
      subject
    })
  });
}

async function sendOnce({ resourceType, resourceId, notificationType, dedupeKey, recipient, message }) {
  if (!validEmail(recipient)) return { status: "skipped", reason: "missing_email" };
  if (await notificationExists(dedupeKey)) return { status: "skipped", reason: "already_sent" };
  const result = await sendMail({ to: recipient, ...message });
  if (result.status === "sent") {
    await recordNotification({ resourceType, resourceId, notificationType, dedupeKey, recipient, subject: message.subject });
  }
  return result;
}

async function requireAdmin(request) {
  const token = clean(request.headers.authorization).replace(/^Bearer\s+/i, "");
  const { url, publicKey } = environment();
  if (!token || !url || !publicKey) return false;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publicKey, authorization: `Bearer ${token}` }
  });
  if (!response.ok) return false;
  const user = await response.json().catch(() => ({}));
  return user.id === "3903aa50-e4db-4165-b673-3a61803f13c7";
}

function cronAuthorized(request) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) return false;
  return clean(request.headers.authorization) === `Bearer ${secret}` || clean(request.query?.secret) === secret;
}

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  return response.status(status).json(body);
}

module.exports = {
  cardMail,
  cardRemaining,
  cronAuthorized,
  giftMail,
  getSettings,
  json,
  requireAdmin,
  rest,
  sendOnce,
  validEmail
};

