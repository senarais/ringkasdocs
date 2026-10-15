import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const CONC = 5;
const ONLY = process.argv.slice(2);
const RESUME = !!process.env.RESUME;
const existsPage = (platform, id) => existsSync(path.join(DATA, platform, 'pages', id + '.json'));

marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

/* ------------------------------------------------------------------ utils */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 6, validate = null) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = JSON.parse(await res.text());
      if (validate && !validate(json)) throw new Error('unexpected payload (rate limited?)');
      return json;
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url} :: ${e.message}`);
      await sleep(500 * (i + 1));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        console.error('  ! ' + e.message);
      }
      done++;
      if (done % 25 === 0) process.stdout.write(`\r  ...${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
  if (items.length >= 25) process.stdout.write('\n');
  return out;
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const slugId = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
const tryParse = (v, fb) => {
  if (v == null) return fb;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
};
const mdInline = (s) => marked.parseInline(String(s ?? ''));

async function writePage(page) {
  const dir = path.join(DATA, page.platform, 'pages');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${page.id}.json`), JSON.stringify(page));
}

/* --------------------------------------------------------------- html bits */
function table(head, rows, cls = '') {
  let s = `<div class="tbl-wrap${cls ? ' ' + cls : ''}"><table>`;
  if (head && head.length)
    s += '<thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead>';
  s += '<tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody>';
  return s + '</table></div>';
}

function codeBlock(lang, code) {
  return `<pre class="code" data-lang="${esc(lang || '')}"><code>${esc(code)}</code><button class="copy" type="button" aria-label="Copy">Copy</button></pre>`;
}

function codeTabs(samples) {
  const list = (samples || []).filter((s) => s && (s.value != null || s.code != null));
  if (!list.length) return '';
  if (list.length === 1) return codeBlock(list[0].type, list[0].value ?? list[0].code);
  const tabs = list
    .map((s, i) => `<button class="ct-tab${i === 0 ? ' is-active' : ''}" data-i="${i}">${esc(s.type || 'Sample ' + (i + 1))}</button>`)
    .join('');
  const panes = list
    .map((s, i) => `<pre class="ct-pane${i === 0 ? ' is-active' : ''}" data-lang="${esc(s.type || '')}"><code>${esc(s.value ?? s.code)}</code></pre>`)
    .join('');
  return `<div class="codetabs"><div class="ct-tabs">${tabs}<button class="ct-copy" type="button">Copy</button></div><div class="ct-body">${panes}</div></div>`;
}

function endpoint(method, p, url) {
  const m = (method || 'POST').toUpperCase();
  return `<div class="endpoint"><span class="method method-${m}">${m}</span><code>${esc(p || '')}</code></div>${
    url ? `<p class="muted small">Base URL: <code>${esc(url)}</code></p>` : ''
  }`;
}

/* ------------------------------------------------------------ shopee slate */
function slateInline(n) {
  if (n.name === 'softBreak' || n.name === 'hardBreak') return '<br>';
  if (n.name === 'link')
    return `<a href="${esc(n.attributes?.href || '#')}" target="_blank" rel="noopener">${(n.children || []).map(slateInline).join('')}</a>`;
  if (n.data != null) {
    let t = esc(n.data);
    const a = n.attributes || {};
    if (a.code) t = `<code>${t}</code>`;
    if (a.bold) t = `<strong>${t}</strong>`;
    if (a.italic) t = `<em>${t}</em>`;
    if (a.underline) t = `<u>${t}</u>`;
    if (a.strikethrough) t = `<s>${t}</s>`;
    if (a.fontColor && a.fontColor.toLowerCase() !== '#2b2c2d') t = `<span style="color:${esc(a.fontColor)}">${t}</span>`;
    return t;
  }
  return slateNode(n);
}

function slateNode(n) {
  const kids = n.children || [];
  switch (n.name) {
    case 'paragraph':
      return kids.length ? `<p>${kids.map(slateInline).join('')}</p>` : '';
    case 'heading1':
      return `<h2>${kids.map(slateInline).join('')}</h2>`;
    case 'heading2':
      return `<h3>${kids.map(slateInline).join('')}</h3>`;
    case 'heading3':
      return `<h4>${kids.map(slateInline).join('')}</h4>`;
    case 'imageBlock':
      return `<figure><img loading="lazy" src="${esc(n.attributes?.src || '')}" alt=""></figure>`;
    case 'table':
      return slateTable(n);
    case 'listItem':
      return `<li>${kids.map(slateInline).join('')}</li>`;
    default:
      return kids.map(slateInline).join('');
  }
}

function slateTable(node) {
  const rows = node.children || [];
  const headingRows = node.attributes?.headingRows || 0;
  let out = '<div class="tbl-wrap"><table>';
  rows.forEach((r, ri) => {
    const cells = (r.children || [])
      .map((c) => {
        const cs = c.attributes?.colspan || 1;
        const content = (c.children || []).map(slateNode).join('');
        const tag = ri < headingRows ? 'th' : 'td';
        return `<${tag}${cs > 1 ? ` colspan="${cs}"` : ''}>${content}</${tag}>`;
      })
      .join('');
    out += `<tr>${cells}</tr>`;
  });
  return out + '</table></div>';
}

function slateToHtml(raw) {
  const nodes = tryParse(raw, []) || [];
  let out = '';
  let list = null;
  const flush = () => {
    if (list) {
      out += `<${list.tag}>${list.items.join('')}</${list.tag}>`;
      list = null;
    }
  };
  for (const n of nodes) {
    if (n.name === 'listItem') {
      const t = (n.attributes?.listType || '').toLowerCase() === 'numbered' ? 'ol' : 'ul';
      if (!list || list.tag !== t) {
        flush();
        list = { tag: t, items: [] };
      }
      list.items.push(slateNode(n));
    } else {
      flush();
      out += slateNode(n);
    }
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ shopee */
const SP = 'https://open.shopee.com/opservice/api/v1';

function shopeeParamTable(rows) {
  if (!rows || !rows.length) return '<p class="muted">No parameters.</p>';
  return table(
    ['Name', 'Type', 'Required', 'Sample', 'Description'],
    rows.map((r) => [
      `<code>${esc(r.name)}</code>`,
      `${esc(r.type || '')}${r.limits ? `<br><span class="muted small">limits: ${esc(r.limits)}</span>` : ''}`,
      r.required === 'True' || r.required === true ? '<span class="req">True</span>' : 'False',
      r.sample ? `<code>${esc(r.sample)}</code>` : '',
      esc(r.description || ''),
    ])
  );
}

function shopeeErrorTable(errs) {
  if (!errs || !errs.length) return '<p class="muted">No errors documented.</p>';
  const seen = new Set();
  const rows = [];
  for (const e of errs) {
    const key = e.name + '|' + e.description;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([
      `<code>${esc(e.name)}</code>`,
      esc(e.description || ''),
      e.solution ? esc(e.solution) : '<span class="muted">—</span>',
    ]);
  }
  return table(['Error', 'Description', 'Solution'], rows);
}

function shopeeApiHtml(api) {
  const common = tryParse(api.common_params, []) || [];
  const pobj = tryParse(api.params, {}) || {};
  const req = pobj.request_params || [];
  const resp = pobj.response_params || [];
  const method = api.is_get_method ? 'GET' : 'POST';
  let h = '';
  if (api.define) h += `<p>${mdInline(api.define)}</p>`;
  h += '<h2>Request</h2>';
  h += '<h3>Request Address</h3>' + endpoint(method, api.path, api.url);
  h += '<h3>Common Request Parameters</h3>' + shopeeParamTable(common);
  h += '<h3>Request Parameters</h3>' + shopeeParamTable(req);
  h += '<h3>Request Example</h3>' + codeTabs(tryParse(api.request_sample, []) || []);
  h += '<h2>Response</h2>';
  h += '<h3>Response Parameters</h3>' + shopeeParamTable(resp);
  h += '<h3>Response Example</h3>' + codeTabs(tryParse(api.response_sample, []) || []);
  h += '<h2>Error Codes</h2>' + shopeeErrorTable((api.error_list || []).concat(api.common_error_list || []));
  const errEx = tryParse(api.error_example, []) || [];
  if (errEx.length) h += '<h3>Error Example</h3>' + codeTabs(errEx);
  if (api.rate_limit) h += `<h2>Rate Limit</h2><p>${esc(api.rate_limit)}</p>`;
  if ((api.api_permission || []).length)
    h += `<h2>API Permissions</h2><ul>${api.api_permission.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const logs = tryParse(api.update_log_list, []) || api.update_log_list || [];
  if (Array.isArray(logs) && logs.length)
    h += `<h2>Update Log</h2>${table(['Date', 'Description'], logs.map((u) => [esc(u.date || ''), esc(u.content || '')]))}`;
  return h;
}

async function crawlShopee() {
  console.log('\n=== SHOPEE ===');
  const [modules, guides, pushCats] = await Promise.all([
    getJson(`${SP}/doc/module/?version=2`),
    getJson(`${SP}/developer_guide/list?language_code=en`),
    getJson(`${SP}/push/category`),
  ]);

  const sections = [];

  // Developer guide
  const guideItems = [];
  const guideDocs = [];
  (guides.developer_guide_list || []).forEach((cat) => {
    const children = cat.children || [];
    const kids = children.map((c) => {
      const id = `shopee-guide-${c.item_id}`;
      guideDocs.push({ id, document_id: c.item_id, title: c.item_name, cat: cat.item_name });
      return { id, title: c.item_name };
    });
    if (kids.length) {
      guideItems.push({ title: cat.item_name, children: kids });
    } else if (cat.item_id) {
      const id = `shopee-guide-${cat.item_id}`;
      guideDocs.push({ id, document_id: cat.item_id, title: cat.item_name, cat: cat.item_name });
      guideItems.push({ id, title: cat.item_name });
    }
  });
  sections.push({ id: 'developer-guide', title: 'Developer Guide', icon: 'book', items: guideItems });

  // API reference
  const apiItems = [];
  const apis = [];
  (modules.modules || [])
    .filter((m) => m.type === 1)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))
    .forEach((m) => {
      const kids = (m.items || [])
        .filter((it) => it.status !== 0)
        .map((it) => {
          const id = `shopee-api-${slugId(it.name)}`;
          apis.push({ id, api_name: it.name, module: m.module_id, module_name: m.module_name });
          return { id, title: it.name };
        });
      if (kids.length) apiItems.push({ title: m.module_name, children: kids });
    });
  sections.push({ id: 'api-reference', title: 'API Reference', icon: 'code', items: apiItems });

  // Push mechanism
  const pushItems = [];
  const pushes = [];
  (pushCats.category || []).forEach((c) => {
    const kids = (c.push || []).map((p) => {
      const id = `shopee-push-${p.push_api_id}`;
      pushes.push({ id, push_api_id: p.push_api_id, name: p.push_api_name });
      return { id, title: p.push_api_name };
    });
    if (kids.length) pushItems.push({ title: c.category_name, children: kids });
  });
  sections.push({ id: 'push-mechanism', title: 'Push Mechanism', icon: 'webhook', items: pushItems });

  const NAV = {
    id: 'shopee',
    name: 'Shopee',
    fullName: 'Shopee Open Platform',
    wordmark: 'SHOPee',
    accent: '#EE4D2D',
    accent2: '#FFB800',
    docsUrl: 'https://open.shopee.com/developer-guide/',
    consoleUrl: 'https://open.shopee.com/myconsole/',
    sections,
  };
  console.log(`  guide pages: ${guideDocs.length}, api endpoints: ${apis.length}, push docs: ${pushes.length}`);

  // Guide pages
  await mapLimit(guideDocs, CONC, async (g) => {
    if (RESUME && existsPage('shopee', g.id)) return;
    let d = null;
    try {
      d = await getJson(`${SP}/developer_guide/detail?document_id=${g.document_id}&language_code=en`, 8, (x) => x && x.raw_content);
    } catch {
      d = null;
    }
    const html = d
      ? slateToHtml(d.raw_content || '[]')
      : '<div class="callout warning">' + '<span class="ttl">Not available</span>This document is listed in the Shopee Developer Guide navigation but is no longer published on the official source (document does not exist). Nothing to display.</div>';
    await writePage({
      id: g.id,
      platform: 'shopee',
      section: 'developer-guide',
      title: (d && d.title) || g.title,
      breadcrumb: ['Shopee', 'Developer Guide', g.cat, (d && d.title) || g.title],
      label: 'SHOPEE · DEVELOPER GUIDE',
      subtitle: d
        ? `Updated ${new Date((d.update_time || 0) * 1000).toISOString().slice(0, 10)} · official Shopee Open Platform guide`
        : 'Source document unavailable',
      meta: [
        { text: 'guide' },
        { text: 'Official docs', url: `https://open.shopee.com/developer-guide/${g.document_id}` },
        { text: 'Console', url: 'https://open.shopee.com/myconsole/' },
      ],
      html: html || '<p class="muted">This page has no content.</p>',
    });
  });

  // API pages
  await mapLimit(apis, CONC, async (a) => {
    if (RESUME && existsPage('shopee', a.id)) return;
    const api = await getJson(`${SP}/doc/api/?version=2&api_name=${encodeURIComponent(a.api_name)}`, 8, (x) => x && x.api_name);
    await writePage({
      id: a.id,
      platform: 'shopee',
      section: 'api-reference',
      title: api.api_name || a.api_name,
      breadcrumb: ['Shopee', 'API Reference', a.module_name, api.api_name || a.api_name],
      label: 'SHOPEE · API REFERENCE',
      subtitle: api.define ? '' : `Shopee Open Platform API ${api.api_name}`,
      meta: [
        { text: api.is_get_method ? 'GET' : 'POST' },
        { text: api.path || '' },
        { text: 'Official docs', url: `https://open.shopee.com/documents/v2/${encodeURIComponent(a.api_name)}?module=${a.module}&type=1` },
        { text: 'Console', url: 'https://open.shopee.com/myconsole/' },
      ],
      html: shopeeApiHtml(api),
    });
  });

  // Push pages
  await mapLimit(pushes, CONC, async (p) => {
    if (RESUME && existsPage('shopee', p.id)) return;
    const d = await getJson(`${SP}/push/doc?push_api_id=${p.push_api_id}`, 8, (x) => x && x.push_api);
    const pa = d.push_api || {};
    let h = '';
    const pc = tryParse(pa.push_content, null);
    const contentHtml = pc && typeof pc === 'object' && pc.content ? pc.content : pa.push_content;
    if (contentHtml) h += `<div class="src-html">${contentHtml}</div>`;
    const params = tryParse(pa.push_params, null);
    if (Array.isArray(params) && params.length)
      h += `<h2>Push Parameters</h2>${table(
        ['Name', 'Type', 'Description'],
        params.map((x) => [`<code>${esc(x.name)}</code>`, esc(x.type || ''), x.description || x.desc || ''])
      )}`;
    const facts = [
      pa.push_code && ['Push code', pa.push_code],
      pa.push_timeout && ['Timeout', pa.push_timeout],
      pa.retry_strategy && ['Retry strategy', pa.retry_strategy],
      pa.push_guarantee && ['Guarantee', pa.push_guarantee],
      pa.app_rules && ['App rules', pa.app_rules],
    ].filter(Boolean);
    if (facts.length)
      h += `<h2>Delivery Contract</h2>${table(['Field', 'Value'], facts.map((f) => [esc(f[0]), esc(f[1])]))}`;
    if (Array.isArray(d.update_logs) && d.update_logs.length)
      h += `<h2>Update Log</h2>${table(
        ['Date', 'Description'],
        d.update_logs.map((u) => [esc(new Date((u.ctime || 0) * 1000).toISOString().slice(0, 10)), esc(u.description || '')])
      )}`;
    await writePage({
      id: p.id,
      platform: 'shopee',
      section: 'push-mechanism',
      title: pa.push_api_name || p.name,
      breadcrumb: ['Shopee', 'Push Mechanism', pa.push_api_name || p.name],
      label: 'SHOPEE · PUSH MECHANISM',
      subtitle: pa.description || '',
      meta: [
        { text: 'push' },
        pa.push_code && { text: `code ${pa.push_code}` },
        { text: 'Official docs', url: `https://open.shopee.com/push-mechanism/${p.push_api_id}` },
      ].filter(Boolean),
      html: h || '<p class="muted">No content.</p>',
    });
  });

  return NAV;
}

