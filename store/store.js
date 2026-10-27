// Compra com PIX automático pelo servidor da loja (tools/store/worker na retrofone-spinoffs).
  // Preview local desabilita pedidos reais; entrega só após confirmação do servidor.
  const STORE_API = 'https://kolja-store.kolja-store-worker.workers.dev';
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Local previews never create production orders. QA may explicitly use a loopback mock.
  const previewApi = local && new URLSearchParams(location.search).get('api');
  const api = location.origin === 'https://kolja.com.br' ? STORE_API
    : (local && previewApi && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(previewApi) ? previewApi : '');
  if (api) document.documentElement.classList.add('pix-on');

  const dlg = document.getElementById('pix'), $ = id => document.getElementById(id);
  const ERR = {
    bad_name: 'Escreva o seu nome.', bad_email: 'Confira o e-mail para identificar o pedido.',
    too_many: 'Muitos pedidos seguidos daqui. Espere alguns minutos e tente de novo.',
    unavailable: 'Este download está temporariamente indisponível. Nenhum PIX foi gerado. Tente novamente mais tarde.',
    provider: 'O Mercado Pago não respondeu agora. Tente de novo em instantes.',
  };
  let delivery = 'license';
  let game = null, poll = null, tick = null, lifecycle = 0;
  const step = s => {
    $('pix-recovery-content').hidden = !['pay', 'done'].includes(s);
    dlg.querySelectorAll('[data-step]').forEach(d => d.hidden = d.dataset.step !== s);
    // Screen-reader feedback for asynchronous payment transitions.
    if (dlg.open && ['done', 'expired'].includes(s)) { const content = dlg.querySelector('[data-step=' + s + ']'); content.tabIndex = -1; content.focus(); }
  };
  const memoryOrders = new Map();
  const saved = g => {
    if (memoryOrders.has(g)) return memoryOrders.get(g);
    try { return JSON.parse(localStorage.getItem('kstore:' + g)) } catch { return null }
  };
  const save = (g, o) => {
    memoryOrders.set(g, o || null);
    try { o ? localStorage.setItem('kstore:' + g, JSON.stringify(o)) : localStorage.removeItem('kstore:' + g) } catch {}
  };
  const stop = () => { lifecycle++; clearTimeout(poll); clearInterval(tick); poll = tick = null; };

  function recovery(o) {
    const u = new URL(location.pathname, location.origin);
    u.searchParams.set('order', o.order); u.searchParams.set('product', o.game || game);
    $('pix-recovery').value = u.href;
  }
  function showPay(o) {
    recovery(o);
    step('pay');
    $('pix-code').value = o.copia_e_cola;
    $('pix-qr').hidden = !o.qr_base64;
    if (o.qr_base64) $('pix-qr').src = 'data:image/png;base64,' + o.qr_base64;
    $('pix-ticket').hidden = !!o.qr_base64 || !o.ticket_url;
    if (o.ticket_url) $('pix-ticket').href = o.ticket_url;
    const left = () => {
      const s = Math.max(0, o.expires - Math.floor(Date.now() / 1000));
      $('pix-timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    };
    left(); clearInterval(tick); tick = setInterval(left, 1000);
    watch(o);
  }
  function showDone(o) {
    stop(); step('done'); recovery(o);
    const download = o.delivery === 'download' && /^\/download\/[a-f0-9]{24}(?:\?expires=\d+&signature=[a-f0-9]{64})?$/.test(o.download || '');
    $('pix-license-content').hidden = !!download;
    $('pix-download-content').hidden = !download;
    if (download) {
      $('pix-sent').textContent = 'Seu APK está disponível. O link de download dura 15 minutos; guarde o link de recuperação para baixar novamente.';
      $('pix-download').href = api + o.download;
      const r = o.release;
      $('pix-release').textContent = r.filename + ' · versão ' + r.version + ' · ' + r.platform + ' · ' + (r.size / 1024 / 1024).toFixed(2) + ' MB · SHA-256: ' + r.sha256;
      return;
    }
    $('pix-lic').value = o.license;
    $('pix-open').href = o.link;
    // mail === false: the Worker has no e-mail sender yet, so don't promise a copy.
    const sent = $('pix-sent'), to = document.createElement('b');
    to.textContent = o.email || 'o seu e-mail';
    if (o.mail !== true) sent.textContent = 'Este é o seu código de licença. Copie e guarde em um lugar seguro.';
    else { sent.textContent = 'Este é o seu código de licença. Uma cópia foi para '; sent.append(to, '.'); }
    $('pix-keep').hidden = o.mail !== true;
  }
  // Local storage remembers the private order ID, never proof of payment.
  async function refreshPaid(o) {
    const orderGame = game, epoch = lifecycle;
    step('recover');
    try {
      const r = await fetch(api + '/order/' + o.order, { cache: 'no-store' });
      if (!r.ok) throw new Error('recovery');
      const fresh = await r.json();
      if (!dlg.open || game !== orderGame || epoch !== lifecycle) return false;
      if (fresh.game !== orderGame || fresh.order !== o.order) throw new Error('recovery');
      save(orderGame, fresh);
      if (fresh.status === 'paid') { showDone(fresh); return true; }
      if (fresh.status === 'pending') showPay(fresh);
      else step('expired');
    } catch {
      if (dlg.open && game === orderGame && epoch === lifecycle) step('expired');
    }
    return false;
  }
  $('pix-download').addEventListener('click', async e => {
    e.preventDefault();
    const o = saved(game);
    if (o && await refreshPaid(o)) location.assign($('pix-download').href);
  });
  function watch(o) {
    const watchedGame = game, epoch = lifecycle;
    clearTimeout(poll);
    poll = setTimeout(async () => {
      if (!dlg.open || epoch !== lifecycle || watchedGame !== game) return;
      try {
        const r = await fetch(api + '/order/' + o.order, { cache: 'no-store' });
        if (!dlg.open || epoch !== lifecycle || watchedGame !== game) return;
        if (r.status === 404) { save(game, null); stop(); return step('expired'); }
        if (!r.ok) throw new Error('network');
        const s = await r.json();
        if (!dlg.open || epoch !== lifecycle || watchedGame !== game) return;
        if (s.status === 'paid') { save(game, { ...o, ...s }); return showDone({ ...o, ...s }); }
        if (s.status === 'expired' || o.expires < Date.now() / 1000 - 60) { save(game, null); stop(); return step('expired'); }
        $('pix-wait').textContent = 'Esperando confirmação do pagamento';
      } catch { if (!dlg.open || epoch !== lifecycle || watchedGame !== game) return; $('pix-wait').textContent = 'Sem confirmação no momento. Tentando reconectar…'; }
      watch(o);
    }, document.hidden ? 8000 : 3000);
  }
  async function order() {
    const err = $('pix-err'), btn = $('pix-go');
    if (btn.disabled) return;
    const orderGame = game, epoch = lifecycle;
    err.hidden = true;
    if (!$('pix-compatible').checked) { err.textContent = delivery === 'download' ? 'Confirme os requisitos do Android e a instalação manual antes de gerar o PIX.' : 'Confirme que já tem a Retrotv compatível e o jogo instalado antes de gerar o PIX.'; err.hidden = false; return $('pix-compatible').focus(); }
    const name = $('pix-name').value.trim(), email = $('pix-email').value.trim();
    if (name.length < 2) { err.textContent = ERR.bad_name; err.hidden = false; return $('pix-name').focus(); }
    if (!$('pix-email').checkValidity() || !email.includes('.')) { err.textContent = ERR.bad_email; err.hidden = false; return $('pix-email').focus(); }
    btn.disabled = true; btn.textContent = 'Gerando o PIX…';
    try {
      const r = await fetch(api + '/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: orderGame, name, email }) });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error);
      o.email = email;
      try { localStorage.setItem('kstore:buyer', JSON.stringify({ name, email })) } catch {}
      save(orderGame, o);
      // A reopened dialog for this game must adopt the order that just finished creating.
      if (dlg.open && game === orderGame) showPay(o);
    } catch (e) {
      if (!dlg.open || epoch !== lifecycle || game !== orderGame) return;
      err.textContent = ERR[e.message] || 'Não deu para gerar o PIX agora. Tente de novo, ou escreva para contato@kolja.com.br.';
      err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Gerar PIX'; }
  }

  document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', e => {
    if (!dlg.showModal) return;
    e.preventDefault();
    game = b.dataset.buy;
    delivery = b.dataset.delivery || 'license';
    $('pix-delivery').textContent = delivery === 'download' ? 'Você está comprando o APK completo. O download aparece nesta tela após a confirmação do PIX. Não há envio automático por e-mail.' : 'Você está comprando uma licença para o jogo já instalado. O código aparece nesta tela após a confirmação do pagamento. Copie e guarde: não há envio automático por e-mail.';
    $('pix-compatible-text').textContent = delivery === 'download' ? 'Meu aparelho atende à versão do Android indicada e sei instalar um APK manualmente.' : 'Já tenho a Retrotv compatível e este jogo aparece em MENU › JOGOS.';
    $('pix-title').textContent = b.dataset.name + ' · ' + b.dataset.price;
    $('pix-mail').href = b.href;
    $('pix-compatible').checked = false;
    $('pix-requires').textContent = 'Requisito: ' + b.dataset.requires + (delivery === 'download' ? '.' : '. Android 8 ou posterior.');
    stop();
    if (!api) step('manual');
    else {
      const o = saved(game);
      if (o && o.status === 'paid') refreshPaid(o);
      // A locally expired order may already be paid. Ask the server before discarding it.
      else if (o && o.order) showPay(o);
      else {
        save(game, null);
        let who = {}; try { who = JSON.parse(localStorage.getItem('kstore:buyer')) || {} } catch {}
        if (who.name && !$('pix-name').value) $('pix-name').value = who.name;
        if (who.email && !$('pix-email').value) $('pix-email').value = who.email;
        $('pix-err').hidden = true;
        step('form');
      }
    }
    dlg.showModal();
  }));
  dlg.querySelector('form').addEventListener('submit', e => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    if (!dlg.querySelector('[data-step=form]').hidden) order();
  });
  dlg.addEventListener('close', stop);
  $('pix-again').addEventListener('click', () => { save(game, null); step('form'); });
  dlg.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const f = $(b.dataset.copy), was = b.textContent;
    f.select();
    try { await navigator.clipboard.writeText(f.value) } catch { document.execCommand('copy') }
    b.textContent = 'Copiado!'; setTimeout(() => b.textContent = was, 1600);
  }));


  // Only resolve literal IDs; malformed or unknown hashes must not break checkout.
  const openHash = () => {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target && target.tagName === 'DETAILS') target.open = true;
  };
  addEventListener('hashchange', openHash); openHash();

  // A private recovery link restores the existing order without creating another PIX.
  (async () => {
    const q = new URLSearchParams(location.search), id = q.get('order'), product = q.get('product');
    if (!api || !/^[a-f0-9]{24}$/.test(id || '')) return;
    const button = [...document.querySelectorAll('[data-buy]')].find(b => b.dataset.buy === product);
    if (!button) return;
    try {
      const r = await fetch(api + '/order/' + id, { cache: 'no-store' });
      if (!r.ok) throw new Error('recovery');
      const o = await r.json();
      if (o.game !== product) throw new Error('recovery');
      save(product, o); button.click();
    } catch {
      button.click(); stop(); step('expired');
    }
  })();
