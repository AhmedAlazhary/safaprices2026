import {
  auth, db, onAuthStateChanged, signOut, doc, getDoc, getDocs,
  collection, query, orderBy, limit, serverTimestamp, runTransaction
} from '../firebase-config.js';

const ADMIN_EMAILS = new Set([
  'ahmed@safatrans.com', 'hesham@safatrans.com',
  'omar@safatrans.com', 'sabry@safatrans.com'
]);
const MAX_DESTINATIONS = 150;
const $ = (selector) => document.querySelector(selector);
const state = {
  user: null, rows: [], baselineRows: [], draftMeta: null,
  activeRelease: null, versions: [], importRows: [], importSource: '',
  importIssues: [], importColumns: [], importHeaders: [],
  restoringFrom: null, busy: false
};

const draftRef = doc(db, 'clientPriceDrafts', 'current');
const controlRef = doc(db, 'clientPriceControl', 'current');
const rowsRef = collection(db, 'clientPriceDrafts', 'current', 'destinations');

function showMessage(message, tone = 'info') {
  const el = $('#appMessage');
  el.textContent = message;
  el.className = `notice ${tone === 'error' ? 'notice-error' : ''}`;
  el.hidden = false;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => { el.hidden = true; }, 6500);
}

function setBusy(value, message) {
  state.busy = value;
  for (const id of ['addDestinationButton', 'saveDraftButton', 'previewButton', 'publishButton']) {
    const button = document.getElementById(id);
    if (button) button.disabled = value;
  }
  if (message) showMessage(message, value ? 'info' : 'error');
}

function normalizeName(value) {
  return String(value || '').trim().toLocaleLowerCase('ar-EG')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[\s\-ـ]+/g, ' ');
}

function slugId() { return `destination-${crypto.randomUUID()}`; }

function cloneRows(rows) {
  return rows.map((row) => ({
    destinationId: row.destinationId,
    name: row.name || '',
    light8t20ft: row.light8t20ft ?? '',
    container40ft: row.container40ft ?? '',
    two20ft: row.two20ft ?? '',
    lat: row.lat ?? '', lng: row.lng ?? '',
    coordinateSource: row.coordinateSource || '',
    coordinatesVerified: row.coordinatesVerified === true
  }));
}

function isDirty() {
  const stable = (rows) => rows.map((r) => ({
    destinationId: r.destinationId, name: String(r.name).trim(),
    light8t20ft: Number(r.light8t20ft), container40ft: Number(r.container40ft),
    two20ft: Number(r.two20ft), lat: r.coordinatesVerified ? Number(r.lat) : null,
    lng: r.coordinatesVerified ? Number(r.lng) : null,
    coordinateSource: r.coordinatesVerified ? String(r.coordinateSource).trim() : ''
  })).sort((a, b) => a.destinationId.localeCompare(b.destinationId));
  return JSON.stringify(stable(state.rows)) !== JSON.stringify(stable(state.baselineRows));
}

function readRolePermission(roleData) {
  return roleData?.pages?.client_prices || '';
}

async function checkEditor(user) {
  const email = String(user.email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.has(email)) return true;
  const roleSnapshot = await getDoc(doc(db, 'user_roles', user.uid));
  if (!roleSnapshot.exists()) return false;
  const roleData = roleSnapshot.data();
  return roleData.role === 'admin' || readRolePermission(roleData) === 'edit';
}

function makeRow(data = {}) {
  return {
    destinationId: data.destinationId || crypto.randomUUID(),
    name: data.name || '',
    light8t20ft: data.light8t20ft ?? '',
    container40ft: data.container40ft ?? '',
    two20ft: data.two20ft ?? '',
    lat: data.lat ?? '', lng: data.lng ?? '',
    coordinateSource: data.coordinateSource || '',
    coordinatesVerified: data.coordinatesVerified === true
  };
}