/* ------------------------------------------------------------------ tiktok */
const TT = 'https://partner.tiktokshop.com/api/v1';
const TT_Q = 'workspace_id=3&aid=359713&locale=en-US';

async function crawlTikTok() {
  console.log('\n=== TIKTOK SHOP ===');
  const tree = await getJson(`${TT}/document/tree?${TT_Q}`);
  const nodes = tree.data?.document_tree || [];
  const byParent = new Map();
  for (const n of nodes) {
    const p = n.parent_id || '';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(n);
  }
  const build = (parentId) =>
    (byParent.get(parentId) || []).map((n) => {
      const leaf = { id: 'tiktok-' + n.document_id, title: n.name };
      if (n.is_dir) {
        const children = build(n.document_id);
        return { title: n.name, children };
      }
      return leaf;
    });

  const tops = (byParent.get('') || []);
  const sections = tops.map((t) => ({
    id: slugId(t.name) || 'section',
    title: t.name,
    icon: /api/i.test(t.name) ? 'code' : /webhook/i.test(t.name) ? 'webhook' : /polic|term/i.test(t.name) ? 'shield' : /changelog/i.test(t.name) ? 'clock' : 'book',
    items: build(t.document_id),
  }));

  const NAV = {
    id: 'tiktok',
    name: 'TikTok Shop',
    fullName: 'TikTok Shop Open Platform',
    wordmark: 'TikTok Shop',
    accent: '#111111',
    accent2: '#25F4EE',
    docsUrl: 'https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview',
    consoleUrl: 'https://partner.tiktokshop.com/',
    sections,
  };

  // collect all leaf docs
  const docs = [];
  const collect = (items) => {
    for (const it of items) {
      if (it.children) collect(it.children);
      else docs.push(it);
    }
  };
  collect(sections.flatMap((s) => s.items));
  console.log(`  pages: ${docs.length}`);

  await mapLimit(docs, CONC, async (d) => {
    if (RESUME && existsPage('tiktok', d.id)) return;
    const documentId = d.id.replace(/^tiktok-/, '');
    const res = await getJson(`${TT}/document/detail?document_id=${documentId}&${TT_Q}`, 8, (x) => x && x.data && x.data.content != null);
    const dd = res.data || {};
    const md = dd.content || '';
    const title = dd.title || d.title;
    const section = sectionOf(sections, d.id);
    await writePage({
      id: d.id,
      platform: 'tiktok',
      section,
      title,
      breadcrumb: ['TikTok Shop', sectionTitle(sections, section), title],
      label: `TIKTOK SHOP · ${sectionTitle(sections, section).toUpperCase()}`,
      subtitle: dd.update_time ? `Updated ${new Date(dd.update_time * 1000).toISOString().slice(0, 10)}` : '',
      meta: [
        { text: dd.is_api_doc ? 'API' : 'guide' },
        { text: 'Official docs', url: `https://partner.tiktokshop.com/docv2/page/${documentId}` },
      ],
      html: md ? marked.parse(md) : '<p class="muted">No content.</p>',
    });
  });

  return NAV;
}

