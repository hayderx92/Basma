import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  getDocs, query, where, serverTimestamp, writeBatch,
} from 'firebase/firestore';

// ================= helpers =================
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const longDate = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
function fmtTime(d) {
  if (!d) return '—';
  let h = d.getHours(); const m = pad(d.getMinutes());
  const ap = h < 12 ? 'ص' : 'م'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
const tsDate = (t) => (t && t.toDate ? t.toDate() : null);
const hm2min = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const fmtDur = (min) => (min == null ? '—' : `${Math.floor(min / 60)}س ${pad(Math.round(min % 60))}د`);
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function genCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  return [...a].map((v) => A[v % A.length]).join('');
}

let toastT;
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3800);
}
window.toast = toast;
function busy(text) {
  if (text === false) return $('#busy').classList.add('hidden');
  $('#busyText').textContent = text || ''; $('#busy').classList.remove('hidden');
}
function fbErr(e) {
  const c = (e && e.code) || '';
  const map = {
    'permission-denied': 'لا توجد صلاحية لهذه العملية',
    unavailable: 'لا يوجد اتصال بالإنترنت',
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة',
    'auth/wrong-password': 'كلمة المرور غير صحيحة',
    'auth/user-not-found': 'الحساب غير موجود',
    'auth/email-already-in-use': 'البريد مستخدم مسبقاً — استخدم «دخول»',
    'auth/weak-password': 'كلمة المرور ضعيفة (6 أحرف على الأقل)',
    'auth/invalid-email': 'البريد غير صحيح',
    'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت',
    'auth/operation-not-allowed': 'فعّل طريقة الدخول هذه من Firebase Authentication',
    'auth/admin-restricted-operation': 'فعّل الدخول المجهول (Anonymous) من Firebase Authentication',
  };
  return map[c] || (typeof e === 'string' ? e : (e && e.message) || 'حدث خطأ');
}

// ================= native bridge =================
const N = window.Android;
const pend = {}; let seq = 0;
window.__native = (id, res) => { const p = pend[id]; if (p) { delete pend[id]; p(res); } };
function callNative(method, ...args) {
  return new Promise((res) => { const id = 'n' + ++seq; pend[id] = res; N[method](id, ...args); });
}
const bio = (title) => (N ? callNative('biometric', title) : Promise.resolve({ ok: confirm(title + ' (محاكاة)') }));
function getLoc() {
  if (N) return callNative('getLocation');
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (p) => res({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, mock: false }),
    (e) => res({ ok: false, error: e.message }), { enableHighAccuracy: true, timeout: 20000 }));
}
const devId = () => (N ? N.deviceId() : 'browser');
const devModel = () => (N ? N.deviceModel() : navigator.userAgent.slice(0, 60));
function shareFile(name, content, mime) {
  if (N) return N.shareFile(name, content, mime);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click();
}
const shareText = (t) => (N ? N.shareText(t) : navigator.clipboard?.writeText(t).then(() => toast('تم النسخ')));

const FP_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 8.5a6.5 6.5 0 0 1 11 0"/><path d="M8 19c-.8-1.8-1.2-3.8-1-5.5a5 5 0 0 1 10 0c.1 1.7-.1 3.5-.7 5.3"/><path d="M10.3 20.5c-.6-1.8-.9-3.7-.8-5.8a2.5 2.5 0 0 1 5 0c0 2-.3 4-.9 5.8"/><path d="M12 14.5c0 2.3-.1 4.3-.5 6.3"/><path d="M4.5 12a7.6 7.6 0 0 1 1-3"/><path d="M19.5 12a7.6 7.6 0 0 0-1-3"/></svg>`;

// ================= firebase =================
const cfg = window.FIREBASE_CONFIG || {};
const app = $('#app');
if (!cfg.apiKey || cfg.apiKey.includes('PASTE')) {
  app.innerHTML = `<div class="hero"><div class="logo">${FP_SVG.replace('currentColor', '#fff')}</div>
  <h1>بصمة</h1><p class="center muted">لم يتم ضبط إعدادات Firebase بعد.<br>عدّل الملف <b>config.js</b> وأعد بناء التطبيق.</p></div>`;
  throw new Error('no config');
}
const fb = initializeApp(cfg);
const auth = getAuth(fb);
const db = getFirestore(fb);

