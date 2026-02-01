const https = require('https');

function notionRequest(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: 'api.notion.com',
            path: '/v1/pages',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: JSON.parse(body) });
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Valid email required' });
    }

    try {
        const result = await notionRequest({
            parent: { database_id: process.env.NOTION_SUBSCRIBERS_DB },
            properties: {
                Email: {
                    title: [{ text: { content: email } }],
                },
                'Subscribed At': {
                    date: { start: new Date().toISOString() },
                },
                Status: {
                    select: { name: 'active' },
                },
            },
        });

        if (result.status === 200) {
            return res.status(200).json({ ok: true });
        } else {
            console.error('Notion error:', JSON.stringify(result.body));
            return res.status(500).json({ error: 'Failed to save subscription' });
        }
    } catch (err) {
        console.error('Subscribe error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
};
