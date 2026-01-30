const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const GEMINI_API_KEY = 'AIzaSyBZyPusEyVD65LiQr74XFX1ZfI1mm0UpHQ';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
const SITE_URL = 'https://mkyang-site.vercel.app';
const SCREENSHOT_API = `https://image.thum.io/get/width/1440/crop/900/maxAge/0/wait/3/${SITE_URL}?static`;

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const get = url.startsWith('https') ? https.get : http.get;
        get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(dest); });
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    });
}

async function geminiReview(imagePath) {
    const imageData = fs.readFileSync(imagePath).toString('base64');

    const prompt = `You are an elite web design critic from Awwwards (https://www.awwwards.com/websites/nominees/).
Review this personal website screenshot with the highest standards.

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
                { inlineData: { mimeType: 'image/png', data: imageData } }
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
    const imgPath = path.resolve(__dirname, 'screenshot.png');

    console.log('Taking screenshot of', SITE_URL, '...');
    await download(SCREENSHOT_API, imgPath);

    const stats = fs.statSync(imgPath);
    console.log('Screenshot saved:', imgPath, `(${Math.round(stats.size/1024)}KB)`);

    console.log('Sending to Gemini for review...');
    const review = await geminiReview(imgPath);
    console.log('\n--- REVIEW ---\n');
    console.log(review);
    console.log('\n--- END REVIEW ---');
}

main().catch(console.error);
