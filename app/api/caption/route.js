export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { clientName, clientBusiness, theme, transcript, memo, genre, purpose, pastCaptions } = await req.json();

    const hasPast = Array.isArray(pastCaptions) && pastCaptions.length > 0;
    const pastCaptionsText = hasPast
      ? pastCaptions.slice(0, 5).map((c, i) => `【過去のキャプション例${i + 1}】\n${c}`).join("\n\n")
      : "";

    const prompt = `あなたはInstagramのグロースに精通したSNSマーケティング専門家です。最新のInstagramアルゴリズム（保存数・滞在時間・シェアを重視する傾向）を踏まえ、下記の動画情報からバズりやすいリールのキャプションを日本語で1本作成してください。冒頭2〜3行で強いフック、続けて価値提供・共感を誘う本文、最後に保存/コメントを促すCTAを含めてください。ハッシュタグは含めないでください（別途指定されたハッシュタグのみが末尾に追加されます）。キャプション本文のみを出力し、前置きや説明は不要です。

クライアント: ${clientName || ""}（${clientBusiness || ""}）
ジャンル: ${genre || "未設定"}
今回の目的: ${purpose || "未設定"}
動画テーマ: ${theme || "未設定"}
動画の文字起こし: ${transcript || "（なし）"}
動画の概要メモ: ${memo || "（なし）"}
${hasPast ? `\nこのクライアントの過去のキャプションの文体・トーン・言葉選びの傾向を読み取り、一貫性のある提案にしてください。\n\n${pastCaptionsText}` : ""}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "AI生成に失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message || "AI生成に失敗しました" }, { status: 500 });
  }
}