function parsePositivePrice(value) {
  const number = parseLocalizedNumber(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseLocalizedNumber(value) {
  const normalized = String(value ?? '').trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

function validateRows(rows) {
  const errors = [];
  if (!rows.length) errors.push('أضف وجهة واحدة على الأقل.');
  if (rows.length > MAX_DESTINATIONS) errors.push(`الحد الأقصى ${MAX_DESTINATIONS} وجهة في المسودة.`);
  const names = new Set();
  for (const [index, row] of rows.entries()) {
    const label = row.name.trim() || `السطر ${index + 1}`;
    const key = normalizeName(row.name);
    if (!key) errors.push(`${label}: اسم الوجهة مطلوب.`);
    else if (names.has(key)) errors.push(`${label}: الوجهة مكررة.`);
    names.add(key);
    for (const [field, title] of [
      ['light8t20ft', 'خفيف 8 طن / 20 قدم'],
      ['container40ft', '40 قدم'], ['two20ft', 'حاويتان 20 قدم']
    ]) {
      if (parsePositivePrice(row[field]) === null) errors.push(`${label}: أدخل سعرًا صحيحًا لـ${title}.`);
    }
    const hasSomeCoordinates = String(row.lat).trim() || String(row.lng).trim() || String(row.coordinateSource).trim();
    if (hasSomeCoordinates) {
      const lat = Number(row.lat); const lng = Number(row.lng);
      if (!row.coordinatesVerified || !row.coordinateSource.trim()) {
        errors.push(`${label}: أكّد الإحداثيات واذكر مصدرها، أو امسحها لتبقى الوجهة خارج الخريطة.`);
      } else if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.push(`${label}: الإحداثيات خارج النطاق الجغرافي الصحيح.`);
      }
    }
  }
  return errors;
}

function rowToDraft(row, uid, timestamp = serverTimestamp()) {
  const data = {
    destinationId: row.destinationId,
    name: row.name.trim(),
    light8t20ft: parsePositivePrice(row.light8t20ft),
    container40ft: parsePositivePrice(row.container40ft),
    two20ft: parsePositivePrice(row.two20ft),
    currency: 'EGP', updatedAt: timestamp, updatedBy: uid
  };
  if (row.coordinatesVerified) {
    data.lat = Number(row.lat); data.lng = Number(row.lng);
    data.coordinateSource = row.coordinateSource.trim();
    data.coordinatesVerified = true;
  }
  return data;
}

function rowToPublic(row, version) {
  const data = {
    destinationId: row.destinationId,
    name: row.name.trim(),
    light8t20ft: parsePositivePrice(row.light8t20ft),
    container40ft: parsePositivePrice(row.container40ft),
    two20ft: parsePositivePrice(row.two20ft),
    currency: 'EGP', publishedAt: serverTimestamp(), version
  };
  if (row.coordinatesVerified) { data.lat = Number(row.lat); data.lng = Number(row.lng); }
  return data;
}

function renderRows() {
  const body = $('#destinationRows');
  const search = normalizeName($('#destinationSearch').value);
  body.replaceChildren();
  const visible = state.rows.filter((row) => !search || normalizeName(row.name).includes(search));
  $('#emptyState').hidden = state.rows.length > 0;
  for (const row of visible) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.innerHTML = `<input class="name-input" data-field="name" data-id="${row.destinationId}" aria-label="اسم الوجهة" maxlength="120">`;
    name.querySelector('input').value = row.name;
    tr.append(name);
    for (const [field, label] of [
      ['light8t20ft', 'سعر الخفيف 8 طن / 20 قدم'],
      ['container40ft', 'سعر حاوية 40 قدم'], ['two20ft', 'سعر حاويتين 20 قدم']
    ]) {
      const td = document.createElement('td');
      td.innerHTML = `<input class="price-input" inputmode="decimal" data-field="${field}" data-id="${row.destinationId}" aria-label="${label}" placeholder="EGP">`;
      td.querySelector('input').value = row[field];
      tr.append(td);
    }
    const geo = document.createElement('td');
    const verified = row.coordinatesVerified && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
    geo.innerHTML = `<details class="coordinate-details" data-id="${row.destinationId}">
      <summary class="map-status ${verified ? 'is-ready' : ''}">${verified ? 'معتمدة · تظهر بالخريطة' : 'غير محددة · تبقى بالحاسبة'}</summary>
      <div class="coordinate-fields">
        <label>خط العرض <input inputmode="decimal" data-field="lat" data-id="${row.destinationId}" placeholder="lat"></label>
        <label>خط الطول <input inputmode="decimal" data-field="lng" data-id="${row.destinationId}" placeholder="lng"></label>
        <label class="source-field">مصدر التحقق <input data-field="coordinateSource" data-id="${row.destinationId}" placeholder="مصدر موثوق"></label>
        <label class="verify-field"><input type="checkbox" data-field="coordinatesVerified" data-id="${row.destinationId}" ${row.coordinatesVerified ? 'checked' : ''}> أؤكد أن الإحداثيات موثوقة</label>
      </div>
    </details>`;
    for (const [field, value] of [['lat', row.lat], ['lng', row.lng], ['coordinateSource', row.coordinateSource]]) {
      geo.querySelector(`[data-field="${field}"]`).value = value;
    }
    tr.append(geo);
    const action = document.createElement('td');
    action.innerHTML = `<button class="delete-row" data-delete="${row.destinationId}" type="button">حذف</button>`;
    tr.append(action);
    body.append(tr);
  }
  $('#saveDraftButton').disabled = state.busy || !isDirty();
  $('#publishButton').disabled = state.busy || !state.rows.length || isDirty();
  $('#draftStatus').textContent = isDirty() ? 'تغييرات غير محفوظة' : (state.draftMeta ? 'مسودة محفوظة' : 'مسودة فارغة');
}

function renderRelease() {
  const published = state.activeRelease;
  const pill = $('#draftStatus');
  if (!published) {
    $('#publishedStatus').textContent = 'لا يوجد إصدار منشور بعد';
    $('#releaseSummary').textContent = 'لا يوجد إصدار منشور. يمكنك مراجعة المسودة ثم نشرها.';
    pill.classList.remove('is-published');
    return;
  }
  $('#publishedStatus').textContent = `الإصدار ${published.version} · ${formatDate(published.publishedAt)}`;
  $('#releaseSummary').textContent = `الإصدار النشط ${published.version} · ${published.currency || 'EGP'} · ${formatDate(published.publishedAt)}.`;
  pill.classList.add('is-published');
}

function renderHistory() {
  const box = $('#versionHistory');
  box.replaceChildren();
  if (!state.versions.length) { box.innerHTML = '<p class="muted">لا توجد إصدارات محفوظة بعد.</p>'; return; }
  for (const version of state.versions) {
    const row = document.createElement('div'); row.className = 'version-item';
    const copy = document.createElement('div'); copy.className = 'version-title';
    copy.innerHTML = `<strong>الإصدار ${Number(version.version) || '—'} ${state.activeRelease?.activeVersionId === version.id ? '· نشط' : ''}</strong><span>${formatDate(version.createdAt)} · ${version.destinationCount} وجهة</span>`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-outline';
    button.dataset.restore = version.id; button.textContent = 'استعادة كمسودة';
    row.append(copy, button); box.append(row);
  }
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : (value instanceof Date ? value : null);
  return date ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'الآن';
}

async function loadData() {
  setBusy(true);
  try {
    const [draftSnapshot, rowsSnapshot, controlSnapshot, historySnapshot] = await Promise.all([
      getDoc(draftRef), getDocs(rowsRef), getDoc(controlRef),
      getDocs(query(collection(db, 'clientPriceVersionMeta'), orderBy('version', 'desc'), limit(30)))
    ]);
    state.draftMeta = draftSnapshot.exists() ? draftSnapshot.data() : null;
    state.baselineDraftTimestamp = state.draftMeta?.updatedAt || null;
    state.rows = rowsSnapshot.docs.map((snapshot) => makeRow(snapshot.data()));
    state.baselineRows = cloneRows(state.rows);
    state.activeRelease = controlSnapshot.exists() ? { id: 'current', ...controlSnapshot.data() } : null;
    state.versions = historySnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    renderRows(); renderRelease(); renderHistory();
  } finally {
    setBusy(false);
    renderRows();
  }
}

function addDestination(data) {
  state.rows.push(makeRow(data || { destinationId: slugId('وجهة جديدة'), name: '', light8t20ft: '', container40ft: '', two20ft: '' }));
  renderRows();
  const last = $('#destinationRows tr:last-child .name-input');
  last?.focus(); last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function rowPublicComparable(row) {
  return {
    destinationId: row.destinationId, name: row.name.trim(),
    light8t20ft: parsePositivePrice(row.light8t20ft),
    container40ft: parsePositivePrice(row.container40ft),
    two20ft: parsePositivePrice(row.two20ft),
    currency: 'EGP', lat: row.coordinatesVerified ? Number(row.lat) : null,
    lng: row.coordinatesVerified ? Number(row.lng) : null
  };
}

function makeChangeEvents(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [row.destinationId, row]));
  const after = new Map(afterRows.map((row) => [row.destinationId, row]));
  const events = [];
  for (const [id, oldRow] of before) {
    if (!after.has(id)) events.push({ action: 'destination_deleted', destinationId: id, before: rowPublicComparable(oldRow) });
  }
  for (const [id, newRow] of after) {
    const oldRow = before.get(id);
    if (!oldRow) events.push({ action: 'destination_added', destinationId: id, after: rowPublicComparable(newRow) });
    else if (JSON.stringify(rowPublicComparable(oldRow)) !== JSON.stringify(rowPublicComparable(newRow))) {
      events.push({ action: 'destination_updated', destinationId: id, before: rowPublicComparable(oldRow), after: rowPublicComparable(newRow) });
    }
  }
  return events;
}

