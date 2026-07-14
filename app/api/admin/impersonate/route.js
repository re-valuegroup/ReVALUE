import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { targetUserId, accessToken } = await req.json();
    if (!targetUserId || !accessToken) {
      return Response.json({ error: "パラメータが不足しています" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return Response.json({ error: "サーバー側でSUPABASE_SERVICE_ROLE_KEYが設定されていません" }, { status: 500 });
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // リクエストを送ってきた本人を検証
    const { data: requesterAuth, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !requesterAuth?.user) {
      return Response.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    // 本人が統括管理者であることを確認
    const { data: requesterProfiles, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, roles, email")
      .eq("auth_user_id", requesterAuth.user.id);

    if (profileErr) {
      return Response.json({ error: "プロフィールの確認に失敗しました：" + profileErr.message }, { status: 500 });
    }
    if (!requesterProfiles || requesterProfiles.length === 0) {
      return Response.json({ error: `ログイン中のアカウント（${requesterAuth.user.email}）に紐づくプロフィールが見つかりません。メンバー管理でこのメールアドレスのプロフィールが存在するか確認してください。` }, { status: 403 });
    }
    if (requesterProfiles.length > 1) {
      return Response.json({ error: `ログイン中のアカウント（${requesterAuth.user.email}）に紐づくプロフィールが複数見つかりました（${requesterProfiles.length}件）。メンバー管理で重複しているプロフィールを確認・削除してください。` }, { status: 403 });
    }
    const requesterProfile = requesterProfiles[0];
    if (!(requesterProfile.roles || []).includes("admin")) {
      return Response.json({ error: `統括管理者のみ実行できます（現在の役割：${(requesterProfile.roles || []).join("、") || "未設定"}）` }, { status: 403 });
    }

    // 切り替え先のスタッフのメールアドレスを取得
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, auth_user_id")
      .eq("id", targetUserId)
      .single();

    if (!targetProfile || !targetProfile.auth_user_id || !targetProfile.email) {
      return Response.json({ error: "対象のスタッフはまだサインアップしていないため切り替えできません" }, { status: 404 });
    }

    // ログイン用のワンタイムトークンを発行
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetProfile.email,
    });
    if (linkErr) {
      return Response.json({ error: linkErr.message }, { status: 500 });
    }

    return Response.json({ hashedToken: linkData.properties.hashed_token });
  } catch (e) {
    return Response.json({ error: e.message || "予期しないエラーが発生しました" }, { status: 500 });
  }
}
