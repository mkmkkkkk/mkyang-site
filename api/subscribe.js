// Simple in-memory rate limiter (per Vercel function instance)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per minute per IP

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimit.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
        rateLimit.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

const ALLOWED_ORIGINS = ['https://mkyang.ai', 'https://www.mkyang.ai'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // CSRF: check Origin header
    const origin = req.headers['origin'];
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const { email: rawEmail } = req.body || {};

    // Validate & normalize email
    if (!rawEmail || typeof rawEmail !== 'string') {
        return res.status(400).json({ error: 'Valid email required' });
    }
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Valid email required' });
    }

    try {
        // Check for duplicate subscription
        const checkRes = await fetch(
            `https://api.notion.com/v1/databases/${process.env.NOTION_SUBSCRIBERS_DB}/query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filter: {
                        property: 'Email',
                        title: { equals: email },
                    },
                    page_size: 1,
                }),
            }
        );

        if (checkRes.ok) {
            const existing = await checkRes.json();
            if (existing.results.length > 0) {
                return res.status(200).json({ ok: true }); // silently accept duplicates
            }
        }

        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
            }),
        });

        if (response.ok) {
            return res.status(200).json({ ok: true });
        } else {
            const err = await response.json();
            console.error('Notion error:', JSON.stringify(err));
            return res.status(500).json({ error: 'Failed to save subscription' });
        }
    } catch (err) {
        console.error('Subscribe error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
