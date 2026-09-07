export const runtime = "nodejs";

// 案件が⑤最終チェック待ちの段階に進んだ時に、登録された宛先へお知らせメールを送信する。
// メール配信にはResend（https://resend.com）を使用する。RESEND_API_KEYはVercelの環境変数として
// サーバー側だけに設定し、ブラウザには公開されない。
export async function POST(req) {
  try {
    const { to, clientName, theme, deadline } = await req.json();
    const recipients = (Array.isArray(to) ? to : [to]).map(s => (s || "").trim()).filter(Boolean);
    if (recipients.length === 0) {
      return Response.json({ error: "通知先メールアドレスが設定されていません" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "サーバー側でRESEND_API_KEYが設定されていません" }, { status: 500 });
    }
    // 送信元アドレス。Resendで独自ドメインを認証していない場合は、Resendが用意しているテスト用アドレス
    // （onboarding@resend.dev）のままで送信できる。独自ドメインを認証した場合は、Vercelの環境変数
    // RESEND_FROM_EMAIL に「表示名 <address@your-domain.com>」の形式で設定すると、その差出人で送信される。
    const fromAddress = process.env.RESEND_FROM_EMAIL || "ReVALUE Studio Manager <onboarding@resend.dev>";

    const subject = "【ReVALUE Studio Manager】⑤最終チェック待ちの動画があります";
    const bodyLines = [
      "以下の動画が①〜④の工程をすべて完了し、⑤最終チェックの段階に進みました。",
      "",
      `クライアント：${clientName || "未設定"}`,
      `テーマ：${theme || "未設定"}`,
      deadline ? `納期：${deadline}` : null,
      "",
      "ReVALUE Studio Managerにログインしてご確認ください。",
    ].filter(line => line !== null).join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject,
        text: bodyLines,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ error: data?.message || "メール送信に失敗しました" }, { status: 500 });
    }
    return Response.json({ ok: true, id: data?.id || null });
  } catch (e) {
    return Response.json({ error: e.message || "予期しないエラーが発生しました" }, { status: 500 });
  }
}
