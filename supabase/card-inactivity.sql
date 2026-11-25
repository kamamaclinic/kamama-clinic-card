-- Optional settings only. Roll back if any pre-existing business value changes.
DO $preserve$
DECLARE before_digest text; after_digest text;
BEGIN
  LOCK TABLE public.clients,public.transactions,public.gift_vouchers,
    public.notification_log,public.notification_settings IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(coalesce(string_agg(table_name || ':' || digest, '' ORDER BY table_name,digest),''))
  INTO before_digest
  FROM (
    SELECT 'clients' AS table_name,md5(to_jsonb(t)::text) AS digest FROM public.clients t
    UNION ALL SELECT 'transactions',md5(to_jsonb(t)::text) FROM public.transactions t
    UNION ALL SELECT 'gift_vouchers',md5(to_jsonb(t)::text) FROM public.gift_vouchers t
    UNION ALL SELECT 'notification_log',md5(to_jsonb(t)::text) FROM public.notification_log t
    UNION ALL SELECT 'notification_settings',md5((to_jsonb(t)-'notify_card_inactivity'-'card_inactivity_months')::text) FROM public.notification_settings t
  ) snapshots;
  ALTER TABLE public.notification_settings
    ADD COLUMN IF NOT EXISTS notify_card_inactivity boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS card_inactivity_months integer NOT NULL DEFAULT 2
      CHECK (card_inactivity_months BETWEEN 1 AND 24);
  SELECT md5(coalesce(string_agg(table_name || ':' || digest, '' ORDER BY table_name,digest),''))
  INTO after_digest
  FROM (
    SELECT 'clients' AS table_name,md5(to_jsonb(t)::text) AS digest FROM public.clients t
    UNION ALL SELECT 'transactions',md5(to_jsonb(t)::text) FROM public.transactions t
    UNION ALL SELECT 'gift_vouchers',md5(to_jsonb(t)::text) FROM public.gift_vouchers t
    UNION ALL SELECT 'notification_log',md5(to_jsonb(t)::text) FROM public.notification_log t
    UNION ALL SELECT 'notification_settings',md5((to_jsonb(t)-'notify_card_inactivity'-'card_inactivity_months')::text) FROM public.notification_settings t
  ) snapshots;
  IF before_digest IS DISTINCT FROM after_digest THEN
    RAISE EXCEPTION 'Existing data changed; rolling back inactivity settings';
  END IF;
END;
$preserve$;
NOTIFY pgrst, 'reload schema';
