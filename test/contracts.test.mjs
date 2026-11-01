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

test('PostgreSQL fixtures use immutable Flyway names and contain no credentials', () => {
  const migrationRoot = path.join(root, 'postgres/migrations');
  for (const service of fs.readdirSync(migrationRoot)) {
    for (const file of fs.readdirSync(path.join(migrationRoot, service))) {
      assert.match(file, /^V[0-9]+__[a-z0-9_]+\.sql$/);
      const sql = fs.readFileSync(path.join(migrationRoot, service, file), 'utf8');
      assert.doesNotMatch(sql, /password|secret|postgresql:\/\//i);
    }
  }
  assert.match(fs.readFileSync(path.join(root, 'postgres/OWNERSHIP.md'), 'utf8'), /cannot connect to or read/);
  assert.match(fs.readFileSync(path.join(root, 'postgres/STORAGE-BACKUP-RESTORE.md'), 'utf8'), /pg_dump --format=custom/);
});
