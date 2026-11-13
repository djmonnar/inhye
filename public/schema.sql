-- =====================================================================
--  포포하우스 · 소품샵 상품관리  —  Supabase 스키마
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
    'version', 6,
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
-- 5-1. 라벨 인쇄 대기열 (폰에서 보내면 노트북 ‘인쇄 스테이션’이 뽑아요)
-- ---------------------------------------------------------------------
create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  copies integer not null default 1 check (copies between 1 and 500),
  style text not null default 'label' check (style in ('label', 'price')),
  status text not null default 'pending' check (status in ('pending', 'printing', 'done', 'failed')),
  requested_by_name text,
  error text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  printed_at timestamptz
);

create index if not exists print_jobs_status_idx on public.print_jobs (status, created_at);

alter table public.print_jobs enable row level security;
grant select, insert, update, delete on public.print_jobs to authenticated;

drop policy if exists "print jobs read" on public.print_jobs;
create policy "print jobs read" on public.print_jobs for select to authenticated using (public.is_member());
drop policy if exists "print jobs insert" on public.print_jobs;
create policy "print jobs insert" on public.print_jobs for insert to authenticated with check (public.is_member());
drop policy if exists "print jobs update" on public.print_jobs;
create policy "print jobs update" on public.print_jobs for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists "print jobs delete" on public.print_jobs;
create policy "print jobs delete" on public.print_jobs for delete to authenticated using (public.is_member());

