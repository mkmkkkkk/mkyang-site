const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set. Add to /workspace/.env');
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

const HEADLESS_SHELL = path.join(
    require('os').homedir(),
    '.cache/ms-playwright/chromium_headless_shell-1208/chrome-linux/headless_shell'
);
const LIB_PATH = '/tmp/chromium-deps/libs/usr/lib/aarch64-linux-gnu:/tmp/chromium-deps/libs/lib/aarch64-linux-gnu';

async function takeScreenshot(url) {
    const { chromium } = require('playwright-core');
    const screenshotPath = path.join(__dirname, 'screenshot.png');

    console.log('Launching headless shell...');
    const browser = await chromium.launch({
        executablePath: HEADLESS_SHELL,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        headless: true,
        env: { ...process.env, LD_LIBRARY_PATH: LIB_PATH }
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000); // let animations settle

    await page.screenshot({ path: screenshotPath, fullPage: false });
    await browser.close();

    console.log('Screenshot saved:', screenshotPath);
    const base64 = fs.readFileSync(screenshotPath).toString('base64');
    console.log('Screenshot size:', Math.round(base64.length / 1024) + 'KB base64');
    return base64;
}

async function geminiVisionReview(imageBase64) {
    const prompt = `You are an elite web design critic from Awwwards (https://www.awwwards.com/websites/nominees/).
Review this screenshot of a personal website. Evaluate it with the highest standards.

Rate it 1-10 on: Design, Usability, Creativity, Content.

Then give EXACTLY 3 specific, actionable improvements. Be very concrete about:
- Exact CSS changes (colors, sizes, spacing, effects)
- Layout improvements
- Animation/interaction enhancements
- Typography tweaks

Focus on what would make this an Awwwards-worthy site. Think: premium feel, cinematic, immersive.

Format:
SCORES: Design: X/10 | Usability: X/10 | Creativity: X/10 | Content: X/10

IMPROVEMENTS:
1. [specific change with exact CSS/design details]
2. [specific change with exact CSS/design details]
3. [specific change with exact CSS/design details]

If all scores are 9+ say "APPROVED" at the end.`;

    const body = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/png', data: imageBase64 } }
            ]
        }]
    };

    const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const json = await res.json();
    if (json.candidates && json.candidates[0]) {
        return json.candidates[0].content.parts[0].text;
    }
    throw new Error('Gemini API error: ' + JSON.stringify(json));
}

async function main() {
    const url = process.argv[2] || 'https://mkyang.ai';
    console.log('Taking screenshot of:', url);

    const base64 = await takeScreenshot(url);
    console.log('Sending screenshot to Gemini for vision review...');

    const review = await geminiVisionReview(base64);
    console.log('\n--- REVIEW ---\n');
    console.log(review);
    console.log('\n--- END REVIEW ---');
}

main().catch(console.error);
