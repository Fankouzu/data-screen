(() => {
  'use strict';
  const screens = window.DATA_SCREENS || [];
  const grid = document.querySelector('#screen-grid');
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort');
  const categories = document.querySelector('#categories');
  const emptyState = document.querySelector('#empty-state');
  let category = 'all';

  // Content uses textContent so future catalog entries remain plain text.
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createCard(screen) {
    const card = element('article', `screen-card${screen.featured ? ' featured' : ''}`);
    const previewLink = element('a', 'preview-link');
    previewLink.href = screen.url;
    previewLink.setAttribute('aria-label', `打开 ${screen.title} 大屏`);
    const image = element('img', 'preview-image');
    image.src = screen.preview;
    image.alt = `${screen.title} 大屏预览`;
    image.width = 1600;
    image.height = 1000;
    image.loading = screen.featured ? 'eager' : 'lazy';
    image.addEventListener('error', () => {
      image.hidden = true;
      previewLink.classList.add('preview-unavailable');
      previewLink.append(element('span', 'preview-fallback', `${screen.title} · 打开大屏 ↗`));
    }, { once: true });
    previewLink.append(image);
    previewLink.append(element('span', 'preview-badge', screen.category));
    const expand = element('span', 'preview-expand', '↗');
    expand.setAttribute('aria-hidden', 'true');
    previewLink.append(expand);

    const body = element('div', 'card-body');
    const meta = element('div', 'card-meta');
    meta.append(element('span', 'card-kicker', screen.featured ? 'FEATURED SCREEN' : 'DATA SCREEN'));
    const date = element('time', '', screen.date.replaceAll('-', '.'));
    date.dateTime = screen.date;
    meta.append(date);
    const title = element('h3', 'card-title');
    const titleLink = element('a', '', screen.title);
    titleLink.href = screen.url;
    title.append(titleLink);
    const tags = element('ul', 'tags');
    (screen.tags || []).forEach(tag => tags.append(element('li', '', tag)));
    body.append(meta, title, element('p', 'card-subtitle', screen.subtitle), element('p', 'card-description', screen.description), tags);
    if (screen.highlights?.length) {
      const highlights = element('dl', 'highlights');
      screen.highlights.forEach(item => {
        const pair = element('div');
        pair.append(element('dt', '', item.label), element('dd', '', item.value));
        highlights.append(pair);
      });
      body.append(highlights);
    }
    const open = element('a', 'open-screen');
    open.href = screen.url;
    open.setAttribute('aria-label', `打开 ${screen.title} 大屏`);
    open.append(element('span', '', '打开大屏'), element('span', 'open-arrow', '↗'));
    body.append(open);
    card.append(previewLink, body);
    return card;
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = screens.filter(screen => {
      const text = [screen.title, screen.subtitle, screen.description, screen.category, ...(screen.tags || [])].join(' ').toLocaleLowerCase();
      return (category === 'all' || screen.category === category) && (!query || text.includes(query));
    }).sort((a, b) => sort.value === 'name'
      ? a.title.localeCompare(b.title, 'zh-CN')
      : b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'));
    grid.replaceChildren(...matches.map(createCard));
    document.querySelector('#result-count').textContent = `${matches.length} / ${screens.length}`;
    emptyState.hidden = matches.length > 0;
    categories.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.category === category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  [...new Set(screens.map(screen => screen.category))].forEach(name => {
    const button = element('button', 'category', name);
    button.dataset.category = name;
    button.setAttribute('aria-pressed', 'false');
    categories.append(button);
  });
  categories.addEventListener('click', event => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    category = button.dataset.category;
    render();
  });
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  document.querySelector('#clear-search').addEventListener('click', () => {
    search.value = '';
    category = 'all';
    render();
    search.focus();
  });
  document.querySelector('#total-count').textContent = String(screens.length).padStart(2, '0');
  render();
})();
