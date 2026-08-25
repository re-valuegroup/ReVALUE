export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { transcript } = await req.json();
    if (!transcript || !transcript.trim()) {
      return Response.json({ error: "音声の内容が空です" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `あなたはSNS運用代行会社の動画制作管理システムのアシスタントです。以下は、スタッフが音声入力で話した内容を文字起こししたものです。この内容を読み取り、動画の管理項目にふさわしい形で振り分けてください。

今日の日付: ${today}（相対的な日付表現「明日」「来週の金曜」などはこの日付を基準に西暦の YYYY-MM-DD 形式に変換してください）

音声の文字起こし:
「${transcript}」

以下のJSON形式で、当てはまる項目だけを埋めて出力してください。話の中で触れられていない項目は、キー自体を含めないでください（空文字列を入れないでください）。前置きや説明、コードブロックの記号（\`\`\`）は一切使わず、JSONオブジェクトのみを出力してください。

{
  "theme": "動画のテーマ・企画内容（一言で）",
  "editInstructions": "編集者への指示内容（テロップの入れ方、カットの仕方、演出の要望など）",
  "script": "台本・話す内容・構成の流れ",
  "memo": "動画の概要・伝えたいこと・補足メモ",
  "workMode": "「1人で全部やる」「一括で」のような話であれば solo、「カットと テロップで担当を分ける」「分業で」のような話であれば team",
  "shooterName": "撮影を担当する人の名前（話に出てきた場合のみ）",
  "deadline": "初稿の締切日（YYYY-MM-DD形式。話に出てきた場合のみ）",
  "postPlanDate": "投稿予定日（YYYY-MM-DD形式。話に出てきた場合のみ）",
  "editorName": "編集を担当する人の名前。1人がすべての工程（カット・テロップ・アニメーション・演出・効果音BGM）を担当する場合はここに入れる",
  "editorAssignments": { "cut": "カット担当者の名前", "telop": "テロップ担当者の名前", "animation": "アニメーション・演出担当者の名前", "sfx": "効果音・BGM担当者の名前" }
}

editorAssignmentsは、工程ごとに違う人が話に出てきた場合のみ、該当する工程のキーだけを含めてください（触れられていない工程のキーは含めないでください）。1人がすべて担当する場合はeditorNameのみを使い、editorAssignmentsは省略してください。`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "振り分けに失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let fields;
    try {
      fields = JSON.parse(cleaned);
    } catch (e) {
      return Response.json({ error: "AIの応答をうまく読み取れませんでした。もう一度お試しください。" }, { status: 500 });
    }

    return Response.json({ fields });
  } catch (e) {
    return Response.json({ error: e.message || "振り分けに失敗しました" }, { status: 500 });
  }
}
