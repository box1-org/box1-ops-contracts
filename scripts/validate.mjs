import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
const root = path.resolve(import.meta.dirname, '..');
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const envelope = JSON.parse(fs.readFileSync(path.join(root, 'events/v1/envelope.schema.json')));
const schemas = Object.fromEntries(fs.readdirSync(path.join(root, 'events/v1')).filter(f => f.endsWith('.schema.json')).map(f => [f, JSON.parse(fs.readFileSync(path.join(root, 'events/v1', f)))]));
for (const schema of Object.values(schemas)) ajv.addSchema(schema);
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/events.json')));
const payloadSchema = event => schemas[`${event.eventType.replaceAll('.', '.')}.schema.json`] ?? schemas[`${event.eventType}.schema.json`];
for (const event of fixtures) {
  if (!ajv.getSchema(envelope.$id)(event)) throw new Error(`Envelope invalid: ${ajv.errorsText()}`);
  const schema = schemas[`${event.eventType.replace(/\.v[0-9]+$/, '')}.schema.json`];
  if (!schema || !ajv.getSchema(schema.$id)(event.payload)) throw new Error(`Payload invalid for ${event.eventType}: ${ajv.errorsText()}`);
}
let examples = 0;
const validateOpenApi = (file, requiredPaths, requiredSchema) => {
  const openapi = YAML.parse(fs.readFileSync(path.join(root, 'openapi', file), 'utf8'));
  if (openapi.openapi !== '3.1.0' || !openapi.components?.schemas?.[requiredSchema]) {
    throw new Error(`${file} is incomplete`);
  }
  const oaAjv = new Ajv2020({ strict: false });
  addFormats(oaAjv);
  oaAjv.addSchema({ $id: 'openapi', components: openapi.components });
  const resolve = ref => ref.replace(/^#\//, '').split('/').reduce((node, key) => node[key], openapi);
  const deref = value => {
    if (Array.isArray(value)) return value.map(deref);
    if (value && typeof value === 'object') return value.$ref ? deref(resolve(value.$ref)) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deref(v)]));
    return value;
  };
  const check = (schema, example, where) => {
    const validate = oaAjv.compile(schema.$ref ? { $ref: `openapi${schema.$ref}` } : JSON.parse(JSON.stringify(schema).replaceAll('"$ref":"#/', '"$ref":"openapi#/')));
    if (!validate(deref(example))) throw new Error(`${file} example invalid at ${where}: ${oaAjv.errorsText(validate.errors)}`);
    examples += 1;
  };
  const walk = (node, where) => {
    if (!node || typeof node !== 'object') return;
    if (node.schema && node.example !== undefined) check(node.schema, node.example, where);
    for (const [key, child] of Object.entries(node)) walk(child, `${where}/${key}`);
  };
  walk(openapi.paths, 'paths');
  walk(openapi.components.responses, 'responses');
  for (const required of requiredPaths) {
    if (!openapi.paths[required]) throw new Error(`${file} is missing ${required}`);
  }
};
validateOpenApi('order-service.yaml', ['/api/v1/orders', '/api/v1/orders/{orderId}', '/api/v1/orders/{orderId}/timeline'], 'Order');
validateOpenApi('inventory-service.yaml', ['/api/v1/inventory', '/api/v1/reservations/{reservationId}', '/internal/v1/stock/{siteId}/{sku}/restock', '/internal/v1/reservations/{reservationId}/release'], 'Reservation');
validateOpenApi('asset-service.yaml', ['/api/v1/telemetry/readings', '/api/v1/assets/{assetId}/readings', '/api/v1/alerts', '/api/v1/sites', '/api/v1/sites/{siteId}', '/api/v1/sites/{siteId}/status'], 'Alert');
const reasons = ['SITE_UNAVAILABLE', 'UNKNOWN_SKU', 'INSUFFICIENT_STOCK'];
const reservations = fs.readFileSync(path.join(root, 'INVENTORY-RESERVATIONS.md'), 'utf8');
for (const reason of reasons) {
  if (!reservations.includes(`\`${reason}\``)) throw new Error(`INVENTORY-RESERVATIONS.md is missing ${reason}`);
}
console.log(`PASS ${fixtures.length} event fixtures, ${Object.keys(schemas).length} schemas and ${examples} OpenAPI examples`);
