# Ringkas — Unified Integration Docs

A single-page app that gathers the **complete** integration documentation for three
marketplaces into one place, switchable via a top tab bar:

- 🟠 **Shopee Open Platform** — Developer Guide + API Reference (v2) + Push Mechanism
- ⚫ **TikTok Shop Open Platform** — Partner Guide, Developer Guide, API Reference, Webhooks, Policies, Changelog
- 🔵 **Lazada Open Platform** — Developer Guide + API Reference

Styling is **neo-brutalist**: thick black borders, hard offset shadows, chunky display type,
high-contrast flat colors and a per-platform accent.

## Why it isn't a summary

The content is **the actual documentation, reproduced in full** — every sidebar entry and every
Table-of-Contents section from the official sources. It is crawled programmatically from each
platform's own content API and normalised into one page model, so nothing is hand-waved or invented.

| Platform | Documents |
| -------- | --------: |
| Shopee   | 534 (44 guide · 455 API · 35 push) |
| TikTok Shop | 869 |
| Lazada   | 510 (387 API · 123 guide) |
| **Total** | **1,913** |

## How it works

```
scripts/crawl.mjs     # fetch + normalise all three platforms → data/
scripts/serve.mjs     # tiny static server (no deps)
assets/*              # SPA (vanilla JS — no framework, no build step)
index.html
```

The crawler reads each platform's content API:

- **Shopee** — `open.shopee.com/opservice/api/v1/`: `doc/module`, `doc/api`, `developer_guide/list`,
  `developer_guide/detail`, `push/category`, `push/doc`
- **TikTok Shop** — `partner.tiktokshop.com/api/v1/`: `document/tree`, `document/detail`
- **Lazada** — `isvconsole.lazada.com/.../getApiCategoryMixed.json` + `getApi.json`,
  and `open.lazada.com/.../doc/getCategories.json` + `getDocDetail.json`

Each source format is normalised to HTML (Shopee guide = Slate JSON, TikTok = Markdown,
Shopee/Lazada API = structured parameter tables, push/docs = HTML) and written to
`data/<platform>/pages/<id>.json` with `data/nav.json` as the navigation manifest.

## Run

```bash
npm install        # only dependency: marked (Markdown → HTML)
npm run crawl      # (re)build data/ from the live docs
npm run serve      # http://localhost:4173
```

## Features

- Sticky top nav + platform tab bar with brand icons
- Sticky, collapsible, filterable sidebar mirroring each platform's real navigation
- Sticky "On this page" table of contents with scroll-spy
- Cross-platform search (⌘K)
- Copy buttons on every code block, tabbed code samples, neo-brutalist tables and callouts

_Content is the property of Shopee, TikTok and Lazada. Ringkas is an integration reference that
reproduces their public developer documentation for practical, unified use._
