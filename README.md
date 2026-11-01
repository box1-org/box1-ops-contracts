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
