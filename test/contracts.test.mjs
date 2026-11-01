import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const schemaDir = path.join(root, 'events/v1');
const schema = name => JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
test('v1 payload schemas retain required fields and types', () => {
  for (const name of ['order.placed.schema.json','inventory.reserved.schema.json','fulfillment.requested.schema.json','shipment.confirmed.schema.json','equipment.reading.schema.json']) {
    const value = schema(name);
    assert.ok(value.required.length > 0, name);
    for (const key of value.required) assert.ok(value.properties[key], `${name}: missing ${key}`);
  }
});
test('incompatible required-field deletion fails compatibility check', () => {
  const previous = schema('order.placed.schema.json');
  const candidate = structuredClone(previous);
  candidate.required = candidate.required.filter(key => key !== 'orderId');
  const removed = previous.required.filter(key => !candidate.required.includes(key));
  assert.deepEqual(removed, ['orderId']);
  const compatible = removed.length === 0;
  assert.equal(compatible, false);
});
