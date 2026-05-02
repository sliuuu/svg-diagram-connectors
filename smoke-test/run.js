// Headless smoke-test runner.
// Loads smoke-test/index.html, waits for the JS to populate the three report panels,
// then asserts:
//   - The RAW panel contains FAIL    (proves the test is exercising the failure case)
//   - The STEP1 panel contains FAIL  (proves Step 1 alone is insufficient)
//   - The STEP1+2 panel contains all PASS (proves the strengthened rule fixes it)
// Exits non-zero on any assertion failure.

const path = require('node:path');
const { chromium } = require('playwright');

// Use system Chrome locally (set USE_SYSTEM_CHROME=1) to avoid downloading
// Playwright's bundled chromium. CI uses the bundled chromium by default.
const launchOpts = process.env.USE_SYSTEM_CHROME ? { channel: 'chrome' } : {};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1700, height: 800 } });
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForFunction(
    () => document.getElementById('report2')?.textContent?.includes('PASS'),
    { timeout: 5000 }
  );

  const reports = await page.$$eval('pre', els => els.map(e => e.textContent));
  const [raw, step1, step12] = reports;

  const checks = [
    ['RAW must FAIL',           raw.includes('FAIL')],
    ['STEP 1 must FAIL on (b)', step1.includes('FAIL')],
    ['STEP 1+2 must PASS (a)',  step12.includes('PASS') && !step12.includes('FAIL')],
    ['STEP 1+2: D2 on axis',    step12.includes('D2 on axis: YES') ||
                                step12.includes('D2 on axis: <span class="ok">YES')],
  ];

  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${label}`);
    if (!ok) allOk = false;
  }

  console.log('\n--- panel reports ---');
  reports.forEach((r, i) => console.log(`\n[panel ${i}]\n${r}`));

  await browser.close();
  process.exit(allOk ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
