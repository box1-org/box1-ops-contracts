import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const schemaDir = path.join(root, 'events/v1');
const schema = name => JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
test('v1 payload schemas retain required fields and types', () => {
  for (const name of ['order.placed.schema.json','inventory.reserved.schema.json','fulfillment.requested.schema.json','shipment.confirmed.schema.json','equipment.reading.schema.json','inventory.rejected.schema.json','inventory.reservation-expired.schema.json','shipment.failed.schema.json','order.state-changed.schema.json','equipment.threshold-exceeded.schema.json','notification.delivered.schema.json','notification.failed.schema.json']) {
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

test('inventory contract covers reservation states, reason codes and its dead-letter topic', () => {
  const doc = fs.readFileSync(path.join(root, 'INVENTORY-RESERVATIONS.md'), 'utf8');
  for (const word of ['ACTIVE', 'COMMITTED', 'CONSUMED', 'EXPIRED', 'RELEASED', 'SITE_UNAVAILABLE', 'UNKNOWN_SKU', 'INSUFFICIENT_STOCK']) {
    assert.match(doc, new RegExp(word));
  }
  const topics = fs.readFileSync(path.join(root, 'TOPICS.md'), 'utf8');
  assert.match(topics, /box1\.inventory\.dlq\.v1/);
  assert.match(topics, /box1\.fulfillment\.dlq\.v1/);
  assert.match(topics, /box1\.fulfillment\.events\.v1.*`inventory`/);
  const sql = fs.readFileSync(path.join(root, 'postgres/migrations/inventory/V1__create_inventory.sql'), 'utf8');
  for (const word of ['inventory_stock', 'on_hand', 'outbox', 'COMMITTED', 'CONSUMED']) {
    assert.match(sql, new RegExp(word));
  }
});

test('telemetry contract covers threshold events, keying and its dead-letter topic', () => {
  const alert = schema('equipment.threshold-exceeded.schema.json');
  for (const key of ['assetId', 'siteId', 'metricName', 'value', 'threshold', 'severity']) assert.ok(alert.required.includes(key), key);
  assert.deepEqual(alert.properties.severity.enum, ['WARNING', 'CRITICAL']);
  assert.equal(alert.additionalProperties, false);
  const doc = fs.readFileSync(path.join(root, 'TELEMETRY.md'), 'utf8');
  for (const word of ['assetId', 'sourceEventId', 'box1.telemetry.dlq.v1', 'One event per activation']) assert.match(doc, new RegExp(word.replaceAll('.', '\\.')));
  const topics = fs.readFileSync(path.join(root, 'TOPICS.md'), 'utf8');
  assert.match(topics, /box1\.telemetry\.dlq\.v1/);
  assert.match(topics, /box1\.telemetry\.events\.v1.*`asset-service`/);
});

test('notification contract: closed payloads, no customer fields, order-topic consumer group', () => {
  for (const name of ['notification.delivered.schema.json', 'notification.failed.schema.json']) {
    const value = schema(name);
    assert.equal(value.additionalProperties, false, name);
    for (const key of ['notificationId', 'orderId', 'noticeType', 'channel', 'templateVersion', 'attemptCount', 'provider']) assert.ok(value.required.includes(key), `${name}: ${key}`);
    for (const key of Object.keys(value.properties)) assert.doesNotMatch(key, /customer|email|phone|recipient|address|name$/i, `${name}: ${key}`);
  }
  const failed = schema('notification.failed.schema.json');
  assert.deepEqual(failed.properties.failureCategory.enum, ['RETRIES_EXHAUSTED', 'PERMANENT_REJECTION']);
  const topics = fs.readFileSync(path.join(root, 'TOPICS.md'), 'utf8');
  assert.match(topics, /box1\.order\.events\.v1.*`notification`/);
  assert.match(topics, /box1\.fulfillment\.events\.v1.*`notification`/);
  const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/events.json'), 'utf8'));
  for (const type of ['notification.delivered.v1', 'notification.failed.v1']) {
    const event = fixtures.find(e => e.eventType === type);
    assert.ok(event, type);
    assert.equal(event.aggregateId, event.payload.orderId);
  }
});
