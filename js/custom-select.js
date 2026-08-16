// ── LISTAS CUSTOMIZADAS ─────────────────────────────────────────────
// Substitui os <select> marcados com [data-fancy] — todos de opções
// fixas, nunca repopulados em runtime — por um combobox construído de
// raiz (caixa + lista), para que a lista aberta também siga o design
// da app em vez do estilo nativo do sistema operativo.
//
// O <select> original mantém-se no DOM, escondido visualmente, como
// única fonte de verdade: .value continua a funcionar exactamente
// como antes (get/set, onchange="...", etc.) em todo o resto do
// código, sem precisar de nenhuma alteração.
(function () {
  const nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let openList = null;

  function closeOpen() {
    if (!openList) return;
    const { list, trigger } = openList;
    list.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    openList = null;
    setTimeout(() => list.remove(), 160);
  }

  function positionList(trigger, list) {
    const r = trigger.getBoundingClientRect();
    list.style.width = r.width + 'px';
    list.style.left = Math.round(r.left) + 'px';
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 200 && r.top > spaceBelow) {
      list.style.top = 'auto';
      list.style.bottom = Math.round(window.innerHeight - r.top + 4) + 'px';
    } else {
      list.style.bottom = 'auto';
      list.style.top = Math.round(r.bottom + 4) + 'px';
    }
  }

  function enhanceSelect(select) {
    if (select.dataset.fancyDone) return;
    select.dataset.fancyDone = '1';

    const wrap = document.createElement('div');
    wrap.className = 'fsel';
    if (select.style.flex) wrap.style.flex = select.style.flex;

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('fsel-native');
    select.tabIndex = -1;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fsel-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    wrap.appendChild(trigger);

    function syncTrigger() {
      const opt = select.options[select.selectedIndex];
      trigger.textContent = opt ? opt.textContent : '';
      trigger.dataset.empty = (!opt || !opt.value) ? 'true' : 'false';
    }

    function setValue(v, fireEvent) {
      nativeValueDesc.set.call(select, v);
      syncTrigger();
      if (fireEvent) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Qualquer atribuição a .value feita pelo resto do código (ex.: ao
    // abrir um painel de edição) mantém o botão customizado em sincronia.
    Object.defineProperty(select, 'value', {
      get() { return nativeValueDesc.get.call(select); },
      set(v) { setValue(v, false); },
      configurable: true,
    });

    let list = null, items = [], hlIndex = 0;

    function setHl(i) {
      if (!items.length) return;
      items.forEach((it) => it.classList.remove('hl'));
      hlIndex = Math.max(0, Math.min(items.length - 1, i));
      items[hlIndex].classList.add('hl');
      items[hlIndex].scrollIntoView({ block: 'nearest' });
    }

    function buildList() {
      list = document.createElement('div');
      list.className = 'fsel-list';
      list.setAttribute('role', 'listbox');

      items = Array.from(select.options).map((o, i) => {
        const item = document.createElement('div');
        item.className = 'fsel-opt';
        item.setAttribute('role', 'option');
        item.dataset.value = o.value;
        item.innerHTML = '<span>' + (o.textContent || ' ') + '</span>'
          + '<svg viewBox="0 0 24 24"><use href="#icon-check"/></svg>';
        item.addEventListener('mouseenter', () => setHl(i));
        item.addEventListener('click', () => {
          setValue(o.value, true);
          closeOpen();
          trigger.focus();
        });
        return item;
      });
      items.forEach((it) => list.appendChild(it));
      document.body.appendChild(list);

      const v = select.value;
      items.forEach((it) => it.setAttribute('aria-selected', it.dataset.value === v ? 'true' : 'false'));
      const selIdx = items.findIndex((it) => it.dataset.value === v);
      setHl(selIdx >= 0 ? selIdx : 0);

      positionList(trigger, list);
      requestAnimationFrame(() => list.classList.add('open'));
    }

    function open() {
      if (openList) closeOpen();
      buildList();
      trigger.setAttribute('aria-expanded', 'true');
      openList = { list, trigger };
    }

    trigger.addEventListener('click', () => {
      if (openList) { closeOpen(); return; }
      open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (!openList) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHl(hlIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(hlIndex - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setHl(0); }
      else if (e.key === 'End') { e.preventDefault(); setHl(items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const it = items[hlIndex];
        if (it) setValue(it.dataset.value, true);
        closeOpen();
      } else if (e.key === 'Escape') { e.preventDefault(); closeOpen(); }
      else if (e.key === 'Tab') { closeOpen(); }
    });

    syncTrigger();
  }

  document.addEventListener('click', (e) => {
    if (!openList) return;
    const { list, trigger } = openList;
    if (e.target === trigger || trigger.contains(e.target) || list.contains(e.target)) return;
    closeOpen();
  });
  document.addEventListener('scroll', () => { if (openList) closeOpen(); }, true);
  window.addEventListener('resize', () => { if (openList) closeOpen(); });

  document.querySelectorAll('select[data-fancy]').forEach(enhanceSelect);
})();
