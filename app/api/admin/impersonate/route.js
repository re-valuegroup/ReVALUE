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
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("roles")
      .eq("auth_user_id", requesterAuth.user.id)
      .single();

    if (!requesterProfile || !(requesterProfile.roles || []).includes("admin")) {
      return Response.json({ error: "この操作は統括管理者のみ実行できます" }, { status: 403 });
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