function sectionOf(sections, pageId) {
  for (const s of sections) {
    if (containsId(s.items, pageId)) return s.id;
  }
  return sections[0]?.id;
}
function containsId(items, id) {
  for (const it of items) {
    if (it.id === id) return true;
    if (it.children && containsId(it.children, id)) return true;
  }
  return false;
}
function sectionTitle(sections, id) {
  return sections.find((s) => s.id === id)?.title || '';
}

/* ------------------------------------------------------------------ lazada */
const LZ_API = 'https://isvconsole.lazada.com/handler/share/apidoc';
const LZ_DOC = 'https://open.lazada.com/handler/share/doc';

function lazadaParamRows(data, depth = 0) {
  const rows = [];
  for (const p of data || []) {
    rows.push([
      `${'&nbsp;&nbsp;'.repeat(depth)}<code>${esc(p.name)}</code>`,
      esc(p.type || ''),
      p.required ? '<span class="req">Yes</span>' : 'No',
      esc(p.desc || p.description || ''),
    ]);
    if (p.children && p.children.length) rows.push(...lazadaParamRows(p.children, depth + 1));
  }
  return rows;
}

function lazadaApiHtml(api) {
  let h = '';
  const intro = api.introduction?.data || [];
  if (intro.length) h += intro.map((x) => `<p>${esc(x.text || x.content || '')}</p>`).join('');
  h += '<h2>Request Address</h2>' + endpoint(api.method || 'POST', api.path, '');
  const regions = api.endpointParams?.data || [];
  if (regions.length) h += table(['Region', 'Base URL'], regions.map((r) => [esc(r.name), `<code>${esc(r.desc)}</code>`]));
  const common = api.commonParameters?.data || [];
  if (common.length) h += '<h2>Common Request Parameters</h2>' + table(['Name', 'Type', 'Required', 'Description'], lazadaParamRows(common));
  const params = api.parameters?.data || [];
  h += '<h2>Request Parameters</h2>' + (params.length ? table(['Name', 'Type', 'Required', 'Description'], lazadaParamRows(params)) : '<p class="muted">No request parameters.</p>');
  const out = api.outputParameters?.data || [];
  if (out.length) h += '<h2>Response Parameters</h2>' + table(['Name', 'Type', 'Required', 'Description'], lazadaParamRows(out));
  const errs = api.errorCodes?.data || [];
  if (errs.length) h += '<h2>Error Codes</h2>' + table(['Code', 'Description', 'Solution'], errs.map((e) => [`<code>E${esc(e.code)}</code>`, esc(e.codeDesc || ''), esc(e.solution || '')]));
  const ex = api.examples?.data?.[0];
  if (ex) {
    if (ex.input) h += '<h2>Request Example</h2>' + codeBlock('json', JSON.stringify(ex.input, null, 2));
    if (ex.output) h += '<h2>Response Example</h2>' + codeBlock('json', JSON.stringify(ex.output, null, 2));
  }
  return h;
}

