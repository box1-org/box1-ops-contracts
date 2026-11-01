import test from 'node:test';
import assert from 'node:assert/strict';
import { backupAndRestore, IsolatedServiceDb, OutboxStore, redeliveryToDlq, runRecoveryDrills } from '../drills/recovery-drills.mjs';

test('outbox survives crash-before-publish and replays exactly once', () => {
  const store = new OutboxStore(); const broker = [];
  const eventId = store.createOrder({ orderId: 'ord_test', sku: 'SKU-1', quantity: 1, siteId: 'site_1' });
  store.publishPending(broker); store.publishPending(broker);
  assert.equal(store.orders.has('ord_test'), true);
  assert.equal(broker.filter(event => event.eventId === eventId).length, 1);
});

test('redelivery retries and poison messages reach the DLQ', () => {
  const result = redeliveryToDlq({ eventId: 'evt' }, (_message, attempt) => { if (attempt < 3) throw Error('retry'); });
  assert.deepEqual(result.attempts, [1, 2, 3]);
  const poison = redeliveryToDlq({ eventId: 'poison' }, () => { throw Error('bad payload'); }, { maxAttempts: 3 });
  assert.equal(poison.delivered, false); assert.equal(poison.dlq.eventId, 'poison');
});

test('service database access is isolated by owner', () => {
  const db = new IsolatedServiceDb('orders'); db.write('orders', 'orders', [{ orderId: 'ord_1' }]);
  assert.throws(() => db.read('inventory', 'orders'), /permission denied/);
});

test('restore reproduces seeded records and checksum', () => {
  const result = backupAndRestore({ orders: [{ orderId: 'ord_1' }], stock: [{ sku: 'SKU-1', available: 4 }] });
  assert.equal(result.restored.orders[0].orderId, 'ord_1');
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
});

test('recovery drill summary reports every acceptance behavior', () => {
  const result = runRecoveryDrills();
  assert.equal(result.outboxReplay.publishedCount, 1);
  assert.equal(result.redelivery.delivered, true);
  assert.equal(result.dlq.captured, true);
  assert.equal(result.dbIsolation.crossServiceReadDenied, true);
  assert.equal(result.restore.rows, 2);
});
