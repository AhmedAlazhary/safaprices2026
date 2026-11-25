import {
  publicDb, publicDoc, publicGetDoc, publicGetDocs,
  publicCollection, publicQuery, publicOrderBy
} from './public-firebase.js';

const $ = (selector) => document.querySelector(selector);
const priceFields = {
  light8t20ft: 'خفيف 8 طن / 20 قدم',
  container40ft: 'حاوية 40 قدم',
  two20ft: '2 حاوية 20 قدم'
};
const state = { destinations: [], selectedDestination: null, map: null, markers: [] };
const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });

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
  const unitPrice = destination && Number.isFinite(destination[field]) ? destination[field] : null;
  const total = unitPrice === null ? null : unitPrice * quantity;
  $('#totalPrice').textContent = total === null ? '—' : money.format(total);
  $('#resultDetails').textContent = destination ? `${destination.name} · ${priceFields[field]} · العدد ${new Intl.NumberFormat('ar-EG').format(quantity)}` : 'اختر وجهة ونوع الحاوية';
  $('#whatsAppButton').disabled = true;
  $('#whatsAppButton').setAttribute('aria-disabled', 'true');
}

function destinationPopup(destination) {
  const content = document.createElement('div'); content.className = 'map-popup';
  const title = document.createElement('strong'); title.textContent = destination.name;
  const action = document.createElement('button'); action.type = 'button'; action.textContent = 'احسب السعر';
  action.addEventListener('click', () => {
    $('#destinationSelect').value = destination.destinationId; updateEstimate();
    $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    marker.on('click', () => {
      $('#destinationSelect').value = destination.destinationId; updateEstimate();
    });
    state.markers.push(marker);
  }
  $('#mapEmptyMessage').hidden = state.markers.length > 0;
}

async function loadPublishedPrices() {
  try {
    const active = await publicGetDoc(publicDoc(publicDb, 'clientPriceControl', 'current'));
    if (!active.exists() || !active.data().activeVersionId) {
      state.destinations = []; renderDestinationOptions();
      setPriceState('لا توجد أسعار منشورة حاليًا. تواصل مع المكتب لمعرفة التفاصيل.');
      await initializeMap([]); return;
    }
    const versionId = active.data().activeVersionId;
    const snapshot = await publicGetDocs(publicQuery(
      publicCollection(publicDb, 'clientPriceVersions', versionId, 'destinations'),
      publicOrderBy('name')
    ));
    state.destinations = snapshot.docs.map((item) => ({ destinationId: item.id, ...item.data() }))
      .filter((item) => typeof item.name === 'string' && Object.keys(priceFields).every((key) => Number.isFinite(item[key])));
    renderDestinationOptions();
    setPriceState(state.destinations.length ? `الأسعار المنشورة · الإصدار ${active.data().version}` : 'الإصدار المنشور لا يحتوي على وجهات صالحة.');
    await initializeMap(state.destinations);
  } catch (error) {
    console.error('Public prices could not be loaded', error);
    state.destinations = []; renderDestinationOptions();
    setPriceState('تعذر تحميل الأسعار الآن. يمكنك التواصل مع المكتب هاتفيًا.', true);
    try { await initializeMap([]); } catch (mapError) { console.error('Map could not be loaded', mapError); $('#mapEmptyMessage').hidden = false; }
  }
}

bindNavigation(); revealOnScroll();
for (const id of ['destinationSelect', 'containerSelect', 'quantityInput']) $(`#${id}`).addEventListener('input', updateEstimate);
$('#decreaseQuantity').addEventListener('click', () => { $('#quantityInput').stepDown(); updateEstimate(); });
$('#increaseQuantity').addEventListener('click', () => { $('#quantityInput').stepUp(); updateEstimate(); });
loadPublishedPrices();
