# Card inactivity reminders

Settings add an opt-in inactivity reminder, off by default, with a default of two calendar months (range 1–24). A qualifying card must be active/unarchived, unexpired (expiry date inclusive), have unused minutes and a valid email address. At least one dated negative-minute transaction is required; loads and zero-minute records do not count as treatments. Without a reliable treatment record the reminder is skipped.

The latest debit supplies the last treatment date in Asia/Jerusalem. Month arithmetic clamps month ends. A later purchase/renewal starts a fresh waiting period to avoid immediately reminding someone who just renewed. Changing the threshold does not change the dedupe key: one inactivity reminder per latest treatment and card cycle. A subsequent treatment starts a new waiting period. The existing daily protected cron and notification log handle delivery; the existing expiry/gift reminders retain their behavior.

The email includes the exact remaining minutes, card expiry date, the existing booking URL and personal-card link. No patient data, links, tokens, balances or transactions are rewritten. The additive SQL file creates only two settings columns and asserts that all pre-existing business values are identical before and after the change inside the same transaction. Existing access policies are retained.

Disabled transaction emails no longer create a notice. Successful/duplicate-send notices clear after five seconds and changing the selected client clears the previous notice. Missing-email and send-error notices remain visible.

Validation uses synthetic fixtures only: calendar-month boundaries, clinic timezone, eligibility/exclusions, latest debit versus loads, once-per-episode delivery, reset after a new treatment/renewal, exact email balance/URLs and silent/temporary notifications. No live reminder/email endpoint is invoked as a test. Production build and existing security regression tests are required before deployment.
