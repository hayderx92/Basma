// Renders an invoice as A4 pages (794 x 1123 CSS px = 210 x 297 mm)
(function () {
  const CSS = `
@page { size: A4; margin: 0; }
html,body{margin:0;padding:0;background:#fff;}
.ipage{direction:ltr;text-align:left;position:relative;width:794px;height:1123px;overflow:hidden;background:#fff;color:#111;
  font-family:Arial,"Helvetica Neue",Roboto,"Noto Sans Arabic","Noto Naskh Arabic",sans-serif;
  page-break-after:always;break-after:page;box-sizing:border-box;}
.ipage:last-child{page-break-after:auto;break-after:auto;}
.ipage *{box-sizing:border-box;}
.abs{position:absolute;}
.en-name{left:46px;top:56px;font-weight:bold;font-size:18px;line-height:23px;}
.ar-name{right:28px;top:22px;width:200px;text-align:center;direction:rtl;font-size:20px;line-height:30px;}
.logo{left:272px;top:14px;width:250px;height:126px;display:flex;align-items:center;justify-content:center;}
.logo img{max-width:100%;max-height:100%;}
.logo-txt{font-size:22px;color:#444;}
.title{left:0;right:0;top:146px;text-align:center;font-size:14px;}
.hl{height:0;border-top:1px solid #777;}
.vl{width:0;border-left:1px solid #777;}
.lbl{font-size:13px;}
.val{font-size:14px;font-weight:bold;}
.cell{font-size:13px;white-space:nowrap;}
.cell b{font-size:14.5px;}
.rtl{direction:rtl;unicode-bidi:plaintext;}
table.items{position:absolute;left:44px;top:362px;width:706px;border-collapse:collapse;font-size:12.5px;}
table.items th,table.items td{border:1px solid #666;padding:3px 4px;}
table.items th{font-weight:normal;height:38px;text-align:center;line-height:15px;}
table.items td{height:24px;}
td.c{text-align:center;} td.r{text-align:right;} td.l{text-align:left;}
td.name{unicode-bidi:plaintext;}
.note{left:22px;width:240px;font-size:14px;line-height:20px;display:flex;}
.note .k{white-space:nowrap;padding-right:6px;}
.note .t{flex:1;}
.note .t div, .note2 div{unicode-bidi:plaintext;text-align:start;}
.note2{left:22px;width:215px;font-size:14px;line-height:20px;}
.note2 .ph{font-size:16px;}
.tot{width:94px;padding-left:8px;font-size:13.5px;}
.tot .v{font-weight:bold;font-size:13px;margin-top:10px;}
.sig{top:958px;width:138px;height:96px;border:1px solid #888;display:flex;align-items:flex-end;justify-content:center;
  padding-bottom:6px;font-weight:bold;font-size:13px;}
`;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qty = (n) => { const v = Number(n) || 0; return Number.isInteger(v) ? String(v) : String(+v.toFixed(3)); };
  const lines = (s) => String(s || '').split('\n').map(l => `<div>${esc(l) || '&nbsp;'}</div>`).join('');

  function totals(inv) {
    const sub = (inv.lines || []).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
    const disc = Number(inv.discount) || 0;
    return { sub, disc, net: sub - disc };
  }

  // split rows into pages: the last page also holds notes + totals
  function paginate(rows) {
    const LAST = 14, FULL = 21, out = [];
    let rest = rows.slice();
    while (rest.length > LAST) {
      const take = Math.min(FULL, rest.length - 1);
      out.push(rest.splice(0, take));
    }
    out.push(rest);
    return out;
  }

  function fmtDate(d) {
    if (!d) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  }

  function page(inv, s, rows, startIdx, pi, pn, t, isLast) {
    const sigs = (s.sigs || ['Manager', 'Accountant', 'Client', 'Warehouse', 'Salesman']);
    const logo = s.logo || 'default-logo.png';
    const sigLeft = [22, 175, 328, 481, 634];
    let h = `<div class="ipage">`;
    // header
    h += `<div class="abs en-name">${esc(s.en1)}<br>${esc(s.en2)}</div>`;
    h += `<div class="abs logo">${s.noLogo ? `<span class="logo-txt">${esc(s.en1)}</span>` : `<img src="${esc(logo)}">`}</div>`;
    h += `<div class="abs ar-name">${lines([s.ar1, s.ar2, s.ar3].filter(x => x).join('\n'))}</div>`;
    h += `<div class="abs title">${esc(s.title || 'sale Invoice')}</div>`;
    // boxes
    h += `<div class="abs hl" style="left:14px;right:14px;top:178px"></div>`;
    h += `<div class="abs hl" style="left:14px;right:14px;top:258px"></div>`;
    h += `<div class="abs vl" style="left:258px;top:178px;height:80px"></div>`;
    h += `<div class="abs vl" style="left:258px;top:258px;height:84px"></div>`;
    h += `<div class="abs vl" style="left:516px;top:178px;height:164px"></div>`;
    // row 1
    h += `<div class="abs cell" style="left:22px;top:200px">Invoice #&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;<b>${esc(inv.no)}</b></div>`;
    h += `<div class="abs cell" style="left:536px;top:190px"><b>${money(t.net)}</b></div>`;
    h += `<div class="abs cell" style="left:536px;top:218px"><b style="font-size:13.5px">Page : ${pi} of ${pn}</b></div>`;
    // row 2 left
    h += `<div class="abs cell" style="left:22px;top:270px">Client Info&nbsp;&nbsp;:</div>`;
    h += `<div class="abs cell" style="left:22px;top:291px"><b>${esc(inv.client)}</b></div>`;
    h += `<div class="abs cell" style="left:22px;top:310px"><b>Location :</b> <b>${esc(inv.location)}</b></div>`;
    // row 2 middle
    h += `<div class="abs cell" style="left:276px;top:270px">Date&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</div>`;
    h += `<div class="abs cell" style="left:376px;top:269px"><b>${esc(fmtDate(inv.date))}</b></div>`;
    h += `<div class="abs cell" style="left:276px;top:293px">Currency :</div>`;
    h += `<div class="abs cell" style="left:376px;top:292px"><b>${esc(inv.currency)}</b></div>`;
    h += `<div class="abs cell" style="left:276px;top:315px">Offer Type :</div>`;
    h += `<div class="abs cell" style="left:376px;top:314px"><b>${esc(inv.offer)}</b></div>`;
    // row 2 right
    h += `<div class="abs cell" style="left:536px;top:293px">Salesman&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;<span style="font-size:13px">${esc(inv.salesman)}</span></div>`;
    // table
    h += `<table class="items"><colgroup>
      <col style="width:30px"><col style="width:180px"><col style="width:94px"><col style="width:74px">
      <col style="width:58px"><col style="width:38px"><col style="width:45px"><col style="width:72px"><col style="width:115px"></colgroup>
      <tr><th>#</th><th>Item Name</th><th>Batch No</th><th>Expiry<br>Date</th><th>Inv Qty</th><th>FQty</th><th>TQty</th><th>UnitPrice</th><th>Net Amount</th></tr>`;
    rows.forEach((l, i) => {
      const q = Number(l.qty) || 0, f = Number(l.free) || 0;
      h += `<tr><td class="c">${startIdx + i + 1}</td><td class="l name">${esc(l.name)}</td><td class="l">${esc(l.batch)}</td>
        <td class="c">${esc(l.expiry)}</td><td class="c">${qty(q)}</td><td class="c">${qty(f)}</td><td class="c">${qty(q + f)}</td>
        <td class="r">${money(l.price)}</td><td class="r">${money(q * (Number(l.price) || 0))}</td></tr>`;
    });
    h += `</table>`;

    if (isLast) {
      // y position below the table (header 38 + rows ~25)
      const y = 362 + 39 + rows.length * 25 + 16;
      h += `<div class="abs note" style="top:${y + 16}px"><span class="k">${inv.note ? 'Note:' : ''}</span><span class="t">${inv.note ? lines(inv.note) : ''}</span></div>`;
      const subL = 562, netL = 692;
      h += `<div class="abs vl" style="left:${subL}px;top:${y - 6}px;height:56px"></div>`;
      h += `<div class="abs tot" style="left:${subL}px;top:${y}px"><div>Sub Amount</div><div class="v">${money(t.sub)}</div></div>`;
      h += `<div class="abs vl" style="left:${netL}px;top:${y - 6}px;height:56px"></div>`;
      h += `<div class="abs tot" style="left:${netL}px;top:${y}px"><div>Net Amount</div><div class="v">${money(t.net)}</div></div>`;
      if (t.disc) {
        h += `<div class="abs cell" style="left:${subL + 8}px;top:${y + 62}px">Discount : <b>${money(t.disc)}</b></div>`;
      }
      if (inv.note2) h += `<div class="abs note2" style="top:${y + 82}px">${lines(inv.note2)}</div>`;
    }
    // footer
    h += `<div class="abs hl" style="left:14px;right:14px;top:917px;border-top-color:#555"></div>`;
    sigs.forEach((n, i) => { h += `<div class="abs sig" style="left:${sigLeft[i]}px">${esc(n)}</div>`; });
    h += `</div>`;
    return h;
  }

  function render(inv, s) {
    const t = totals(inv);
    const pages = paginate(inv.lines || []);
    let idx = 0, body = '';
    pages.forEach((rows, i) => {
      body += page(inv, s, rows, idx, i + 1, pages.length, t, i === pages.length - 1);
      idx += rows.length;
    });
    return { body, pages: pages.length };
  }

  function fullHtml(inv, s) {
    const r = render(inv, s);
    return {
      pages: r.pages,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=794">
<style>${CSS}</style></head><body>${r.body}</body></html>`
    };
  }

  window.Invoice = { CSS, render, fullHtml, totals, money, fmtDate };
})();
