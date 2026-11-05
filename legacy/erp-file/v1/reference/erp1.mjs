// Reference reader for the ERP1 legacy file protocol (SPEC.md).
// It exists only to keep the specification and its fixtures consistent.
// Services implement their own reader and writer; do not import this file.

export const MAX_FILE_BYTES = 65536;

const ID = (prefix, max = 124) => new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,${max}}$`);
const TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const REJECTION_CODES = ['STOCK_UNAVAILABLE', 'SITE_UNAVAILABLE', 'DAMAGED_GOODS', 'OPERATOR_CANCELLED', 'OTHER'];
export const ERROR_CODES = ['FILE_TOO_LARGE', 'ENCODING', 'TRUNCATED', 'MALFORMED_RECORD', 'UNSUPPORTED_VERSION', 'RECORD_ORDER',
  'MISSING_FIELD', 'FIELD_LENGTH', 'FIELD_VALUE', 'COUNT_MISMATCH', 'FILENAME_MISMATCH', 'CONFLICTING_REUSE'];

const timestamp = v => {
  const m = TS.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number);
  if (y < 1970 || s > 59) return false;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s;
};
const text = () => true;
const re = r => v => r.test(v);
const oneOf = list => v => list.includes(v);

// [name, required, maxCodePoints, rule]. required may be a function of the record's earlier fields.
const F = (name, required, max, rule) => ({ name, required, max, rule });
const RECORDS = {
  HDR: [F('magic', true, 0, null), F('fileType', true, 3, oneOf(['REQ', 'RES', 'ERR'])), F('createdAt', true, 24, timestamp)],
  REQ: [F('fulfillmentRequestId', true, 128, re(ID('ful'))), F('orderId', true, 128, re(ID('ord'))), F('reservationId', true, 128, re(ID('res'))),
    F('siteId', true, 128, re(ID('site', 123))), F('origin', true, 5, oneOf(['EVENT', 'API'])), F('requestedAt', true, 24, timestamp),
    F('correlationId', false, 128, text), F('traceparent', false, 55, re(TRACEPARENT))],
  LIN: [F('lineNo', true, 2, re(/^[1-9][0-9]?$/)), F('sku', true, 80, text), F('quantity', true, 9, re(/^[1-9][0-9]{0,8}$/))],
  RES: [F('resultId', true, 36, re(/^rsl_[0-9a-f]{32}$/)), F('fulfillmentRequestId', true, 128, re(ID('ful'))), F('revision', true, 6, re(/^[1-9][0-9]{0,5}$/)),
    F('status', true, 8, oneOf(['PENDING', 'HELD', 'SHIPPED', 'REJECTED'])), F('orderId', true, 128, re(ID('ord'))),
    F('shipmentId', r => r.status === 'SHIPPED', 128, re(ID('shp'))), F('statusAt', true, 24, timestamp),
    F('reasonCode', r => r.status === 'REJECTED', 32, oneOf(REJECTION_CODES)), F('reasonText', r => r.status === 'REJECTED', 200, text),
    F('correlationId', false, 128, text), F('traceparent', false, 55, re(TRACEPARENT))],
  ERR: [F('errorId', true, 36, re(/^err_[0-9a-f]{32}$/)), F('inboundFileName', true, 255, text), F('fulfillmentRequestId', false, 128, re(ID('ful'))),
    F('errorCode', true, 32, oneOf(ERROR_CODES)), F('detail', true, 200, text)],
  TRL: [F('recordCount', true, 3, re(/^[1-9][0-9]{0,2}$/))],
};
// Conditional fields (required as a function) must be empty when the condition is false.
const NAME = {
  REQ: /^REQ\.ful_[A-Za-z0-9_-]{1,124}\.[0-9a-f]{8,32}\.erp1$/,
  RES: /^RES\.ful_[A-Za-z0-9_-]{1,124}\.[0-9]{6}\.rsl_[0-9a-f]{32}\.erp1$/,
  ERR: /^ERR\.err_[0-9a-f]{32}\.erp1$/,
};

class ProtocolError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const fail = (code, detail) => { throw new ProtocolError(code, detail); };

const splitFields = line => {
  const fields = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') {
      const n = line[i + 1];
      if (n !== '|' && n !== '\\') return null;
      cur += n; i++;
    } else if (c === '|') { fields.push(cur); cur = ''; } else cur += c;
  }
  fields.push(cur);
  return fields;
};

const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;

export function parse(bytes, fileName) {
  try { return { ok: true, ...parseOrThrow(bytes, fileName) }; } catch (e) {
    if (e instanceof ProtocolError) return { ok: false, code: e.code, detail: e.message };
    throw e;
  }
}

function parseOrThrow(bytes, fileName) {
  const expectedType = ['REQ', 'RES', 'ERR'].find(t => NAME[t].test(fileName));
  if (!expectedType) fail('FILENAME_MISMATCH', `not a ready name: ${fileName}`);
  if (bytes.length > MAX_FILE_BYTES) fail('FILE_TOO_LARGE', `${bytes.length} bytes`);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('ENCODING', 'byte-order mark');
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('ENCODING', 'invalid UTF-8'); }
  if (CONTROL.test(content)) fail('ENCODING', 'control character');
  if (content.length === 0 || !content.endsWith('\n')) fail('TRUNCATED', 'missing final LF');
  const version = /^HDR\|ERP([0-9]+)(\||\n)/.exec(content);
  if (!version) fail('MALFORMED_RECORD', 'file does not start with HDR|ERP<n>');
  if (version[1] !== '1') fail('UNSUPPORTED_VERSION', `ERP${version[1]}`);

  const lines = content.slice(0, -1).split('\n');
  const records = [];
  let fileType = null;
  let lineCount = 0;
  let done = false;
  for (const line of lines) {
    const raw = line.split('|')[0];
    const fields = line === '' ? null : splitFields(line);
    if (!fields || !RECORDS[raw] || fields[0] !== raw) fail('MALFORMED_RECORD', `record ${records.length + 1}`);
    const spec = RECORDS[raw];
    if (fields.length - 1 !== spec.length) fail('MALFORMED_RECORD', `${raw} has ${fields.length - 1} fields`);
    // Position rules
    const n = records.length;
    const allowed = done ? []
      : n === 0 ? ['HDR']
      : n === 1 ? [expectedType]
      : fileType === 'REQ' ? (lineCount === 0 ? ['LIN'] : lineCount < 99 ? ['LIN', 'TRL'] : ['TRL'])
      : ['TRL'];
    if (!allowed.includes(raw)) fail('RECORD_ORDER', `${raw} at record ${n + 1}`);
    const values = {};
    spec.forEach((f, i) => {
      const v = fields[i + 1];
      const required = typeof f.required === 'function' ? f.required(values) : f.required;
      const conditional = typeof f.required === 'function';
      if (v === '') {
        if (required) fail('MISSING_FIELD', `${raw}.${f.name}`);
        values[f.name] = '';
        return;
      }
      if (f.max && [...v].length > f.max) fail('FIELD_LENGTH', `${raw}.${f.name}`);
      if (conditional && !required) fail('FIELD_VALUE', `${raw}.${f.name} must be empty`);
      if (raw === 'HDR' && f.name === 'fileType' && v !== expectedType) fail('FIELD_VALUE', `HDR.fileType ${v} but name is ${expectedType}`);
      if (f.rule && !f.rule(v)) fail('FIELD_VALUE', `${raw}.${f.name}`);
      values[f.name] = v;
    });
    if (raw === 'HDR') fileType = values.fileType;
    if (raw === 'LIN') {
      lineCount += 1;
      if (Number(values.lineNo) !== lineCount) fail('FIELD_VALUE', `LIN.lineNo ${values.lineNo} out of sequence`);
    }
    if (raw === 'TRL') done = true;
    records.push({ type: raw, ...values });
  }
  if (!done) fail('TRUNCATED', 'no TRL');
  const trl = records[records.length - 1];
  if (Number(trl.recordCount) !== records.length) fail('COUNT_MISMATCH', `TRL says ${trl.recordCount}, found ${records.length}`);

  const body = records[1];
  const expected = fileType === 'REQ' ? new RegExp(`^REQ\\.${escapeRe(body.fulfillmentRequestId)}\\.[0-9a-f]{8,32}\\.erp1$`)
    : fileType === 'RES' ? new RegExp(`^RES\\.${escapeRe(body.fulfillmentRequestId)}\\.${body.revision.padStart(6, '0')}\\.${body.resultId}\\.erp1$`)
    : new RegExp(`^ERR\\.${body.errorId}\\.erp1$`);
  if (!expected.test(fileName)) fail('FILENAME_MISMATCH', fileName);
  return { fileType, records };
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

// Equivalence (SPEC section 6) for two parsed REQ files.
export function equivalent(a, b) {
  const key = p => {
    const req = p.records.find(r => r.type === 'REQ');
    const lines = p.records.filter(r => r.type === 'LIN').map(r => [r.lineNo, r.sku, r.quantity]);
    return JSON.stringify([req.fulfillmentRequestId, req.orderId, req.reservationId, req.siteId, lines]);
  };
  return key(a) === key(b);
}

// Writer used only for the mapping fixture (SPEC section 8).
export const escapeField = v => String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
export function requestFileFromEvent(event, createdAt) {
  const p = event.payload;
  const requestedAt = new Date(event.occurredAt).toISOString();
  const rows = [
    ['HDR', 'ERP1', 'REQ', createdAt],
    ['REQ', p.fulfillmentRequestId, p.orderId, p.reservationId, p.siteId, 'EVENT', requestedAt, event.correlationId ?? '', event.traceparent ?? ''],
    ['LIN', '1', p.sku, String(p.quantity)],
    ['TRL', '4'],
  ];
  return rows.map(r => r.map(escapeField).join('|')).join('\n') + '\n';
}

// File-name classification (SPEC section 4): 'ready', 'ignore' (in progress) or 'quarantine'/'unexpected'.
const READY = { inbound: [NAME.REQ], outbound: [NAME.RES, NAME.ERR] };
export function classify(area, name) {
  if (name.startsWith('.') && name.endsWith('.tmp')) return 'ignore';
  if (READY[area].some(r => r.test(name))) return 'ready';
  return 'quarantine';
}

// Result consumer (SPEC section 7). Returns one outcome per delivery and the final state.
export function consume(sent, deliveries) {
  const requests = new Map(sent.map(r => [r.fulfillmentRequestId, { orderId: r.orderId, seen: [], applied: null }]));
  const outcomes = deliveries.map(({ bytes, name }) => {
    const p = parse(bytes, name);
    if (!p.ok || p.fileType !== 'RES') return 'quarantine';
    const r = p.records[1];
    const req = requests.get(r.fulfillmentRequestId);
    if (!req || r.orderId !== req.orderId) return 'quarantine';
    const rev = Number(r.revision);
    const key = Buffer.from(bytes).toString('base64');
    const sameId = req.seen.find(s => s.resultId === r.resultId);
    if (sameId) return sameId.key === key ? 'duplicate' : 'quarantine';
    if (req.seen.some(s => s.revision === rev)) return 'quarantine';
    if (r.status === 'SHIPPED' && req.seen.some(s => s.status === 'SHIPPED' && s.shipmentId !== r.shipmentId)) return 'quarantine';
    const a = req.applied;
    if (a && ['SHIPPED', 'REJECTED'].includes(a.status) && rev > a.revision) return 'quarantine';
    const entry = { resultId: r.resultId, key, revision: rev, status: r.status, shipmentId: r.shipmentId };
    req.seen.push(entry);
    if (!a || rev > a.revision) { req.applied = entry; return 'apply'; }
    return 'late';
  });
  const final = Object.fromEntries([...requests].filter(([, v]) => v.applied).map(([k, v]) =>
    [k, { status: v.applied.status, revision: v.applied.revision, shipmentId: v.applied.shipmentId }]));
  return { outcomes, final };
}
