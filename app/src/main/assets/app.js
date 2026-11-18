(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = Invoice.money;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };

  // ---------- storage ----------
  const K = { s: 'inv_settings', i: 'inv_items', v: 'inv_invoices', d: 'inv_draft' };
  const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('الذاكرة ممتلئة، احذف فواتير قديمة'); return false; } };

  const DEF_SETTINGS = {
    en1: 'Safeer Al-dawaa', en2: 'scientific bureau',
    ar1: 'مكتب سفير الدواء', ar2: 'العلمي', ar3: 'لدعاية الادوية',
    title: 'sale Invoice', logo: null, noLogo: false,
    prefix: 'SAL-01-', nextNo: 27071,
    client: 'زبون Sales Team', location: 'المنصور', currency: 'Dinar د.ع.', offer: '', salesman: 'المندوب العام',
    note: '', note2: '',
    sigs: ['Manager', 'Accountant', 'Client', 'Warehouse', 'Salesman']
  };
  let S = Object.assign({}, DEF_SETTINGS, load(K.s, {}));
  let ITEMS = load(K.i, null);
  if (!ITEMS) {
    ITEMS = [{ id: uid(), name: 'Etorix 120MG 1x7 Tablet', price: 5424, batch: '4214', expiry: '10 2026' }];
    save(K.i, ITEMS);
  }
  let INVS = load(K.v, []);

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function blankInvoice() {
    return {
      id: null, no: S.prefix + S.nextNo, date: today(),
      client: S.client, location: S.location, currency: S.currency, offer: S.offer, salesman: S.salesman,
      note: S.note, note2: S.note2, discount: 0, lines: []
    };
  }
  let CUR = load(K.d, null) || blankInvoice();
  const saveDraft = () => save(K.d, CUR);

  // ---------- ui helpers ----------
  let tt;
  function toast(m, ms = 2200) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms); }
  function openSheet(html, onMount) { $('#sbox').innerHTML = html; $('#sheet').classList.remove('hide'); onMount && onMount($('#sbox')); }
  function closeSheet() { $('#sheet').classList.add('hide'); $('#sbox').innerHTML = ''; }
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  let VIEW = 'edit';
  function go(v) {
    VIEW = v;
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    ({ edit: viewEdit, items: viewItems, saved: viewSaved, settings: viewSettings })[v]();
    window.scrollTo(0, 0);
  }
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.v));

  window.__back = function () {
    if (!$('#preview').classList.contains('hide')) { $('#preview').classList.add('hide'); return true; }
    if (!$('#sheet').classList.contains('hide')) { closeSheet(); return true; }
    if (VIEW !== 'edit') { go('edit'); return true; }
    return false;
  };

  // ---------- invoice editor ----------
  function viewEdit() {
    $('#ttl').textContent = CUR.id ? 'تعديل فاتورة ' + CUR.no : 'فاتورة جديدة';
    const v = $('#view');
    v.innerHTML = `
    <div class="card"><h3>معلومات الفاتورة</h3>
      <div class="grid">
        <div><label>رقم الفاتورة</label><input class="ltr" data-f="no" value="${esc(CUR.no)}"></div>
        <div><label>التاريخ</label><input type="date" data-f="date" value="${esc(CUR.date)}"></div>
        <div class="full"><label>الزبون (Client Info)</label><input data-f="client" value="${esc(CUR.client)}"></div>
        <div><label>الموقع (Location)</label><input data-f="location" value="${esc(CUR.location)}"></div>
        <div><label>العملة (Currency)</label><input data-f="currency" value="${esc(CUR.currency)}"></div>
        <div><label>نوع العرض (Offer Type)</label><input data-f="offer" value="${esc(CUR.offer)}"></div>
        <div><label>المندوب (Salesman)</label><input data-f="salesman" value="${esc(CUR.salesman)}"></div>
      </div>
    </div>
    <div class="card"><h3>المواد <span class="badge" id="cnt"></span></h3>
      <div id="lines"></div>
      <div class="row"><button class="btn pri" id="add-line">＋ إضافة مادة</button>
      <button class="btn" id="add-manual">＋ مادة يدوية</button></div>
    </div>
    <div class="card"><h3>المجموع</h3>
      <div class="sum"><span>Sub Amount</span><b id="t-sub"></b></div>
      <div class="grid" style="margin:8px 0"><div class="full"><label>خصم (اختياري)</label><input class="ltr" inputmode="decimal" data-f="discount" value="${CUR.discount || ''}"></div></div>
      <div class="sum big"><span>Net Amount</span><b id="t-net"></b></div>
    </div>
    <div class="card"><h3>الملاحظات</h3>
      <label>Note (تظهر بجانب كلمة Note)</label><textarea data-f="note">${esc(CUR.note)}</textarea>
      <label style="margin-top:8px">ملاحظة ثانية (أسفلها — مثل اسم المندوب ورقمه)</label><textarea data-f="note2">${esc(CUR.note2)}</textarea>
    </div>
    <div class="actions">
      <button class="btn" id="b-prev">👁️ معاينة</button>
      <button class="btn pri" id="b-pdf">⬇️ تصدير PDF</button>
      <button class="btn" id="b-save">💾 حفظ</button>
      <button class="btn" id="b-print">🖨️ طباعة</button>
      <button class="btn red" id="b-new" style="grid-column:1/-1">فاتورة جديدة</button>
    </div>`;
    $$('[data-f]', v).forEach(el => el.addEventListener('input', () => {
      const f = el.dataset.f;
      CUR[f] = f === 'discount' ? num(el.value) : el.value;
      if (f === 'no') $('#ttl').textContent = CUR.id ? 'تعديل فاتورة ' + CUR.no : 'فاتورة جديدة';
      saveDraft(); refreshTotals();
    }));
    renderLines();
    $('#add-line').onclick = pickItem;
    $('#add-manual').onclick = () => { CUR.lines.push({ name: '', batch: '', expiry: '', qty: 1, free: 0, price: 0 }); saveDraft(); renderLines(true); };
    $('#b-prev').onclick = () => showPreview(CUR);
    $('#b-pdf').onclick = () => { if (persist(true)) exportPdf(CUR); };
    $('#b-save').onclick = () => { if (persist()) toast('تم حفظ الفاتورة ✓'); };
    $('#b-print').onclick = () => { if (persist(true)) printInv(CUR); };
    $('#b-new').onclick = () => {
      if (CUR.lines.length && !CUR.id && !confirm('الفاتورة الحالية غير محفوظة. بدء فاتورة جديدة؟')) return;
      CUR = blankInvoice(); saveDraft(); viewEdit();
    };
  }

  function renderLines(focusLast) {
    const box = $('#lines');
    $('#cnt').textContent = CUR.lines.length || '';
    if (!CUR.lines.length) { box.innerHTML = '<div class="empty">لا توجد مواد بعد — اضغط «إضافة مادة»</div>'; refreshTotals(); return; }
    box.innerHTML = CUR.lines.map((l, i) => `
      <div class="line" data-i="${i}">
        <div class="hd"><span>#${i + 1}</span>
          <span class="row">
            <button class="btn sm" data-a="up" ${i ? '' : 'disabled'}>▲</button>
            <button class="btn sm red" data-a="del">حذف</button></span></div>
        <label>اسم المادة</label><input class="ltr" data-l="name" value="${esc(l.name)}">
        <div class="g3" style="margin-top:6px">
          <div><label>Batch No</label><input class="ltr" data-l="batch" value="${esc(l.batch)}"></div>
          <div><label>Expiry</label><input class="ltr" data-l="expiry" value="${esc(l.expiry)}"></div>
          <div><label>السعر (Unit)</label><input class="ltr" inputmode="decimal" data-l="price" value="${l.price}"></div>
          <div><label>الكمية (Inv)</label><input class="ltr" inputmode="decimal" data-l="qty" value="${l.qty}"></div>
          <div><label>مجاني (FQty)</label><input class="ltr" inputmode="decimal" data-l="free" value="${l.free}"></div>
          <div><label>TQty</label><input class="ltr" disabled data-t="tq" value=""></div>
        </div>
        <div class="net"><span>Net Amount</span><b data-t="net"></b></div>
        <div class="row" style="margin-top:6px"><button class="btn sm" data-a="saveprice">حفظ السعر في قائمة المواد</button></div>
      </div>`).join('');
    $$('.line', box).forEach(card => {
      const i = +card.dataset.i;
      $$('[data-l]', card).forEach(el => el.addEventListener('input', () => {
        const f = el.dataset.l;
        CUR.lines[i][f] = ['price', 'qty', 'free'].includes(f) ? num(el.value) : el.value;
        saveDraft(); updLine(card, i); refreshTotals();
      }));
      card.querySelector('[data-a=del]').onclick = () => { CUR.lines.splice(i, 1); saveDraft(); renderLines(); };
      card.querySelector('[data-a=up]').onclick = () => { const t = CUR.lines[i - 1]; CUR.lines[i - 1] = CUR.lines[i]; CUR.lines[i] = t; saveDraft(); renderLines(); };
      card.querySelector('[data-a=saveprice]').onclick = () => {
        const l = CUR.lines[i]; if (!l.name.trim()) return toast('اكتب اسم المادة أولاً');
        let it = ITEMS.find(x => x.name.trim().toLowerCase() === l.name.trim().toLowerCase());
        if (it) { it.price = l.price; it.batch = l.batch; it.expiry = l.expiry; }
        else ITEMS.push(it = { id: uid(), name: l.name.trim(), price: l.price, batch: l.batch, expiry: l.expiry });
        save(K.i, ITEMS); toast('تم حفظ «' + it.name + '» بسعر ' + money(it.price));
      };
      updLine(card, i);
    });
    refreshTotals();
    if (focusLast) { const c = $$('.line', box).pop(); c.scrollIntoView({ block: 'center' }); c.querySelector('[data-l=name]').focus(); }
  }
  function updLine(card, i) {
    const l = CUR.lines[i];
    card.querySelector('[data-t=tq]').value = (num(l.qty) + num(l.free));
    card.querySelector('[data-t=net]').textContent = money(num(l.qty) * num(l.price));
  }
  function refreshTotals() {
    const t = Invoice.totals(CUR);
    if ($('#t-sub')) { $('#t-sub').textContent = money(t.sub); $('#t-net').textContent = money(t.net); }
  }

  function pickItem() {
    openSheet(`<h3 style="margin:0 0 10px">اختر مادة</h3>
      <input class="search" id="q" placeholder="بحث…">
      <div class="list" id="pl"></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="pk-new">＋ مادة جديدة للقائمة</button></div>`, (b) => {
      const draw = () => {
        const q = $('#q', b).value.trim().toLowerCase();
        const arr = ITEMS.filter(x => !q || x.name.toLowerCase().includes(q));
        $('#pl', b).innerHTML = arr.length ? arr.map(x => `<div class="it" data-id="${x.id}">
            <div><div class="n">${esc(x.name)}</div><div class="s">Batch ${esc(x.batch || '-')} · Exp ${esc(x.expiry || '-')}</div></div>
            <div class="p">${money(x.price)}</div></div>`).join('') : '<div class="empty">لا توجد مواد</div>';
        $$('.it', b).forEach(el => el.onclick = () => {
          const x = ITEMS.find(y => y.id === el.dataset.id);
          CUR.lines.push({ name: x.name, batch: x.batch || '', expiry: x.expiry || '', qty: 1, free: 0, price: num(x.price) });
          saveDraft(); closeSheet(); renderLines(true);
        });
      };
      $('#q', b).oninput = draw; draw();
      $('#pk-new', b).onclick = () => editItem(null, (it) => {
        CUR.lines.push({ name: it.name, batch: it.batch, expiry: it.expiry, qty: 1, free: 0, price: num(it.price) });
        saveDraft(); renderLines(true);
      });
    });
  }

  function persist(silent) {
    if (!CUR.lines.length) { toast('أضف مادة واحدة على الأقل'); return false; }
    if (!String(CUR.no).trim()) { toast('اكتب رقم الفاتورة'); return false; }
    const now = Date.now();
    if (!CUR.id) {
      CUR.id = uid(); CUR.created = now;
      if (CUR.no === S.prefix + S.nextNo) { S.nextNo = Number(S.nextNo) + 1; save(K.s, S); }
    }
    CUR.updated = now;
    const copy = JSON.parse(JSON.stringify(CUR));
    const i = INVS.findIndex(x => x.id === CUR.id);
    if (i >= 0) INVS[i] = copy; else INVS.unshift(copy);
    if (!save(K.v, INVS)) return false;
    saveDraft();
    if (VIEW === 'edit') $('#ttl').textContent = 'تعديل فاتورة ' + CUR.no;
    return true;
  }

  // ---------- preview / pdf / print ----------
  function settingsForRender() {
    return Object.assign({}, S);
  }
  function showPreview(inv) {
    const r = Invoice.render(inv, settingsForRender());
    let st = $('#inv-css');
    if (!st) { st = document.createElement('style'); st.id = 'inv-css'; st.textContent = Invoice.CSS.replace(/html,body\{[^}]*\}/, '').replace(/@page[^}]*\}/, ''); document.head.appendChild(st); }
    const w = Math.min(window.innerWidth - 16, 794), sc = w / 794;
    const tmp = document.createElement('div'); tmp.innerHTML = r.body;
    const host = $('#pv-pages'); host.innerHTML = '';
    $$('.ipage', tmp).forEach(p => {
      const pg = document.createElement('div'); pg.className = 'pg';
      pg.style.width = w + 'px'; pg.style.height = (1123 * sc) + 'px';
      p.style.transform = `scale(${sc})`; pg.appendChild(p); host.appendChild(pg);
    });
    $('#preview').classList.remove('hide');
    $('#pv-close').onclick = () => $('#preview').classList.add('hide');
    $('#pv-pdf').onclick = () => { if (inv === CUR && !persist(true)) return; exportPdf(inv); };
    $('#pv-print').onclick = () => { if (inv === CUR && !persist(true)) return; printInv(inv); };
  }

  const hasNative = () => !!(window.Android && window.Android.makePdf);
  function fileName(inv) { return String(inv.no || 'invoice').replace(/[^\w\-.]+/g, '_') + '.pdf'; }

  function exportPdf(inv) {
    const r = Invoice.fullHtml(inv, settingsForRender());
    if (!hasNative()) { const w = window.open(''); w.document.write(r.html); w.document.close(); setTimeout(() => w.print(), 400); return; }
    toast('جاري إنشاء PDF…', 6000);
    window.Android.makePdf(r.html, fileName(inv), r.pages);
  }
  function printInv(inv) {
    const r = Invoice.fullHtml(inv, settingsForRender());
    if (!hasNative()) { const w = window.open(''); w.document.write(r.html); w.document.close(); setTimeout(() => w.print(), 400); return; }
    toast('جاري التحضير للطباعة…');
    window.Android.print(r.html, 'Invoice ' + inv.no, r.pages);
  }
  window.__pdfDone = function (res) {
    if (!res || !res.ok) { toast('فشل إنشاء PDF: ' + ((res && res.error) || ''), 4000); return; }
    $('#toast').classList.remove('on');
    openSheet(`<h3 style="margin:0 0 6px">تم إنشاء الفاتورة PDF ✓</h3>
      <div style="color:#666;font-size:13px;margin-bottom:12px;direction:ltr;text-align:right">${esc(res.where || res.name)}</div>
      <div class="actions"><button class="btn pri" id="pd-share">📤 مشاركة</button><button class="btn" id="pd-open">📄 فتح</button></div>
      <button class="btn" style="width:100%;margin-top:8px" id="pd-close">إغلاق</button>`, (b) => {
      $('#pd-share', b).onclick = () => window.Android.sharePdf(res.name);
      $('#pd-open', b).onclick = () => window.Android.openPdf(res.name);
      $('#pd-close', b).onclick = closeSheet;
    });
  };

  // ---------- items ----------
  function viewItems() {
    $('#ttl').textContent = 'المواد والأسعار';
    $('#view').innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:10px"><input id="iq" placeholder="بحث عن مادة…" style="flex:1"><button class="btn pri" id="i-add">＋ إضافة</button></div>
      <div class="list" id="il"></div></div>`;
    const draw = () => {
      const q = $('#iq').value.trim().toLowerCase();
      const arr = ITEMS.filter(x => !q || x.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      $('#il').innerHTML = arr.length ? arr.map(x => `<div class="it" data-id="${x.id}">
        <div><div class="n">${esc(x.name)}</div><div class="s">Batch ${esc(x.batch || '-')} · Exp ${esc(x.expiry || '-')}</div></div>
        <div class="p">${money(x.price)}</div></div>`).join('') : '<div class="empty">لا توجد مواد</div>';
      $$('#il .it').forEach(el => el.onclick = () => editItem(ITEMS.find(y => y.id === el.dataset.id), draw));
    };
    $('#iq').oninput = draw; draw();
    $('#i-add').onclick = () => editItem(null, draw);
  }

  function editItem(it, after) {
    const isNew = !it;
    it = it || { name: '', price: '', batch: '', expiry: '' };
    openSheet(`<h3 style="margin:0 0 10px">${isNew ? 'مادة جديدة' : 'تعديل مادة'}</h3>
      <div class="grid">
        <div class="full"><label>اسم المادة</label><input class="ltr" id="e-name" value="${esc(it.name)}"></div>
        <div class="full"><label>السعر (UnitPrice)</label><input class="ltr" inputmode="decimal" id="e-price" value="${it.price}"></div>
        <div><label>Batch No</label><input class="ltr" id="e-batch" value="${esc(it.batch)}"></div>
        <div><label>Expiry Date</label><input class="ltr" id="e-exp" placeholder="10 2026" value="${esc(it.expiry)}"></div>
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn pri" id="e-ok">حفظ</button>
        ${isNew ? '<button class="btn" id="e-cancel">إلغاء</button>' : '<button class="btn red" id="e-del">حذف</button>'}
      </div>`, (b) => {
      if (isNew) $('#e-name', b).focus();
      $('#e-ok', b).onclick = () => {
        const name = $('#e-name', b).value.trim();
        if (!name) return toast('اكتب اسم المادة');
        it.name = name; it.price = num($('#e-price', b).value);
        it.batch = $('#e-batch', b).value.trim(); it.expiry = $('#e-exp', b).value.trim();
        if (isNew) { it.id = uid(); ITEMS.push(it); }
        save(K.i, ITEMS); closeSheet(); toast('تم الحفظ ✓'); after && after(it);
      };
      const c = $('#e-cancel', b); if (c) c.onclick = closeSheet;
      const d = $('#e-del', b); if (d) d.onclick = () => {
        if (!confirm('حذف «' + it.name + '»؟')) return;
        ITEMS = ITEMS.filter(x => x.id !== it.id); save(K.i, ITEMS); closeSheet(); after && after();
      };
    });
  }

  // ---------- saved invoices ----------
  function viewSaved() {
    $('#ttl').textContent = 'الفواتير المحفوظة';
    $('#view').innerHTML = `<div class="card"><input id="sq" class="search" placeholder="بحث برقم الفاتورة أو الزبون…"><div class="list" id="sl"></div></div>`;
    const draw = () => {
      const q = $('#sq').value.trim().toLowerCase();
      const arr = INVS.filter(x => !q || (x.no + ' ' + x.client + ' ' + x.location).toLowerCase().includes(q));
      $('#sl').innerHTML = arr.length ? arr.map(x => `<div class="it" data-id="${x.id}">
        <div><div class="n">${esc(x.no)}</div><div class="s">${esc(x.client)} · ${esc(Invoice.fmtDate(x.date))} · ${x.lines.length} مادة</div></div>
        <div class="p">${money(Invoice.totals(x).net)}</div></div>`).join('') : '<div class="empty">لا توجد فواتير محفوظة</div>';
      $$('#sl .it').forEach(el => el.onclick = () => savedActions(INVS.find(y => y.id === el.dataset.id), draw));
    };
    $('#sq').oninput = draw; draw();
  }

  function savedActions(inv, redraw) {
    openSheet(`<h3 style="margin:0 0 4px;direction:ltr;text-align:right">${esc(inv.no)}</h3>
      <div style="color:#666;font-size:13px;margin-bottom:12px">${esc(inv.client)} — ${money(Invoice.totals(inv).net)}</div>
      <div class="actions">
        <button class="btn pri" id="s-pdf">⬇️ PDF</button>
        <button class="btn" id="s-prev">👁️ معاينة</button>
        <button class="btn" id="s-edit">✏️ تعديل</button>
        <button class="btn" id="s-dup">📄 نسخ كفاتورة جديدة</button>
        <button class="btn" id="s-print">🖨️ طباعة</button>
        <button class="btn red" id="s-del">🗑️ حذف</button>
      </div>`, (b) => {
      $('#s-pdf', b).onclick = () => { closeSheet(); exportPdf(inv); };
      $('#s-prev', b).onclick = () => { closeSheet(); showPreview(inv); };
      $('#s-print', b).onclick = () => { closeSheet(); printInv(inv); };
      $('#s-edit', b).onclick = () => { CUR = JSON.parse(JSON.stringify(inv)); saveDraft(); closeSheet(); go('edit'); };
      $('#s-dup', b).onclick = () => {
        const n = JSON.parse(JSON.stringify(inv));
        Object.assign(n, { id: null, created: null, updated: null, no: S.prefix + S.nextNo, date: today() });
        CUR = n; saveDraft(); closeSheet(); go('edit'); toast('تم النسخ — عدّل واحفظ');
      };
      $('#s-del', b).onclick = () => {
        if (!confirm('حذف الفاتورة ' + inv.no + '؟')) return;
        INVS = INVS.filter(x => x.id !== inv.id); save(K.v, INVS);
        if (CUR.id === inv.id) { CUR = blankInvoice(); saveDraft(); }
        closeSheet(); redraw();
      };
    });
  }

  // ---------- settings ----------
  function viewSettings() {
    $('#ttl').textContent = 'الإعدادات';
    const f = (k, l, cls = '', ph = '') => `<div class="${cls}"><label>${l}</label><input data-s="${k}" value="${esc(S[k])}" placeholder="${ph}"></div>`;
    $('#view').innerHTML = `
    <div class="card"><h3>رأس الفاتورة</h3>
      <div class="grid">
        ${f('en1', 'الاسم بالإنكليزي — سطر 1', 'full ltr')}
        ${f('en2', 'الاسم بالإنكليزي — سطر 2', 'full ltr')}
        ${f('ar1', 'الاسم بالعربي — سطر 1', 'full')}
        ${f('ar2', 'الاسم بالعربي — سطر 2', '')}
        ${f('ar3', 'الاسم بالعربي — سطر 3', '')}
        ${f('title', 'عنوان الفاتورة', 'full')}
      </div>
      <label style="margin-top:10px">الشعار</label>
      <img class="logo-prev" id="lg" src="${esc(S.logo || 'default-logo.png')}">
      <div class="row">
        <label class="btn" style="margin:0;color:var(--b);font-size:14px">🖼️ اختيار شعار<input type="file" accept="image/*" id="lf" style="display:none"></label>
        <button class="btn" id="lr">الشعار الافتراضي</button>
      </div>
    </div>
    <div class="card"><h3>الترقيم</h3>
      <div class="grid">
        ${f('prefix', 'بادئة الرقم', 'ltr')}
        <div><label>الرقم التالي</label><input class="ltr" inputmode="numeric" data-s="nextNo" value="${S.nextNo}"></div>
      </div>
    </div>
    <div class="card"><h3>القيم الافتراضية للفاتورة الجديدة</h3>
      <div class="grid">
        ${f('client', 'الزبون', 'full')}
        ${f('location', 'الموقع')}
        ${f('currency', 'العملة')}
        ${f('offer', 'نوع العرض')}
        ${f('salesman', 'المندوب')}
      </div>
      <label style="margin-top:8px">Note الافتراضية</label><textarea data-s="note">${esc(S.note)}</textarea>
      <label style="margin-top:8px">الملاحظة الثانية الافتراضية</label><textarea data-s="note2">${esc(S.note2)}</textarea>
    </div>
    <div class="card"><h3>مربعات التوقيع (أسفل الفاتورة)</h3>
      <div class="grid">${S.sigs.map((s, i) => `<div><input class="ltr" data-sig="${i}" value="${esc(s)}"></div>`).join('')}</div>
    </div>
    <div class="card"><h3>نسخة احتياطية</h3>
      <div class="actions"><button class="btn" id="bk-exp">📤 تصدير البيانات</button><button class="btn" id="bk-imp">📥 استيراد</button></div>
    </div>`;
    $$('[data-s]').forEach(el => el.addEventListener('input', () => {
      const k = el.dataset.s; S[k] = k === 'nextNo' ? (parseInt(el.value) || 1) : el.value; save(K.s, S);
      if (!CUR.id && !CUR.lines.length) { CUR = blankInvoice(); saveDraft(); }
    }));
    $$('[data-sig]').forEach(el => el.addEventListener('input', () => { S.sigs[+el.dataset.sig] = el.value; save(K.s, S); }));
    $('#lf').onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 700, k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          S.logo = c.toDataURL('image/png'); if (save(K.s, S)) { $('#lg').src = S.logo; toast('تم تغيير الشعار ✓'); }
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    };
    $('#lr').onclick = () => { S.logo = null; save(K.s, S); $('#lg').src = 'default-logo.png'; };
    $('#bk-exp').onclick = () => {
      const data = JSON.stringify({ settings: S, items: ITEMS, invoices: INVS });
      openSheet(`<h3 style="margin:0 0 8px">انسخ هذا النص واحفظه</h3><textarea id="bx" style="min-height:220px;direction:ltr;font-size:11px">${esc(data)}</textarea>
        <button class="btn pri" style="width:100%;margin-top:8px" id="bc">نسخ</button>`, (b) => {
        $('#bc', b).onclick = () => { $('#bx', b).select(); document.execCommand('copy'); toast('تم النسخ'); };
      });
    };
    $('#bk-imp').onclick = () => {
      openSheet(`<h3 style="margin:0 0 8px">الصق نص النسخة الاحتياطية</h3><textarea id="bx" style="min-height:220px;direction:ltr;font-size:11px"></textarea>
        <button class="btn pri" style="width:100%;margin-top:8px" id="bi">استيراد</button>`, (b) => {
        $('#bi', b).onclick = () => {
          try {
            const d = JSON.parse($('#bx', b).value);
            if (d.settings) { S = Object.assign({}, DEF_SETTINGS, d.settings); save(K.s, S); }
            if (d.items) { ITEMS = d.items; save(K.i, ITEMS); }
            if (d.invoices) { INVS = d.invoices; save(K.v, INVS); }
            closeSheet(); toast('تم الاستيراد ✓'); viewSettings();
          } catch (e) { toast('النص غير صالح'); }
        };
      });
    };
  }

  go('edit');
})();