async function saveDraft() {
  const errors = validateRows(state.rows);
  if (errors.length) { showMessage(errors.slice(0, 4).join(' '), 'error'); return; }
  if (!state.user) { showMessage('انتهت جلسة المستخدم. سجّل الدخول مرة أخرى.', 'error'); return; }
  const changes = makeChangeEvents(state.baselineRows, state.rows);
  const revisionId = doc(collection(db, 'clientPriceDraftRevisions')).id;
  const revisionMetaRef = doc(db, 'clientPriceDraftRevisions', revisionId);
  const baselineIds = new Set(state.baselineRows.map((row) => row.destinationId));
  const nextIds = new Set(state.rows.map((row) => row.destinationId));
  const revisionIdForAudit = state.restoringFrom;
  setBusy(true);
  try {
    await runTransaction(db, async (transaction) => {
      const currentDraft = await transaction.get(draftRef);
      const currentUpdatedAt = currentDraft.exists() ? currentDraft.data().updatedAt : null;
      const baseline = state.baselineDraftTimestamp;
      const unchanged = (!baseline && !currentUpdatedAt) || (baseline && currentUpdatedAt && baseline.isEqual(currentUpdatedAt));
      if (!unchanged) throw new Error('تغيرت المسودة من مستخدم آخر. أعد تحميلها قبل الحفظ.');

      const stamp = serverTimestamp();
      transaction.set(draftRef, {
        baseVersion: state.activeRelease?.version || 0,
        destinationCount: state.rows.length, updatedAt: stamp, updatedBy: state.user.uid
      });
      for (const row of state.rows) {
        const data = rowToDraft(row, state.user.uid, stamp);
        transaction.set(doc(db, 'clientPriceDrafts', 'current', 'destinations', row.destinationId), data);
        transaction.set(doc(db, 'clientPriceDraftRevisions', revisionId, 'destinations', row.destinationId), data);
      }
      for (const oldRow of state.baselineRows) {
        if (!nextIds.has(oldRow.destinationId)) {
          transaction.delete(doc(db, 'clientPriceDrafts', 'current', 'destinations', oldRow.destinationId));
        }
      }
      transaction.set(revisionMetaRef, {
        createdAt: stamp, createdBy: state.user.uid, destinationCount: state.rows.length,
        source: state.importSource || 'manual', baseVersion: state.activeRelease?.version || 0
      });
      if (!changes.length) changes.push({ action: 'draft_saved' });
      if (revisionIdForAudit) changes.push({ action: 'restored', sourceFile: revisionIdForAudit });
      if (state.importSource) changes.push({ action: 'import_applied', sourceFile: state.importSource, rowCount: state.rows.length });
      for (const change of changes) {
        const eventRef = doc(collection(db, 'clientPriceAudit'));
        transaction.set(eventRef, { ...change, createdAt: stamp, createdBy: state.user.uid });
      }
    });
    state.baselineRows = cloneRows(state.rows);
    state.restoringFrom = null; state.importSource = '';
    await loadData();
    showMessage('تم حفظ المسودة وسجل التغييرات. لم تُنشر الأسعار بعد.');
  } catch (error) {
    showMessage(error.message || 'تعذر حفظ المسودة. تحقق من الاتصال والصلاحية.', 'error');
  } finally { setBusy(false); renderRows(); }
}

