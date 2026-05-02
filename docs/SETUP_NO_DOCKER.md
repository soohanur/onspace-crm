# Running without Docker

If you can't (or don't want to) run Docker, this project supports a fully user-space stack: portable Postgres + a tiny Redis built from source. No `sudo` required.

## One-time install

```bash
DEV=$HOME/.local/onspace-dev
mkdir -p $DEV/{src,bin,data,redis-data,logs,pg}

# --- Redis (build from source) ---
cd $DEV/src
curl -fsSL -o redis.tar.gz https://download.redis.io/releases/redis-7.4.1.tar.gz
tar xzf redis.tar.gz
cd redis-7.4.1 && make BUILD_TLS=no -j4
cp src/redis-server src/redis-cli $DEV/bin/

# --- Postgres (Zonky portable binaries, run-in-place) ---
cd $DEV/src
curl -fsSL -o pg.jar "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/16.4.0/embedded-postgres-binaries-linux-amd64-16.4.0.jar"
unzip -p pg.jar postgres-linux-x86_64.txz > postgres.txz
cd $DEV/pg && tar xJf $DEV/src/postgres.txz

# --- Init Postgres cluster + DB ---
$DEV/pg/bin/initdb -D $DEV/data --username=onspace --pwfile=<(echo onspace) --auth=md5 --auth-host=md5 --auth-local=md5 -E UTF8 --no-locale
$DEV/pg/bin/pg_ctl -D $DEV/data -l $DEV/logs/pg.log -o "-p 5432 -k /tmp" start

# (Postgres now running. Create the app DB via Python — psql isn't bundled in the Zonky tarball.)
python3 -c "
import psycopg
c = psycopg.connect(host='localhost', port=5432, user='onspace', password='onspace', dbname='postgres', autocommit=True)
c.execute('CREATE DATABASE onspace_crm')
"
```

## Daily dev loop

```bash
./scripts/dev.sh
```

The script:
1. Starts Postgres + Redis if they're not already listening on 5432 / 6379.
2. Exports the right DATABASE_URL / REDIS_HOST.
3. Runs `prisma migrate deploy` (idempotent).
4. Launches `turbo run dev --parallel` to start API + Web.

## Stopping

```bash
$HOME/.local/onspace-dev/pg/bin/pg_ctl -D $HOME/.local/onspace-dev/data stop
pkill -f "redis-server.*6379"
```

## Why this exists

Phase 1 was developed and verified end-to-end on a machine without Docker access. The portable approach above is what was actually used to scrape ~12 dentist listings from YellowPages with full structured data (rating, hours, lat/lng, social links, business descriptions) in under 2 minutes.
