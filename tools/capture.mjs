import fs from 'node:fs';
import { launch, newPage, signIn, BASE } from './lib.mjs';

const catalogue = JSON.parse(fs.readFileSync('catalogue.json', 'utf8'));
const only = process.argv[2] ? process.argv[2].split(',') : null;
const targets = only ? catalogue.filter(r => only.includes(r.report_key)) : catalogue;

fs.mkdirSync('out/reports', { recursive: true });
const b = await launch();
const p = await newPage(b, 1500, 1200);
await signIn(p, 'admin');

const log = [];
for (const r of targets) {
  const key = r.report_key;
  try {
    await p.goto(`${BASE}/reports/${key}`, { waitUntil: 'networkidle' });
    // The SPA applies the route after hydration, so wait for the heading to
    // become this report rather than whatever was selected before.
    await p.waitForFunction(
      (t) => [...document.querySelectorAll('h1,h2,h3')].some(h => h.textContent.trim() === t),
      r.title, { timeout: 15000 },
    );
    const run = p.locator('button:has-text("Run report")').last();
    await run.click();
    await p.waitForFunction(
      () => !document.body.innerText.includes('Ready to run'), null, { timeout: 30000 },
    ).catch(() => {});
    // Park the cursor off the canvas, or whichever bar it happens to be
    // over keeps its tooltip open in the screenshot.
    await p.mouse.move(4, 4);
    await p.waitForTimeout(1500);
    const main = p.locator('.report-layout > div:last-child').first();
    const el = (await main.count()) ? main : p.locator('body');
    await el.screenshot({ path: `out/reports/${key}.png` });
    const rows = await p.locator('tbody tr').count();
    const err  = await p.locator('.error, [role="alert"]').count();
    log.push(`${key.padEnd(28)} rows=${String(rows).padStart(4)} err=${err}`);
  } catch (e) {
    log.push(`${key.padEnd(28)} FAILED ${String(e.message).slice(0, 70)}`);
  }
}
await b.close();
console.log(log.join('\n'));
