export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Valid email required' });
    }

    try {
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