async function crawlLazada() {
  console.log('\n=== LAZADA ===');
  const [cat, docCat] = await Promise.all([
    getJson(`${LZ_API}/getApiCategoryMixed.json`),
    getJson(`${LZ_DOC}/getCategories.json?oeid=LZD_DOC&lang=en_US&typeId=6`),
  ]);

  const sections = [];

  // API reference
  const apiItems = [];
  const apis = [];
  (cat.data || []).forEach((c) => {
    const kids = (c.apiList || []).map((a) => {
      const id = `lazada-api-${slugId(a.path || a.title)}`;
      apis.push({ id, path: a.path, title: a.title, category: c.name });
      return { id, title: a.title || a.path };
    });
    if (kids.length) apiItems.push({ title: c.name, children: kids });
  });
  sections.push({ id: 'api-reference', title: 'API Reference', icon: 'code', items: apiItems });

  // Guide docs
  const docItems = [];
  const docs = [];
  const walkDocs = (node, parentTitle) => {
    const list = node.currentDocList || [];
    const kids = list.map((d) => {
      const id = `lazada-doc-${d.id}`;
      docs.push({ id, docId: d.id, title: d.enTitle || d.cnTitle, cat: node.enTitle || parentTitle });
      return { id, title: d.enTitle || d.cnTitle };
    });
    const children = (node.children || []).map((ch) => ({
      title: ch.enTitle || ch.cnTitle,
      children: walkDocs(ch, node.enTitle),
    })).filter((x) => x.children.length);
    if (kids.length) docItems.push({ title: node.enTitle || node.cnTitle, children: kids });
    return [...kids, ...children.flatMap((c) => c.children)];
  };
  (docCat.data?.children || []).forEach((c) => walkDocs(c, 'Lazada Open Platform'));
  sections.push({ id: 'developer-guide', title: 'Developer Guide', icon: 'book', items: docItems });

  const NAV = {
    id: 'lazada',
    name: 'Lazada',
    fullName: 'Lazada Open Platform',
    wordmark: 'Lazada',
    accent: '#0F55D6',
    accent2: '#F04E23',
    docsUrl: 'https://open.lazada.com/apps/doc/api',
    consoleUrl: 'https://open.lazada.com/apps/console',
    sections,
  };
  console.log(`  api endpoints: ${apis.length}, guide docs: ${docs.length}`);

  await mapLimit(apis, CONC, async (a) => {
    if (RESUME && existsPage('lazada', a.id)) return;
    const res = await getJson(`${LZ_API}/getApi.json?path=${encodeURIComponent(a.path)}`, 8, (x) => x && x.data);
    const api = res.data?.apiList?.[0] || {};
    await writePage({
      id: a.id,
      platform: 'lazada',
      section: 'api-reference',
      title: api.title || a.title,
      breadcrumb: ['Lazada', 'API Reference', a.category, api.title || a.title],
      label: 'LAZADA · API REFERENCE',
      subtitle: api.desc || '',
      meta: [
        { text: (api.method || 'POST').toUpperCase() },
        { text: api.path || a.path || '' },
        { text: 'Official docs', url: `https://open.lazada.com/apps/doc/api?path=${encodeURIComponent(a.path)}` },
        { text: 'Console', url: 'https://open.lazada.com/apps/console' },
      ],
      html: lazadaApiHtml(api),
    });
  });

  await mapLimit(docs, CONC, async (d) => {
    if (RESUME && existsPage('lazada', d.id)) return;
    const res = await getJson(`${LZ_DOC}/getDocDetail.json?oeid=LZD_DOC&lang=en_US&docId=${d.docId}`, 8, (x) => x && x.data);
    const dd = res.data || {};
    await writePage({
      id: d.id,
      platform: 'lazada',
      section: 'developer-guide',
      title: dd.enTitle || d.title,
      breadcrumb: ['Lazada', 'Developer Guide', d.cat, dd.enTitle || d.title],
      label: 'LAZADA · DEVELOPER GUIDE',
      subtitle: dd.lastModified ? `Last modified ${dd.lastModified}` : '',
      meta: [
        { text: 'guide' },
        { text: 'Official docs', url: `https://open.lazada.com/apps/doc/doc?docId=${d.docId}` },
        { text: 'Console', url: 'https://open.lazada.com/apps/console' },
      ],
      html: dd.enContent || '<p class="muted">No content.</p>',
    });
  });

  return NAV;
}

/* -------------------------------------------------------------------- main */
async function main() {
  await fs.mkdir(DATA, { recursive: true });

  const platforms = [];
  const want = (p) => !ONLY.length || ONLY.includes(p);
  if (!RESUME) {
    for (const id of ['shopee', 'tiktok', 'lazada']) {
      if (want(id)) await fs.rm(path.join(DATA, id), { recursive: true, force: true });
    }
  }
  if (want('shopee')) platforms.push(await crawlShopee());
  if (want('tiktok')) platforms.push(await crawlTikTok());
  if (want('lazada')) platforms.push(await crawlLazada());

  const order = ['shopee', 'tiktok', 'lazada'];
  const navPath = path.join(DATA, 'nav.json');
  let all = platforms;
  if (existsSync(navPath)) {
    const prev = JSON.parse(await fs.readFile(navPath, 'utf8'));
    const crawled = new Set(platforms.map((p) => p.id));
    all = [...platforms, ...(prev.platforms || []).filter((p) => !crawled.has(p.id))];
  }
  all.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  await fs.writeFile(navPath, JSON.stringify({ generatedAt: new Date().toISOString(), platforms: all }));
  console.log('\n✅ done. nav written to data/nav.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
