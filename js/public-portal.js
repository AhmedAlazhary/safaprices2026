import { validatePublicPriceRelease } from './public-price-schema.mjs';
import { WHATSAPP_CONTACTS } from './public-portal-config.mjs';
import { calculateQuote, createWhatsAppQuoteUrl } from './public-price-calculator.mjs';

const $ = (selector) => document.querySelector(selector);
const priceFields = {
  light8t20ft: 'خفيف 8 طن / 20 قدم',
  container40ft: 'حاوية 40 قدم',
  two20ft: '2 حاوية 20 قدم'
};
const state = { destinations: [], selectedDestination: null, map: null, markers: [], markerById: new Map() };
const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });
const containerLabels = priceFields;

$('#primaryWhatsAppLink').href = `https://wa.me/${WHATSAPP_CONTACTS.primary.number}`;
$('#primaryWhatsAppNumber').textContent = WHATSAPP_CONTACTS.primary.display;
$('#backupWhatsAppLink').href = `https://wa.me/${WHATSAPP_CONTACTS.backup.number}`;
$('#backupWhatsAppNumber').textContent = WHATSAPP_CONTACTS.backup.display;

function revealOnScroll() {
  const items = document.querySelectorAll('.reveal');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible')); return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible'); observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
  items.forEach((item) => observer.observe(item));
}

function bindNavigation() {
  const toggle = $('#menuToggle'); const nav = $('#siteNav');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
  });
  $('#backToTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => $('#backToTop').classList.toggle('is-visible', window.scrollY > 500), { passive: true });
}

function setPriceState(message, error = false) {
  $('#priceLoadState').textContent = message;
  $('#priceLoadState').classList.toggle('is-error', error);
}

function renderDestinationOptions() {
  const select = $('#destinationSelect'); select.replaceChildren(new Option('اختر الوجهة', ''));
  for (const destination of state.destinations) select.add(new Option(destination.name, destination.destinationId));
  select.disabled = state.destinations.length === 0;
  if (!state.destinations.length) {
    select.replaceChildren(new Option('لا توجد وجهات منشورة حاليًا', ''));
    $('#calculatorHint').textContent = 'سيظهر السعر عند نشر وجهات معتمدة.';
  } else $('#calculatorHint').textContent = 'اختر الوجهة ونوع الحاوية لحساب السعر التقديري.';
  updateEstimate();
}

function updateEstimate() {
  const destination = state.destinations.find((item) => item.destinationId === $('#destinationSelect').value) || null;
  const field = $('#containerSelect').value;
  const quantity = Math.max(1, Math.min(99, Math.trunc(Number($('#quantityInput').value) || 1)));
  $('#quantityInput').value = String(quantity);
  state.selectedDestination = destination;
  const quote = calculateQuote(destination, field, quantity);
  const total = quote?.total ?? null;
  $('#totalPrice').textContent = total === null ? '—' : money.format(total);
  $('#resultDetails').textContent = destination ? `${destination.name} · ${priceFields[field]} · العدد ${new Intl.NumberFormat('ar-EG').format(quantity)}` : 'اختر وجهة ونوع الحاوية';
  const whatsappEnabled = Boolean(destination && total !== null);
  $('#whatsAppButton').disabled = !whatsappEnabled;
  $('#whatsAppButton').setAttribute('aria-disabled', String(!whatsappEnabled));
  $('#whatsAppStatus').textContent = whatsappEnabled
    ? `ستُفتح رسالة جاهزة إلى ${WHATSAPP_CONTACTS.primary.display}. لن تُرسل تلقائيًا.`
    : 'اختر وجهة منشورة لحساب السعر وتجهيز الرسالة.';
  showDestinationOnMap(destination);
}

function sendWhatsAppRequest() {
  const destination = state.selectedDestination;
  if (!destination) return;
  const field = $('#containerSelect').value;
  const quantity = Number($('#quantityInput').value);
  const quote = calculateQuote(destination, field, quantity);
  if (!quote) return;
  const url = createWhatsAppQuoteUrl({
    number: WHATSAPP_CONTACTS.primary.number, destinationName: destination.name,
    containerLabel: containerLabels[field], quantity: quote.quantity, total: quote.total
  });
  window.open(url, '_blank', 'noopener,noreferrer');
}

