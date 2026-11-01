# Secret bootstrap

Database passwords and connection strings are references, never Git content. The generated service workload may contain a clearly marked placeholder during scaffolding, but reconciliation must be blocked until the real Secret is provisioned.

Use one Secret per service, for example `<service>-postgres`, with these keys:

- `POSTGRESQL_DATABASE`
- `POSTGRESQL_USER`
- `POSTGRESQL_PASSWORD`
- `QUARKUS_DATASOURCE_PASSWORD`

The database bootstrap owner creates the database and login out of band or through the approved secret-management integration, grants only the service schema privileges, and records the Secret name—not its value—in deployment evidence. Prefer an ExternalSecret, SealedSecret, or equivalent connected secret manager when available. Do not put passwords in ConfigMaps, Kustomize literals, Git history, logs, fixtures, or issue comments.

Rotation requires coordinated password update, application restart/reload, and a connection check. Changing a Kubernetes Secret does not necessarily change an already initialized PostgreSQL role password; rotate the role deliberately and retain recovery access.