const LS = {
  get role() { return localStorage.getItem('role'); },
  set role(v) { v ? localStorage.setItem('role', v) : localStorage.removeItem('role'); },
  get code() { return localStorage.getItem('code'); },
  set code(v) { v ? localStorage.setItem('code', v) : localStorage.removeItem('code'); },
};

let back = null; // function returning true if handled
window.__back = () => (back ? back() : false);

async function loadSettings() {
  const s = await getDoc(doc(db, 'settings', 'main'));
  return s.exists() ? s.data() : null;
}

// ================= welcome =================
function welcome() {
  back = null;
  app.innerHTML = `<div class="hero">
    <div class="logo">${FP_SVG.replace('currentColor', '#fff')}</div>
    <h1>بصمة</h1>
    <p class="center muted" style="margin-top:0">نظام الحضور والانصراف</p>
    <button class="btn" id="bEmp">أنا موظف</button>
    <button class="btn alt" id="bAdm">دخول المدير</button>
  </div>`;
  $('#bEmp').onclick = empJoin;
  $('#bAdm').onclick = adminLogin;
}

// ================= employee =================
function empJoin() {
  back = () => { welcome(); return true; };
  app.innerHTML = `<div class="hero">
    <div class="logo">${FP_SVG.replace('currentColor', '#fff')}</div>
    <h1>ربط الجهاز</h1>
    <p class="center muted small" style="margin-top:0">أدخل رمز الموظف الذي أعطاك إياه المدير.<br>سيُربط الرمز بهذا الموبايل فقط.</p>
    <input id="code" class="ltr center" style="font-size:22px;letter-spacing:4px;text-transform:uppercase" maxlength="6" placeholder="XXXXXX" autocomplete="off">
    <button class="btn" id="go">ربط</button>
    <button class="btn gray" id="bk">رجوع</button>
  </div>`;
  $('#bk').onclick = welcome;
  $('#go').onclick = async () => {
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 6) return toast('الرمز 6 خانات', 'bad');
    busy('جاري الربط…');
    try {
      if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth);
      if (!auth.currentUser) await signInAnonymously(auth);
      const uid = auth.currentUser.uid;
      const ref = doc(db, 'employees', code);
      const s = await getDoc(ref);
      if (!s.exists()) throw 'الرمز غير صحيح';
      const e = s.data();
      if (!e.active) throw 'هذا الحساب موقوف، راجع المدير';
      if (e.uid && e.uid !== uid) throw 'هذا الرمز مربوط بموبايل آخر. اطلب من المدير «فك الربط».';
      if (!e.uid) await updateDoc(ref, { uid, deviceId: devId(), device: devModel(), boundAt: serverTimestamp() });
      LS.role = 'emp'; LS.code = code;
      busy(false); toast('تم ربط الجهاز ✓', 'ok');
      empHome();
    } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
}

