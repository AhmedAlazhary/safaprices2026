export const PUBLIC_PRICE_SCHEMA_VERSION = 1;
export const PUBLIC_PRICE_FIELDS = Object.freeze([
  'destinationId', 'name', 'light8t20ft', 'container40ft', 'two20ft', 'currency', 'lat', 'lng'
]);

const isFiniteCoordinate = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function toPublicPriceDestination(row) {
  const destination = {
    destinationId: String(row.destinationId || '').trim(),
    name: String(row.name || '').trim(),
    light8t20ft: Number(row.light8t20ft),
    container40ft: Number(row.container40ft),
    two20ft: Number(row.two20ft),
    currency: 'EGP'
  };
  if (row.coordinatesVerified === true) {
    destination.lat = Number(row.lat);
    destination.lng = Number(row.lng);
  }
  return destination;
}

export function createPublicPriceRelease(rows, { version, publishedAt }) {
  return {
    schemaVersion: PUBLIC_PRICE_SCHEMA_VERSION,
    version: Number(version),
    publishedAt: String(publishedAt || ''),
    currency: 'EGP',
    destinations: rows.map(toPublicPriceDestination)
  };
}

export function validatePublicPriceRelease(release, { allowEmptyBootstrap = false } = {}) {
  const errors = [];
  if (!release || typeof release !== 'object' || Array.isArray(release)) return ['JSON root must be an object.'];
  const rootKeys = ['schemaVersion', 'version', 'publishedAt', 'currency', 'destinations'];
  if (Object.keys(release).some((key) => !rootKeys.includes(key)) || rootKeys.some((key) => !(key in release))) {
    errors.push('JSON contains missing or unsupported root fields.');
  }
  if (release.schemaVersion !== PUBLIC_PRICE_SCHEMA_VERSION) errors.push('Unsupported schemaVersion.');
  if (release.currency !== 'EGP') errors.push('Currency must be EGP.');
  if (!Number.isInteger(release.version) || release.version < 0) errors.push('Version must be a nonnegative integer.');
  const bootstrap = allowEmptyBootstrap && release.version === 0 && release.publishedAt === null && Array.isArray(release.destinations) && release.destinations.length === 0;
  if (!bootstrap && release.version < 1) errors.push('A published release version must be positive.');
  if (!bootstrap && (!Number.isFinite(Date.parse(release.publishedAt)) || typeof release.publishedAt !== 'string')) errors.push('publishedAt must be an ISO date string.');
  if (!Array.isArray(release.destinations)) return [...errors, 'destinations must be an array.'];
  if (!bootstrap && release.destinations.length === 0) errors.push('A release must contain at least one destination.');
  const ids = new Set();
  for (const [index, item] of release.destinations.entries()) {
    const label = `destinations[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`${label} must be an object.`); continue; }
    const allowed = new Set(PUBLIC_PRICE_FIELDS);
    if (Object.keys(item).some((key) => !allowed.has(key))) errors.push(`${label} contains a nonpublic field.`);
    if (typeof item.destinationId !== 'string' || !item.destinationId.trim()) errors.push(`${label}.destinationId is required.`);
    else if (ids.has(item.destinationId)) errors.push(`${label}.destinationId is duplicated.`);
    else ids.add(item.destinationId);
    if (typeof item.name !== 'string' || !item.name.trim()) errors.push(`${label}.name is required.`);
    for (const field of ['light8t20ft', 'container40ft', 'two20ft']) if (!Number.isFinite(item[field]) || item[field] <= 0) errors.push(`${label}.${field} must be a positive number.`);
    if (item.currency !== 'EGP') errors.push(`${label}.currency must be EGP.`);
    if (('lat' in item) !== ('lng' in item)) errors.push(`${label} must contain both coordinates or neither.`);
    if ('lat' in item && (!isFiniteCoordinate(item.lat, -90, 90) || !isFiniteCoordinate(item.lng, -180, 180))) errors.push(`${label} has invalid coordinates.`);
  }
  return errors;
}
