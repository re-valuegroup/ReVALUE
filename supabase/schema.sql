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
  reading text,
  roles text[] not null default '{shooter}' check (roles <@ array['admin','editor','shooter','designer','director','sns']::text[]),
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
  youtube jsonb default '{"url":"","id":""}',
  hashtag1 text,
  hashtag2 text,
  hashtag3 text,
  business text,
  appeal text,
  cast_info text,
  contract_status text default 'active',
  plan text,
  monthly_count int default 4,
  short_term_count int,
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
  shoot_hours numeric,
  shoot_unit_pay numeric,
  cut_editor_id uuid references profiles(id) on delete set null,
  telop_editor_id uuid references profiles(id) on delete set null,
  animation_editor_id uuid references profiles(id) on delete set null,
  sfx_editor_id uuid references profiles(id) on delete set null,
  editor_secondary_id uuid references profiles(id) on delete set null,
  cut_checker_id uuid references profiles(id) on delete set null,
  telop_checker_id uuid references profiles(id) on delete set null,
  animation_checker_id uuid references profiles(id) on delete set null,
  sfx_checker_id uuid references profiles(id) on delete set null,
  checklist jsonb default '{"c1":false,"c2":false,"c3":false,"c4":false,"c5":false,"c6":false,"c7":false,"c8":false,"memo":""}',
  check_submitted boolean default false,
  check_submitted_at timestamptz,
  theme text,
  script text,
  edit_instructions text,
  drive_url text,
  reference_video_url text,
  final_video_url text,
  transcript text,
  memo text,
  caption text,
  caption_done boolean default false,
  hashtag1 text,
  hashtag2 text,
  hashtag3 text,
  caption_history jsonb default '[]',
  trend_searches jsonb default '[]',
  completed_stages int default 0,
  stage_version int default 2,
  posted_date date,
  instagram_url text,
  instagram_views int,
  instagram_likes int,
  tiktok_url text,
  tiktok_views int,
  tiktok_likes int,
  youtube_url text,
  youtube_views int,
  youtube_likes int,
  edit_start_date date,
  edit_end_date date,
  cut_workload numeric,
  telop_workload numeric,
  animation_workload numeric,
  sfx_workload numeric,
  check_workload numeric,
  cut_done boolean default false,
  telop_done boolean default false,
  animation_done boolean default false,
  sfx_done boolean default false,
  deadline date,
  required_roles text[] default '{cutEditorId,telopEditorId,animationEditorId,sfxEditorId}',
  work_mode text default 'team',
  revision_history jsonb default '[]',
  revision_memo text,
  revision_video_url text,
  resubmit_comment text,
  cut_submitted boolean default false,
  telop_submitted boolean default false,
  animation_submitted boolean default false,
  sfx_submitted boolean default false,
  rush boolean default false,
  cut_comment text,
  telop_comment text,
  animation_comment text,
  sfx_comment text,
  check_comment text,
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

-- ============ pay_rates（月ごとの単価。経理管理・自分の実績のスタッフ実績集計で使用。工数ではなく1件完了ごとの定額） ============
create table if not exists pay_rates (
  year_month text primary key,
  solo_rate numeric,
  cut_rate numeric,
  telop_rate numeric,
  animation_rate numeric,
  sfx_rate numeric,
  check_rate numeric,
  shoot_rate numeric,
  edit_rate numeric
);

-- ============ shoot_logs（撮影日別の時給×稼働時間。経理管理で撮影担当者のみ手動編集する） ============
create table if not exists shoot_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  year_month text not null,
  shoot_date date,
  hours numeric,
  hourly_rate numeric,
  note text,
  created_at timestamptz default now()
);

-- ============ board_posts（掲示板） ============
create table if not exists board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  theme text,
  content text not null,
  read_by uuid[] default '{}',
  created_at timestamptz default now()
);

-- ============ calendar_events（編集者の稼働期間・撮影者の撮影日） ============
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete set null,
  reel_ids uuid[] default '{}',
  type text not null check (type in ('shoot', 'edit')),
  edit_task text default 'all',
  start_date date not null,
  end_date date not null,
  start_time text,
  end_time text,
  note text,
  created_at timestamptz default now()
);

-- ============ RLS（Row Level Security） ============
alter table profiles enable row level security;
alter table clients enable row level security;
alter table reels enable row level security;
alter table finance enable row level security;
alter table pay_rates enable row level security;
alter table shoot_logs enable row level security;
alter table board_posts enable row level security;
alter table calendar_events enable row level security;

drop policy if exists "profiles_all_authenticated" on profiles;
create policy "profiles_all_authenticated" on profiles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "clients_all_authenticated" on clients;
create policy "clients_all_authenticated" on clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "reels_all_authenticated" on reels;
create policy "reels_all_authenticated" on reels for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "board_posts_all_authenticated" on board_posts;
create policy "board_posts_all_authenticated" on board_posts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "calendar_events_all_authenticated" on calendar_events;
create policy "calendar_events_all_authenticated" on calendar_events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "finance_admin_only" on finance;
create policy "finance_admin_only" on finance for all
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)))
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));

