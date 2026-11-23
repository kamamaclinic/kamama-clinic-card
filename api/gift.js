const { rest, json } = require('./card-email');

// Keep every existing /gift/:code link. A code is a bearer credential; never
// expose the base table, recipient email, or a list of available codes.
module.exports = async function handler(request, response) {
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed' });
  const code = String(request.query?.code || '').trim();
  if (!/^GIFT-[A-Z0-9]{6,64}$/.test(code)) return json(response, 404, { error: 'Gift not found' });
  try {
    const fields = 'code,recipient_name,minutes,expiry_date,from_name,blessing,redeemed';
    const rows = await rest('gift_vouchers', `?select=${fields}&code=eq.${encodeURIComponent(code)}&limit=1`);
    return rows?.[0] ? json(response, 200, { gift: rows[0] }) : json(response, 404, { error: 'Gift not found' });
  } catch {
    return json(response, 503, { error: 'Gift unavailable' });
  }
};
