# Recovery drills

`npm run test:drills` runs deterministic local drills for the four issue-21 acceptance behaviors:

- Outbox state and event are committed together; a replay after a simulated crash publishes one event by `eventId`.
- A transient consumer failure is redelivered, while a poison message reaches a bounded DLQ with attempt history.
- Service database owners cannot read another service's database in the isolation harness.
- A seeded state is serialized, checksummed, restored into an isolated copy, and compared.

Run the complete local suite with:

```sh
npm ci
npm test
npm run test:drills
npm run validate
```

These are implementation and simulation checks, not live PostgreSQL or Kafka evidence. Live acceptance still requires a provisioned database for each service and a ready `box1-kafka` cluster, followed by a real crash-before-publish test, consumer redelivery/DLQ replay, negative database-role checks, and `pg_dump` restore checksum comparison.
