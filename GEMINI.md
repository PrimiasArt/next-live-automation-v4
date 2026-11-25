# Workspace Sync & Development Rule (`F:` <-> `D:\PJ`)

## 1. Dual-Write Mirroring (`F:` and `D:\PJ`)
- Every code, UI, config, or documentation change made for this project in `F:\SJ\Next Live Automation v4` MUST also be written identically to `D:\PJ\SJ\Next Live Automation v4` (and vice versa).
- Keep both copies synced on code/config/system assets (`config.py`, `core/`, `web/`, `run.py`, `app.py`, `api/`, `vercel.json`, `.vercelignore`, `data/system_avatars.json`, `storage/system_avatars/`). Do NOT overwrite runtime user data or caches (`data/api_keys.json`, `data/users.json`, `data/tokens.json`, `data/ai_settings.json`, `storage/users/`, `storage/voice_samples/`) unless explicitly requested.

## 2. Failover When Drive `F:` Disconnects
- If `F:\SJ\Next Live Automation v4` becomes unavailable/unmounted (`no such directory` or `file does not exist`), continue development, testing, and Git operations directly in `D:\PJ\SJ\Next Live Automation v4`.
- As soon as `F:\SJ\Next Live Automation v4` reconnects, immediately sync all modified files and Git commits from `D:\PJ\SJ\Next Live Automation v4` back to `F:\SJ\Next Live Automation v4` so both directories match before finishing.

## 3. Environment & Verification Notes
- Working Python & Node binaries on this machine: `C:\Users\nguye\.conda\envs\nkspace\python.exe` and `C:\Users\nguye\.conda\envs\nkspace\node.exe` (`ffmpeg.exe` is in `C:\Users\nguye\.conda\envs\nkspace\Library\bin\ffmpeg.exe`, resolved by `core/runtime_utils.py`).
- Keep `VercelPathFixMiddleware` (`web/app.py`), `vercel.json` (`?__vercel_path=$1`), and `/index.html` in `.vercelignore` intact whenever updating GitHub `main`/`master` so `https://hlclive.vercel.app` deploys cleanly.
