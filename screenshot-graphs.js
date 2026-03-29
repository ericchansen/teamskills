const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const BASE = 'https://ca-frontend-teamskills.greenwater-c5983efd.centralus.azurecontainerapps.io';
const DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

(async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'msedge',
    args: ['--window-size=1920,1080']
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('Navigating to production site...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Current URL: ' + page.url());

  await ask('Press ENTER once you have logged in...\n');
  console.log('Continuing...');
  
  // Reload to ensure we're on the app
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  async function shot(label, filename, wait = 4000) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(DIR, filename) });
    console.log(`[${label}] saved → ${filename}`);
  }

  // 1) Matrix
  await shot('Matrix', '01-matrix.png', 3000);

  // 2) Graph
  try {
    await page.click('button:has-text("Graph"), [role="tab"]:has-text("Graph")', { timeout: 5000 });
    await shot('Graph', '02-graph.png', 6000);
  } catch (e) { console.log('Graph tab not found'); }

  // 3) Coverage
  try {
    await page.click('button:has-text("Coverage"), [role="tab"]:has-text("Coverage")', { timeout: 5000 });
    await shot('Coverage', '03-coverage.png');
  } catch (e) { console.log('Coverage tab not found'); }

  // 4) Gaps
  try {
    await page.click('button:has-text("Gaps"), [role="tab"]:has-text("Gaps")', { timeout: 5000 });
    await shot('Gaps', '04-gaps.png');
  } catch (e) { console.log('Gaps tab not found'); }

  // 5) Trends
  try {
    await page.click('button:has-text("Trends"), [role="tab"]:has-text("Trends")', { timeout: 5000 });
    await shot('Trends', '05-trends.png');
  } catch (e) { console.log('Trends tab not found'); }

  console.log('\nAll done!');
  rl.close();
  await browser.close();
})();
