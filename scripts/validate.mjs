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
const openapi = YAML.parse(fs.readFileSync(path.join(root, 'openapi/order-service.yaml'), 'utf8'));
if (openapi.openapi !== '3.1.0' || !openapi.paths?.['/api/v1/orders'] || !openapi.components?.schemas?.Order) {
  throw new Error('Order OpenAPI contract is incomplete');
}
console.log(`PASS ${fixtures.length} event fixtures and ${Object.keys(schemas).length} schemas`);