async function publishRelease() {
  if (isDirty()) { showMessage('احفظ المسودة أولًا، ثم راجع الإصدار قبل النشر.', 'error'); return; }
  const errors = validateRows(state.rows);
  if (errors.length) { showMessage(errors.slice(0, 4).join(' '), 'error'); return; }
  if (state.rows.length > MAX_DESTINATIONS) { showMessage(`لا يمكن أن يتجاوز الإصدار ${MAX_DESTINATIONS} وجهة.`, 'error'); return; }
  setBusy(true);
  try {
    const versionId = doc(collection(db, 'clientPriceVersionMeta')).id;
    const metaRef = doc(db, 'clientPriceVersionMeta', versionId);
    const draftDestinationsRef = collection(db, 'clientPriceDrafts', 'current', 'destinations');
    await runTransaction(db, async (transaction) => {
      const controlSnapshot = await transaction.get(controlRef);
      const draftSnapshot = await transaction.get(draftRef);
      const version = (controlSnapshot.exists() ? controlSnapshot.data().version : 0) + 1;
      if (draftSnapshot.exists() && state.baselineDraftTimestamp && !draftSnapshot.data().updatedAt.isEqual(state.baselineDraftTimestamp)) {
        throw new Error('تغيرت المسودة أثناء المراجعة. أعد تحميل البيانات قبل النشر.');
      }
      const draftDocuments = await Promise.all(state.rows.map((row) => transaction.get(doc(draftDestinationsRef, row.destinationId))));
      for (let index = 0; index < draftDocuments.length; index++) {
        if (!draftDocuments[index].exists()) throw new Error('توجد وجهة لم تُحفظ في المسودة. احفظ المسودة ثم أعد المحاولة.');
        const source = draftDocuments[index].data();
        const expected = rowPublicComparable(state.rows[index]);
        const actual = {
          destinationId: source.destinationId, name: source.name,
          light8t20ft: source.light8t20ft, container40ft: source.container40ft,
          two20ft: source.two20ft, currency: source.currency,
          lat: source.lat ?? null, lng: source.lng ?? null
        };
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error('المسودة تغيّرت بعد تحميلها. أعد التحميل قبل النشر.');
        }
      }
      const stamp = serverTimestamp();
      for (const row of state.rows) {
        const destinationRef = doc(db, 'clientPriceVersions', versionId, 'destinations', row.destinationId);
        const publicDestination = rowToPublic(row, version);
        transaction.set(destinationRef, publicDestination);
        transaction.set(doc(db, 'publicClientPriceVersions', versionId, 'destinations', row.destinationId), publicDestination);
      }
      transaction.set(metaRef, {
        version, createdAt: stamp, createdBy: state.user.uid,
        destinationCount: state.rows.length,
        sourceDraftRevisionId: state.restoringFrom || 'current',
        ...(state.restoringFrom ? { restoredFrom: state.restoringFrom } : {})
      });
      transaction.set(controlRef, {
        activeVersionId: versionId, version, currency: 'EGP', publishedAt: stamp
      });
      transaction.set(doc(collection(db, 'clientPriceAudit')), {
        action: 'published', createdAt: stamp, createdBy: state.user.uid,
        version, rowCount: state.rows.length
      });
    });
    state.restoringFrom = null;
    await loadData();
    showMessage('تم نشر الإصدار كاملًا. لم يتم إرسال أي طلب إلى المكتب.');
  } catch (error) {
    showMessage(error.message || 'تعذر النشر. لم يتغير مؤشر الإصدار النشط.', 'error');
  } finally { setBusy(false); renderRows(); }
}

