-- =====================================================================
--  몽실창고 · 소품샵 상품관리  —  Supabase 스키마
--  Supabase 대시보드 → SQL Editor → 새 쿼리에 전체 붙여넣고 [Run]
--  여러 번 실행해도 안전합니다 (업데이트 시에도 그대로 다시 실행).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 사용자 프로필 / 권한
--    첫 번째로 만들어진 계정 = 관리자(admin)
--    그 이후 직접 가입한 계정 = 승인 대기(pending) → 관리자가 승인해야 사용 가능
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null default '',
  role text not null default 'pending' check (role in ('admin', 'staff', 'pending')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'));
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), uname),
    case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 설정 화면에서 쓰는 상태 확인 (로그인 전에도 호출 가능, 민감정보 없음)
create or replace function public.app_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'version', 1,
    'has_admin', exists (select 1 from public.profiles where role = 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- 2. 구매처 (소품 산 곳)
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'online' check (kind in ('online', 'wholesale', 'offline', 'etc')),
  website text,
  contact text,
  phone text,
  order_note text,
  memo text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. 상품
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '기타',
  barcode text,
  kiosk_code text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchase_url text,
  supplier_sku text,
  cost_price integer not null default 0,
  sale_price integer not null default 0,
  stock_qty integer not null default 0,
  safety_stock integer not null default 0,
  kiosk_track_stock boolean not null default false,
  is_active boolean not null default true,
  image_path text,
  tags text[] not null default '{}',
  memo text,
  name_en text,
  name_zh text,
  name_ja text,
  description text,
  description_en text,
  description_zh text,
  description_ja text,
  kiosk_synced_at timestamptz,
  kiosk_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_barcode_key on public.products (barcode) where barcode is not null;
create index if not exists products_supplier_idx on public.products (supplier_id);

-- 수정 시각 자동 기록. 재고 수량만 바뀐 경우는 "수정"으로 치지 않고,
-- 키오스크 엑셀에 들어가는 항목이 바뀌면 kiosk_changed_at 도 갱신합니다.
create or replace function public.touch_product() returns trigger
language plpgsql as $$
declare
  ignore_cols text[] := array['stock_qty', 'updated_at', 'kiosk_synced_at', 'kiosk_changed_at', 'created_at'];
  kiosk_cols text[] := array['name', 'category', 'sale_price', 'is_active', 'kiosk_track_stock', 'barcode',
    'cost_price', 'kiosk_code', 'name_en', 'name_zh', 'name_ja',
    'description', 'description_en', 'description_zh', 'description_ja'];
  c text;
begin
  if (to_jsonb(new) - ignore_cols) is distinct from (to_jsonb(old) - ignore_cols) then
    new.updated_at := now();
  end if;
  foreach c in array kiosk_cols loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      new.kiosk_changed_at := now();
      exit;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_product();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. 입고 / 출고 / 재고조정 기록
-- ---------------------------------------------------------------------
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  kind text not null check (kind in ('in', 'out', 'adjust', 'sale')),
  qty integer not null,
  unit_cost integer,
  supplier_id uuid references public.suppliers (id) on delete set null,
  memo text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists stock_moves_product_idx on public.stock_moves (product_id, created_at desc);
create index if not exists stock_moves_created_idx on public.stock_moves (created_at desc);

-- 재고 변경은 이 함수로만: 수량 갱신 + 기록을 한 번에 처리합니다.
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_kind text,
  p_qty integer,
  p_unit_cost integer default null,
  p_supplier_id uuid default null,
  p_memo text default null,
  p_update_cost boolean default false
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  new_qty integer;
begin
  if not public.is_member() then
    raise exception '권한이 없어요';
  end if;

  update public.products
     set stock_qty = stock_qty + p_qty,
         cost_price = case when p_update_cost and p_unit_cost is not null then p_unit_cost else cost_price end
   where id = p_product_id
  returning stock_qty into new_qty;

  if not found then
    raise exception '상품을 찾을 수 없어요';
  end if;

  insert into public.stock_moves (product_id, kind, qty, unit_cost, supplier_id, memo, created_by_name)
  values (p_product_id, p_kind, p_qty, p_unit_cost, p_supplier_id, p_memo,
          (select display_name from public.profiles where id = auth.uid()));

  return new_qty;
end $$;

-- ---------------------------------------------------------------------
-- 5. 접근 권한 (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_moves enable row level security;

grant select, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.suppliers, public.products, public.stock_moves to authenticated;
grant execute on function public.app_status() to anon, authenticated;
grant execute on function public.adjust_stock(uuid, text, integer, integer, uuid, text, boolean) to authenticated;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete" on public.profiles for delete to authenticated
  using (public.is_admin() and id <> auth.uid());

drop policy if exists "suppliers read" on public.suppliers;
create policy "suppliers read" on public.suppliers for select to authenticated using (public.is_member());
drop policy if exists "suppliers insert" on public.suppliers;
create policy "suppliers insert" on public.suppliers for insert to authenticated with check (public.is_member());
drop policy if exists "suppliers update" on public.suppliers;
create policy "suppliers update" on public.suppliers for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists "suppliers delete" on public.suppliers;
create policy "suppliers delete" on public.suppliers for delete to authenticated using (public.is_admin());

drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select to authenticated using (public.is_member());
drop policy if exists "products insert" on public.products;
create policy "products insert" on public.products for insert to authenticated with check (public.is_member());
drop policy if exists "products update" on public.products;
create policy "products update" on public.products for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists "products delete" on public.products;
create policy "products delete" on public.products for delete to authenticated using (public.is_admin());

drop policy if exists "moves read" on public.stock_moves;
create policy "moves read" on public.stock_moves for select to authenticated using (public.is_member());
drop policy if exists "moves insert" on public.stock_moves;
create policy "moves insert" on public.stock_moves for insert to authenticated with check (public.is_member());
drop policy if exists "moves delete" on public.stock_moves;
create policy "moves delete" on public.stock_moves for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. 상품 사진 저장소 (공개 읽기, 직원만 업로드)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "product images insert" on storage.objects;
create policy "product images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_member());
drop policy if exists "product images update" on storage.objects;
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_member());
drop policy if exists "product images delete" on storage.objects;
create policy "product images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_member());

-- ---------------------------------------------------------------------
-- (선택) 특정 아이디를 관리자로 지정하려면 아래 줄의 주석을 풀고 아이디를 바꿔 실행하세요.
-- update public.profiles set role = 'admin' where username = '관리자아이디';
-- ---------------------------------------------------------------------
