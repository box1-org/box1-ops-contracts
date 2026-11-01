# Storage, backup, and restore

## Lab storage profile

The current single-node lab uses storage class `lvms-vg1`, `ReadWriteOnce` PVCs, and a 5Gi starting request for generated service databases. Size is a starting capacity, not a durability guarantee. Node-local LVM and one database replica provide no node-level HA. Monitor PVC usage and expand before exhaustion; do not assume a PVC resize is a backup.

Keep database data PVCs, credentials, and backups under separate ownership. A database backup must be written to protected object or file storage outside the database PVC. The lab profile does not establish production RPO/RTO or vendor support for a particular operator/version combination.

## Backup procedure

Run from a PostgreSQL client environment with the service Secret loaded without printing it:

```sh
export PGHOST='<service>-postgres.<namespace>.svc'
export PGPORT=5432
export PGDATABASE='<service database>'
export PGUSER='<service runtime user>'
export PGPASSWORD='(read from the approved Secret; do not echo)'
pg_dump --format=custom --no-owner --no-acl --file=/protected/<service>-$(date -u +%Y%m%dT%H%M%SZ).dump "$PGDATABASE"
sha256sum /protected/<service>-*.dump > /protected/<service>-checksums.txt
```

Record the database name, source revision, dump timestamp, PostgreSQL client/server versions, and checksum. Do not store `PGPASSWORD` in shell history or logs.

## Restore rehearsal

Restore into a new isolated database or disposable namespace. Never use `--clean` against a live service database for a rehearsal:

```sh
createdb --host "$PGHOST" --username "$PGUSER" box1_restore_check
pg_restore --list /protected/<service>-<timestamp>.dump
pg_restore --no-owner --no-acl --dbname box1_restore_check /protected/<service>-<timestamp>.dump
psql --dbname box1_restore_check --command 'SELECT count(*) FROM orders;'
```

Compare representative row counts and a known checksum/query result with the seeded fixture. Record the restore database, result, checksum, and cleanup separately. Destructive restore, production recovery, and scheduled backup compliance are **not tested** by this repository slice.
