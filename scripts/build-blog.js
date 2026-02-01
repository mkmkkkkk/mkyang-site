#!/usr/bin/env node
/**
 * Blog index generator for mkyang.ai
 * Scans blog/*.html for BLOG_META blocks, generates blog/index.html
 * Zero dependencies — uses only Node.js built-ins.
 *
 * Usage: node scripts/build-blog.js
 */

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', 'blog');
const OUTPUT = path.join(BLOG_DIR, 'index.html');

// ── Parse BLOG_META from an HTML file ──────────────────────────────────
function parseMeta(filePath) {
    const html = fs.readFileSync(filePath, 'utf-8');
    const match = html.match(/<!--\s*\nBLOG_META\n([\s\S]*?)\nEND_META\s*\n-->/);
    if (!match) return null;

    const meta = {};
    for (const line of match[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key && val) meta[key] = val;
    }
    meta.slug = path.basename(filePath);
    return meta;
}

// ── Collect all posts ──────────────────────────────────────────────────
const posts = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => parseMeta(path.join(BLOG_DIR, f)))
    .filter(Boolean)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// ── Format date ────────────────────────────────────────────────────────
function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Generate HTML ──────────────────────────────────────────────────────
const postCards = posts.map(p => {
    const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const tagHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
    const bilingualBadge = p.bilingual === 'true' ? '<span class="tag bilingual">EN / 中文</span>' : '';
    return `
            <a href="/blog/${p.slug}" class="post-card">
                <time class="post-date">${formatDate(p.date)}</time>
                <h2 class="post-title">${p.title}</h2>
                <p class="post-desc">${p.description || ''}</p>
                <div class="post-tags">${tagHTML}</div>
            </a>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog - Michael Yang</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/base.css">
    <style>
        /* === BLOG INDEX === */
        .blog-index {
            max-width: 720px;
            margin: 0 auto;
            padding-bottom: 6rem;
        }

        .blog-header {
            margin-bottom: 4rem;
            opacity: 0;
            animation: fadeUp 1s ease forwards 0.4s;
        }

        .blog-header h1 {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: clamp(2.5rem, 5vw, 3.5rem);
            font-weight: 800;
            color: var(--text);
            margin-bottom: 1rem;
        }

        .blog-header p {
            font-size: 1.05rem;
            font-weight: 300;
            color: rgba(240, 237, 230, 0.55);
            line-height: 1.7;
        }

        .blog-header .header-rule {
            width: 60px;
            height: 1px;
            background: var(--accent);
            margin-top: 2rem;
        }

        .post-list {
            opacity: 0;
            animation: fadeUp 1s ease forwards 0.6s;
        }

        .post-card {
            display: block;
            text-decoration: none;
            padding: 2rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            transition: transform 0.3s ease;
        }

        .post-card:first-child {
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .post-card:hover {
            transform: translateX(8px);
        }

        .post-date {
            font-size: 0.72rem;
            font-weight: 400;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: var(--accent);
            display: block;
            margin-bottom: 0.75rem;
        }

        .post-title {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text);
            line-height: 1.3;
            margin-bottom: 0.4rem;
        }

        .post-title-zh {
            font-size: 1rem;
            font-weight: 300;
            color: rgba(240, 237, 230, 0.45);
            margin-bottom: 0.6rem;
        }

        .post-desc {
            font-size: 0.95rem;
            font-weight: 300;
            color: rgba(240, 237, 230, 0.6);
            line-height: 1.7;
            margin-bottom: 0.75rem;
        }

        .post-tags {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .tag {
            font-size: 0.6rem;
            font-weight: 500;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--muted);
            border: 1px solid rgba(255, 255, 255, 0.08);
            padding: 0.2em 0.6em;
            border-radius: 3px;
        }

        .tag.bilingual {
            color: var(--accent);
            border-color: rgba(201, 168, 76, 0.2);
        }

        .blog-footer {
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 2rem;
            margin-top: 4rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            opacity: 0;
            animation: fadeUp 1s ease forwards 0.8s;
        }

        .topbar { margin-bottom: 5rem; }

        @media (max-width: 768px) {
            .topbar { margin-bottom: 3rem; }
            .blog-footer { flex-direction: column; gap: 1rem; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <!-- Ambient background -->
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="grid-overlay"></div>
    <div class="v-line"></div>
    <div class="noise"></div>
    <div class="vignette"></div>

    <div class="page">
        <header class="topbar">
            <a href="/" class="logo">mkyang.ai</a>
            <div class="topbar-right">
                <nav class="topbar-nav">
                    <a href="/">Home</a>
                </nav>
                <div class="status-badge">
                    <span class="status-dot"></span>
                    Building with AI
                </div>
            </div>
        </header>

        <main class="blog-index">
            <div class="blog-header">
                <h1>Blog</h1>
                <p>Thoughts on AI, building products, and the future of work.</p>
                <div class="header-rule"></div>
            </div>

            <div class="post-list">
${postCards}
            </div>

            <footer class="blog-footer">
                <nav class="links">
                    <a href="/">Home</a>
                    <a href="https://github.com/MichaelYangzk" target="_blank" rel="noopener">GitHub</a>
                    <a href="https://x.com/bayc2043" target="_blank" rel="noopener">X / Twitter</a>
                    <a href="mailto:yangzk01@gmail.com">Email</a>
                </nav>
                <span class="copyright">&copy; 2025 Michael Yang</span>
            </footer>
        </main>
    </div>
</body>
</html>
`;

fs.writeFileSync(OUTPUT, html);
console.log(`✅ Generated ${OUTPUT} with ${posts.length} post(s)`);
