import crypto from 'node:crypto';

export class OutboxStore {
  constructor() { this.orders = new Map(); this.outbox = new Map(); }
  createOrder(order, { crashBeforeCommit = false } = {}) {
    if (crashBeforeCommit) throw new Error('simulated transaction rollback');
    this.orders.set(order.orderId, structuredClone(order));
    const eventId = crypto.randomUUID();
    this.outbox.set(eventId, { eventId, eventType: 'order.placed.v1', aggregateId: order.orderId, payload: structuredClone(order), publishedAt: null });
    return eventId;
  }
  publishPending(broker) {
    for (const event of this.outbox.values()) {
      if (event.publishedAt) continue;
      if (!broker.some(message => message.eventId === event.eventId)) broker.push(structuredClone(event));
      event.publishedAt = new Date().toISOString();
    }
  }
}

export function redeliveryToDlq(message, handler, { maxAttempts = 3 } = {}) {
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts.push(attempt);
    try { handler(message, attempt); return { attempts, delivered: true, dlq: null }; }
    catch (error) { if (attempt === maxAttempts) return { attempts, delivered: false, dlq: { ...message, attempts, error: error.message } }; }
  }
  throw new Error('unreachable');
}

export class IsolatedServiceDb {
  constructor(owner) { this.owner = owner; this.tables = new Map(); }
  write(caller, table, value) {
    if (caller !== this.owner) throw new Error(`permission denied: ${caller} cannot write ${this.owner}`);
    this.tables.set(table, structuredClone(value));
  }
  read(caller, table) {
    if (caller !== this.owner) throw new Error(`permission denied: ${caller} cannot read ${this.owner}`);
    return structuredClone(this.tables.get(table));
  }
}

export function backupAndRestore(state) {
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  const dump = JSON.stringify(normalize(state));
  const checksum = crypto.createHash('sha256').update(dump).digest('hex');
  return { checksum, restored: JSON.parse(dump), dump };
}

export function runRecoveryDrills() {
  const store = new OutboxStore();
  const order = { orderId: 'ord_drill_1', customerId: 'cust_demo', sku: 'SKU-42', quantity: 2, siteId: 'site_nyc' };
  const eventId = store.createOrder(order);
  const broker = [];
  store.publishPending(broker);
  store.publishPending(broker);
  const outboxReplay = { orderPersisted: store.orders.has(order.orderId), publishedCount: broker.filter(m => m.eventId === eventId).length };

  let failures = 0;
  const delivery = redeliveryToDlq({ eventId: 'evt_dlq_1' }, (_message, attempt) => {
    failures += 1;
    if (attempt < 3) throw new Error('temporary consumer failure');
  });
  const dlq = redeliveryToDlq({ eventId: 'evt_poison_1' }, () => { throw new Error('poison payload'); }, { maxAttempts: 3 });

  const orders = new IsolatedServiceDb('order');
  const inventory = new IsolatedServiceDb('inventory');
  orders.write('order', 'orders', [order]);
  inventory.write('inventory', 'stock', [{ siteId: 'site_nyc', sku: 'SKU-42', available: 10 }]);
  let isolationDenied = false;
  try { inventory.read('order', 'stock'); } catch { isolationDenied = true; }

  const restore = backupAndRestore({ orders: [order], stock: [{ siteId: 'site_nyc', sku: 'SKU-42', available: 8 }] });
  return { outboxReplay, redelivery: { attempts: delivery.attempts, delivered: delivery.delivered, transientFailures: failures }, dlq: { attempts: dlq.attempts, captured: Boolean(dlq.dlq) }, dbIsolation: { crossServiceReadDenied: isolationDenied }, restore: { checksum: restore.checksum, rows: restore.restored.orders.length + restore.restored.stock.length } };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(runRecoveryDrills(), null, 2));
