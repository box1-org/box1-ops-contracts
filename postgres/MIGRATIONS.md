# Flyway migration rules

Services keep migrations in their own repositories under `src/main/resources/db/migration/` and use the shared examples here only as contract fixtures. A migration is immutable after it reaches any shared environment.

- Use Flyway versioned names: `V<integer>__<description>.sql`.
- Apply migrations in order before the application is marked ready.
- Keep one service's migrations independent from every other service.
- Use transactional DDL where PostgreSQL supports it; make non-transactional operations explicit and reversible.
- Add constraints and indexes with the owning service; do not add cross-service foreign keys.
- Record the Flyway schema history and checksum in deployment evidence.
- For breaking changes, use expand → dual read/write → backfill → contract rather than editing an applied migration.
- Test a migration against an empty database and a representative upgrade database before promotion.

The fixtures in `migrations/` demonstrate the minimum ownership boundaries. They are not a production schema and contain no customer data.
