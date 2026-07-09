export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { clientName, clientBusiness, clientAppeal, clientPlan, theme } = await req.json();

    const prompt = `あなたはInstagram ReelsとTikTokに精通したSNSコンテンツストラテジストです。web検索ツールを使って直近の最新トレンド（バズっているフォーマット・音源・演出手法・構成パターン）を調べたうえで、動画撮影者がそのまま現場で使える台本を1本、日本語で提案してください。

クライアント情報:
- 会社名: ${clientName || ""}
- 事業内容: ${clientBusiness || ""}
- アピールポイント: ${clientAppeal || ""}
- 運用プラン: ${clientPlan || ""}
- 今回の動画テーマ: ${theme || "（未設定・テーマから提案してください）"}

出力形式:
【企画意図】1〜2行
【台本】カット割り・セリフ・テロップを箇条書きで具体的に（撮影者がそのまま読める形式）
【演出・撮影のポイント】箇条書き2〜3点`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