let clockT;
async function empHome() {
  back = null;
  clearInterval(clockT);
  const code = LS.code; const uid = auth.currentUser?.uid;
  app.innerHTML = `<div class="center muted" style="padding-top:40vh">جاري التحميل…</div>`;
  let emp, settings, rec, hist;
  try {
    const es = await getDoc(doc(db, 'employees', code));
    if (!es.exists() || es.data().uid !== uid) {
      LS.role = null; LS.code = null;
      toast('تم فك ربط هذا الجهاز من قبل المدير', 'bad');
      return empJoin();
    }
    emp = es.data();
    settings = await loadSettings();
    const today = ymd(new Date());
    const rs = await getDoc(doc(db, 'attendance', `${code}_${today}`));
    rec = rs.exists() ? rs.data() : null;
    const hs = await getDocs(query(collection(db, 'attendance'), where('uid', '==', uid)));
    hist = hs.docs.map((d) => d.data()).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  } catch (err) {
    app.innerHTML = `<div class="hero"><p class="center">${esc(fbErr(err))}</p><button class="btn" id="rt">إعادة المحاولة</button></div>`;
    $('#rt').onclick = empHome; return;
  }

  const state = !rec ? 'in' : !rec.outTs ? 'out' : 'done';
  const label = { in: 'بصمة حضور', out: 'بصمة انصراف', done: 'تم اليوم' }[state];
  const inT = tsDate(rec?.inTs), outT = tsDate(rec?.outTs);
  const late = settings && inT ? minOfDay(inT) - hm2min(settings.start) - (settings.grace || 0) : 0;

  app.innerHTML = `
  <div class="top"><div class="topbar"><div><h1>أهلاً ${esc(emp.name)}</h1>
    <div class="sub">${esc(settings?.place || '')} · دوام ${esc(settings?.start || '--')} – ${esc(settings?.end || '--')}</div></div>
    <button class="icon-btn" id="rf">تحديث</button></div></div>
  <div class="wrap">
    <div class="card center">
      <div class="muted small">${longDate(new Date())}</div>
      <div class="clock" id="clk">--:--</div>
      <div class="punch"><button class="fp ${state}" id="fp" ${state === 'done' ? 'disabled' : ''}>${FP_SVG}<span>${label}</span></button></div>
      <div class="row" style="margin-top:14px">
        <div><div class="muted small">الحضور</div><b>${fmtTime(inT)}</b>${late > 0 ? `<div><span class="pill p-warn">متأخر ${late} د</span></div>` : ''}</div>
        <div><div class="muted small">الانصراف</div><b>${fmtTime(outT)}</b></div>
        <div><div class="muted small">المدة</div><b>${inT && outT ? fmtDur((outT - inT) / 60000) : '—'}</b></div>
      </div>
    </div>
    <div class="card"><h3>سجلّي</h3>${hist.length ? hist.map((h) => {
      const i = tsDate(h.inTs), o = tsDate(h.outTs);
      return `<div class="item"><div><div class="nm">${esc(h.date)}</div><div class="small muted">${fmtTime(i)} ← ${fmtTime(o)}</div></div>
      <span class="pill ${o ? 'p-ok' : 'p-info'}">${o ? fmtDur((o - i) / 60000) : 'بدون انصراف'}</span></div>`;
    }).join('') : '<div class="muted small">لا توجد سجلات بعد</div>'}</div>
    <div class="center small muted">الرمز: <span class="ltr">${esc(code)}</span></div>
  </div>`;
  const tick = () => { const c = $('#clk'); if (c) c.textContent = fmtTime(new Date()); };
  tick(); clockT = setInterval(tick, 10000);
  $('#rf').onclick = empHome;
  if (state !== 'done') $('#fp').onclick = () => punch(state, emp, settings);
}

async function punch(kind, emp, settings) {
  if (!navigator.onLine) return toast('لا يوجد اتصال بالإنترنت', 'bad');
  if (!settings || settings.lat == null) return toast('المدير لم يحدد موقع العمل بعد', 'bad');
  const b = await bio(kind === 'in' ? 'بصمة الحضور' : 'بصمة الانصراف');
  if (!b.ok) { if (!b.cancel) toast(b.error || 'فشل التحقق من البصمة', 'bad'); return; }
  busy('جاري تحديد موقعك…');
  const loc = await getLoc();
  if (!loc.ok) { busy(false); return toast(loc.error, 'bad'); }
  if (loc.mock) { busy(false); return toast('تم اكتشاف موقع وهمي (Fake GPS). أوقفه وأعد المحاولة.', 'bad'); }
  const d = distM(loc.lat, loc.lng, settings.lat, settings.lng);
  const radius = Number(settings.radius) || 100;
  if (d > radius) {
    busy(false);
    return toast(`أنت خارج موقع العمل — تبعد ${Math.round(d)} م (المسموح ${radius} م)`, 'bad');
  }
  busy('جاري التسجيل…');
  const code = LS.code; const date = ymd(new Date());
  const ref = doc(db, 'attendance', `${code}_${date}`);
  try {
    if (kind === 'in') {
      await setDoc(ref, {
        code, name: emp.name, uid: auth.currentUser.uid, date,
        inTs: serverTimestamp(), inLat: loc.lat, inLng: loc.lng, inAcc: loc.acc, inDist: Math.round(d),
      });
    } else {
      await updateDoc(ref, {
        outTs: serverTimestamp(), outLat: loc.lat, outLng: loc.lng, outAcc: loc.acc, outDist: Math.round(d),
      });
    }
    busy(false);
    toast(kind === 'in' ? 'تم تسجيل الحضور ✓' : 'تم تسجيل الانصراف ✓', 'ok');
    empHome();
  } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
}

