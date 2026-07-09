-- ReVALUE Studio Manager — Supabase schema（最新版）
-- Supabaseダッシュボードの「SQL Editor」でこのファイルの内容をそのまま実行してください。
-- すでに古いバージョンのテーブルを作成済みの場合は、先に schema.sql の内容を確認のうえ、
-- 該当テーブルを drop table してから実行するか、下部の「移行用ALTER文」を個別に実行してください。

create extension if not exists pgcrypto;

-- ============ profiles（スタッフ情報） ============
-- 統括管理者が先にスタッフ情報を登録しておき、本人がサインアップした時点で
-- 同じメールアドレスの行に自動的に紐付く仕組みにしています（auth_user_id）。
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  roles text[] not null default '{shooter}' check (roles <@ array['admin','editor','shooter','designer']::text[]),
  email text,
  phone text,
  join_date date,
  contract_type text default '業務委託',
  skills text,
  availability text,
  bank_account text,
  work_status text default '稼働中',
  notes text,
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  update public.profiles set auth_user_id = new.id
  where email = new.email and auth_user_id is null;

  if not found then
    insert into public.profiles (auth_user_id, name, roles, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', new.email),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(new.raw_user_meta_data->'roles') as x),
        array['shooter']
      ),
      new.email
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============ clients ============
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ceo_name text,
  address text,
  website text,
  instagram jsonb default '{"url":"","id":"","password":""}',
  tiktok jsonb default '{"url":"","id":"","password":""}',
  business text,
  appeal text,
  plan text,
  monthly_count int default 4,
  contract_end_date date,
  post_days int[] default '{}',
  setup_tasks jsonb default '{"profile":"pending","highlight":"pending","line":"pending","lp":"pending"}',
  notes text,
  created_at timestamptz default now()
);

-- ============ reels（月次動画） ============
create table if not exists reels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  year_month text not null,
  assigned_staff_id uuid references profiles(id) on delete set null,
  cut_editor_id uuid references profiles(id) on delete set null,
  telop_editor_id uuid references profiles(id) on delete set null,
  sfx_editor_id uuid references profiles(id) on delete set null,
  editor_secondary_id uuid references profiles(id) on delete set null,
  checklist jsonb default '{"c1":false,"c2":false,"c3":false,"c4":false,"c5":false,"c6":false,"c7":false,"c8":false,"memo":""}',
  check_submitted boolean default false,
  check_submitted_at timestamptz,
  theme text,
  script text,
  edit_instructions text,
  drive_url text,
  transcript text,
  memo text,
  caption text,
  hashtag1 text,
  hashtag2 text,
  hashtag3 text,
  caption_history jsonb default '[]',
  trend_searches jsonb default '[]',
  completed_stages int default 0,
  stage_version int default 2,
  posted_date date,
  views7day int,
  edit_start_date date,
  edit_end_date date,
  edit_workload numeric,
  created_at timestamptz default now()
);

-- ============ finance（統括管理者専用） ============
create table if not exists finance (
  client_id uuid primary key references clients(id) on delete cascade,
  contract_start date,
  contract_end date,
  monthly_fee numeric,
  contract_fee numeric,
  billing_dates jsonb default '{}',
  paid_months text[] default '{}',
  notes text
);

-- ============ board_posts（掲示板） ============
create table if not exists board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  theme text,
  content text not null,
  created_at timestamptz default now()
);

-- ============ calendar_events（編集者の稼働期間・撮影者の撮影日） ============
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete set null,
  reel_ids uuid[] default '{}',
  type text not null check (type in ('shoot', 'edit')),
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz default now()
);

-- ============ RLS（Row Level Security） ============
alter table profiles enable row level security;
alter table clients enable row level security;
alter table reels enable row level security;
alter table finance enable row level security;
alter table board_posts enable row level security;
alter table calendar_events enable row level security;

create policy "profiles_all_authenticated" on profiles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "clients_all_authenticated" on clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "reels_all_authenticated" on reels for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "board_posts_all_authenticated" on board_posts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "calendar_events_all_authenticated" on calendar_events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "finance_admin_only" on finance for all
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)))
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));

-- ============ 移行用ALTER文（すでに旧バージョンのテーブルがある場合のみ、個別に実行してください） ============
-- alter table clients add column if not exists post_days int[] default '{}';
-- alter table clients add column if not exists setup_tasks jsonb default '{"profile":"pending","highlight":"pending","line":"pending","lp":"pending"}';
-- alter table reels add column if not exists cut_editor_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists telop_editor_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists sfx_editor_id uuid references profiles(id) on delete set null;
-- alter table reels drop column if exists editor_primary_id;
-- alter table reels add column if not exists hashtag1 text;
-- alter table reels add column if not exists hashtag2 text;
-- alter table reels add column if not exists hashtag3 text;
-- alter table reels add column if not exists trend_searches jsonb default '[]';
-- alter table reels drop column if exists script_proposals;
-- alter table reels add column if not exists stage_version int default 2;
-- alter table finance add column if not exists contract_fee numeric;
-- alter table finance add column if not exists billing_dates jsonb default '{}';
-- alter table finance add column if not exists paid_months text[] default '{}';
-- alter table finance drop column if exists billing_date;
-- alter table finance drop column if exists payment_status;
-- alter table calendar_events add column if not exists reel_ids uuid[] default '{}';
-- alter table calendar_events drop column if exists reel_id;
