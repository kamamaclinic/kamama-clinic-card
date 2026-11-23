# Security update — 2026-11-23

Existing /card/:token and /gift/:code URLs remain unchanged. No existing code, token, card balance, voucher, transaction, contact, note or history is rewritten.

Public gift viewing now uses a server endpoint restricted to the exact supplied code. It returns only fields needed to display that voucher and excludes recipient email. The base gift table is restricted to the existing clinic-owner account, as are notification settings and logs. The SQL access update checks a hash of every business row before and after the permission changes inside the same transaction and aborts if any row changes. Apply it after the compatible frontend/server deployment.

Authenticated email actions require the existing owner user ID. Cron authentication fails closed and no longer trusts the forgeable x-vercel-cron header. Existing Vercel cron uses its configured CRON_SECRET. Newly created gift codes use cryptographic randomness (192 bits); all older codes remain valid. Legacy short codes remain weaker bearer credentials; preserving them is intentional compatibility, not a claim that historical links have been rotated.

Validation: production build; synthetic owner/cron/exact-code tests; live read-only checks of anonymous table access and existing link compatibility. No real email sends or business-record writes are used as tests. A Git snapshot is a source recovery point, not a database backup. Policy changes can be reverted independently of source deployment; avoid rolling source back to direct anonymous gift-table access after applying the restrictive policy.
