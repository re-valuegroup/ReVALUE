export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { clientName, monthLabel, posts } = await req.json();

    if (!posts || posts.length === 0) {
      return Response.json({ error: "投稿済みの動画がありません" }, { status: 400 });
    }

    const postList = posts.map((p, i) => {
      const links = [];
      if (p.instagramUrl) links.push(`Instagram: ${p.instagramUrl}`);
      if (p.tiktokUrl) links.push(`TikTok: ${p.tiktokUrl}`);
      if (p.youtubeUrl) links.push(`YouTube: ${p.youtubeUrl}`);
      return `${i + 1}. 「${p.theme || "テーマ未設定"}」\n${links.join("\n")}`;
    }).join("\n\n");

    const prompt = `あなたはSNS運用代行会社のレポート作成を担当するアナリストです。web検索ツールを使って、以下のクライアントの投稿URLについて、可能な範囲で現在の再生数・いいね数・シェア数・コメント数などの実績数値を調べてください。

クライアント名: ${clientName}
対象期間: ${monthLabel}

投稿一覧:
${postList}

以下の形式で、SNS運用代行の月次報告書に使える文章を日本語で作成してください。
- 各投稿ごとに、調べられた数値（再生数・いいね数・シェア数・コメント数）を箇条書きで記載
- 数値が取得できなかった場合は「取得できませんでした」と正直に記載（架空の数値は絶対に作らないでください）
- 最後に、今月の傾向・所感を3〜4行でまとめる

前置きや余計な説明は不要で、報告書の本文のみを出力してください。`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "レポート作成に失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message || "レポート作成に失敗しました" }, { status: 500 });
  }
}