async function restoreVersion(versionId) {
  if (isDirty() && !window.confirm('لديك تغييرات غير محفوظة. هل تريد تجاهلها واستعادة الإصدار؟')) return;
  if (!window.confirm('سيُنسخ الإصدار إلى المسودة. لن يُنشر قبل أن تحفظه وتنشره يدويًا.')) return;
  setBusy(true);
  try {
    const snapshot = await getDocs(collection(db, 'clientPriceVersions', versionId, 'destinations'));
    state.rows = snapshot.docs.map((item) => makeRow({ ...item.data(), coordinatesVerified: item.data().lat !== undefined && item.data().lng !== undefined, coordinateSource: 'استعادة من إصدار منشور' }));
    state.restoringFrom = versionId;
    state.importSource = '';
    renderRows();
    showMessage(`تم تحميل الإصدار إلى المحرر كمسودة غير محفوظة. اضغط «حفظ المسودة» للمراجعة.`);
  } catch (error) { showMessage('تعذرت قراءة الإصدار السابق.', 'error'); }
  finally { setBusy(false); renderRows(); }
}

function openPreview() {
  const body = $('#previewRows'); body.replaceChildren();
  for (const row of state.rows) {
    const tr = document.createElement('tr');
    for (const value of [row.name, formatPrice(row.light8t20ft), formatPrice(row.container40ft), formatPrice(row.two20ft)]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    body.append(tr);
  }
  $('#previewDialog').showModal();
}

function formatPrice(value) {
  const amount = parsePositivePrice(value);
  return amount === null ? '—' : new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(amount);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) { if (window.XLSX) resolve(); else existing.addEventListener('load', resolve, { once: true }); return; }
    const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
}

const HEADER_PATTERNS = {
  name: [/الوجهة/, /المحافظة/, /المكان/, /destination/i, /place/i, /location/i],
  light8t20ft: [/خفيف/, /٨\s*طن/, /8\s*طن/i, /20\s*قدم/, /20\s*ft/i, /c20/i],
  container40ft: [/40\s*قدم/, /40\s*ft/i, /c40/i],
  two20ft: [/2\s*[×x*]\s*20/i, /حاويتين/, /حاويتان/, /2\s*حاوية/, /2\s*\*\s*20/i, /2x20/i]
};

function detectHeader(headers, type) {
  return headers.findIndex((header) => {
    const value = String(header || '').trim();
    if (type === 'light8t20ft' && HEADER_PATTERNS.two20ft.some((pattern) => pattern.test(value))) return false;
    return HEADER_PATTERNS[type].some((pattern) => pattern.test(value));
  });
}