-- pay_rates は「自分の実績」ページで全スタッフが単価を閲覧できる必要があるため、
-- 閲覧（select）は全ログインユーザーに許可し、登録・変更・削除（insert/update/delete）のみ統括管理者に限定する
drop policy if exists "pay_rates_admin_only" on pay_rates;
drop policy if exists "pay_rates_select_all" on pay_rates;
drop policy if exists "pay_rates_admin_write" on pay_rates;
create policy "pay_rates_select_all" on pay_rates for select
  using (auth.role() = 'authenticated');
create policy "pay_rates_admin_write" on pay_rates for insert
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));
create policy "pay_rates_admin_update" on pay_rates for update
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)))
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));
create policy "pay_rates_admin_delete" on pay_rates for delete
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));

-- shoot_logs も同様に、閲覧（select）は全ログインユーザーに許可する（「自分の実績」ページで自分の分を見られるように）。
-- 登録・変更・削除（insert/update/delete）は、統括管理者、または本人（staff_id が自分のプロフィールと一致する場合）に許可する
-- （経理管理では全撮影担当を、自分の実績ページでは本人が自分の分だけを、手動編集できるようにするため）
drop policy if exists "shoot_logs_select_all" on shoot_logs;
drop policy if exists "shoot_logs_admin_write" on shoot_logs;
drop policy if exists "shoot_logs_admin_update" on shoot_logs;
drop policy if exists "shoot_logs_admin_delete" on shoot_logs;
drop policy if exists "shoot_logs_write" on shoot_logs;
drop policy if exists "shoot_logs_update" on shoot_logs;
drop policy if exists "shoot_logs_delete" on shoot_logs;
create policy "shoot_logs_select_all" on shoot_logs for select
  using (auth.role() = 'authenticated');
create policy "shoot_logs_write" on shoot_logs for insert
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));
create policy "shoot_logs_update" on shoot_logs for update
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))))
  with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));
create policy "shoot_logs_delete" on shoot_logs for delete
  using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));