-- 대기 중인 인쇄를 한 번에 가져가요. 인쇄 스테이션이 두 대여도 같은 라벨을 두 번 뽑지 않아요.
-- (2분 넘게 ‘인쇄 중’으로 멈춘 건 다시 가져가요)
create or replace function public.claim_print_jobs(p_limit integer default 50)
returns setof public.print_jobs
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_member() then
    raise exception '권한이 없어요';
  end if;
  return query
  update public.print_jobs j
     set status = 'printing', claimed_at = now(), error = null
   where j.id in (
     select id from public.print_jobs
      where status = 'pending' or (status = 'printing' and claimed_at < now() - interval '2 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
end $$;

grant execute on function public.claim_print_jobs(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5-2. POS(빅솔론) 매출 연동
--   한 행 = (날짜, 상품)별 판매 합계 또는 판매 한 줄. 서버(서비스 키)만 쓰고, 직원은 읽기만 해요.
--   같은 날 수량이 늘면(3 → 5) 그 행의 qty가 바뀌고, apply_pos_sales()가 차이(2개)만 재고에서 빼요.
--   applied_qty = 지금까지 재고에 반영한 수량. 여러 번 실행해도 중복으로 빠지지 않아요.
-- ---------------------------------------------------------------------
create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'bixolon',
  external_id text not null,
  sold_at timestamptz not null,
  product_code text,
  barcode text,
  product_name text not null default '',
  qty integer not null default 1,
  amount integer not null default 0,
  payment text,
  product_id uuid references public.products (id) on delete set null,
  applied_qty integer not null default 0,
  stock_applied_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

alter table public.pos_sales add column if not exists applied_qty integer not null default 0;

create index if not exists pos_sales_sold_idx on public.pos_sales (sold_at desc);
drop index if exists public.pos_sales_pending_idx;
create index if not exists pos_sales_unapplied_idx on public.pos_sales (product_id) where qty <> applied_qty;

create table if not exists public.pos_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'bixolon',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  range_from timestamptz,
  range_to timestamptz,
  fetched integer not null default 0,
  inserted integer not null default 0,
  applied integer not null default 0,
  unmatched integer not null default 0,
  error text
);

alter table public.pos_sales enable row level security;
alter table public.pos_sync_runs enable row level security;
grant select on public.pos_sales, public.pos_sync_runs to authenticated;

drop policy if exists "pos sales read" on public.pos_sales;
create policy "pos sales read" on public.pos_sales for select to authenticated using (public.is_member());
drop policy if exists "pos runs read" on public.pos_sync_runs;
create policy "pos runs read" on public.pos_sync_runs for select to authenticated using (public.is_member());

create or replace function public.apply_pos_sales() returns json
language plpgsql security invoker set search_path = public as $$
declare
  matched integer;
  applied integer;
  unmatched integer;
begin
  -- 서버(서비스 키)에서만 실행해요. 앱에서는 /api/pos/sync 를 거쳐요.
  if current_user not in ('service_role', 'postgres') then
    raise exception '권한이 없어요';
  end if;

  -- 빅솔론 상품 코드 → 바코드 순서로 우리 상품과 연결
  update public.pos_sales s
     set product_id = p.id
    from public.products p
   where s.product_id is null
     and ((s.product_code is not null and p.kiosk_code = s.product_code)
       or (s.barcode is not null and p.barcode = s.barcode));
  get diagnostics matched = row_count;

  -- 아직 반영 안 된 차이만 재고에서 빼기 (수량이 줄면 = 반품, 다시 더해져요)
  with todo as (
    select id, product_id, qty - applied_qty as delta, external_id
      from public.pos_sales
     where product_id is not null and qty <> applied_qty
     for update skip locked
  ), moves as (
    insert into public.stock_moves (product_id, kind, qty, memo, created_by_name)
    select product_id, 'sale', -delta, '빅솔론 판매 ' || external_id, '빅솔론' from todo
    returning product_id, qty
  ), stock as (
    update public.products p
       set stock_qty = p.stock_qty + d.change
      from (select product_id, sum(qty) as change from moves group by product_id) d
     where p.id = d.product_id
    returning p.id
  )
  update public.pos_sales s
     set applied_qty = s.qty, stock_applied_at = now()
    from todo
   where s.id = todo.id;
  get diagnostics applied = row_count;

  select count(*) into unmatched from public.pos_sales where product_id is null and qty <> 0;
  return json_build_object('matched', matched, 'applied', applied, 'unmatched', unmatched);
end $$;

revoke execute on function public.apply_pos_sales() from public, anon, authenticated;
grant select, insert, update, delete on public.pos_sales, public.pos_sync_runs to service_role;
grant execute on function public.apply_pos_sales() to service_role;

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
-- 7. 주문 (꽃다발 등 예약 주문) — 주문 비서 채팅 / 주문 화면에서 등록·수정
--    status: open 진행 중 · done 완료(알림 안 함) · canceled 취소(삭제 대신, 되살릴 수 있어요)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer text not null default '',
  item text not null default '',
  price integer not null default 0 check (price >= 0),
  due_date date not null,
  method text not null default 'pickup' check (method in ('pickup', 'delivery')),
  status text not null default 'open' check (status in ('open', 'done', 'canceled')),
  memo text,
  contact text,
  address text,
  source_text text,
  done_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_due_idx on public.orders (status, due_date);
-- 픽업 시간 (선택, 한국 시각 HH:MM)
alter table public.orders add column if not exists due_time time;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.orders enable row level security;
grant select, insert, update, delete on public.orders to authenticated;

drop policy if exists "orders read" on public.orders;
create policy "orders read" on public.orders for select to authenticated using (public.is_member());
drop policy if exists "orders insert" on public.orders;
create policy "orders insert" on public.orders for insert to authenticated with check (public.is_member());
drop policy if exists "orders update" on public.orders;
create policy "orders update" on public.orders for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists "orders delete" on public.orders;
create policy "orders delete" on public.orders for delete to authenticated using (public.is_admin());

-- 카카오톡 ‘나에게 보내기’ 토큰 (한 줄). 비밀이라 서버(서비스 키)만 읽고 써요 — 정책 없음.
create table if not exists public.kakao_tokens (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  last_brief_on date,
  updated_at timestamptz not null default now()
);

alter table public.kakao_tokens enable row level security;
revoke all on public.kakao_tokens from anon, authenticated;

-- 앱 설정 (한 줄). brief_hour = 카카오톡 알림을 보낼 한국 시각(0~23시)
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  brief_hour smallint not null default 9 check (brief_hour between 0 and 23),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

alter table public.app_settings enable row level security;
grant select, update on public.app_settings to authenticated;
drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings for select to authenticated using (public.is_member());
drop policy if exists "settings admin update" on public.app_settings;
create policy "settings admin update" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. 거래처별 가격 (스키마 v6)
--    같은 상품도 거래처마다 값이 달라요 → 상품 × 거래처마다 최근 개당 가격 한 줄(product_sources)
--    + 확인할 때마다 쌓이는 가격 기록(price_logs). products.supplier_id 는 ‘주 거래처’,
--    products.cost_price 는 마진 계산용 ‘지금 원가’로 그대로 둬요.
-- ---------------------------------------------------------------------
create table if not exists public.product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  price integer check (price is null or price >= 0),
  price_at timestamptz,
  purchase_url text,
  supplier_sku text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);
create index if not exists product_sources_supplier_idx on public.product_sources (supplier_id);

create table if not exists public.price_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  price integer not null check (price >= 0),
  source text not null default 'manual' check (source in ('manual', 'stock_in', 'chatbot', 'import')),
  stock_move_id uuid unique references public.stock_moves (id) on delete set null,
  memo text,
  created_by_name text,
  noted_at timestamptz not null default now()
);
create index if not exists price_logs_product_idx on public.price_logs (product_id, noted_at desc);
create index if not exists price_logs_supplier_idx on public.price_logs (supplier_id, noted_at desc);