function selectDestination(destination, { scrollToCalculator = false } = {}) {
  $('#destinationSelect').value = destination.destinationId;
  updateEstimate();
  if (scrollToCalculator) $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDestinationOnMap(destination) {
  if (!destination) {
    $('#mapSelectionStatus').textContent = 'اختر وجهة من الحاسبة أو علامة على الخريطة.';
    return;
  }
  const marker = state.markerById.get(destination.destinationId);
  if (!marker || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
    $('#mapSelectionStatus').textContent = `${destination.name}: لا توجد إحداثيات معتمدة لعرضها على الخريطة.`;
    return;
  }
  $('#mapSelectionStatus').textContent = `موقع ${destination.name} ظاهر على الخريطة.`;
  state.map.setView([destination.lat, destination.lng], Math.max(state.map.getZoom(), 8));
  marker.openPopup();
}

function destinationPopup(destination) {
  const content = document.createElement('div'); content.className = 'map-popup';
  const title = document.createElement('strong'); title.textContent = destination.name;
  const action = document.createElement('button'); action.type = 'button'; action.textContent = 'احسب السعر';
  action.addEventListener('click', () => {
    selectDestination(destination, { scrollToCalculator: true });
  });
  content.append(title, action); return content;
}

async function initializeMap(destinations) {
  const map = L.map('egyptMap', { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  state.map = map;
  const response = await fetch('assets/maps/egypt.geojson');
  if (!response.ok) throw new Error('تعذر تحميل خريطة مصر.');
  const boundary = await response.json();
  const country = L.geoJSON(boundary, { style: { color: '#d9702b', weight: 2, fillColor: '#102b47', fillOpacity: 0.08 } }).addTo(map);
  map.fitBounds(country.getBounds(), { padding: [18, 18] });
  for (const destination of destinations) {
    if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) continue;
    const marker = L.marker([destination.lat, destination.lng]).bindPopup(destinationPopup(destination)).addTo(map);
    marker.on('click', () => selectDestination(destination));
    state.markers.push(marker);
    state.markerById.set(destination.destinationId, marker);
  }
  $('#mapEmptyMessage').hidden = state.markers.length > 0;
  showDestinationOnMap(state.selectedDestination);
}

async function loadPublishedPrices() {
  let destinations = [];
  try {
    const response = await fetch('assets/data/client-prices.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    const errors = validatePublicPriceRelease(release, { allowEmptyBootstrap: true });
    if (errors.length) throw new Error(errors.join(' '));
    if (release.version === 0) {
      state.destinations = []; renderDestinationOptions();
      setPriceState('لا يوجد ملف أسعار منشور بعد. تواصل مع المكتب لمعرفة التفاصيل.');
    } else {
      destinations = release.destinations.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar-EG'));
      state.destinations = destinations;
      renderDestinationOptions();
      setPriceState(`الأسعار المنشورة · الإصدار ${release.version} · ${new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(release.publishedAt))}`);
    }
  } catch (error) {
    console.error('Public prices could not be loaded', error);
    state.destinations = []; renderDestinationOptions();
    setPriceState(`تعذر تحميل ملف الأسعار: ${error.message || 'خطأ غير معروف'}. يمكنك التواصل مع المكتب هاتفيًا.`, true);
  }
  try { await initializeMap(destinations); }
  catch (mapError) {
    console.error('Map could not be loaded', mapError);
    $('#mapEmptyMessage').textContent = 'تعذر تحميل الخريطة الآن. يمكنك متابعة اختيار الوجهة وحساب السعر من القائمة.';
    $('#mapEmptyMessage').hidden = false;
    $('#mapSelectionStatus').textContent = 'الخريطة غير متاحة حاليًا.';
  }
}

bindNavigation(); revealOnScroll();
$('#whatsAppButton').addEventListener('click', sendWhatsAppRequest);
for (const id of ['destinationSelect', 'containerSelect', 'quantityInput']) $(`#${id}`).addEventListener('input', updateEstimate);
$('#decreaseQuantity').addEventListener('click', () => { $('#quantityInput').stepDown(); updateEstimate(); });
$('#increaseQuantity').addEventListener('click', () => { $('#quantityInput').stepUp(); updateEstimate(); });
loadPublishedPrices();
