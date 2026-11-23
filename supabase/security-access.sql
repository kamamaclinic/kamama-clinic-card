-- Access-only hardening. No existing record, balance, token, code or URL changes.
-- Deploy api/gift.js and the updated client before applying this file.
DO $security$
DECLARE
  before_digest text;
  after_digest text;
BEGIN
  LOCK TABLE public.clients, public.transactions, public.gift_vouchers,
    public.notification_settings, public.notification_log IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(coalesce(string_agg(table_name || ':' || row_digest, '' ORDER BY table_name, row_digest),'')) INTO before_digest
  FROM (
    SELECT 'clients' AS table_name, md5(to_jsonb(t)::text) AS row_digest FROM public.clients t
    UNION ALL SELECT 'transactions',md5(to_jsonb(t)::text) FROM public.transactions t
    UNION ALL SELECT 'gift_vouchers',md5(to_jsonb(t)::text) FROM public.gift_vouchers t
    UNION ALL SELECT 'notification_settings',md5(to_jsonb(t)::text) FROM public.notification_settings t
    UNION ALL SELECT 'notification_log',md5(to_jsonb(t)::text) FROM public.notification_log t
  ) snapshots;

  ALTER POLICY "Anyone can view gift voucher by code" ON public.gift_vouchers TO anon USING (false);
  ALTER POLICY "Admin can manage gift vouchers" ON public.gift_vouchers TO authenticated
    USING ((select auth.uid()) = '3903aa50-e4db-4165-b673-3a61803f13c7'::uuid)
    WITH CHECK ((select auth.uid()) = '3903aa50-e4db-4165-b673-3a61803f13c7'::uuid);
  ALTER POLICY "Authenticated users manage notification settings" ON public.notification_settings TO authenticated
    USING ((select auth.uid()) = '3903aa50-e4db-4165-b673-3a61803f13c7'::uuid)
    WITH CHECK ((select auth.uid()) = '3903aa50-e4db-4165-b673-3a61803f13c7'::uuid);
  ALTER POLICY "Authenticated users read notification log" ON public.notification_log TO authenticated
    USING ((select auth.uid()) = '3903aa50-e4db-4165-b673-3a61803f13c7'::uuid);
  ALTER FUNCTION public.get_client_transactions(text) SET search_path = public;

  SELECT md5(coalesce(string_agg(table_name || ':' || row_digest, '' ORDER BY table_name, row_digest),'')) INTO after_digest
  FROM (
    SELECT 'clients' AS table_name, md5(to_jsonb(t)::text) AS row_digest FROM public.clients t
    UNION ALL SELECT 'transactions',md5(to_jsonb(t)::text) FROM public.transactions t
    UNION ALL SELECT 'gift_vouchers',md5(to_jsonb(t)::text) FROM public.gift_vouchers t
    UNION ALL SELECT 'notification_settings',md5(to_jsonb(t)::text) FROM public.notification_settings t
    UNION ALL SELECT 'notification_log',md5(to_jsonb(t)::text) FROM public.notification_log t
  ) snapshots;
  IF before_digest IS DISTINCT FROM after_digest THEN
    RAISE EXCEPTION 'Data preservation assertion failed; rolling back permission changes';
  END IF;
END;
$security$;
