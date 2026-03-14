const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });

    await page.waitForSelector('text=Gateway Queue');
    await page.fill('input[placeholder^="Task label"]', 'Echo External');
    await page.fill('textarea[placeholder^="Command to queue"]', 'ollama list');
    await page.getByText('External (approval required)').click();
    await page.getByRole('button', { name: 'Queue Task' }).click();
    await page.waitForTimeout(500);
    const pendingLabel = await page
      .locator('.gateway-task .status-pill')
      .first()
      .innerText();
    console.log('ECHO_LOOP 1: External task status ->', pendingLabel);

    await page.getByRole('button', { name: 'Approve' }).first().click();
    await page.waitForTimeout(500);
    const approvedLabel = await page
      .locator('.gateway-task .status-pill')
      .first()
      .innerText();
    console.log('ECHO_LOOP 2: Approved task status ->', approvedLabel);

    await page.getByRole('link', { name: 'Chat' }).click();
    await page.waitForSelector('h1:has-text("Ollama Chat Node")');
    await page.fill('textarea[placeholder^="Send a message"]', 'Echo loop user test.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    const lastBubble = await page
      .locator('.chat-bubble.user .bubble-text')
      .last()
      .innerText();
    console.log('ECHO_LOOP 3: User message rendered ->', lastBubble);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('ECHO_LOOP failed:', err.message);
  process.exit(1);
});