drop trigger if exists product_sources_touch on public.product_sources;
create trigger product_sources_touch before update on public.product_sources
  for each row execute function public.touch_updated_at();

-- 가격 기록은 이 함수로: 거래처별 최근 가격을 바꾸고 기록도 한 줄 남겨요.
-- 앱(로그인한 직원)과 챗봇 서버(서비스 키) 둘 다 써요.
create or replace function public.record_price(
  p_product_id uuid,
  p_supplier_id uuid,
  p_price integer,
  p_purchase_url text default null,
  p_supplier_sku text default null,
  p_memo text default null,
  p_source text default 'manual',
  p_set_cost boolean default false,
  p_by_name text default null
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not (public.is_member() or current_user in ('service_role', 'postgres')) then
    raise exception '권한이 없어요';
  end if;
  if p_price is null or p_price < 0 then
    raise exception '가격을 확인해 주세요';
  end if;

  insert into public.product_sources as ps (product_id, supplier_id, price, price_at, purchase_url, supplier_sku, memo)
  values (p_product_id, p_supplier_id, p_price, now(),
          nullif(trim(p_purchase_url), ''), nullif(trim(p_supplier_sku), ''), nullif(trim(p_memo), ''))
  on conflict (product_id, supplier_id) do update
     set price = excluded.price,
         price_at = excluded.price_at,
         purchase_url = coalesce(excluded.purchase_url, ps.purchase_url),
         supplier_sku = coalesce(excluded.supplier_sku, ps.supplier_sku),
         memo = coalesce(excluded.memo, ps.memo);

  insert into public.price_logs (product_id, supplier_id, price, source, memo, created_by_name)
  values (p_product_id, p_supplier_id, p_price, coalesce(p_source, 'manual'), nullif(trim(p_memo), ''),
          coalesce(p_by_name, (select display_name from public.profiles where id = auth.uid())));

  if p_set_cost then
    update public.products set cost_price = p_price where id = p_product_id;
  end if;
end $$;

-- 입고할 때 거래처·개당 가격을 적으면 가격 기록도 자동으로 남아요.
create or replace function public.price_from_stock_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'in' and new.supplier_id is not null and coalesce(new.unit_cost, 0) > 0 then
    insert into public.product_sources as ps (product_id, supplier_id, price, price_at)
    values (new.product_id, new.supplier_id, new.unit_cost, new.created_at)
    on conflict (product_id, supplier_id) do update
       set price = excluded.price, price_at = excluded.price_at
     where ps.price_at is null or ps.price_at <= excluded.price_at;
    insert into public.price_logs (product_id, supplier_id, price, source, stock_move_id, created_by_name, noted_at)
    values (new.product_id, new.supplier_id, new.unit_cost, 'stock_in', new.id, new.created_by_name, new.created_at)
    on conflict (stock_move_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists stock_moves_price on public.stock_moves;
create trigger stock_moves_price after insert on public.stock_moves
  for each row execute function public.price_from_stock_in();

-- 상품의 주 거래처는 항상 거래처별 가격에도 한 줄 있게 해요 (구매 링크·구매처 상품명도 채워요).
create or replace function public.source_from_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.supplier_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.supplier_id is not distinct from old.supplier_id
       and new.purchase_url is not distinct from old.purchase_url
       and new.supplier_sku is not distinct from old.supplier_sku then
      return new;
    end if;
  end if;
  insert into public.product_sources as ps (product_id, supplier_id, price, price_at, purchase_url, supplier_sku)
  values (new.id, new.supplier_id, nullif(new.cost_price, 0),
          case when new.cost_price > 0 then now() end, new.purchase_url, new.supplier_sku)
  on conflict (product_id, supplier_id) do update
     set purchase_url = coalesce(excluded.purchase_url, ps.purchase_url),
         supplier_sku = coalesce(excluded.supplier_sku, ps.supplier_sku),
         price = coalesce(ps.price, excluded.price),
         price_at = coalesce(ps.price_at, excluded.price_at);
  return new;
end $$;

drop trigger if exists products_source on public.products;
create trigger products_source after insert or update on public.products
  for each row execute function public.source_from_product();

-- 처음 v6로 올릴 때 한 번만: 지금까지의 입고 기록 → 가격 기록, 상품의 주 거래처·입고 가격 → 거래처별 가격.
-- (거래처별 가격 표가 비어 있을 때만 채워요 — 나중에 다시 실행해도 지운 줄이 되살아나지 않게)
do $$
begin
  if exists (select 1 from public.product_sources) then
    return;
  end if;

  insert into public.price_logs (product_id, supplier_id, price, source, stock_move_id, created_by_name, noted_at)
  select m.product_id, m.supplier_id, m.unit_cost, 'stock_in', m.id, m.created_by_name, m.created_at
    from public.stock_moves m
    join public.suppliers s on s.id = m.supplier_id
   where m.kind = 'in' and coalesce(m.unit_cost, 0) > 0
  on conflict (stock_move_id) do nothing;

  insert into public.product_sources (product_id, supplier_id, price, price_at, purchase_url, supplier_sku)
  select p.id, p.supplier_id, nullif(p.cost_price, 0), case when p.cost_price > 0 then p.updated_at end,
         p.purchase_url, p.supplier_sku
    from public.products p
   where p.supplier_id is not null
  on conflict (product_id, supplier_id) do nothing;

  insert into public.product_sources as ps (product_id, supplier_id, price, price_at)
  select distinct on (l.product_id, l.supplier_id) l.product_id, l.supplier_id, l.price, l.noted_at
    from public.price_logs l
   order by l.product_id, l.supplier_id, l.noted_at desc
  on conflict (product_id, supplier_id) do update
     set price = excluded.price, price_at = excluded.price_at
   where ps.price_at is null or ps.price_at < excluded.price_at;
end $$;

alter table public.product_sources enable row level security;
alter table public.price_logs enable row level security;
grant select, insert, update, delete on public.product_sources, public.price_logs to authenticated;
grant execute on function public.record_price(uuid, uuid, integer, text, text, text, text, boolean, text) to authenticated;

drop policy if exists "sources read" on public.product_sources;
create policy "sources read" on public.product_sources for select to authenticated using (public.is_member());
drop policy if exists "sources insert" on public.product_sources;
create policy "sources insert" on public.product_sources for insert to authenticated with check (public.is_member());
drop policy if exists "sources update" on public.product_sources;
create policy "sources update" on public.product_sources for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists "sources delete" on public.product_sources;
create policy "sources delete" on public.product_sources for delete to authenticated using (public.is_admin());

drop policy if exists "price logs read" on public.price_logs;
create policy "price logs read" on public.price_logs for select to authenticated using (public.is_member());
drop policy if exists "price logs insert" on public.price_logs;
create policy "price logs insert" on public.price_logs for insert to authenticated with check (public.is_member());
drop policy if exists "price logs delete" on public.price_logs;
create policy "price logs delete" on public.price_logs for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 9. 카카오 챗봇 (스키마 v6) — 서버(서비스 키)만 읽고 써요. 정책 없음.
--    kakao_bot_users: 카카오 사용자(봇 사용자 키) ↔ 앱 계정. 권한은 앱 계정의 역할을 그대로 따라요.
--    kakao_bot_codes: 앱에서 받은 6자리 연결 코드 (10분)
--    kakao_bot_sessions: 거래처 등록처럼 여러 번 주고받는 대화의 진행 상태
-- ---------------------------------------------------------------------
create table if not exists public.kakao_bot_users (
  bot_user_key text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists kakao_bot_users_profile_idx on public.kakao_bot_users (profile_id);

create table if not exists public.kakao_bot_codes (
  code text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kakao_bot_sessions (
  bot_user_key text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kakao_bot_users enable row level security;
alter table public.kakao_bot_codes enable row level security;
alter table public.kakao_bot_sessions enable row level security;
revoke all on public.kakao_bot_users, public.kakao_bot_codes, public.kakao_bot_sessions from anon, authenticated;

-- 새로 만든 표·함수를 API가 바로 알아보게 해요 (schema cache 새로고침)
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- (선택) 특정 아이디를 관리자로 지정하려면 아래 줄의 주석을 풀고 아이디를 바꿔 실행하세요.
-- update public.profiles set role = 'admin' where username = '관리자아이디';
-- ---------------------------------------------------------------------
