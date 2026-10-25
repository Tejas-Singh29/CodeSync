# Hosted Judge0 setup

CodeSync sends submissions only to the hosted Judge0-compatible service configured on the backend. It never compiles or runs submitted code locally.

Copy the Judge0 settings into the server's `.env` (never into React's `REACT_APP_*` variables). Set `JUDGE0_API_URL`, and set `JUDGE0_API_KEY` only when the selected provider requires one. The provider-specific `JUDGE0_AUTH_HEADER` and optional `JUDGE0_AUTH_SCHEME` determine how that key is sent. For example, a provider may document a header named `X-Auth-Token`; do not use that example unless the provider documents it.

The default configuration targets the documented public CE API: `https://ce.judge0.com`, `POST /submissions/?base64_encoded=false&wait=false`, and `GET /submissions/{token}?base64_encoded=false`. It uses the IDs currently returned by `GET /languages/`: C/GCC 14.1.0 `103`, C++/GCC 14.1.0 `105`, Python 3.11.2 `92`, Java JDK 17.0.6 `91`, and Node.js 20.17.0 `97`. These are environment-overridable because language availability can change.

The default authentication header is `X-Auth-Token`, but it is only sent when `JUDGE0_API_KEY` is non-empty. Set `JUDGE0_AUTH_HEADER` if another host documents a different header. Set the provider-specific paths, base64 behavior, and language IDs when switching hosts. If a host requires a key, configure it; the application does not invent credentials or silently use local execution.

Before relying on a zero-cost deployment, verify the selected provider's current free-tier quota, per-minute submission/request limits, authentication requirements, data retention policy, maximum source/input sizes, and whether polling is permitted. Free tiers are provider-specific and are not assumed to be unlimited. This project does not subscribe to plans, enable billing, or make provider-account changes.

Run the server with `npm run server:dev` and the frontend with `npm run start:front`. Open a room, choose a room language, enter optional stdin, and select **Run Code**. A real end-to-end run requires valid provider settings and credentials.