// ================= admin =================
function adminLogin() {
  back = () => { welcome(); return true; };
  app.innerHTML = `<div class="hero">
    <div class="logo">${FP_SVG.replace('currentColor', '#fff')}</div>
    <h1>دخول المدير</h1>
    <label>البريد الإلكتروني</label><input id="em" type="email" class="ltr" autocomplete="username">
    <label>كلمة المرور</label><input id="pw" type="password" class="ltr" autocomplete="current-password">
    <button class="btn" id="li">دخول</button>
    <button class="btn alt" id="cr">إنشاء حساب المدير (أول مرة فقط)</button>
    <button class="btn gray" id="bk">رجوع</button>
  </div>`;
  $('#bk').onclick = welcome;
  const creds = () => [$('#em').value.trim(), $('#pw').value];
  $('#li').onclick = async () => {
    busy('جاري الدخول…');
    try {
      if (auth.currentUser) await signOut(auth);
      await signInWithEmailAndPassword(auth, ...creds());
      const a = await getDoc(doc(db, 'admins', auth.currentUser.uid));
      if (!a.exists()) { await signOut(auth); throw 'هذا الحساب ليس مديراً'; }
      LS.role = 'admin'; LS.code = null; busy(false); adminHome();
    } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
  $('#cr').onclick = async () => {
    const [em, pw] = creds();
    if (!em || pw.length < 6) return toast('أدخل بريداً وكلمة مرور (6 أحرف على الأقل)', 'bad');
    busy('جاري الإنشاء…');
    try {
      if (auth.currentUser) await signOut(auth);
      const { user } = await createUserWithEmailAndPassword(auth, em, pw);
      try {
        const bt = writeBatch(db);
        bt.set(doc(db, 'meta', 'owner'), { uid: user.uid, email: em });
        bt.set(doc(db, 'admins', user.uid), { email: em });
        await bt.commit();
      } catch (e) {
        await deleteUser(user).catch(() => {});
        throw 'يوجد مدير مسجّل مسبقاً لهذا النظام';
      }
      await setDoc(doc(db, 'settings', 'main'), {
        place: 'مكان العمل', lat: null, lng: null, radius: 100, start: '08:00', end: '16:00', grace: 10,
      });
      LS.role = 'admin'; busy(false); toast('تم إنشاء حساب المدير ✓', 'ok');
      adminHome('settings');
    } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
}

let tab = 'today';
async function adminHome(t) {
  if (t) tab = t;
  back = () => { if (tab !== 'today') { adminHome('today'); return true; } return false; };
  const tabs = [['today', 'اليوم'], ['emps', 'الموظفين'], ['rep', 'التقارير'], ['settings', 'الإعدادات']];
  app.innerHTML = `
  <div class="top" style="padding-bottom:30px"><div class="topbar"><div><h1>لوحة المدير</h1>
  <div class="sub">${longDate(new Date())}</div></div><button class="icon-btn" id="lo">خروج</button></div></div>
  <div class="tabs">${tabs.map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div>
  <div class="wrap" id="pane"><div class="center muted">جاري التحميل…</div></div>`;
  app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => adminHome(b.dataset.t)));
  $('#lo').onclick = async () => { await signOut(auth); LS.role = null; welcome(); };
  try {
    await ({ today: paneToday, emps: paneEmps, rep: paneRep, settings: paneSettings }[tab])($('#pane'));
  } catch (err) { $('#pane').innerHTML = `<div class="card center">${esc(fbErr(err))}</div>`; }
}