async function loadImportFile(file) {
  if (!file) return;
  setBusy(true);
  state.importSource = file.name;
  state.importIssues = [];
  try {
    const extension = file.name.split('.').pop().toLowerCase();
    let headers; let rawRows;
    if (['xlsx', 'xls', 'csv'].includes(extension)) {
      if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      headers = (matrix[0] || []).map(String);
      rawRows = matrix.slice(1).filter((row) => row.some((cell) => String(cell).trim() !== ''));
    } else if (extension === 'pdf') {
      ({ headers, rawRows } = await parsePdf(file));
    } else throw new Error('اختر ملف Excel أو PDF صالحًا.');
    state.importHeaders = headers;
    state.importRawRows = rawRows;
    state.importColumns = {
      name: detectHeader(headers, 'name'), light8t20ft: detectHeader(headers, 'light8t20ft'),
      container40ft: detectHeader(headers, 'container40ft'), two20ft: detectHeader(headers, 'two20ft')
    };
    renderColumnMapping();
    buildImportRows();
  } catch (error) {
    showMessage(error.message || 'تعذر قراءة الملف. لم تتغير المسودة أو الأسعار المنشورة.', 'error');
    $('#importPanel').hidden = true;
  } finally { setBusy(false); $('#importFile').value = ''; }
}

async function parsePdf(file) {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    const grouped = new Map();
    for (const item of text.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!grouped.has(y)) grouped.set(y, []);
      grouped.get(y).push({ x: item.transform[4], text: item.str });
    }
    for (const [, parts] of grouped) {
      parts.sort((a, b) => a.x - b.x);
      const line = parts.map((part) => part.text).join(' ').trim();
      if (line) lines.push(line);
    }
  }
  if (lines.join(' ').length < 20) {
    const ocr = await recognizeScannedPdf(pdf, pdfjs);
    lines.push(...ocr);
  }
  const parsed = lines.map(parsePdfLine).filter(Boolean);
  if (!parsed.length) throw new Error('لم أستطع تكوين صفوف مرشحة من الملف. أدخل البيانات يدويًا أو استخدم PDF أوضح.');
  state.importIssues.push('استخرج النظام صفوفًا مرشحة من PDF. راجع ترتيب الأسعار والوجهات يدويًا قبل الدمج.');
  return {
    headers: ['الوجهة', 'خفيف 8 طن / 20 قدم', '40 قدم', '2 × 20 قدم'],
    rawRows: parsed.map((row) => [row.name, row.values[0] || '', row.values[1] || '', row.values[2] || ''])
  };
}

async function recognizeScannedPdf(pdf, pdfjs) {
  const module = await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js');
  const worker = await module.createWorker('ara+eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
    logger: ({ status, progress }) => { if (status === 'recognizing text') $('#importSummary').textContent = `OCR للصفحة… ${Math.round(progress * 100)}٪`; }
  });
  const lines = [];
  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const result = await worker.recognize(canvas);
      if (Number(result.data.confidence) < 82) state.importIssues.push(`دقة OCR منخفضة في الصفحة ${pageNo}; راجع كل الأرقام.`);
      lines.push(...String(result.data.text || '').split(/\r?\n/).filter((line) => line.trim()));
    }
  } finally { await worker.terminate(); }
  state.importIssues.push('تم استخدام OCR محليًا. راجع كل اسم ورقم يدويًا قبل دمج البيانات.');
  return lines;
}