-- ============ 移行用ALTER文（すでに旧バージョンのテーブルがある場合のみ、個別に実行してください） ============
-- alter table reels add column if not exists resubmit_comment text;
-- alter table profiles add column if not exists reading text;
-- alter table clients add column if not exists contract_status text default 'active';
-- alter table reels add column if not exists cut_submitted boolean default false;
-- alter table reels add column if not exists telop_submitted boolean default false;
-- alter table reels add column if not exists animation_submitted boolean default false;
-- alter table reels add column if not exists sfx_submitted boolean default false;
-- alter table reels add column if not exists work_mode text default 'team';
-- alter table reels add column if not exists revision_history jsonb default '[]';
-- alter table reels add column if not exists revision_memo text;
-- alter table reels add column if not exists revision_video_url text;
-- alter table reels add column if not exists required_roles text[] default '{cutEditorId,telopEditorId,animationEditorId,sfxEditorId}';
-- alter table reels add column if not exists animation_editor_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists animation_done boolean default false;
-- alter table reels add column if not exists animation_workload numeric;
-- alter table reels add column if not exists animation_comment text;
-- alter table board_posts add column if not exists read_by uuid[] default '{}';
-- alter table reels add column if not exists rush boolean default false;
-- alter table reels add column if not exists cut_comment text;
-- alter table reels add column if not exists telop_comment text;
-- alter table reels add column if not exists sfx_comment text;
-- alter table reels add column if not exists check_comment text;
-- alter table reels add column if not exists cut_workload numeric;
-- alter table reels add column if not exists telop_workload numeric;
-- alter table reels add column if not exists sfx_workload numeric;
-- alter table reels add column if not exists check_workload numeric;
-- alter table reels drop column if exists edit_workload;
-- alter table reels add column if not exists cut_done boolean default false;
-- alter table reels add column if not exists telop_done boolean default false;
-- alter table reels add column if not exists sfx_done boolean default false;
-- alter table reels add column if not exists deadline date;
-- alter table calendar_events add column if not exists edit_task text default 'all';
-- alter table calendar_events add column if not exists start_time text;
-- alter table calendar_events add column if not exists end_time text;
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
-- alter table reels add column if not exists instagram_url text;
-- alter table reels add column if not exists instagram_views int;
-- alter table reels add column if not exists instagram_likes int;
-- alter table reels add column if not exists tiktok_url text;
-- alter table reels add column if not exists tiktok_views int;
-- alter table reels add column if not exists tiktok_likes int;
-- alter table reels add column if not exists youtube_url text;
-- alter table reels add column if not exists youtube_views int;
-- alter table reels add column if not exists youtube_likes int;
-- alter table reels drop column if exists views7day;
-- alter table calendar_events drop column if exists reel_id;
-- alter table clients add column if not exists youtube jsonb default '{"url":"","id":""}';
-- alter table clients add column if not exists hashtag1 text;
-- alter table clients add column if not exists hashtag2 text;
-- alter table clients add column if not exists hashtag3 text;
-- alter table reels add column if not exists cut_checker_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists telop_checker_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists animation_checker_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists sfx_checker_id uuid references profiles(id) on delete set null;
-- alter table reels add column if not exists reference_video_url text;
-- alter table reels add column if not exists final_video_url text;
-- alter table profiles drop constraint profiles_roles_check;
-- alter table profiles add constraint profiles_roles_check check (roles <@ array['admin','editor','shooter','designer','director','sns']::text[]);
-- alter table reels add column if not exists shoot_hours numeric;
-- alter table pay_rates add column if not exists solo_rate numeric;
-- alter table pay_rates add column if not exists cut_rate numeric;
-- alter table pay_rates add column if not exists telop_rate numeric;
-- alter table pay_rates add column if not exists animation_rate numeric;
-- alter table pay_rates add column if not exists sfx_rate numeric;
-- alter table pay_rates add column if not exists shoot_rate numeric;
-- pay_rates のRLSを「閲覧は全スタッフ・変更は統括管理者のみ」に変更（「自分の実績」ページを全スタッフが見られるようにするため）
-- drop policy if exists "pay_rates_admin_only" on pay_rates;
-- drop policy if exists "pay_rates_select_all" on pay_rates;
-- drop policy if exists "pay_rates_admin_write" on pay_rates;
-- create policy "pay_rates_select_all" on pay_rates for select
--   using (auth.role() = 'authenticated');
-- create policy "pay_rates_admin_write" on pay_rates for insert
--   with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));
-- create policy "pay_rates_admin_update" on pay_rates for update
--   using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)))
--   with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));
-- create policy "pay_rates_admin_delete" on pay_rates for delete
--   using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and 'admin' = any(p.roles)));
-- 以下は新規テーブル（pay_rates）です。まだテーブル自体を作成していない既存のSupabaseプロジェクトでは、このファイル上部の create table 文と合わせて、下記もSQL Editorで実行してください（すでにpay_ratesテーブルがある場合は、上のadd column文だけを実行してください）。
-- create table if not exists pay_rates (
--   year_month text primary key,
--   solo_rate numeric,
--   cut_rate numeric,
--   telop_rate numeric,
--   animation_rate numeric,
--   sfx_rate numeric,
--   check_rate numeric,
--   shoot_rate numeric,
--   edit_rate numeric
-- );
-- alter table pay_rates enable row level security;

-- alter table reels add column if not exists shoot_unit_pay numeric;
-- 以下は新規テーブル（shoot_logs：撮影日別の時給×稼働時間）です。まだ作成していない場合は、SQL Editorで実行してください。
-- 登録・変更・削除は、統括管理者、または本人（staff_idが自分のプロフィールと一致する場合）に許可しています
-- （経理管理では全撮影担当を、自分の実績ページでは本人が自分の分だけを、手動編集できるようにするため）。
-- create table if not exists shoot_logs (
--   id uuid primary key default gen_random_uuid(),
--   staff_id uuid references profiles(id) on delete cascade,
--   year_month text not null,
--   shoot_date date,
--   hours numeric,
--   hourly_rate numeric,
--   note text,
--   created_at timestamptz default now()
-- );
-- alter table shoot_logs enable row level security;
-- drop policy if exists "shoot_logs_select_all" on shoot_logs;
-- drop policy if exists "shoot_logs_admin_write" on shoot_logs;
-- drop policy if exists "shoot_logs_admin_update" on shoot_logs;
-- drop policy if exists "shoot_logs_admin_delete" on shoot_logs;
-- drop policy if exists "shoot_logs_write" on shoot_logs;
-- drop policy if exists "shoot_logs_update" on shoot_logs;
-- drop policy if exists "shoot_logs_delete" on shoot_logs;
-- create policy "shoot_logs_select_all" on shoot_logs for select
--   using (auth.role() = 'authenticated');
-- create policy "shoot_logs_write" on shoot_logs for insert
--   with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));
-- create policy "shoot_logs_update" on shoot_logs for update
--   using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))))
--   with check (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));
-- create policy "shoot_logs_delete" on shoot_logs for delete
--   using (exists (select 1 from profiles p where p.auth_user_id = auth.uid() and (p.id = staff_id or 'admin' = any(p.roles))));
-- もしすでにshoot_logsテーブルを作成済み（前バージョンの管理者限定RLS）の場合は、上記のdrop policy〜create policyの部分だけを再実行すれば、
-- 本人も自分のログを編集できるように更新されます（create table文は「すでに存在すれば何もしない」ため再実行しても問題ありません）。
