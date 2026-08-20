const crypto = require('crypto');

const mexcApiKey = process.env.MEXC_API_KEY;
const mexcApiSecret = process.env.MEXC_API_SECRET;

async function getMexcServerTime() {
  const res = await fetch('https://api.mexc.com/api/v3/time');
  const data = await res.json();
  return data.serverTime;
}

async function getMexcBalance() {
  if (!mexcApiKey || !mexcApiSecret) {
    throw new Error('MEXC_API_KEY и MEXC_API_SECRET не заданы в .env');
  }

  const timestamp = await getMexcServerTime();
  const query = `timestamp=${timestamp}&recvWindow=60000`;
  const signature = crypto.createHmac('sha256', mexcApiSecret).update(query).digest('hex');

  const res = await fetch(`https://api.mexc.com/api/v3/account?${query}&signature=${signature}`, {
    headers: { 'X-MEXC-APIKEY': mexcApiKey },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.msg || `Ошибка MEXC API (${res.status})`);
  }

  return data.balances.filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
}

module.exports = { getMexcBalance };