function parsePdfLine(line) {
  const numberPattern = /[0-9٠-٩۰-۹][0-9٠-٩۰-۹,٬.\s]*/g;
  const matches = [...String(line).matchAll(numberPattern)].map((match) => match[0].trim()).filter((value) => parsePositivePrice(value) !== null);
  if (matches.length < 3) return null;
  let name = String(line);
  for (const match of [...String(line).matchAll(numberPattern)].reverse()) name = name.slice(0, match.index) + ' ' + name.slice(match.index + match[0].length);
  name = name.replace(/[|:;–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || /الوجهة|المكان|خفيف|السعر|الإجمالي/.test(name)) return null;
  return { name, values: matches.slice(0, 3) };
}

function renderColumnMapping() {
  const box = $('#columnMapping'); box.replaceChildren();
  const fields = [
    ['name', 'الوجهة'], ['light8t20ft', 'خفيف 8 طن / 20 قدم'],
    ['container40ft', '40 قدم'], ['two20ft', '2 × 20 قدم']
  ];
  for (const [key, title] of fields) {
    const label = document.createElement('label'); label.className = 'mapping-field';
    const caption = document.createElement('span'); caption.textContent = title;
    const select = document.createElement('select'); select.dataset.column = key;
    select.add(new Option('اختر العمود…', '-1'));
    state.importHeaders.forEach((header, index) => select.add(new Option(`${index + 1}. ${header || 'عمود بلا عنوان'}`, String(index))));
    select.value = String(state.importColumns[key] ?? -1);
    select.addEventListener('change', () => { state.importColumns[key] = Number(select.value); buildImportRows(); });
    label.append(caption, select); box.append(label);
  }
  box.hidden = false;
}

function buildImportRows() {
  const mapped = ['name', 'light8t20ft', 'container40ft', 'two20ft'].every((key) => Number.isInteger(state.importColumns[key]) && state.importColumns[key] >= 0);
  if (!mapped) {
    state.importRows = [];
    $('#importSummary').textContent = 'اختر عمودًا لكل حقل. لم يتم حفظ أي بيانات.';
    $('#importPreviewBody').replaceChildren(); $('#importPanel').hidden = false; return;
  }
  state.importRows = state.importRawRows.map((raw, index) => ({
    importId: String(index), name: String(raw[state.importColumns.name] ?? '').trim(),
    light8t20ft: String(raw[state.importColumns.light8t20ft] ?? '').trim(),
    container40ft: String(raw[state.importColumns.container40ft] ?? '').trim(),
    two20ft: String(raw[state.importColumns.two20ft] ?? '').trim()
  }));
  drawImportPreview();
}

function classifyImportRow(row) {
  const errors = [];
  if (!row.name.trim()) errors.push('اسم الوجهة ناقص');
  for (const field of ['light8t20ft', 'container40ft', 'two20ft']) if (parsePositivePrice(row[field]) === null) errors.push('سعر ناقص أو غير صحيح');
  const duplicateCount = state.importRows.filter((candidate) => normalizeName(candidate.name) === normalizeName(row.name)).length;
  if (duplicateCount > 1) errors.push('اسم مكرر داخل الملف');
  if (errors.length) return { label: errors.join(' · '), kind: 'invalid' };
  const current = state.rows.find((candidate) => normalizeName(candidate.name) === normalizeName(row.name));
  if (!current) return { label: 'وجهة جديدة', kind: 'new' };
  const same = ['light8t20ft', 'container40ft', 'two20ft'].every((field) => parsePositivePrice(current[field]) === parsePositivePrice(row[field]));
  return same ? { label: 'مطابقة', kind: '' } : { label: 'سعر متغير', kind: 'changed' };
}

function drawImportPreview() {
  $('#importPanel').hidden = false;
  $('#importIssues').textContent = state.importIssues.join(' ');
  const body = $('#importPreviewBody'); body.replaceChildren();
  const currentNames = new Set(state.rows.map((row) => normalizeName(row.name)));
  const importedNames = new Set(state.importRows.map((row) => normalizeName(row.name)));
  const missingCount = [...currentNames].filter((name) => !importedNames.has(name)).length;
  const invalidCount = state.importRows.filter((row) => classifyImportRow(row).kind === 'invalid').length;
  $('#importSummary').textContent = `${state.importRows.length} صف من الملف · ${invalidCount} يحتاج تصحيحًا · ${missingCount} وجهة حالية غير موجودة في الملف (لن تُحذف تلقائيًا).`;
  for (const row of state.importRows) {
    const status = classifyImportRow(row); const tr = document.createElement('tr');
    const stateCell = document.createElement('td'); stateCell.innerHTML = `<span class="import-row-state ${status.kind}">${status.label}</span>`; tr.append(stateCell);
    for (const [field, title] of [['name', 'الوجهة'], ['light8t20ft', 'خفيف'], ['container40ft', '40 قدم'], ['two20ft', '2 × 20 قدم']]) {
      const td = document.createElement('td');
      const input = document.createElement('input'); input.value = row[field]; input.dataset.importId = row.importId; input.dataset.field = field; input.setAttribute('aria-label', `${title} ${row.name || ''}`);
      td.append(input); tr.append(td);
    }
    body.append(tr);
  }
  $('#replaceImportButton').disabled = !state.importRows.length || invalidCount > 0;
  $('#mergeImportButton').disabled = !state.importRows.length || invalidCount > 0;
}

function applyImport(mode) {
  const invalid = state.importRows.filter((row) => classifyImportRow(row).kind === 'invalid');
  if (invalid.length) { showMessage('صحح الصفوف المحددة قبل اعتماد المعاينة.', 'error'); return; }
  if (mode === 'replace' && !window.confirm('سيستبدل هذا الإجراء جميع صفوف المسودة بالصفوف المعروضة. لن يغير الإصدار المنشور. متابعة؟')) return;
  const byName = new Map(state.rows.map((row) => [normalizeName(row.name), row]));
  const imported = state.importRows.map((row) => {
    const existing = byName.get(normalizeName(row.name));
    return makeRow({
      ...(existing || {}), name: row.name,
      light8t20ft: parsePositivePrice(row.light8t20ft),
      container40ft: parsePositivePrice(row.container40ft),
      two20ft: parsePositivePrice(row.two20ft)
    });
  });
  if (mode === 'replace') state.rows = imported;
  else {
    const merged = new Map(state.rows.map((row) => [normalizeName(row.name), row]));
    for (const row of imported) merged.set(normalizeName(row.name), row);
    state.rows = [...merged.values()];
  }
  state.importSource = state.importSource || 'import';
  $('#importPanel').hidden = true;
  renderRows();
  showMessage('أضيفت النتائج إلى المسودة المحلية فقط. اضغط «حفظ المسودة» ثم راجعها قبل النشر.');
}

function bindEvents() {
  $('#addDestinationButton').addEventListener('click', () => addDestination());
  $('#emptyAddButton').addEventListener('click', () => addDestination());
  $('#destinationSearch').addEventListener('input', renderRows);
  $('#saveDraftButton').addEventListener('click', saveDraft);
  $('#previewButton').addEventListener('click', openPreview);
  $('#closePreviewButton').addEventListener('click', () => $('#previewDialog').close());
  $('#publishButton').addEventListener('click', () => {
    $('#publishDialogSummary').textContent = `سيُنشر إصدار جديد يضم ${state.rows.length} وجهة بعملة EGP. السعر لا يشمل الإيصالات الرسمية.`;
    $('#publishDialog').showModal();
  });
  $('#publishDialog').addEventListener('close', () => { if ($('#publishDialog').returnValue === 'confirm') publishRelease(); });
  $('#importFile').addEventListener('change', (event) => loadImportFile(event.target.files[0]));
  $('#closeImportButton').addEventListener('click', () => { $('#importPanel').hidden = true; state.importRows = []; });
  $('#mergeImportButton').addEventListener('click', () => applyImport('merge'));
  $('#replaceImportButton').addEventListener('click', () => applyImport('replace'));
  $('#destinationRows').addEventListener('input', (event) => {
    const input = event.target.closest('[data-field][data-id]'); if (!input) return;
    const row = state.rows.find((item) => item.destinationId === input.dataset.id); if (!row) return;
    row[input.dataset.field] = input.value;
    $('#saveDraftButton').disabled = state.busy || !isDirty();
    $('#publishButton').disabled = state.busy || !state.rows.length || isDirty();
    $('#draftStatus').textContent = isDirty() ? 'تغييرات غير محفوظة' : (state.draftMeta ? 'مسودة محفوظة' : 'مسودة فارغة');
  });
  $('#destinationRows').addEventListener('change', (event) => {
    const input = event.target.closest('[data-field][data-id]'); if (!input) return;
    const row = state.rows.find((item) => item.destinationId === input.dataset.id); if (!row) return;
    if (input.dataset.field === 'coordinatesVerified') row.coordinatesVerified = input.checked;
    renderRows();
  });
  $('#destinationRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete]'); if (!button) return;
    const row = state.rows.find((item) => item.destinationId === button.dataset.delete);
    if (!row || !window.confirm(`حذف «${row.name || 'الوجهة الجديدة'}» من المسودة؟ سيبقى الإصدار المنشور كما هو.`)) return;
    state.rows = state.rows.filter((item) => item.destinationId !== button.dataset.delete); renderRows();
  });
  $('#versionHistory').addEventListener('click', (event) => {
    const button = event.target.closest('[data-restore]'); if (button) restoreVersion(button.dataset.restore);
  });
  $('#importPreviewBody').addEventListener('input', (event) => {
    const input = event.target.closest('[data-import-id][data-field]'); if (!input) return;
    const row = state.importRows.find((item) => item.importId === input.dataset.importId); if (row) row[input.dataset.field] = input.value;
  });
  $('#importPreviewBody').addEventListener('change', () => {
    drawImportPreview();
  });
}

async function startForUser(user) {
  state.user = user;
  try {
    const allowed = await checkEditor(user);
    if (!allowed) { $('#accessMessage').hidden = false; return; }
    $('#editorApp').hidden = false;
    await loadData();
  } catch (error) {
    $('#accessMessage').hidden = false;
    showMessage('تعذر التحقق من صلاحية الوحدة. لم يتم تحميل المسودات.', 'error');
  }
}

bindEvents();
onAuthStateChanged(auth, (user) => {
  if (!user) { location.href = 'index.html'; return; }
  startForUser(user);
});
