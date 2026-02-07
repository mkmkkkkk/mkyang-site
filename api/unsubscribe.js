/**
 * GET /api/unsubscribe?email=xxx
 *
 * Marks a subscriber as inactive in Notion.
 * Returns a simple HTML confirmation page.
 */

const NOTION_API = 'https://api.notion.com/v1';

export default async function handler(req, res) {
    const rawEmail = req.query.email;
    const token = req.query.token;

    if (!rawEmail) {
        return res.status(400).send(page('Missing email parameter.', false));
    }

    // Validate & normalize email
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).send(page('Invalid email.', false));
    }

    // HMAC token verification (if UNSUBSCRIBE_SECRET is configured)
    if (process.env.UNSUBSCRIBE_SECRET) {
        const crypto = await import('crypto');
        const expected = crypto.createHmac('sha256', process.env.UNSUBSCRIBE_SECRET)
            .update(email).digest('hex').slice(0, 16);
        if (!token || token !== expected) {
            return res.status(403).send(page('Invalid unsubscribe link.', false));
        }
    }

    try {
        // Find the subscriber in Notion
        const searchRes = await fetch(
            `${NOTION_API}/databases/${process.env.NOTION_SUBSCRIBERS_DB}/query`,
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
                }),
            }
        );

        if (!searchRes.ok) {
            return res.status(500).send(page('Something went wrong. Please try again.', false));
        }

        const data = await searchRes.json();
        if (data.results.length === 0) {
            return res.status(200).send(page('This email is not subscribed.', false));
        }

        // Update status to inactive
        const pageId = data.results[0].id;
        const updateRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties: {
                    Status: { select: { name: 'unsubscribed' } },
                },
            }),
        });

        if (updateRes.ok) {
            return res.status(200).send(page('You have been unsubscribed. Sorry to see you go.', true));
        } else {
            return res.status(500).send(page('Something went wrong. Please try again.', false));
        }
    } catch (err) {
        console.error('Unsubscribe error:', err.message);
        return res.status(500).send(page('Something went wrong. Please try again.', false));
    }
}

function page(message, success) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Unsubscribe - mkyang.ai</title>
<style>
  body { margin:0; background:#0a0a0a; color:#f0ede6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .box { text-align:center; max-width:400px; padding:40px 24px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 12px; color:${success ? '#4ade80' : '#f87171'}; }
  p { font-size:15px; color:#999; line-height:1.6; margin:0 0 24px; }
  a { color:#c9a84c; text-decoration:none; font-size:14px; }
  a:hover { text-decoration:underline; }
</style>
</head>
<body>
<div class="box">
  <h1>${success ? 'Unsubscribed' : 'Oops'}</h1>
  <p>${message}</p>
  <a href="https://mkyang.ai/blog">Back to Blog</a>
</div>
</body>
</html>`;
}
