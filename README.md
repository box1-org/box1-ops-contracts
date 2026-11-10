# Box1 operations contracts

Versioned event and HTTP contracts for the Box1 order lifecycle. This repository is the source of truth for shared schemas; producers and consumers must not copy or independently redefine these contracts.

The v1 envelope carries stable event metadata and a versioned payload. Delivery is at least once. Consumers record `eventId` transactionally with business effects, and order lifecycle topics use `orderId` as their partition key. Breaking changes require a v2 event or endpoint and an agreed migration plan.

Run the checks with Node.js 20.11+:

```sh
npm ci
npm test
npm run validate
```

No credentials, customer PII, live topic data, or database exports belong here.

The legacy ERP file protocol (`ERP1`), shared by the ERP appliance and the fulfillment adapter, is in [`legacy/erp-file/v1/`](legacy/erp-file/v1/SPEC.md) with its golden fixtures.

Notification events, notice types and their deduplication rules are in [`NOTIFICATION.md`](NOTIFICATION.md).

Edge site events, the site topic, their effect in the Inventory service, site pick lists and the site status API are in [`SITE.md`](SITE.md).

PostgreSQL ownership, Flyway rules, Secret bootstrap, storage, backup, and restore guidance is in [`postgres/`](postgres/).
