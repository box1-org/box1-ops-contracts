# Legacy ERP file protocol v1 (`ERP1`)

Status: v1, shared by the ERP appliance ([box1-docs#14](https://github.com/box1-org/box1-docs/issues/14)) and the fulfillment adapter ([box1-docs#13](https://github.com/box1-org/box1-docs/issues/13)). Both implement this document and test against [`fixtures/`](fixtures/) unchanged; neither keeps a copy. A change that makes a valid v1 file invalid, or changes a file's meaning, needs `ERP2`.

The ERP has no HTTP, OpenAPI or Kafka interface. The adapter delivers one fulfillment request per file over SFTP; the ERP answers with result files and error files.

## 1. Encoding and framing

These rules hold for every version, so a reader can always find the version.

- UTF-8 without a byte-order mark. Invalid UTF-8 is an error.
- One record per line. Every record, including the last, ends with LF (`0x0A`). CR (`0x0D`) is not allowed anywhere.
- No control characters (U+0000–U+001F except the LF terminator, U+007F–U+009F) anywhere in the file.
- The first record starts with `HDR|ERP<n>` followed by `|` or the end of the line, where `<n>` is a decimal version. v1 is `ERP1`.
- Fields are separated by `|`. Inside a field value, `\|` is a literal `|` and `\\` is a literal `\`. Any other `\` sequence, or a trailing lone `\`, is malformed. Writers escape every `|` and `\` in a value; no other characters are escaped.
- Lengths are counted in Unicode code points after unescaping (as JSON Schema `maxLength` does). Implementations in UTF-16 languages must not use the UTF-16 length.
- Values are compared exactly, code point by code point. Nobody applies Unicode normalization.
- An empty field means "absent". Required fields must not be empty.
- Maximum file size: 65,536 bytes.

## 2. Files and record order

Every file is `HDR`, one body record, any `LIN` records the type allows, then `TRL`. The file name decides the expected type (section 4).

| Type | Written by | Records, in order |
|---|---|---|
| `REQ` request | adapter | `HDR`, `REQ`, 1–99 `LIN`, `TRL` |
| `RES` result | ERP | `HDR`, `RES`, `TRL` |
| `ERR` inbound error | ERP | `HDR`, `ERR`, `TRL` |

### Records

Field positions are 1-based after the record type. Every record has exactly the listed number of fields.

**`HDR|<magic>|<fileType>|<createdAt>`**

| # | Field | Req. | Max | Rule |
|---|---|---|---|---|
| 1 | magic | yes | — | `ERP1`; checked before anything else in the file (section 3, step 4) |
| 2 | fileType | yes | 3 | the type the file name implies: `REQ`, `RES` or `ERR` |
| 3 | createdAt | yes | 24 | timestamp |

**`REQ|<fulfillmentRequestId>|<orderId>|<reservationId>|<siteId>|<origin>|<requestedAt>|<correlationId>|<traceparent>`**

| # | Field | Req. | Max | Rule |
|---|---|---|---|---|
| 1 | fulfillmentRequestId | yes | 128 | `^ful_[A-Za-z0-9_-]{1,124}$` |
| 2 | orderId | yes | 128 | `^ord_[A-Za-z0-9_-]{1,124}$` |
| 3 | reservationId | yes | 128 | `^res_[A-Za-z0-9_-]{1,124}$` |
| 4 | siteId | yes | 128 | `^site_[A-Za-z0-9_-]{1,123}$` |
| 5 | origin | yes | 5 | `EVENT` (from `fulfillment.requested.v1`) or `API` (adapter REST) |
| 6 | requestedAt | yes | 24 | timestamp |
| 7 | correlationId | no | 128 | any text |
| 8 | traceparent | no | 55 | `^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$` |

**`LIN|<lineNo>|<sku>|<quantity>`**

| # | Field | Req. | Max | Rule |
|---|---|---|---|---|
| 1 | lineNo | yes | 2 | `^[1-9][0-9]?$`; lines are numbered 1, 2, 3… in file order |
| 2 | sku | yes | 80 | any text |
| 3 | quantity | yes | 9 | `^[1-9][0-9]{0,8}$` (1 to 999,999,999) |

**`RES|<resultId>|<fulfillmentRequestId>|<revision>|<status>|<orderId>|<shipmentId>|<statusAt>|<reasonCode>|<reasonText>|<correlationId>|<traceparent>`**

| # | Field | Req. | Max | Rule |
|---|---|---|---|---|
| 1 | resultId | yes | 36 | `^rsl_[0-9a-f]{32}$` |
| 2 | fulfillmentRequestId | yes | 128 | as `REQ` |
| 3 | revision | yes | 6 | `^[1-9][0-9]{0,5}$` |
| 4 | status | yes | 8 | `PENDING`, `HELD`, `SHIPPED`, `REJECTED` |
| 5 | orderId | yes | 128 | as `REQ` |
| 6 | shipmentId | if `SHIPPED` | 128 | `^shp_[A-Za-z0-9_-]{1,124}$`; empty for any other status |
| 7 | statusAt | yes | 24 | timestamp of the state change |
| 8 | reasonCode | if `REJECTED` | 32 | a rejection code (section 5); empty otherwise |
| 9 | reasonText | if `REJECTED` | 200 | operator text; empty otherwise |
| 10 | correlationId | no | 128 | echoed from the request |
| 11 | traceparent | no | 55 | echoed from the request |

**`ERR|<errorId>|<inboundFileName>|<fulfillmentRequestId>|<errorCode>|<detail>`**

| # | Field | Req. | Max | Rule |
|---|---|---|---|---|
| 1 | errorId | yes | 36 | `^err_[0-9a-f]{32}$` |
| 2 | inboundFileName | yes | 255 | the rejected file's name, made writable (below) |
| 3 | fulfillmentRequestId | no | 128 | as `REQ`, when it could be read from the file or its name |
| 4 | errorCode | yes | 32 | an error code (section 5) |
| 5 | detail | yes | 200 | human-readable; no request content beyond IDs |

A received file name may not be valid in a record. The ERP decodes it as UTF-8 replacing invalid bytes with U+FFFD, replaces each control character with `?`, and keeps the first 255 code points.

**`TRL|<recordCount>`**: total records in the file including `HDR` and `TRL`, `^[1-9][0-9]{0,2}$`.

**Timestamps** are UTC, exactly `YYYY-MM-DDTHH:MM:SS.sssZ` (24 characters), with a year from 1970 to 9999, seconds 00–59 (no leap second), and a real calendar date. Writers convert other offsets to UTC and truncate below milliseconds.

## 3. Validation order

Readers stop at the first violation, in this order, so both implementations report the same code. Fixtures depend on it.

0. The entry is not a regular file the reader can open without following a link: `UNREADABLE`. Then: the file name is not a ready name for any file type (section 4): `FILENAME_MISMATCH`. The name gives the expected file type.
1. Size over 65,536 bytes: `FILE_TOO_LARGE`.
2. Invalid UTF-8, a BOM, CR, or another control character: `ENCODING`.
3. Empty file, or last byte not LF: `TRUNCATED`.
4. The first record does not start with `HDR|ERP<n>` followed by `|` or end of line: `MALFORMED_RECORD`. It does, but `<n>` is not `1`: `UNSUPPORTED_VERSION`.
5. Records in order. For each record:
   1. unknown record type, wrong field count, an empty line, or a bad escape: `MALFORMED_RECORD`;
   2. record type not allowed at this position for the expected file type (for example `LIN` before `REQ`, a second `REQ`, `TRL` before the first `LIN`, a 100th `LIN`, anything after `TRL`): `RECORD_ORDER`;
   3. fields left to right: empty required field `MISSING_FIELD`; longer than its maximum `FIELD_LENGTH`; otherwise not matching its rule `FIELD_VALUE` (this includes an `HDR` file type that differs from the name's, `lineNo` out of sequence, and a non-empty conditional field that must be empty).
6. End of file reached without `TRL`: `TRUNCATED`.
7. `TRL` record count differs from the actual count: `COUNT_MISMATCH`.
8. IDs in the name differ from the file's (`REQ`: the request ID; `RES`: request ID, zero-padded revision and `resultId`; `ERR`: `errorId`): `FILENAME_MISMATCH`.

`CONFLICTING_REUSE` is decided by the ERP ledger after a request file is valid (section 6).

## 4. File names, areas and publication

| Name pattern | Meaning |
|---|---|
| `REQ.<fulfillmentRequestId>.<nonce>.erp1`, nonce `[0-9a-f]{8,32}` | request; nonce is chosen by the adapter per upload so retries never overwrite a different upload |
| `RES.<fulfillmentRequestId>.<revision as 6 digits>.<resultId>.erp1` | result |
| `ERR.<errorId>.erp1` | inbound error |
| `.<anything>.tmp` | in progress; never read |

Areas on the exchange filesystem, all on one filesystem so a rename never copies:

| Area | Adapter | ERP |
|---|---|---|
| `inbound/` | uploads `.<name>.tmp`, renames to the ready name | reads ready names; moves each processed file out of the exchange to its private archive or quarantine |
| `outbound/` | reads ready names; after committing (or quarantining) a file on its side, renames it to `consumed/<name>.<nonce>`, nonce `[0-9a-f]{8,32}` | writes `.<name>.tmp`, renames to the ready name |
| `consumed/` | owns; may delete after its own retention | may purge files older than 7 days |

The per-move nonce in `consumed/` means a re-emitted result with the same name never collides with an earlier copy, so plain SFTP rename works.

In `inbound/`, a file that is neither a ready `REQ` name nor a `.tmp` name is quarantined with `FILENAME_MISMATCH` without being parsed. An entry the ERP cannot read as a regular file (a directory, a symbolic link, a device, or a file it lacks permission to read) is moved to quarantine unopened with `UNREADABLE`; the ERP never follows a link. Every quarantined upload gets its own `ERR` file, even when an earlier upload had the same name and bytes. In `outbound/`, a file that is neither a ready `RES` or `ERR` name nor a `.tmp` name is unexpected: the adapter quarantines it on its side and moves it to `consumed/` like any other file. The ERP's archive and quarantine are private to the appliance and are not reachable over SFTP. Every quarantined inbound file produces an `ERR` file. The SFTP account cannot reach the ERP database.

**Commit order.** The ERP commits a request (or its quarantine record and `ERR` intent) to its ledger before it moves the inbound file out of the exchange. A crash in between re-reads the file, which deduplicates (section 6). The adapter commits a result on its side before moving it to `consumed/`. Either side may deliver again at any time: the adapter may resend an equivalent request under a new nonce to recover a lost upload.

**Visibility versus durability.** A rename makes a complete file visible atomically; it does not make it durable. The ERP writes a file, `fsync`s it, renames it, then `fsync`s the directory, and only then records it as published. A crash before that point republishes the same name and bytes after restart. SFTP writers cannot `fsync`; readers rely on the `TRL` count to detect a truncated file.

## 5. Codes

**Result status.** `PENDING`: imported, waiting for an operator or automatic processing. `HELD`: an operator stopped automatic processing; waiting is not a transport failure. `SHIPPED` (terminal): `shipmentId` and `statusAt` give the shipment. `REJECTED` (terminal): a business rejection; the adapter maps it to `shipment.failed.v1` with `retryable: false`.

**Rejection reason codes.** `STOCK_UNAVAILABLE`, `SITE_UNAVAILABLE`, `DAMAGED_GOODS`, `OPERATOR_CANCELLED`, `OTHER`. `reasonText` is operator free text for troubleshooting and must not be copied into events.

**Error codes** (in `ERR` files). `UNREADABLE` (not a regular file, or the ERP lacks permission to read it), `FILE_TOO_LARGE`, `ENCODING`, `TRUNCATED`, `MALFORMED_RECORD`, `UNSUPPORTED_VERSION`, `RECORD_ORDER`, `MISSING_FIELD`, `FIELD_LENGTH`, `FIELD_VALUE`, `COUNT_MISMATCH`, `FILENAME_MISMATCH`, `CONFLICTING_REUSE`. An error file means the ERP did not accept that file. It does not change any request's state; the adapter decides whether to fix and resend.

## 6. Request identity and equivalence

`fulfillmentRequestId` identifies a request. Two requests with the same ID are **equivalent** when `orderId`, `reservationId`, `siteId` and the ordered list of (`lineNo`, `sku`, `quantity`) are equal. `origin`, `requestedAt`, `correlationId`, `traceparent`, the header and the file name are not compared, so the same request from Kafka and from REST is equivalent.

- First valid file for an ID: the ERP records the request as `PENDING` and publishes revision 1.
- Equivalent repeat: no new revision and no new shipment; the ERP republishes its latest result for that request, unchanged.
- Non-equivalent repeat: quarantined with `CONFLICTING_REUSE`; the existing request is unchanged.

## 7. Results: identity, revisions and ordering

What the ERP guarantees:

- Each business-state change creates one result with the next revision (1, 2, 3…) and a new random `resultId`. `SHIPPED` and `REJECTED` are terminal, so nothing follows them.
- A result's bytes are fixed when it is created. Re-emitting a result publishes the same name and the same bytes; it never creates a new revision or shipment.
- At most one shipment exists per `fulfillmentRequestId`, so every `SHIPPED` result for a request carries the same `shipmentId`.
- Files may arrive in any order, more than once, and with gaps in revisions (an earlier revision may arrive later, or not at all, if the consumer acted on a later one first).

What a consumer does with a valid result file, per request. It keeps the `(revision, resultId, bytes)` of every result it has seen. Rows are checked top to bottom; the first match decides.

| Case | Outcome |
|---|---|
| Request ID the consumer never sent | `quarantine` |
| `orderId` different from the request's | `quarantine` |
| Same `resultId` and same bytes as one already seen | `duplicate`: no change |
| Same `resultId` as one already seen, different bytes | `quarantine` |
| Same revision as one already seen, different `resultId` | `quarantine` |
| `SHIPPED` with a `shipmentId` different from a `SHIPPED` already seen | `quarantine` |
| A revision higher than an applied terminal (`SHIPPED`/`REJECTED`) revision | `quarantine` |
| Revision higher than the highest applied | `apply` |
| Otherwise (a lower revision) | `late`: recorded, no state change; never regresses state |

A quarantined result is recorded with its reason and not applied. [`fixtures/manifest.json`](fixtures/manifest.json) `sequences` gives these cases as ordered deliveries with their expected outcomes and final state.

## 8. Mapping from `fulfillment.requested.v1`

| File field | Source |
|---|---|
| `REQ.fulfillmentRequestId`, `orderId`, `reservationId`, `siteId` | payload fields of the same names |
| `REQ.origin` | `EVENT` |
| `REQ.requestedAt` | envelope `occurredAt`, in UTC, truncated to milliseconds |
| `REQ.correlationId`, `REQ.traceparent` | envelope fields of the same names |
| one `LIN` with `lineNo` 1 | payload `sku`, `quantity` |

No v1 payload field is dropped. A value the protocol cannot carry (for example a quantity over 999,999,999 or a control character in `sku`) must be rejected by the adapter explicitly, not truncated. The manifest's `mapping` entry gives the exact expected file for the `fulfillment.requested.v1` event in [`../../../fixtures/events.json`](../../../fixtures/events.json).

## 9. Implementation notes

- **Camel Bindy alone cannot read ERP1.** Bindy's CSV support splits on a separator with quoting, not backslash escapes; it maps one class per line; and Java `String.length()` counts UTF-16 units. The adapter needs its own framing step (a custom `DataFormat` or a tokenizer before Bindy) that applies sections 1 and 3: escaping, code-point lengths and the validation order. Bindy, if used, then maps already-split, unescaped records by type.
- Neither side reads the other's private areas: the ERP never reads `consumed/`; the adapter never sees the ERP's archive, quarantine or database.

## 10. Fixtures

[`fixtures/manifest.json`](fixtures/manifest.json) lists every fixture with its expected outcome:

- `files`: a fixture file and, if valid, its parsed records with unescaped values; if invalid, the expected error code. Each is checked under the file name given.
- `equivalence`: pairs of valid request fixtures and whether they are equivalent.
- `names`: file names in `inbound/` and `outbound/` and whether each is `ready`, `ignore` (in progress) or `quarantine`.
- `sequences`: result deliveries in order, each with its expected outcome (`apply`, `duplicate`, `late`, `quarantine`), and the final status and shipment.
- `mapping`: an event, the `createdAt` to use, and the exact expected request file.

`npm test` checks the fixtures with a reference reader ([`reference/erp1.mjs`](reference/erp1.mjs)) that exists only to keep this specification and its fixtures consistent. Services implement their own reader and writer.
