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
    if (select.style.maxWidth) wrap.style.maxWidth = select.style.maxWidth;

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('fsel-native');
    select.tabIndex = -1;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    // Alguns selects nativos tinham dimensões próprias (linhas
    // compactas, ex.: tabela do Stock) — herdar para o botão manter o
    // alinhamento com os campos vizinhos.
    ['height', 'fontSize', 'padding', 'margin'].forEach((prop) => {
      if (select.style[prop]) trigger.style[prop] = select.style[prop];
    });
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

    // Algumas listas são repopuladas em runtime (ex.: Marca/Fornecedor
    // de pneu, consoante os dados que o utilizador gere noutras
    // páginas, ou Posição consoante o veículo escolhido). O
    // MutationObserver apanha essas trocas de <option> e mantém o
    // botão — e a lista, se estiver aberta nesse preciso momento —
    // em sincronia sem que o código que popula o select precise de
    // saber que existe uma versão customizada por cima.
    new MutationObserver(() => {
      syncTrigger();
      if (openList && openList.trigger === trigger) closeOpen();
    }).observe(select, { childList: true });

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
  // Scroll DENTRO da própria lista (a navegar pelas opções) não deve
  // fechá-la — só um scroll fora dela (a página por trás, um painel)
  // fecha, porque a lista é position:fixed e deixaria de acompanhar o
  // botão que a abriu.
  document.addEventListener('scroll', (e) => {
    if (!openList) return;
    if (openList.list.contains(e.target)) return;
    closeOpen();
  }, true);
  window.addEventListener('resize', () => { if (openList) closeOpen(); });

  function enhanceFancySelects(root) {
    (root || document).querySelectorAll('select[data-fancy]').forEach(enhanceSelect);
  }

  // Exposta para poder ser chamada depois de código que gera <select
  // data-fancy> dinamicamente (ex.: linhas de fatura no Stock).
  window.enhanceFancySelects = enhanceFancySelects;

  enhanceFancySelects();
})();
