import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicPriceRelease,
  toPublicPriceDestination,
  validatePublicPriceRelease
} from '../js/public-price-schema.mjs';
import { calculateQuote, createWhatsAppQuoteUrl } from '../js/public-price-calculator.mjs';

const row = {
  destinationId: 'dest-1', name: 'الإسكندرية', light8t20ft: 1200,
  container40ft: 1800, two20ft: 2100, currency: 'EGP',
  marketPrice: 5000, commission: 900, customerName: 'internal',
  lat: 31.2, lng: 29.9, coordinateSource: 'approved map', coordinatesVerified: true
};

test('public serializer strips internal-only fields and includes verified coordinates', () => {
  const destination = toPublicPriceDestination(row);
  assert.deepEqual(Object.keys(destination).sort(), [
    'container40ft', 'currency', 'destinationId', 'lat', 'light8t20ft', 'lng', 'name', 'two20ft'
  ].sort());
  assert.equal('marketPrice' in destination, false);
  assert.equal('commission' in destination, false);
  assert.equal('customerName' in destination, false);
  assert.equal(validatePublicPriceRelease(createPublicPriceRelease([row], { version: 1, publishedAt: '2026-11-26T12:00:00.000Z' })).length, 0);
});

test('unverified coordinates are omitted from public JSON', () => {
  const destination = toPublicPriceDestination({ ...row, coordinatesVerified: false });
  assert.equal('lat' in destination, false);
  assert.equal('lng' in destination, false);
});

test('empty bootstrap is valid only when explicitly allowed', async () => {
  const bootstrap = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../assets/data/client-prices.json', import.meta.url), 'utf8'));
  assert.ok(validatePublicPriceRelease(bootstrap).length > 0);
  assert.deepEqual(validatePublicPriceRelease(bootstrap, { allowEmptyBootstrap: true }), []);
});

test('rejects malformed prices, unpaired coordinates, duplicates, and unknown fields', () => {
  const base = createPublicPriceRelease([row], { version: 1, publishedAt: '2026-11-26T12:00:00.000Z' });
  const badPrice = structuredClone(base); badPrice.destinations[0].light8t20ft = -1;
  assert.ok(validatePublicPriceRelease(badPrice).some((error) => error.includes('light8t20ft')));
  const unpaired = structuredClone(base); delete unpaired.destinations[0].lng;
  assert.ok(validatePublicPriceRelease(unpaired).some((error) => error.includes('both coordinates')));
  const duplicate = structuredClone(base); duplicate.destinations.push(structuredClone(duplicate.destinations[0]));
  assert.ok(validatePublicPriceRelease(duplicate).some((error) => error.includes('duplicated')));
  const privateField = structuredClone(base); privateField.destinations[0].commission = 7;
  assert.ok(validatePublicPriceRelease(privateField).some((error) => error.includes('nonpublic field')));
  const nullCoordinates = structuredClone(base); nullCoordinates.destinations[0].lat = null; nullCoordinates.destinations[0].lng = null;
  assert.ok(validatePublicPriceRelease(nullCoordinates).some((error) => error.includes('invalid coordinates')));
  const zeroVersion = structuredClone(base); zeroVersion.version = 0;
  assert.ok(validatePublicPriceRelease(zeroVersion).some((error) => error.includes('version must be positive')));
});

test('calculator multiplies unit price by a bounded integer quantity', () => {
  assert.deepEqual(calculateQuote({ container40ft: 1850 }, 'container40ft', 3.8), { unitPrice: 1850, quantity: 3, total: 5550 });
  assert.deepEqual(calculateQuote({ two20ft: 900 }, 'two20ft', 0), { unitPrice: 900, quantity: 1, total: 900 });
  assert.deepEqual(calculateQuote({ light8t20ft: 100 }, 'light8t20ft', 999), { unitPrice: 100, quantity: 99, total: 9900 });
  assert.equal(calculateQuote({ light8t20ft: 0 }, 'light8t20ft', 1), null);
});

test('WhatsApp quote URL contains the approved recipient and all quote details', () => {
  const url = new URL(createWhatsAppQuoteUrl({
    number: '+20 122 041 7513', destinationName: 'الإسكندرية',
    containerLabel: 'حاوية 40 قدم', quantity: 2, total: 3700
  }));
  assert.equal(url.pathname, '/201220417513');
  const message = url.searchParams.get('text');
  assert.match(message, /الإسكندرية/);
  assert.match(message, /حاوية 40 قدم/);
  assert.match(message, /العدد: 2/);
  assert.match(message, /٣٬٧٠٠/);
});
