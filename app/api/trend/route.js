export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { genre, minFollowers, minViews } = await req.json();

    const conditions = [];
    if (minFollowers) conditions.push(`投稿アカウントのフォロワー数が${minFollowers}以上`);
    if (minViews) conditions.push(`その投稿の再生数が${minViews}以上`);
    const conditionText = conditions.length > 0 ? conditions.join("、") : "指定なし";

    const prompt = `あなたはInstagram Reelsのトレンドリサーチに精通したSNSアナリストです。web検索ツールを使って、以下のジャンル・条件に関連する、直近で実際にバズっている（再生数・いいね数が多い）Instagramのショート動画（リール）を3つ探してください。

ジャンル: ${genre || "指定なし"}
条件: ${conditionText}

必ず実在するInstagramのリールのURL（https://www.instagram.com/reel/... の形式）を3つ、以下の形式で出力してください。前置きや説明文は不要です。条件に完全に一致する数値が確認できない場合は、分かる範囲のフォロワー数・再生数の目安も併記してください。
1. [URL] - 簡単な説明（なぜバズっているか、構成の特徴、分かる範囲のフォロワー数・再生数など）
2. [URL] - 説明
3. [URL] - 説明`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "検索に失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message || "検索に失敗しました" }, { status: 500 });
  }
}