async function getEmps() {
  const s = await getDocs(collection(db, 'employees'));
  return s.docs.map((d) => d.data()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
function lateMin(inT, settings) {
  if (!inT || !settings) return 0;
  return Math.max(0, minOfDay(inT) - hm2min(settings.start) - (Number(settings.grace) || 0));
}

async function paneToday(p) {
  const today = ymd(new Date());
  const [emps, settings, as] = await Promise.all([
    getEmps(), loadSettings(), getDocs(query(collection(db, 'attendance'), where('date', '==', today))),
  ]);
  const recs = {}; as.docs.forEach((d) => { recs[d.data().code] = d.data(); });
  const act = emps.filter((e) => e.active);
  let cIn = 0, cOut = 0, cLate = 0, cAbs = 0;
  const rows = act.map((e) => {
    const r = recs[e.code]; const i = tsDate(r?.inTs), o = tsDate(r?.outTs);
    const lt = lateMin(i, settings);
    let pill;
    if (!r) { cAbs++; pill = '<span class="pill p-bad">لم يحضر</span>'; }
    else if (!o) { cIn++; pill = '<span class="pill p-ok">داخل الدوام</span>'; }
    else { cOut++; pill = '<span class="pill p-gray">انصرف</span>'; }
    if (lt > 0) cLate++;
    return { r, html: `<div class="item"><div><div class="nm">${esc(e.name)}</div>
      <div class="small muted">${r ? `حضور ${fmtTime(i)}${o ? ` · انصراف ${fmtTime(o)}` : ''}` : '—'}</div></div>
      <div style="text-align:left">${pill}${lt > 0 ? `<div><span class="pill p-warn">تأخير ${lt} د</span></div>` : ''}</div></div>` };
  }).sort((a, b) => (!!b.r - !!a.r));
  p.innerHTML = `
    ${settings?.lat == null ? '<div class="card" style="background:#FEF3C7">⚠️ لم تحدد موقع العمل بعد. اذهب إلى «الإعدادات».</div>' : ''}
    <div class="stat" style="margin-bottom:12px">
      <div><b style="color:var(--ok)">${cIn}</b><small>داخل</small></div>
      <div><b>${cOut}</b><small>انصرف</small></div>
      <div><b style="color:var(--warn)">${cLate}</b><small>متأخر</small></div>
      <div><b style="color:var(--bad)">${cAbs}</b><small>غائب</small></div>
    </div>
    <div class="card"><div class="topbar"><h3 style="margin:0">حضور اليوم</h3><button class="btn sm gray" id="rf">تحديث</button></div>
    ${rows.length ? rows.map((x) => x.html).join('') : '<div class="muted small" style="margin-top:8px">لا يوجد موظفون. أضفهم من «الموظفين».</div>'}</div>`;
  $('#rf').onclick = () => adminHome('today');
}

async function paneEmps(p) {
  const emps = await getEmps();
  p.innerHTML = `
  <div class="card"><h3>إضافة موظف</h3>
    <input id="nm" placeholder="اسم الموظف">
    <button class="btn" id="add">إضافة وإنشاء رمز</button></div>
  <div class="card"><h3>الموظفون (${emps.length})</h3>
  ${emps.map((e) => `<div class="item" style="flex-wrap:wrap"><div style="flex:1;min-width:60%">
      <div class="nm">${esc(e.name)} ${e.active ? '' : '<span class="pill p-bad">موقوف</span>'}</div>
      <div style="margin-top:4px"><span class="code">${esc(e.code)}</span>
      ${e.uid ? `<span class="pill p-ok">مربوط</span>` : '<span class="pill p-gray">غير مربوط</span>'}</div>
      ${e.device ? `<div class="small muted ltr" style="text-align:right">${esc(e.device)}</div>` : ''}
    </div>
    <div style="width:100%">
      <button class="btn sm" data-a="share" data-c="${e.code}">مشاركة الرمز</button>
      ${e.uid ? `<button class="btn sm gray" data-a="unbind" data-c="${e.code}">فك الربط</button>` : ''}
      <button class="btn sm gray" data-a="toggle" data-c="${e.code}">${e.active ? 'إيقاف' : 'تفعيل'}</button>
      <button class="btn sm red" data-a="del" data-c="${e.code}">حذف</button>
    </div></div>`).join('') || '<div class="muted small">لا يوجد موظفون بعد</div>'}</div>`;

  $('#add').onclick = async () => {
    const name = $('#nm').value.trim();
    if (!name) return toast('اكتب اسم الموظف', 'bad');
    busy('جاري الإضافة…');
    try {
      let code, tries = 0;
      do { code = genCode(); tries++; } while ((await getDoc(doc(db, 'employees', code))).exists() && tries < 5);
      await setDoc(doc(db, 'employees', code), {
        code, name, active: true, uid: null, deviceId: null, device: null, createdAt: serverTimestamp(),
      });
      busy(false); toast(`تمت الإضافة — الرمز ${code}`, 'ok'); adminHome('emps');
    } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
  p.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
    const e = emps.find((x) => x.code === b.dataset.c); const ref = doc(db, 'employees', e.code);
    try {
      if (b.dataset.a === 'share') {
        return shareText(`مرحباً ${e.name}\nثبّت تطبيق «بصمة» واختر «أنا موظف» وأدخل الرمز:\n${e.code}`);
      }
      if (b.dataset.a === 'unbind') {
        if (!confirm(`فك ربط موبايل ${e.name}؟ سيحتاج لإدخال الرمز مرة أخرى.`)) return;
        await updateDoc(ref, { uid: null, deviceId: null, device: null });
      }
      if (b.dataset.a === 'toggle') await updateDoc(ref, { active: !e.active });
      if (b.dataset.a === 'del') {
        if (!confirm(`حذف ${e.name}؟ (سجلات حضوره السابقة تبقى)`)) return;
        await deleteDoc(ref);
      }
      adminHome('emps');
    } catch (err) { toast(fbErr(err), 'bad'); }
  }));
}

