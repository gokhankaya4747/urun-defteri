-- Ürün Defteri v21 — sürüm, değişiklik geçmişi, personel yetkisi
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştır → Run (tekrar çalıştırmak zararsızdır)

-- 1) SÜRÜM: her kayıt yazılışında data._v bir artar (uygulama "okuduğum sürüm hâlâ aynı mı" diye koşullu yazar;
--    eski sürüm uygulama açık kalmış bir telefon bile yazsa sürüm ilerler, yeni uygulama çakışmayı yakalar)
create or replace function public.docs_surum() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.data->'_v' is null then new.data := jsonb_set(new.data, '{_v}', '1'::jsonb); end if;
  else
    new.data := jsonb_set(new.data, '{_v}', to_jsonb(coalesce((old.data->>'_v')::int, 0) + 1));
  end if;
  return new;
end $$;
drop trigger if exists docs_surum on public.docs;
create trigger docs_surum before insert or update on public.docs for each row execute function public.docs_surum();

-- 2) GEÇMİŞ: kim, ne zaman, neyi değiştirdi / sildi (eski ve yeni hali). Uygulamadan değiştirilemez, sadece okunur.
create table if not exists public.docs_hist (
  hid bigint generated always as identity primary key,
  col text not null,
  id text not null,
  op text not null,              -- insert | update | delete
  old_data jsonb,
  new_data jsonb,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists docs_hist_kayit on public.docs_hist (col, id, at desc);
create index if not exists docs_hist_zaman on public.docs_hist (at desc);
alter table public.docs_hist enable row level security;
drop policy if exists "uyeler okur" on public.docs_hist;
create policy "uyeler okur" on public.docs_hist for select to authenticated using (public.my_role() is not null);

create or replace function public.docs_gecmis() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.col, old.col) = 'settings' then return null; end if;   -- bildirim günlükleri vb. geçmişe girmez
  insert into public.docs_hist (col, id, op, old_data, new_data, by_email)
  values (coalesce(new.col, old.col), coalesce(new.id, old.id), lower(tg_op),
          case when tg_op <> 'INSERT' then old.data end,
          case when tg_op <> 'DELETE' then new.data end,
          lower(nullif(auth.jwt()->>'email', '')));
  return null;
end $$;
drop trigger if exists docs_gecmis on public.docs;
create trigger docs_gecmis after insert or update or delete on public.docs for each row execute function public.docs_gecmis();

-- 3) PERSONEL (staff): kayıt girer ve düzenler; SİLEMEZ, firma ve ayarları değiştiremez.
--    Kâr, maliyet, banka bakiyesi ekranları personelde gizlidir.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('owner','editor','staff','viewer'));

drop policy if exists "yazabilenler ekler" on public.docs;
drop policy if exists "yazabilenler gunceller" on public.docs;
drop policy if exists "yazabilenler siler" on public.docs;
create policy "yazabilenler ekler" on public.docs for insert to authenticated
  with check (public.my_role() in ('owner','editor') or (public.my_role() = 'staff' and col not in ('settings','firms')));
create policy "yazabilenler gunceller" on public.docs for update to authenticated
  using (public.my_role() in ('owner','editor') or (public.my_role() = 'staff' and col not in ('settings','firms')))
  with check (public.my_role() in ('owner','editor') or (public.my_role() = 'staff' and col not in ('settings','firms')));
create policy "yazabilenler siler" on public.docs for delete to authenticated using (public.my_role() in ('owner','editor'));

drop policy if exists "belgeler eklenir" on storage.objects;
create policy "belgeler eklenir" on storage.objects for insert to authenticated
  with check (bucket_id = 'belgeler' and public.my_role() in ('owner','editor','staff'));

-- 4) İKİ ADIMLI GİRİŞ ZORUNLULUĞU: doğrulama uygulaması bağlamış bir kullanıcı, kodu girmeden (aal2 olmadan)
--    hiçbir veriyi okuyamaz/yazamaz. Uygulama bağlamamış kullanıcılar eskisi gibi şifreyle girer.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.members m
  where lower(m.email) = lower(coalesce(auth.jwt()->>'email',''))
    and (coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
         or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
$$;
