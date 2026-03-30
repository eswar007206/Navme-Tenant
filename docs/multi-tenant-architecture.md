# Multi-Tenant Architecture

## What changed

- This stays as one shared dashboard. You do not create a new dashboard codebase per client.
- The shared Supabase project now uses `organizations` as the tenant boundary.
- Existing single-tenant rows are backfilled into the default organization `Suhas House`.
- Every tenant-owned table is expected to carry `organization_id`.
- Browser code is no longer supposed to read and write tables directly.
- The Node server is now the tenant-aware API boundary for dashboard logins, org management, and data mutations.
- Mattecraft and other internal dev apps should use generated organization API keys instead of wiring Supabase project ids and anon keys into their clients.

## Database upgrade

Run:

```sql
-- in Supabase SQL Editor
\i scripts/multi-tenant-upgrade.sql
```

If your SQL editor does not support `\i`, paste the contents of:

- [scripts/multi-tenant-upgrade.sql](C:\Users\nalam\OneDrive\Desktop\NavMePinnacle-main\scripts\multi-tenant-upgrade.sql)

## Required backend environment variables

Set these before running `npm run dev` or `npm start`:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_SESSION_SECRET=...
CORS_ALLOWED_ORIGINS=https://your-mattecraft-app.com,https://your-navme-dashboard.onrender.com
```

For the hosted multi-tenant setup, Mattecraft should call this backend API. You do not need browser-side `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` for the current dashboard flow.

## API surface

### Dashboard session

- `POST /api/auth/login`
- `GET /api/auth/session`

### Super admin

- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/admins`
- `POST /api/admins`
- `DELETE /api/admins/:id`
- `GET /api/api-keys`
- `POST /api/api-keys`

### Tenant-scoped data

- `POST /api/query`
- `POST /api/mutate`

### External ingestion

- `POST /api/external/query/:table`
- `POST /api/external/mutate/:table`
- `POST /api/ingest/:table`

Send the generated key as:

```http
x-navme-api-key: navme_...
```

The server hashes the key, resolves its organization, and scopes every request to that organization automatically.

For write requests, the server injects `organization_id` before insert or upsert operations and always applies `organization_id` filters before updates.

### Mattecraft integration pattern

Do this from Mattecraft or any internal tooling:

- Store the generated organization API key in the backend or server environment of the integrating app.
- Call the NavMe backend API instead of connecting that app directly to Supabase with the publishable key.
- Generate one key per client organization, such as `Suhas House` or `Eswar`, so each integration stays locked to that tenant.

Example read:

```bash
curl -X POST http://localhost:8080/api/external/query/ar_rooms \
  -H "x-navme-api-key: navme_..." \
  -H "Content-Type: application/json" \
  -d '{"select":"id,name,floor,metadata","orderBy":"name","ascending":true}'
```

Example write:

```bash
curl -X POST http://localhost:8080/api/external/mutate/access_control_zones \
  -H "x-navme-api-key: navme_..." \
  -H "Content-Type: application/json" \
  -d '{"operation":"upsert","rows":[{"zone_id":"vip-east","label":"VIP East","x":42,"y":20,"w":120,"h":80,"floor":"ground","zone_type":"vip","is_blocked":false}],"onConflict":"zone_id","select":"*"}'
```

## Current tenant bootstrap

- `Suhas House` becomes the default organization for all existing data.
- New organizations such as `Eswar` can be created from the super admin screen.
- Each organization receives its own login(s), emergency state row, and floor-nav placeholders.
