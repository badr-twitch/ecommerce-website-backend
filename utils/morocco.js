// Morocco-only address validation helpers.
// Single source of truth for country whitelisting and Moroccan phone
// normalisation on the backend. The frontend mirrors this in
// ecommerce-website-frontend/src/utils/morocco.js — keep them in sync.

const CANONICAL_COUNTRY = 'Maroc';

// Accepted inputs — normalise to CANONICAL_COUNTRY on save so the DB stays
// uniform regardless of whether the client sent "Maroc", "Morocco", or "MA".
const ACCEPTED_COUNTRY_ALIASES = new Set(['maroc', 'morocco', 'ma', 'mar']);

function isMoroccanCountry(raw) {
  if (typeof raw !== 'string') return false;
  return ACCEPTED_COUNTRY_ALIASES.has(raw.trim().toLowerCase());
}

function normalizeCountry(raw) {
  return isMoroccanCountry(raw) ? CANONICAL_COUNTRY : null;
}

// Accept common Moroccan phone shapes:
//   06XXXXXXXX / 07XXXXXXXX (mobile), 05XXXXXXXX (fixed) — 10 digits local
//   +212 6XXXXXXXX, 00212 6XXXXXXXX, 2126XXXXXXXX — international variants
// Separators (spaces, dashes, parentheses, dots) are tolerated.
// Returns `{ valid, normalized }` where `normalized` is the E.164-ish form
// `+2126XXXXXXXX` suitable for storage and downstream use (SMS, contact).
function normalizeMoroccanPhone(raw) {
  if (typeof raw !== 'string') return { valid: false, normalized: '' };
  const stripped = raw.replace(/[\s\-().]/g, '');
  if (!stripped) return { valid: false, normalized: '' };

  let local;
  if (stripped.startsWith('+212')) {
    local = '0' + stripped.slice(4);
  } else if (stripped.startsWith('00212')) {
    local = '0' + stripped.slice(5);
  } else if (stripped.startsWith('212') && stripped.length === 12) {
    local = '0' + stripped.slice(3);
  } else {
    local = stripped;
  }

  if (!/^0[567]\d{8}$/.test(local)) {
    return { valid: false, normalized: '' };
  }
  return { valid: true, normalized: '+212' + local.slice(1) };
}

module.exports = {
  CANONICAL_COUNTRY,
  ACCEPTED_COUNTRY_ALIASES,
  isMoroccanCountry,
  normalizeCountry,
  normalizeMoroccanPhone,
};
