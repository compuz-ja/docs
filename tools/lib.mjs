import crypto from 'node:crypto';
import { chromium } from 'playwright';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totp(secret, t = Date.now()) {
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeUInt32BE(Math.floor(t / 30000), 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

export const BASE = 'http://127.0.0.1:8099';
export const USERS = {
  admin:      ['htingling@compuzign.com',     '<admin-totp-secret>'],
  gm:         ['gm@meridiancu.demo',          '<gm-totp-secret>'],
  finance:    ['finance@meridiancu.demo',     '<finance-totp-secret>'],
  compliance: ['compliance@meridiancu.demo',  '<compliance-totp-secret>'],
  risk:       ['risk@meridiancu.demo',        '<risk-totp-secret>'],
};
export const PASSWORD = '<demo-password>';

export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}

/** House standard: 1500 CSS px at 2x. */
export async function newPage(browser, width = 1500, height = 1000) {
  return browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
}

export async function signIn(page, who = 'admin') {
  const [email, secret] = USERS[who];
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  const code = page.locator('input[inputmode="numeric"], input[name="code"], input[autocomplete="one-time-code"]').first();
  if (await code.count()) {
    await code.fill(totp(secret));
    const btn = page.locator('button[type="submit"]').first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(1500);
  }
  return page;
}
