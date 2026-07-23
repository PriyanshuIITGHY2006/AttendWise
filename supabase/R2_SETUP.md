# Cloudflare R2 storage for Materials

Materials files can be stored in **Cloudflare R2** (10 GB free, **free egress**)
instead of Supabase Storage (1 GB free). The app auto-detects: until the four
R2 secrets below are set, uploads go to Supabase as before; once they're set,
**new** uploads go to R2 (old Supabase files keep working).

No code changes are needed to switch — just do the steps below.

## 1. Create the R2 bucket
1. Cloudflare dashboard → **R2** (enabling R2 requires a card on file; you are
   not charged under the free limits).
2. **Create bucket** → name it e.g. `attendwise-materials`. Keep it **private**.
3. Note your **Account ID** (shown on the R2 overview / in the dashboard URL).

## 2. Create an API token
1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permission: **Object Read & Write**, scoped to the bucket above.
3. Copy the **Access Key ID** and **Secret Access Key** (shown once).

## 3. Set the Edge Function secrets in Supabase
Supabase dashboard → **Edge Functions → Secrets** (or `supabase secrets set`):

```
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=attendwise-materials
```

The `materials-storage` function is already deployed; it picks these up
automatically.

## 4. Add a CORS policy to the bucket
Browsers upload/download **directly** to R2 via presigned URLs, so the bucket
must allow the app's origin. R2 bucket → **Settings → CORS Policy**:

```json
[
  {
    "AllowedOrigins": [
      "https://priyanshuiitghy2006.github.io",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

(The native app loads from the GitHub Pages origin, so that entry covers it too.)

## 5. Test
1. In the app, add a file to any folder.
2. It should appear in the R2 bucket (Cloudflare dashboard → bucket → objects),
   **not** in Supabase Storage.
3. If it still lands in Supabase, open the browser console — the app logs the
   exact R2 error (`r2_not_configured`, a CORS failure, or a signing error).
   Most likely a missing secret (step 3) or CORS (step 4).

## Notes
- Existing Supabase-stored files are untouched and keep working; only new
  uploads use R2. A stored file's backend is encoded in `materials.file_path`
  (`r2:` prefix = R2, otherwise Supabase).
- R2 credentials never reach the browser — the client only ever receives
  short-lived presigned URLs from the `materials-storage` edge function.
