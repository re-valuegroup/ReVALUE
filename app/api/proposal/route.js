export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { clientName, clientBusiness, clientAppeal, clientPlan, purpose, structure, shootCount } = await req.json();
    const count = parseInt(shootCount) || 3;

    const prompt = `あなたはInstagram ReelsとTikTokに精通したSNSコンテンツストラテジストです。web検索ツールを使って直近の最新トレンド（バズっているフォーマット、音源、演出手法）を調べたうえで、以下のクライアントに最適な次回撮影のリール企画を${count}案、日本語で提案してください。

クライアント情報:
- 会社名: ${clientName || ""}
- 事業内容: ${clientBusiness || ""}
- アピールポイント: ${clientAppeal || ""}
- 運用プラン: ${clientPlan || ""}

今回の撮影の目的: ${purpose || "指定なし（クライアントの魅力を伝える一般的な内容で提案してください）"}
希望する構成・演出の方向性: ${structure || "指定なし（トレンドを踏まえて自由に提案してください）"}
撮影本数: ${count}本

各企画には「テーマ」「構成・台本の流れ（箇条書き）」「演出・撮影のポイント」を含めてください。簡潔に、撮影者がそのまま現場で使える形式でお願いします。`;

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
