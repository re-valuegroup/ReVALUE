export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { transcript } = await req.json();
    if (!transcript || !transcript.trim()) {
      return Response.json({ error: "文字起こしの内容が空です" }, { status: 400 });
    }

    const prompt = `以下は、Adobe Premiere Proの自動文字起こし機能でコピーされた、動画のテキストです。タイムコード・再生時間・話者ラベル・改行の乱れなど、文章として不要な情報が混ざっています。

これを読み取り、以下の対応をしてください。
- タイムコードや再生時間の表記（例：「00:00:12」「0:15」など）を取り除く
- 不要な改行・重複した空白を整理する
- 明らかな誤字脱字を自然に修正する（内容や意味は変えない）
- 話している内容そのものは要約・省略せず、自然につながった一つの文章にまとめる

出力は、整えられた文章のみとしてください。前置きや説明、見出しは一切不要です。

【元のテキスト】
${transcript}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "添削に失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message || "添削に失敗しました" }, { status: 500 });
  }
}
