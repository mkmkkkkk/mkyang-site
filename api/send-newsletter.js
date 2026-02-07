/**
 * POST /api/send-newsletter
 *
 * Sends a newsletter email to all active subscribers when a new blog post is published.
 *
 * Body: { slug: "post-filename.html", secret: "..." }
 *
 * Flow:
 *   1. Validate secret
 *   2. Fetch post page from mkyang.ai to extract title/description
 *   3. Query Notion for all active subscribers
 *   4. Send email via Resend (batch, with rate limiting)
 *   5. Return results
 */

import { createHmac } from 'crypto';

const SITE_URL = 'https://mkyang.ai';
const RESEND_API = 'https://api.resend.com/emails';
const NOTION_API = 'https://api.notion.com/v1';

function unsubscribeUrl(email) {
    const base = `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`;
    if (process.env.UNSUBSCRIBE_SECRET) {
        const token = createHmac('sha256', process.env.UNSUBSCRIBE_SECRET)
            .update(email).digest('hex').slice(0, 16);
        return `${base}&token=${token}`;
    }
    return base;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slug, secret } = req.body || {};

    // Auth check
    if (!secret || secret !== process.env.NEWSLETTER_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!slug) {
        return res.status(400).json({ error: 'slug is required' });
    }

    try {
        // 1. Fetch the post page to extract metadata
        const postUrl = `${SITE_URL}/blog/${slug}`;
        const pageRes = await fetch(postUrl);
        if (!pageRes.ok) {
            return res.status(404).json({ error: `Post not found: ${postUrl}` });
        }
        const html = await pageRes.text();

        // Extract metadata from BLOG_META block
        const metaMatch = html.match(/<!--\s*\nBLOG_META\n([\s\S]*?)\nEND_META\s*\n-->/);
        if (!metaMatch) {
            return res.status(400).json({ error: 'No BLOG_META found in post' });
        }
        const meta = {};
        for (const line of metaMatch[1].split('\n')) {
            const idx = line.indexOf(':');
            if (idx === -1) continue;
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            if (key && val) meta[key] = val;
        }

        const title = meta.title || 'New Post';
        const description = meta.description || '';
        const tags = (meta.tags || '').split(',').map(t => t.trim()).filter(Boolean);

        // 2. Query Notion for active subscribers
        const subscribers = await getAllSubscribers();
        if (subscribers.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, message: 'No active subscribers' });
        }

        // 3. Send emails via Resend with rate limiting (2 req/sec for free plan)
        const results = { sent: 0, failed: 0, errors: [] };

        for (const email of subscribers) {
            try {
                const emailHtml = buildEmailHtml({ title, description, postUrl, tags, email });
                const sendRes = await fetch(RESEND_API, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'Michael Yang <blog@mkyang.ai>',
                        to: email,
                        subject: `New Post: ${title}`,
                        html: emailHtml,
                        headers: {
                            'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
                        },
                    }),
                });

                if (sendRes.ok) {
                    results.sent++;
                } else {
                    const err = await sendRes.json();
                    results.failed++;
                    results.errors.push({ email, error: err.message || 'Send failed' });
                }

                // Rate limit: 1.5s between sends (Resend free plan: 2 req/sec)
                await sleep(1500);
            } catch (err) {
                results.failed++;
                results.errors.push({ email, error: err.message });
            }
        }

        return res.status(200).json({ ok: true, ...results });
    } catch (err) {
        console.error('Newsletter error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}

// ── Notion: get all active subscribers ────────────────────────────────
async function getAllSubscribers() {
    const emails = [];
    let cursor = undefined;

    do {
        const body = {
            filter: {
                property: 'Status',
                select: { equals: 'active' },
            },
            page_size: 100,
        };
        if (cursor) body.start_cursor = cursor;

        const res = await fetch(
            `${NOTION_API}/databases/${process.env.NOTION_SUBSCRIBERS_DB}/query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }
        );

        if (!res.ok) break;
        const data = await res.json();

        for (const page of data.results) {
            const emailProp = page.properties?.Email?.title;
            if (emailProp && emailProp[0]?.text?.content) {
                emails.push(emailProp[0].text.content);
            }
        }

        cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    return emails;
}

// ── Helpers ───────────────────────────────────────────────────────────
function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email template ────────────────────────────────────────────────────
function buildEmailHtml({ title, description, postUrl, tags, email }) {
    const tagBadges = tags.map(t =>
        `<span style="display:inline-block;font-size:11px;color:#999;border:1px solid #333;padding:2px 8px;border-radius:3px;margin-right:6px;letter-spacing:0.5px;text-transform:uppercase;">${esc(t)}</span>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">

  <!-- Header -->
  <div style="margin-bottom:32px;">
    <a href="${SITE_URL}" style="color:#c9a84c;text-decoration:none;font-size:14px;letter-spacing:0.1em;">mkyang.ai</a>
  </div>

  <!-- Content -->
  <div style="border-top:1px solid #222;padding-top:32px;">
    <p style="font-size:12px;color:#666;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 16px;">New Post</p>
    <h1 style="font-size:28px;color:#f0ede6;margin:0 0 12px;line-height:1.3;font-weight:700;">${esc(title)}</h1>
    <p style="font-size:16px;color:#999;line-height:1.6;margin:0 0 20px;">${esc(description)}</p>
    ${tagBadges ? `<div style="margin-bottom:24px;">${tagBadges}</div>` : ''}
    <a href="${postUrl}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:12px 28px;font-size:14px;font-weight:500;border-radius:4px;letter-spacing:0.03em;">Read Post</a>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #222;margin-top:48px;padding-top:20px;">
    <p style="font-size:12px;color:#555;margin:0;line-height:1.6;">
      You're receiving this because you subscribed at <a href="${SITE_URL}/blog" style="color:#c9a84c;text-decoration:none;">mkyang.ai/blog</a>.<br>
      <a href="${unsubscribeUrl(email)}" style="color:#555;text-decoration:underline;">Unsubscribe</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
