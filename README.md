# ReVALUE Studio Manager（Vercel + Supabase版）

株式会社ReVALUE様向け SNS運用代行 業務管理システムです。統括管理者・動画編集者・動画撮影者がPC / スマートフォンから、いつでもどこでもログインして利用できます。

## 構成

- **フロントエンド**: Next.js 14（App Router）+ Tailwind CSS + lucide-react
- **データベース / 認証**: Supabase（Postgres + Auth）
- **AI機能**: サーバー側APIルート（`/app/api/*`）が Anthropic API を呼び出し、APIキーはブラウザに一切露出しません
- **ホスティング**: Vercel

---

## 1. Supabaseのセットアップ（データベース）

1. [supabase.com](https://supabase.com) で無料アカウントを作成し、新規プロジェクトを作成
2. 左メニューの「SQL Editor」を開き、`supabase/schema.sql` の中身をすべて貼り付けて実行
   - スタッフ情報・クライアント情報・動画・経理・掲示板の全テーブルとセキュリティ設定が作成されます
3. 左メニューの「Authentication」→「Providers」で **Email** が有効になっていることを確認
   - 開発中は「Confirm email」をオフにしておくと、メール確認なしですぐログインでき動作確認がスムーズです（本運用時は有効化を推奨）
4. 左メニューの「Settings」→「API」から以下をメモしておく
   - `Project URL`
   - `anon public` キー

## 2. Anthropic APIキーの取得（AI機能用）

1. [console.anthropic.com](https://console.anthropic.com) でAPIキーを発行
   - これはClaude.aiのアカウントとは別物です。Claude Platform（従量課金）用のキーになります
2. `sk-ant-...` から始まるキーをメモしておく

## 3. ローカルで動作確認（任意）

```bash
npm install
cp .env.example .env.local
# .env.local を開いて、Supabaseの2つの値とAnthropicのAPIキーを入力
npm run dev
```

`http://localhost:3000` を開いて、「初めての方はこちら」からアカウントを作成してください。最初に作るアカウントを **統括管理者** にしておくのがおすすめです。

## 4. Vercelへのデプロイ

1. このフォルダをGitHubリポジトリにpush（またはVercel CLIで直接デプロイ）
2. [vercel.com](https://vercel.com) でGitHubリポジトリをインポート
3. 「Environment Variables」に以下の3つを設定
   | 変数名 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon public キー |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice_roleキー（Settings > API の下の方）。統括管理者の「他のスタッフに切り替え」機能でのみサーバー側で使用します |
   | `ANTHROPIC_API_KEY` | Anthropic APIキー |
4. 「Deploy」をクリック
5. 発行されたURL（例: `https://revalue-studio.vercel.app`）にPC・スマホどちらからでもアクセス可能になります

## 5. スタッフの使い方

- 各自が自分のメールアドレスとパスワードでサインアップし、名前と役割（統括管理者／動画編集者／動画撮影者）を選択してアカウントを作成します
- 2回目以降はメールアドレス＋パスワードでログインするだけで、PCでもスマホでも同じデータにアクセスできます
- スマホはブラウザでURLを開くだけで利用できます（ホーム画面に追加すればアプリのように使えます）

### 先にスタッフを登録しておきたい場合

統括管理者が「メンバー管理」画面から、名前・メールアドレス・契約形態などの詳細プロフィールを先に登録しておくことができます。本人が同じメールアドレスでサインアップすると、自動的にそのプロフィールに紐付きます。

## 6. 注意事項

- `finance`（経理情報）テーブルは統括管理者のみ読み書きできるようアクセス制御（RLS）を設定済みです
- クライアントのSNSパスワードや振込先口座は現状DBに平文で保存されます。より高いセキュリティが必要な場合は、Supabaseの列レベル暗号化（pgsodium等）の追加導入をご検討ください
- AI機能（キャプション生成・台本提案）はAnthropic APIの従量課金が発生します。利用状況は[console.anthropic.com](https://console.anthropic.com)のUsageページで確認できます
- 本番運用前に、Supabaseの「Confirm email」を有効にし、なりすまし登録を防止することを推奨します
- `SUPABASE_SERVICE_ROLE_KEY`はデータベースの全権限を持つ非常に強い権限のキーです。**Vercelの環境変数以外の場所（コード中やクライアント側）には絶対に書かないでください**。このキーはサーバー側のAPIルート（`/api/admin/impersonate`）でのみ使用され、ブラウザには一切送信されません

## フォルダ構成

```
app/
  page.js               メイン画面の入口
  layout.js             全体レイアウト
  globals.css           グローバルスタイル
  api/
    caption/route.js    AIキャプション生成
    script/route.js     AI台本提案（動画単位）
    proposal/route.js   AI企画提案（クライアント単位）
components/
  App.js                アプリ本体（全画面のロジック・UI）
lib/
  supabaseClient.js     Supabaseクライアント初期化
  db.js                 データ読み書きの共通処理
supabase/
  schema.sql            データベース定義（最初に1回実行）
```
