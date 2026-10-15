/* =====================================================================
   Ringkas — unified integration docs app
   ===================================================================== */
(function () {
  const { icon } = window.RK;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slug = (s) =>
    String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sec';
  const dark = (hex) => {
    const c = String(hex).replace('#', '');
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b < 145;
  };

  const state = { nav: null, platforms: [], pageCache: new Map(), searchIndex: [] };
  const TAGLINES = {
    shopee: 'Open API v2.0 for orders, products, logistics, marketing and more.',
    tiktok: 'Open API, webhooks and SDKs for TikTok Shop sellers, creators and partners.',
    lazada: 'REST Open API with HMAC-SHA256 signing and a push (webhook) mechanism.',
  };

  /* --------------------------------------------------------------- boot */
  async function boot() {
    try {
      const nav = await (await fetch('data/nav.json')).json();
      state.nav = nav;
      state.platforms = nav.platforms || [];
      document.title = 'Ringkas — Unified Integration Docs';
      renderFooter();
      initSearch();
      renderTabbar();
      window.addEventListener('hashchange', route);
      route();
    } catch (e) {
      $('#app').innerHTML = `<div class="loading">Could not load data/nav.json — run <code>npm run crawl</code> then serve the folder.</div>`;
      console.error(e);
    }
  }

  const platById = (id) => state.platforms.find((p) => p.id === id) || state.platforms[0];

  /* --------------------------------------------------------------- chrome */
  function renderFooter() {
    const total = state.platforms.reduce((n, p) => n + countLeaves(p.sections.flatMap((s) => s.items)), 0);
    $('#footer').innerHTML = `
      <b>Ringkas</b> · unified integration docs · ${state.platforms.length} platforms · ${total.toLocaleString()} pages
      <span class="muted">Crawled ${new Date(state.nav.generatedAt).toLocaleDateString()}. Source content owned by Shopee, TikTok & Lazada.</span>`;
  }

  function renderTabbar() {
    const bar = $('#tabbar');
    bar.innerHTML = state.platforms
      .map(
        (p) =>
          `<button class="tab" data-plat="${p.id}" style="--plat:${p.accent}">${icon(
            p.id,
            ''
          )}<span>${esc(p.name)}</span></button>`
      )
      .join('');
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      const p = platById(t.dataset.plat);
      go(p.id, firstPage(p).id);
    });
  }

  const countLeaves = (items) =>
    items.reduce((n, it) => n + (it.children ? countLeaves(it.children) : 1), 0);

  /* --------------------------------------------------------------- routing */
  function go(platform, page) {
    location.hash = `#/${platform}/${page}`;
  }
  function goHome() {
    location.hash = '#/';
  }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return { home: true };
    const [platform, ...rest] = h.split('/');
    return { home: false, platform, page: rest.join('/') };
  }

  function firstPage(p) {
    for (const s of p.sections) {
      const leaf = firstLeaf(s.items);
      if (leaf) return leaf;
    }
    return { id: '' };
  }
  function firstLeaf(items) {
    for (const it of items) {
      if (it.children) {
        const l = firstLeaf(it.children);
        if (l) return l;
      } else return it;
    }
    return null;
  }

  async function route() {
    const r = parseHash();
    $$('.tab').forEach((t) => t.classList.remove('is-active'));
    if (r.home || !state.platforms.some((p) => p.id === r.platform)) {
      renderHome();
      return;
    }
    const p = platById(r.platform);
    $(`.tab[data-plat="${p.id}"]`)?.classList.add('is-active');
    document.documentElement.style.setProperty('--plat', p.accent);
    document.documentElement.style.setProperty('--plat-2', p.accent2);
    document.documentElement.style.setProperty('--plat-ink', dark(p.accent) ? '#ffffff' : '#0b0b0b');
    await renderDoc(p, r.page);
  }

  /* --------------------------------------------------------------- home */
  function renderHome() {
    document.documentElement.style.setProperty('--plat', 'var(--yellow)');
    const p0 = state.platforms[0];
    const total = state.platforms.reduce((n, p) => n + countLeaves(p.sections.flatMap((s) => s.items)), 0);
    const app = $('#app');
    app.innerHTML = `
      <div class="home">
        <section class="hero">
          <div>
            <span class="eyebrow">${icon('bolt')} Unified integration docs</span>
            <h1>Integrate <em>Shopee</em>, TikTok Shop and Lazada — in one place.</h1>
            <p class="lede">Ringkas is the full integration reference for all three marketplaces: every guide, endpoint, webhook and error code from the official docs, rewritten and unified in a single app. Switch platforms with the tabs above.</p>
            <div class="cta">
              <a class="btn primary" href="#/${p0.id}/${firstPage(p0).id}">${icon('book')} Start with ${esc(p0.name)}</a>
              <a class="btn" href="#/${state.platforms[1]?.id || p0.id}/${firstPage(state.platforms[1] || p0).id}">${icon('key')} Auth guide</a>
            </div>
          </div>
          <div class="choose">
            <h3>Choose a platform</h3>
            ${state.platforms
              .map((p) => {
                const leaves = countLeaves(p.sections.flatMap((s) => s.items));
                return `<a class="opt" href="#/${p.id}/${firstPage(p).id}">
                  <span class="k" style="background:${p.accent};color:#fff">${icon(p.id)}</span>
                  <span><span class="t">${esc(p.fullName)}</span>
                  <span class="d">${esc(p.tagline || TAGLINES[p.id] || '')} ${leaves.toLocaleString()} pages.</span></span>
                </a>`;
              })
              .join('')}
          </div>
        </section>
        <section class="statbar">
          ${state.platforms
            .map(
              (p) =>
                `<div class="stat" style="background:${p.accent};color:${dark(p.accent) ? '#fff' : '#0b0b0b'}"><div class="n">${countLeaves(
                  p.sections.flatMap((s) => s.items)
                ).toLocaleString()}</div><div class="l">${esc(p.name)} pages</div></div>`
            )
            .join('')}
          <div class="stat"><div class="n">${total.toLocaleString()}</div><div class="l">Total documents</div></div>
        </section>
        <section class="homecards">
          ${card('key', 'Auth, end to end', 'OAuth flows, token lifetimes and refresh loops for each platform, exactly as documented.', 'var(--cyan)')}
          ${card('code', 'Signing done right', 'HMAC-SHA256 base strings, ordering rules, timestamp units and code samples.', 'var(--lime)')}
          ${card('webhook', 'Webhooks &amp; push', 'Subscribe, verify signatures and handle retries and idempotency.', 'var(--pink)')}
        </section>
      </div>`;
    window.scrollTo(0, 0);
  }
  const card = (ic, t, b, bg) =>
    `<div class="fcard"><div class="k" style="background:${bg}">${icon(ic)}</div><h3>${t}</h3><p>${b}</p></div>`;

  /* --------------------------------------------------------------- doc view */
  async function renderDoc(p, pageId) {
    const app = $('#app');
    app.innerHTML = `<div class="loading">Loading ${esc(p.name)} docs…</div>`;
    const leaf = findLeaf(p, pageId) || firstPage(p);
    const page = await loadPage(p.id, leaf.id);
    if (!page) {
      app.innerHTML = `<div class="loading">Page not found.</div>`;
      return;
    }

    app.innerHTML = `
      <div class="layout">
        <aside class="sidebar" id="sidebar"></aside>
        <article class="article">
          <nav class="crumb">${(page.breadcrumb || [p.name])
            .map((c, i, a) => (i === a.length - 1 ? `<span class="here">${esc(c)}</span>` : `<span>${esc(c)}</span>`))
            .join('<span class="sep">/</span>')}</nav>
          <span class="labelchip">${icon(p.sections.find((s) => s.id === page.section)?.icon || 'book')} ${esc(
      page.label || p.name
    )}</span>
          <h1 class="page-title">${esc(page.title)}</h1>
          ${page.subtitle ? `<p class="page-sub">${esc(page.subtitle)}</p>` : ''}
          <div class="meta-row">
            ${(page.meta || [])
              .map((m) =>
                m.url
                  ? `<a class="chip" href="${esc(m.url)}" target="_blank" rel="noopener">${icon('external')} ${esc(m.text)}</a>`
                  : `<span class="chip k">${esc(m.text)}</span>`
              )
              .join('')}
          </div>
          <div class="prose" id="prose">${page.html || ''}</div>
        </article>
        <aside class="toc" id="toc"></aside>
      </div>`;

    $('#sidebar').innerHTML = buildSidebar(p, leaf.id);
    wireSidebar(p);
    const prose = $('#prose');
    normalizeContent(prose);
    buildToc(prose, p, page);
    wireContent(prose);
    window.scrollTo(0, 0);
  }

  async function loadPage(platform, id) {
    const key = platform + '/' + id;
    if (state.pageCache.has(key)) return state.pageCache.get(key);
    try {
      const res = await fetch(`data/${platform}/pages/${id}.json`);
      if (!res.ok) return null;
      const json = await res.json();
      state.pageCache.set(key, json);
      return json;
    } catch {
      return null;
    }
  }
  function findLeaf(p, id) {
    const walk = (items) => {
      for (const it of items) {
        if (it.children) {
          const r = walk(it.children);
          if (r) return r;
        } else if (it.id === id) return it;
      }
      return null;
    };
    return walk(p.sections.flatMap((s) => s.items));
  }

  /* --------------------------------------------------------------- sidebar */
  function buildSidebar(p, activeId) {
    let h = `<div class="sidecard">
        <span class="badge">${icon(p.id)}</span>
        <span><span class="nm">${esc(p.name)}</span> <span class="sb">${esc(
      p.fullName.replace(p.name, '').trim() || 'Open Platform'
    )} docs</span></span>
      </div>
      <label class="sidefilter">${icon('search')}<input type="search" id="navfilter" placeholder="Filter ${esc(
      p.name
    )} pages…" autocomplete="off"></label>`;

    for (const s of p.sections) {
      const leaves = countLeaves(s.items);
      h += `<div class="navgroup" data-section="${s.id}">
        <button class="navsec" type="button" data-sec="${s.id}">${icon(s.icon || 'book')}<span>${esc(
        s.title
      )}</span><span class="cnt">${leaves}</span></button>`;
      for (const it of s.items) h += navItem(it, activeId, p.id);
      h += `</div>`;
    }
    return h;
  }

  function navItem(it, activeId, platform) {
    if (it.children) {
      const open = contains(it.children, activeId);
      return `<div class="navnode">
        <button class="navhead${open ? '' : ' is-collapsed'}" type="button">${icon('chevron', 'chev')} <span>${esc(
        it.title
      )}</span><span class="n">${countLeaves(it.children)}</span></button>
        <div class="navchildren${open ? '' : ' is-collapsed'}">
          ${it.children.map((c) => navItem(c, activeId, platform)).join('')}
        </div>
      </div>`;
    }
    return `<a class="navlink${it.id === activeId ? ' is-active' : ''}" href="#/${platform}/${it.id}" data-id="${it.id}">${esc(
      it.title
    )}</a>`;
  }
  function contains(items, id) {
    return items.some((it) => (it.children ? contains(it.children, id) : it.id === id));
  }

  function wireSidebar(p) {
    const sb = $('#sidebar');
    sb.addEventListener('click', (e) => {
      const head = e.target.closest('.navhead');
      if (head) {
        head.classList.toggle('is-collapsed');
        head.nextElementSibling.classList.toggle('is-collapsed');
      }
      const sec = e.target.closest('.navsec');
      if (sec) sec.closest('.navgroup').classList.toggle('sec-collapsed');
    });
    sb.addEventListener('click', (e) => {
      const a = e.target.closest('.navlink');
      if (a) {
        e.preventDefault();
        const id = a.dataset.id;
        history.pushState(null, '', `#/${p.id}/${id}`);
        renderDoc(p, id);
      }
    });
    const filter = $('#navfilter');
    filter?.addEventListener('input', () => {
      const q = filter.value.toLowerCase().trim();
      $$('.navgroup', sb).forEach((g) => {
        let any = false;
        $$('.navlink', g).forEach((a) => {
          const match = !q || a.textContent.toLowerCase().includes(q);
          a.style.display = match ? '' : 'none';
          if (match) any = true;
        });
        $$('.navhead', g).forEach((hd) => {
          const kids = $$('.navlink', hd.parentElement);
          const match = kids.some((k) => k.style.display !== 'none');
          hd.parentElement.style.display = match ? '' : 'none';
          if (match && q) {
            hd.classList.remove('is-collapsed');
            hd.nextElementSibling.classList.remove('is-collapsed');
          }
        });
        g.style.display = any || !q ? '' : 'none';
      });
    });
  }

  /* --------------------------------------------------------------- TOC */
  function buildToc(prose, p, page) {
    const heads = $$('h2, h3', prose);
    const used = new Set();
    heads.forEach((h) => {
      let id = slug(h.textContent);
      while (used.has(id)) id += '-1';
      used.add(id);
      h.id = id;
    });
    const toc = $('#toc');
    if (!heads.length) {
      toc.innerHTML = refBox(p, page);
      $('.layout').classList.add('no-toc');
      return;
    }
    toc.innerHTML =
      `<h4>On this page</h4>` +
      heads
        .map(
          (h) =>
            `<a href="#${h.id}" class="lvl${h.tagName === 'H3' ? '3' : '2'}" data-t="${h.id}">${esc(
              h.textContent
            )}</a>`
        )
        .join('') +
      refBox(p, page);
    toc.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-t]');
      if (a) {
        e.preventDefault();
        const el = document.getElementById(a.dataset.t);
        window.scrollTo({ top: el.offsetTop - 150, behavior: 'smooth' });
      }
    });
    scrollSpy(heads);
  }

  function refBox(p, page) {
    const url = (page.meta || []).find((m) => m.url)?.url;
    return `<div class="refbox">
      <div class="rt">Reference</div>
      <p>Read the official ${esc(p.name)} source for this page.</p>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${icon('external')} Open source</a>` : ''}
    </div>`;
  }

  function scrollSpy(heads) {
    const links = $$('#toc a[data-t]');
    const onScroll = () => {
      let active = heads[0]?.id;
      for (const h of heads) if (h.getBoundingClientRect().top < 170) active = h.id;
      links.forEach((l) => l.classList.toggle('is-active', l.dataset.t === active));
    };
    window.removeEventListener('scroll', window.__rk_spy || (() => {}));
    window.__rk_spy = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* --------------------------------------------------------------- content wiring */
  function normalizeContent(prose) {
    // content h1 -> h2 so it joins the TOC and the styled hierarchy
    $$('h1', prose).forEach((h) => {
      const h2 = document.createElement('h2');
      h2.innerHTML = h.innerHTML;
      h.replaceWith(h2);
    });
    // wrap raw tables
    $$('table', prose).forEach((t) => {
      if (t.parentElement?.classList.contains('tbl-wrap')) return;
      const w = document.createElement('div');
      w.className = 'tbl-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
    // style raw pre and add copy buttons
    $$('pre', prose).forEach((pre) => {
      if (pre.classList.contains('ct-pane')) return;
      pre.classList.add('code');
      if (!$('.copy', pre)) {
        const b = document.createElement('button');
        b.className = 'copy';
        b.type = 'button';
        b.textContent = 'Copy';
        pre.appendChild(b);
      }
    });
    // external links open in new tab
    $$('a[href^="http"]', prose).forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  function wireContent(prose) {
    prose.addEventListener('click', (e) => {
      const copy = e.target.closest('.copy');
      if (copy) {
        const pre = copy.closest('pre');
        const code = pre.querySelector('code') || pre;
        copyText(code.textContent.replace(/\n?Copy\s*$/, '').trim());
        copy.textContent = 'Copied!';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
        return;
      }
      const ctab = e.target.closest('.ct-tab');
      if (ctab) {
        const box = ctab.closest('.codetabs');
        $$('.ct-tab', box).forEach((t) => t.classList.toggle('is-active', t === ctab));
        $$('.ct-pane', box).forEach((pn) => pn.classList.toggle('is-active', pn.dataset.i === ctab.dataset.i));
        return;
      }
      const ccopy = e.target.closest('.ct-copy');
      if (ccopy) {
        const box = ccopy.closest('.codetabs');
        const active = box.querySelector('.ct-pane.is-active code') || box.querySelector('.ct-pane.is-active');
        copyText(active.textContent.trim());
        ccopy.textContent = 'Copied!';
        setTimeout(() => (ccopy.textContent = 'Copy'), 1200);
      }
    });
  }

  function copyText(t) {
    navigator.clipboard?.writeText(t).then(
      () => toast('Copied to clipboard'),
      () => toast('Copy failed')
    );
  }
  let toastT;
  function toast(msg) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('is-on'), 1400);
  }

  /* --------------------------------------------------------------- search */
  function initSearch() {
    state.searchIndex = [];
    for (const p of state.platforms) {
      const walk = (items, sec) => {
        for (const it of items) {
          if (it.children) walk(it.children, sec);
          else state.searchIndex.push({ platform: p.id, name: p.name, accent: p.accent, id: it.id, title: it.title, section: sec });
        }
      };
      for (const s of p.sections) walk(s.items, s.title);
    }

    $('#topbar').innerHTML = `
      <a class="brand" href="#/">
        <span class="mark">${icon('logo')}</span>
        <span class="name">Ringkas<b>docs</b></span>
      </a>
      <nav class="navlinks">
        <a href="#/" data-nav="docs">Documentation</a>
        <a href="#" data-nav="guides">Guides</a>
        <a href="#" data-nav="api">API reference</a>
      </nav>
      <button class="navtoggle" id="navtoggle" aria-label="Toggle navigation">${icon('menu')}</button>
      <div class="searchwrap">
        <label class="search">${icon('search')}
          <input id="q" type="search" placeholder="Search all platforms…" autocomplete="off" />
          <kbd>⌘K</kbd>
        </label>
        <div class="results" id="results"></div>
      </div>`;

    $('#navtoggle')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('is-open'));

    const q = $('#q');
    const results = $('#results');
    let active = -1;

    const run = () => {
      const term = q.value.toLowerCase().trim();
      if (!term) {
        results.classList.remove('is-open');
        return;
      }
      const hits = state.searchIndex.filter((x) => x.title.toLowerCase().includes(term)).slice(0, 24);
      active = -1;
      results.innerHTML = hits.length
        ? hits
            .map(
              (x) =>
                `<a class="result" href="#/${x.platform}/${x.id}" data-plat="${x.platform}">
                   <span class="p" style="background:${x.accent}">${esc(x.name)}</span>
                   <span class="t">${esc(x.title)}</span>
                   <span class="s">${esc(x.section)}</span>
                 </a>`
            )
            .join('')
        : `<div class="none">No pages match “${esc(q.value)}”.</div>`;
      results.classList.add('is-open');
    };

    q.addEventListener('input', run);
    q.addEventListener('focus', run);
    q.addEventListener('keydown', (e) => {
      const opts = $$('.result', results);
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, opts.length - 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault(); }
      else if (e.key === 'Enter' && opts[active]) { location.hash = opts[active].getAttribute('href').slice(1); results.classList.remove('is-open'); q.blur(); return; }
      opts.forEach((o, i) => o.classList.toggle('is-active', i === active));
    });
    results.addEventListener('click', () => results.classList.remove('is-open'));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchwrap')) results.classList.remove('is-open');
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); }
      if (e.key === 'Escape') { results.classList.remove('is-open'); q.blur(); }
    });

    $('.navlinks')?.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-nav]');
      if (!a) return;
      e.preventDefault();
      const cur = parseHash().platform ? platById(parseHash().platform) : state.platforms[0];
      if (a.dataset.nav === 'docs') return goHome();
      const sec = a.dataset.nav === 'guides' ? ['developer-guide', 'getting-started', 'partner-guide'] : ['api-reference'];
      const section = cur.sections.find((s) => sec.includes(s.id)) || cur.sections.find((s) => /api/i.test(s.title)) || cur.sections[0];
      const leaf = firstLeaf(section.items);
      if (leaf) go(cur.id, leaf.id);
    });
  }

  /* --------------------------------------------------------------- go */
  window.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