async function paneRep(p) {
  const now = new Date();
  const from0 = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const emps = await getEmps();
  p.innerHTML = `
  <div class="card"><h3>تقرير الحضور</h3>
    <div class="row"><div><label>من</label><input type="date" id="f" value="${from0}"></div>
    <div><label>إلى</label><input type="date" id="t" value="${ymd(now)}"></div></div>
    <label>الموظف</label><select id="e"><option value="">الكل</option>${emps.map((e) => `<option value="${e.code}">${esc(e.name)}</option>`).join('')}</select>
    <button class="btn" id="go">عرض</button></div>
  <div id="res"></div>`;
  $('#go').onclick = async () => {
    const f = $('#f').value, t = $('#t').value, ec = $('#e').value;
    if (!f || !t || f > t) return toast('تحقق من التواريخ', 'bad');
    busy('جاري التحميل…');
    try {
      const [settings, s] = await Promise.all([loadSettings(), getDocs(query(collection(db, 'attendance'), where('date', '>=', f), where('date', '<=', t)))]);
      let recs = s.docs.map((d) => d.data()); if (ec) recs = recs.filter((r) => r.code === ec);
      recs.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, 'ar') : a.date < b.date ? -1 : 1));
      const sum = {};
      const rows = recs.map((r) => {
        const i = tsDate(r.inTs), o = tsDate(r.outTs); const dur = i && o ? (o - i) / 60000 : null; const lt = lateMin(i, settings);
        const k = r.code; sum[k] = sum[k] || { name: r.name, days: 0, min: 0, late: 0, lateMin: 0, noOut: 0 };
        sum[k].days++; if (dur) sum[k].min += dur; else sum[k].noOut++; if (lt > 0) { sum[k].late++; sum[k].lateMin += lt; }
        return { r, i, o, dur, lt };
      });
      busy(false);
      const sums = Object.values(sum);
      $('#res').innerHTML = `
      <div class="card"><h3>الملخّص</h3><div class="scroll-x"><table><tr><th>الاسم</th><th>أيام</th><th>ساعات</th><th>تأخير</th><th>بلا انصراف</th></tr>
      ${sums.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.days}</td><td>${fmtDur(x.min)}</td><td>${x.late} (${x.lateMin}د)</td><td>${x.noOut}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا توجد بيانات</td></tr>'}
      </table></div><button class="btn" id="csv" ${rows.length ? '' : 'disabled'}>تصدير Excel (CSV)</button></div>
      <div class="card"><h3>التفاصيل (${rows.length})</h3><div class="scroll-x"><table><tr><th>التاريخ</th><th>الاسم</th><th>حضور</th><th>انصراف</th><th>المدة</th></tr>
      ${rows.map((x) => `<tr><td class="ltr">${x.r.date.slice(5)}</td><td>${esc(x.r.name)}${x.lt > 0 ? ` <span class="pill p-warn">${x.lt}د</span>` : ''}</td><td>${fmtTime(x.i)}</td><td>${fmtTime(x.o)}</td><td>${fmtDur(x.dur)}</td></tr>`).join('')}
      </table></div></div>`;
      const c = $('#csv'); if (c) c.onclick = () => {
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [['التاريخ', 'الاسم', 'الرمز', 'وقت الحضور', 'وقت الانصراف', 'المدة (دقيقة)', 'التأخير (دقيقة)', 'مسافة الحضور (م)', 'مسافة الانصراف (م)'].map(q).join(',')];
        rows.forEach((x) => lines.push([x.r.date, x.r.name, x.r.code, fmtTime(x.i), x.o ? fmtTime(x.o) : '', x.dur ? Math.round(x.dur) : '', x.lt || 0, x.r.inDist ?? '', x.r.outDist ?? ''].map(q).join(',')));
        shareFile(`attendance_${f}_${t}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
      };
    } catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
  $('#go').click();
}

async function paneSettings(p) {
  const s = (await loadSettings()) || { place: '', lat: null, lng: null, radius: 100, start: '08:00', end: '16:00', grace: 10 };
  let lat = s.lat, lng = s.lng;
  const locTxt = () => (lat == null ? '<span class="pill p-bad">غير محدد</span>'
    : `<span class="ltr small">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>`);
  p.innerHTML = `
  <div class="card"><h3>موقع العمل</h3>
    <label>اسم المكان</label><input id="pl" value="${esc(s.place)}">
    <label>الإحداثيات</label><div id="ll">${locTxt()}</div>
    <button class="btn alt" id="here">📍 تحديد موقع العمل من موقعي الحالي</button>
    <div class="small muted" style="margin-top:6px">قف داخل مكان العمل واضغط الزر.</div>
    <label>نطاق السماح (متر)</label><input id="rd" type="number" inputmode="numeric" value="${esc(s.radius)}">
  </div>
  <div class="card"><h3>الدوام</h3>
    <div class="row"><div><label>بداية الدوام</label><input id="st" type="time" value="${esc(s.start)}"></div>
    <div><label>نهاية الدوام</label><input id="en" type="time" value="${esc(s.end)}"></div></div>
    <label>فترة السماح بالتأخير (دقيقة)</label><input id="gr" type="number" inputmode="numeric" value="${esc(s.grace)}">
    <button class="btn" id="sv">حفظ الإعدادات</button>
  </div>
  <div class="center small muted">حساب المدير: <span class="ltr">${esc(auth.currentUser?.email || '')}</span></div>`;
  $('#here').onclick = async () => {
    busy('جاري تحديد الموقع…'); const l = await getLoc(); busy(false);
    if (!l.ok) return toast(l.error, 'bad');
    lat = l.lat; lng = l.lng; $('#ll').innerHTML = locTxt() + ` <span class="small muted">(دقة ±${Math.round(l.acc)} م)</span>`;
    toast('تم التقاط الموقع — اضغط «حفظ»');
  };
  $('#sv').onclick = async () => {
    const data = {
      place: $('#pl').value.trim(), lat, lng,
      radius: Math.max(20, Number($('#rd').value) || 100),
      start: $('#st').value || '08:00', end: $('#en').value || '16:00',
      grace: Math.max(0, Number($('#gr').value) || 0),
    };
    busy('جاري الحفظ…');
    try { await setDoc(doc(db, 'settings', 'main'), data); busy(false); toast('تم الحفظ ✓', 'ok'); }
    catch (err) { busy(false); toast(fbErr(err), 'bad'); }
  };
}

// ================= boot =================
(async () => {
  try { await auth.authStateReady(); } catch (e) { /* ignore */ }
  const u = auth.currentUser;
  if (LS.role === 'emp' && u && u.isAnonymous && LS.code) return empHome();
  if (LS.role === 'admin' && u && !u.isAnonymous) {
    try {
      const a = await getDoc(doc(db, 'admins', u.uid));
      if (a.exists()) return adminHome();
    } catch (e) { /* fallthrough */ }
  }
  welcome();
})();
