require('dotenv').config();

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@umod.ma';

if (!apiKey) {
  console.error('❌ SENDGRID_API_KEY is not set in .env');
  process.exit(1);
}

const maskedKey = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
console.log(`🔑 API key: ${maskedKey}`);
console.log(`📨 From email: ${fromEmail}\n`);

async function call(path) {
  const res = await fetch(`https://api.sendgrid.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

(async () => {
  console.log('── Check 1: API key validity + scopes ──');
  const scopes = await call('/v3/scopes');
  if (scopes.status !== 200) {
    console.error(`❌ Key invalid or blocked — HTTP ${scopes.status}`);
    console.error(scopes.body);
    process.exit(1);
  }
  const hasMailSend = (scopes.body.scopes || []).some(s => s === 'mail.send' || s.startsWith('mail.send'));
  console.log(`✅ Key valid · ${scopes.body.scopes?.length || 0} scopes`);
  console.log(hasMailSend ? '✅ mail.send scope present' : '❌ mail.send scope MISSING');

  console.log('\n── Check 2: Verified senders ──');
  const senders = await call('/v3/verified_senders');
  if (senders.status !== 200) {
    console.error(`❌ Could not list senders — HTTP ${senders.status}`);
    console.error(senders.body);
  } else {
    const results = senders.body.results || [];
    console.log(`Found ${results.length} verified sender(s):`);
    results.forEach(s => console.log(`  · ${s.from_email} ${s.verified ? '✅' : '⏳ pending'}`));
    const match = results.find(s => s.from_email?.toLowerCase() === fromEmail.toLowerCase() && s.verified);
    console.log(match
      ? `\n✅ ${fromEmail} is verified — sends should succeed`
      : `\n❌ ${fromEmail} is NOT in the verified list — this is why sends fail`);
  }

  console.log('\n── Check 3: Domain authentication (optional) ──');
  const domains = await call('/v3/whitelabel/domains');
  if (domains.status === 200) {
    const list = domains.body || [];
    console.log(`${list.length} authenticated domain(s)`);
    list.forEach(d => console.log(`  · ${d.domain} ${d.valid ? '✅' : '⏳ not verified'}`));
  }
})();
