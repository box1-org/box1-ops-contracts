import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, equivalent, classify, consume, requestFileFromEvent, ERROR_CODES } from '../legacy/erp-file/v1/reference/erp1.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'legacy/erp-file/v1/fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const read = rel => fs.readFileSync(path.join(dir, rel));
const parsed = {};

test('every fixture file is listed in the manifest exactly once', () => {
  const onDisk = fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.erp1')).map(f => f.split(path.sep).join('/')).sort();
  const listed = manifest.files.map(f => f.file).sort();
  assert.deepEqual(listed, onDisk);
  assert.equal(new Set(listed).size, listed.length);
});

for (const fx of manifest.files) {
  test(`${fx.file} ${fx.valid ? 'parses' : `fails with ${fx.errorCode}`}`, () => {
    const result = parse(read(fx.file), fx.name);
    if (fx.valid) {
      assert.equal(result.ok, true, result.detail);
      assert.equal(result.fileType, fx.fileType);
      assert.deepEqual(result.records, fx.records);
      parsed[fx.file] = result;
    } else {
      assert.ok(ERROR_CODES.includes(fx.errorCode), fx.errorCode);
      assert.equal(result.ok, false, `expected ${fx.errorCode}`);
      assert.equal(result.code, fx.errorCode, result.detail);
    }
  });
}

test('every error code except CONFLICTING_REUSE has an invalid fixture', () => {
  const covered = new Set(manifest.files.filter(f => !f.valid).map(f => f.errorCode));
  for (const code of ERROR_CODES.filter(c => c !== 'CONFLICTING_REUSE')) assert.ok(covered.has(code), code);
});

test('equivalence pairs', () => {
  for (const pair of manifest.equivalence) {
    const a = parse(read(pair.a), manifest.files.find(f => f.file === pair.a).name);
    const b = parse(read(pair.b), manifest.files.find(f => f.file === pair.b).name);
    assert.equal(equivalent(a, b), pair.equivalent, pair.why);
  }
});

test('file-name classification', () => {
  for (const n of manifest.names) assert.equal(classify(n.area, n.name), n.expect, `${n.area}/${n.name}`);
});

test('fulfillment.requested.v1 maps to the expected request file without dropping fields', () => {
  const events = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/events.json'), 'utf8'));
  for (const m of manifest.mapping) {
    const event = events.find(e => e.eventId === m.eventId);
    assert.ok(event, m.eventId);
    const produced = requestFileFromEvent(event, m.createdAt);
    assert.equal(produced, read(m.expected).toString('utf8'));
    const result = parse(Buffer.from(produced), manifest.files.find(f => f.file === m.expected).name);
    const req = result.records.find(r => r.type === 'REQ');
    const lin = result.records.filter(r => r.type === 'LIN');
    for (const k of ['orderId', 'reservationId', 'fulfillmentRequestId', 'siteId']) assert.equal(req[k], event.payload[k]);
    assert.deepEqual(lin.map(l => [l.sku, Number(l.quantity)]), [[event.payload.sku, event.payload.quantity]]);
  }
});

test('result sequences: duplicates, late, gaps and conflicts', () => {
  const names = Object.fromEntries(manifest.files.map(f => [f.file, f.name]));
  for (const seq of manifest.sequences) {
    const { outcomes, final } = consume(seq.sent, seq.deliveries.map(([file]) => ({ bytes: read(file), name: names[file] })));
    assert.deepEqual(outcomes, seq.deliveries.map(([, outcome]) => outcome), seq.name);
    assert.deepEqual(final, seq.final, seq.name);
  }
});
