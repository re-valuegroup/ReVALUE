export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { genre, theme } = await req.json();

    const prompt = `あなたはInstagram Reelsのトレンドリサーチに精通したSNSアナリストです。web検索ツールを使って、以下のジャンル・テーマに関連する、直近で実際にバズっている（再生数・いいね数が多い）Instagramのショート動画（リール）を3つ探してください。

ジャンル: ${genre || "指定なし"}
テーマ: ${theme || "指定なし"}

必ず実在するInstagramのリールのURL（https://www.instagram.com/reel/... の形式）を3つ、以下の形式で出力してください。前置きや説明文は不要です。
1. [URL] - 簡単な説明（なぜバズっているか、構成の特徴など1文）
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
