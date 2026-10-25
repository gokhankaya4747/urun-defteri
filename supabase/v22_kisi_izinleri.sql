-- Ürün Defteri v22 — kişi bazında gizleme (sahip ayarlar: Ayarlar → Kullanıcılar)
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştır → Run (tekrar çalıştırmak zararsızdır)
-- gizle: {"kar":true,"banka":true,"rapor":true,"excel":true,"sil":true} — true olan şeyi o kişi göremez / yapamaz.
alter table public.members add column if not exists gizle jsonb not null default '{}'::jsonb;

create or replace function public.my_gizle() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select gizle from public.members where lower(email) = lower(coalesce(auth.jwt()->>'email',''))), '{}'::jsonb)
$$;

-- silme yasağı veritabanında da geçerli
drop policy if exists "yazabilenler siler" on public.docs;
create policy "yazabilenler siler" on public.docs for delete to authenticated
  using (public.my_role() in ('owner','editor') and coalesce((public.my_gizle()->>'sil')::boolean, false) = false);
