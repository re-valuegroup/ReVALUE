"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Video, CheckSquare, BarChart3, Wallet, UserCog,
  Plus, X, Pencil, Trash2, Instagram, ExternalLink, Sparkles, ChevronRight,
  ChevronLeft, Menu, Eye, EyeOff, Calendar, TrendingUp, FileText,
  Link2, Loader2, Camera, Scissors, MessageSquare, Send, Clock,
  CircleCheck, Circle, ArrowLeft, Building2, User, MapPin, Info, Copy,
  ClipboardList, MessageCircle, Megaphone, UserCheck, Image as ImageIcon,
  DollarSign, LogOut
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAll, upsertRow, deleteRow, bulkUpsert } from "@/lib/db";

const STAGES = [
  { key: "shoot", label: "撮影完了", icon: Camera },
  { key: "edit_request", label: "編集指示完了", icon: MessageSquare },
  { key: "editing", label: "編集完了", icon: Scissors },
  { key: "edit_done", label: "チェック完了", icon: CheckSquare },
  { key: "posted", label: "投稿完了", icon: Send },
];

const ROLES = [
  { key: "admin", label: "統括管理者", color: "coral", icon: UserCog },
  { key: "editor", label: "動画編集者", color: "teal", icon: Scissors },
  { key: "shooter", label: "動画撮影者", color: "amber", icon: Camera },
  { key: "designer", label: "画像作成者", color: "purple", icon: ImageIcon },
];
const SELECTABLE_ROLES = ROLES.filter(r => r.key !== "admin");
const EDIT_WORKLOAD_OPTIONS = [1, 1.5, 2, 2.5, 3];
const EDIT_ROLE_FIELDS = [
  { key: "cutEditorId", label: "①カット" },
  { key: "telopEditorId", label: "②テロップ" },
  { key: "sfxEditorId", label: "③効果音" },
];

const CONTRACT_TYPES = ["正社員", "業務委託", "アルバイト", "その他"];
const WORK_STATUSES = ["稼働中", "休止中", "退職"];
const workStatusTone = { "稼働中": "teal", "休止中": "amber", "退職": "gray" };

const roleLabel = (k) => ROLES.find(r => r.key === k)?.label || k;
const roleLabels = (roles) => (roles && roles.length ? roles.map(roleLabel).join("・") : "未設定");

function emptyUser() {
  return {
    id: uid("user"), name: "", roles: ["shooter"],
    email: "", phone: "", joinDate: "", contractType: "業務委託",
    skills: "", availability: "", bankAccount: "",
    workStatus: "稼働中", notes: "", createdAt: new Date().toISOString(),
  };
}

// 過去バージョン（role が単一文字列だったころ）のデータを roles 配列に変換する
// 旧・6段階パイプライン（撮影/編集指示/編集/修正チェック/キャプション/投稿）から
// 新・5段階パイプライン（撮影完了/編集指示/編集中/編集完了/投稿完了）へ、進捗値を一度だけ変換する
function normalizeReel(r) {
  if (!r) return r;
  if (r.stageVersion === 2) return r;
  const raw = r.completedStages || 0;
  const migrated = raw <= 4 ? raw : raw - 1;
  return { ...r, completedStages: migrated, stageVersion: 2 };
}

// 動画1本の編集予定日を、カレンダー上の「その動画専用の編集イベント」と同期する
// （カレンダー側で複数動画をまとめて登録したイベントとは別に、1動画=1イベントで自動管理する）
function syncReelEditCalendar(setCalendarEvents, reelId, startDate, endDate, staffId) {
  if (!setCalendarEvents) return;
  setCalendarEvents(prev => {
    const existing = prev.find(e => e.type === "edit" && e.reelIds && e.reelIds.length === 1 && e.reelIds[0] === reelId);
    if (!startDate) {
      return existing ? prev.filter(e => e.id !== existing.id) : prev;
    }
    const end = endDate || startDate;
    if (existing) {
      return prev.map(e => e.id === existing.id ? { ...e, startDate, endDate: end, staffId: staffId || e.staffId } : e);
    }
    return [...prev, { id: uid("event"), type: "edit", reelIds: [reelId], staffId: staffId || "", startDate, endDate: end, note: "", createdAt: new Date().toISOString() }];
  });
}

function uid(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function currentYearMonth() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m)}月`;
}

async function callApi(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "AI応答の取得に失敗しました");
  return data.text;
}

const emptyClient = () => ({
  id: uid("client"),
  companyName: "", ceoName: "", address: "", website: "",
  instagram: { url: "", id: "", password: "" },
  tiktok: { url: "", id: "", password: "" },
  youtube: { url: "", id: "" },
  hashtag1: "", hashtag2: "", hashtag3: "",
  business: "", appeal: "", plan: "", monthlyCount: 4,
  contractEndDate: "", postDays: [],
  setupTasks: { profile: "pending", highlight: "pending", line: "pending", lp: "pending" },
  notes: "", createdAt: new Date().toISOString(),
});

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SETUP_TASK_FIELDS = [
  { key: "profile", label: "インスタプロフィール作成" },
  { key: "highlight", label: "ハイライト作成" },
  { key: "line", label: "公式LINE作成" },
  { key: "lp", label: "LP作成" },
];
const getSetupTasks = (c) => ({ profile: "pending", highlight: "pending", line: "pending", lp: "pending", ...(c.setupTasks || {}) });

const CHECKLIST_ITEMS = [
  { key: "c1", label: "カットの間が空きすぎず、詰まりすぎずテンポがある" },
  { key: "c2", label: "テロップの位置は統一感、意図がある" },
  { key: "c3", label: "テロップはセーフマージン内に収まっている" },
  { key: "c4", label: "テロップの色はクライアントのアカウントの雰囲気に合っている" },
  { key: "c5", label: "テロップと効果音のタイミングにズレがなく表示タイミングもいい" },
  { key: "c6", label: "テロップ、効果音共に単調になっていない" },
  { key: "c7", label: "冒頭フックは動画全体の惹きつけられる場面等が使われている" },
  { key: "c8", label: "動画の途中で離脱ポイントがほとんどない" },
];
const emptyChecklist = () => ({ c1: false, c2: false, c3: false, c4: false, c5: false, c6: false, c7: false, c8: false, memo: "" });

const emptyReel = (clientId, ym) => ({
  id: uid("reel"), clientId, yearMonth: ym,
  assignedStaffId: "",
  cutEditorId: "", telopEditorId: "", sfxEditorId: "", editorSecondaryId: "",
  editStartDate: "", editEndDate: "", editWorkload: "",
  checklist: emptyChecklist(), checkSubmitted: false, checkSubmittedAt: null,
  theme: "", script: "", editInstructions: "", driveUrl: "",
  transcript: "", memo: "", caption: "",
  captionHistory: [], trendSearches: [],
  completedStages: 0, stageVersion: 2, postedDate: "",
  instagramUrl: "", instagramViews: "", instagramLikes: "",
  tiktokUrl: "", tiktokViews: "", tiktokLikes: "",
  youtubeUrl: "", youtubeViews: "", youtubeLikes: "",
  createdAt: new Date().toISOString(),
});

function duplicateReel(reel, clientId, ym) {
  return {
    ...emptyReel(clientId ?? reel.clientId, ym ?? reel.yearMonth),
    assignedStaffId: reel.assignedStaffId,
    theme: reel.theme, script: reel.script, editInstructions: reel.editInstructions, driveUrl: "",
    memo: reel.memo,
  };
}

const emptyFinance = (clientId) => ({
  clientId, contractStart: "", contractEnd: "", monthlyFee: "", contractFee: "",
  billingDates: {}, paidMonths: [], notes: "",
});

// 4月始まり・3月終わりの会計年度の12ヶ月分（YYYY-MM）を返す
function getFiscalYearMonths(baseDate = new Date()) {
  const y = baseDate.getFullYear();
  const startYear = baseDate.getMonth() >= 3 ? y : y - 1;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, 3 + i, 1);
    months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  return months;
}

// 契約開始日〜契約終了日の月一覧（YYYY-MM）。契約期間が未設定の場合は会計年度（4月〜翌3月）を返す
function getContractMonths(f) {
  if (!f?.contractStart || !f?.contractEnd) return getFiscalYearMonths();
  const start = new Date(f.contractStart);
  const end = new Date(f.contractEnd);
  if (isNaN(start) || isNaN(end) || end < start) return getFiscalYearMonths();
  const months = [];
  let d = new Date(start.getFullYear(), start.getMonth(), 1);
  const endD = new Date(end.getFullYear(), end.getMonth(), 1);
  while (d <= endD && months.length < 240) {
    months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return months;
}

// 月額料金が未入力で契約料金が入力されている場合は、契約料金を12ヶ月で割った金額を使う
function effectiveMonthlyFee(f) {
  const monthly = parseFloat(f?.monthlyFee);
  if (monthly > 0) return monthly;
  const contractFee = parseFloat(f?.contractFee);
  if (contractFee > 0) return contractFee / 12;
  return 0;
}


function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: { bg: "#EDEBE4", fg: "#5F5E5A" },
    coral: { bg: "#FBE4F1", fg: "#96185E" },
    teal: { bg: "#E1F4FA", fg: "#0E90B8" },
    amber: { bg: "#FAEEDA", fg: "#854F0B" },
    red: { bg: "#FCEBEB", fg: "#A32D2D" },
    purple: { bg: "#F1E9FB", fg: "#6B3FA0" },
  };
  const t = tones[tone] || tones.gray;
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold mb-1" style={{ color: "#5F5E5A" }}>{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 transition";
const inputStyle = { borderColor: "#DEDACD", background: "#FFFFFF" };

function TextInput(props) {
  return <input {...props} className={inputCls + " " + (props.className || "")} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function TextArea(props) {
  return <textarea {...props} className={inputCls + " " + (props.className || "")} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

function PasswordField({ value, onChange, placeholder, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} className="pr-9" {...rest} />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-90">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function Pipeline({ completedStages, onAdvance, onRegress, compact }) {
  return (
    <div className="flex items-center" style={{ gap: compact ? 2 : 4 }}>
      {STAGES.map((s, i) => {
        const done = i < completedStages;
        const isNext = i === completedStages;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            <button
              type="button"
              title={s.label}
              onClick={() => {
                if (!onAdvance) return;
                if (done) { onRegress && onRegress(i); } else { onAdvance(i); }
              }}
              className="flex flex-col items-center group"
              style={{ cursor: onAdvance ? "pointer" : "default" }}
            >
              <div
                className="rounded-full flex items-center justify-center transition"
                style={{
                  width: compact ? 22 : 30, height: compact ? 22 : 30,
                  background: done ? "#0E90B8" : isNext ? "#D6248A" : "#EDEBE4",
                  color: done || isNext ? "#fff" : "#8B897F",
                }}
              >
                <Icon size={compact ? 11 : 14} />
              </div>
              {<span className="mt-1 text-center" style={{ fontSize: compact ? 8 : 10, color: done ? "#0E90B8" : isNext ? "#D6248A" : "#A9A79C", fontWeight: 600, lineHeight: 1.2 }}>{done ? s.label : "未完了"}</span>}
            </button>
            {i < STAGES.length - 1 && <div style={{ width: compact ? 8 : 16, height: 2, background: i < completedStages ? "#0E90B8" : "#E4E1D6" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleRole = (key) => setRoles(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        if (!name.trim()) throw new Error("名前を入力してください");
        if (roles.length === 0) throw new Error("役割を1つ以上選択してください");
        // 日本語などの名前をサインアップのメタデータに直接含めると、
        // 一部のブラウザ環境で内部的なエラーが起きるため、
        // まずメールアドレス・パスワードだけでサインアップし、
        // 作成されたプロフィールの名前・役割はあとから更新する
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data?.user) {
          await supabase.from("profiles").update({ name: name.trim(), roles }).eq("auth_user_id", data.user.id);
        }
      }
      onAuthed && onAuthed();
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "メールアドレスまたはパスワードが違います。" : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#16171B" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4" style={{ width: 64, height: 64 }}>
            <img src="/logo-mark.png" alt="ReVALUE" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: "#FAF8F3" }}>ReVALUE Studio</h1>
          <p className="text-sm mt-1" style={{ color: "#8B897F" }}>SNS運用代行 業務管理システム</p>
        </div>

        <form className="rounded-2xl p-6" style={{ background: "#FAF8F3" }} onSubmit={submit}>
          <div className="flex rounded-xl overflow-hidden mb-4 border" style={{ borderColor: "#DEDACD" }}>
            <button type="button" onClick={() => setMode("login")} className="flex-1 text-sm font-semibold py-2" style={{ background: mode === "login" ? "#16171B" : "#fff", color: mode === "login" ? "#fff" : "#5F5E5A" }}>ログイン</button>
            <button type="button" onClick={() => setMode("signup")} className="flex-1 text-sm font-semibold py-2" style={{ background: mode === "signup" ? "#16171B" : "#fff", color: mode === "signup" ? "#fff" : "#5F5E5A" }}>初めての方はこちら</button>
          </div>

          {mode === "signup" && (
            <>
              <Field label="名前"><TextInput name="name" value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" /></Field>
              <Field label="役割（複数選択可）">
                <div className="grid grid-cols-3 gap-2">
                  {SELECTABLE_ROLES.map(r => (
                    <button key={r.key} onClick={() => toggleRole(r.key)} type="button"
                      className="flex flex-col items-center gap-1 py-2 rounded-lg border"
                      style={{ borderColor: roles.includes(r.key) ? "#16171B" : "#DEDACD", background: roles.includes(r.key) ? "#16171B" : "#fff" }}>
                      <r.icon size={16} color={roles.includes(r.key) ? "#fff" : "#5F5E5A"} />
                      <span className="text-[11px] font-semibold" style={{ color: roles.includes(r.key) ? "#fff" : "#5F5E5A" }}>{r.label}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label="メールアドレス"><TextInput type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <Field label="パスワード">
            <PasswordField name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="8文字以上" />
          </Field>

          {error && <p className="text-xs mb-2" style={{ color: "#A32D2D" }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim() || (mode === "signup" && !name.trim())}
            className="w-full text-sm font-semibold py-2.5 rounded-xl text-white mt-2 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "#D6248A" }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "login" ? "ログイン" : "アカウントを作成してログイン"}
          </button>
          {mode === "signup" && (
            <p className="text-[11px] mt-2 text-center" style={{ color: "#A9A79C" }}>連絡先や契約形態などの詳細プロフィールは、ログイン後「メンバー管理」から登録・編集できます。</p>
          )}
        </form>
      </div>
    </div>
  );
}

function ClientForm({ client, finance, isAdmin, onSave, onCancel }) {
  const [c, setC] = useState({ ...emptyClient(), ...client, instagram: { ...emptyClient().instagram, ...client.instagram }, tiktok: { ...emptyClient().tiktok, ...client.tiktok }, youtube: { ...emptyClient().youtube, ...client.youtube } });
  const [f, setF] = useState(finance || emptyFinance(client.id));
  const set = (path, val) => {
    setC(prev => {
      const next = { ...prev };
      if (path.includes(".")) {
        const [a, b] = path.split(".");
        next[a] = { ...next[a], [b]: val };
      } else next[path] = val;
      return next;
    });
  };
  const setFin = (key, val) => setF(prev => ({ ...prev, [key]: val }));
  return (
    <div className="rounded-2xl p-5 border" style={{ borderColor: "#DEDACD", background: "#fff" }}>
      <div className="grid md:grid-cols-2 gap-x-6">
        <Field label="会社名"><TextInput value={c.companyName} onChange={e => set("companyName", e.target.value)} placeholder="株式会社〇〇" /></Field>
        <Field label="代表者名"><TextInput value={c.ceoName} onChange={e => set("ceoName", e.target.value)} placeholder="代表 太郎" /></Field>
        <Field label="住所"><TextInput value={c.address} onChange={e => set("address", e.target.value)} placeholder="沖縄県那覇市..." /></Field>
        <Field label="Webサイト"><TextInput value={c.website} onChange={e => set("website", e.target.value)} placeholder="https://example.com" /></Field>
        <Field label="運用プラン"><TextInput value={c.plan} onChange={e => set("plan", e.target.value)} placeholder="スタンダードプラン" /></Field>
        <Field label="契約終了予定日"><TextInput type="date" value={c.contractEndDate} onChange={e => set("contractEndDate", e.target.value)} /></Field>
        <Field label="事業内容"><TextArea rows={2} value={c.business} onChange={e => set("business", e.target.value)} placeholder="美容室経営 / ヘアサロン" /></Field>
        <Field label="アピールポイント"><TextArea rows={2} value={c.appeal} onChange={e => set("appeal", e.target.value)} placeholder="低価格、地域No.1の技術力など" /></Field>
        <Field label="月の動画制作本数"><TextInput type="number" value={c.monthlyCount} onChange={e => set("monthlyCount", e.target.value)} /></Field>
        <Field label="投稿曜日">
          <div className="flex gap-1">
            {WEEKDAYS.map((w, i) => {
              const checked = (c.postDays || []).includes(i);
              return (
                <button key={i} type="button" onClick={() => set("postDays", checked ? (c.postDays || []).filter(d => d !== i) : [...(c.postDays || []), i])}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border"
                  style={{ borderColor: checked ? "#16171B" : "#DEDACD", background: checked ? "#16171B" : "#fff", color: checked ? "#fff" : "#5F5E5A" }}>
                  {w}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="備考メモ"><TextArea rows={2} value={c.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </div>

      <div className="grid md:grid-cols-3 gap-x-6 mt-2 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
        <div>
          <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: "#96185E" }}><Instagram size={13} /> Instagram</p>
          <Field label="URL"><TextInput value={c.instagram.url} onChange={e => set("instagram.url", e.target.value)} placeholder="https://instagram.com/..." /></Field>
          <Field label="ID"><TextInput value={c.instagram.id} onChange={e => set("instagram.id", e.target.value)} /></Field>
          <Field label="パスワード"><PasswordField value={c.instagram.password} onChange={e => set("instagram.password", e.target.value)} /></Field>
        </div>
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#16171B" }}>TikTok</p>
          <Field label="URL"><TextInput value={c.tiktok.url} onChange={e => set("tiktok.url", e.target.value)} placeholder="https://tiktok.com/@..." /></Field>
          <Field label="ID"><TextInput value={c.tiktok.id} onChange={e => set("tiktok.id", e.target.value)} /></Field>
          <Field label="パスワード"><PasswordField value={c.tiktok.password} onChange={e => set("tiktok.password", e.target.value)} /></Field>
        </div>
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#A32D2D" }}>YouTube</p>
          <Field label="URL"><TextInput value={c.youtube.url} onChange={e => set("youtube.url", e.target.value)} placeholder="https://youtube.com/@..." /></Field>
          <Field label="ID"><TextInput value={c.youtube.id} onChange={e => set("youtube.id", e.target.value)} /></Field>
        </div>
      </div>

      <div className="mt-2 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
        <p className="text-xs font-bold mb-2" style={{ color: "#16171B" }}>指定ハッシュタグ（動画のキャプション作成時、末尾に自動で追加されます）</p>
        <div className="grid grid-cols-3 gap-2">
          <TextInput value={c.hashtag1} onChange={e => set("hashtag1", e.target.value)} placeholder="#タグ1" />
          <TextInput value={c.hashtag2} onChange={e => set("hashtag2", e.target.value)} placeholder="#タグ2" />
          <TextInput value={c.hashtag3} onChange={e => set("hashtag3", e.target.value)} placeholder="#タグ3" />
        </div>
      </div>

      {isAdmin && (
        <div className="mt-2 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: "#16171B" }}><Wallet size={13} /> 契約・料金情報（経理管理と連動）</p>
          <div className="grid md:grid-cols-4 gap-x-4">
            <Field label="契約開始日"><TextInput type="date" value={f.contractStart} onChange={e => setFin("contractStart", e.target.value)} /></Field>
            <Field label="契約終了日"><TextInput type="date" value={f.contractEnd} onChange={e => setFin("contractEnd", e.target.value)} /></Field>
            <Field label="月額料金"><TextInput type="number" value={f.monthlyFee} onChange={e => setFin("monthlyFee", e.target.value)} placeholder="円" /></Field>
            <Field label="契約料金"><TextInput type="number" value={f.contractFee} onChange={e => setFin("contractFee", e.target.value)} placeholder="円" /></Field>
          </div>
          <p className="text-[11px]" style={{ color: "#A9A79C" }}>請求日・入金ステータスの管理は「経理管理」ページから行えます。</p>
        </div>
      )}

      <div className="mt-2 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
        <p className="text-xs font-bold mb-2" style={{ color: "#16171B" }}>初期設定タスク</p>
        <div className="grid md:grid-cols-2 gap-3">
          {SETUP_TASK_FIELDS.map(f2 => {
            const tasks = getSetupTasks(c);
            const val = tasks[f2.key];
            return (
              <div key={f2.key} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#FAF8F3" }}>
                <span className="text-xs font-semibold">{f2.label}</span>
                <div className="flex gap-1">
                  {[{ v: "pending", label: "未完了" }, { v: "done", label: "✅完了" }, { v: "unnecessary", label: "不要" }].map(opt => (
                    <button key={opt.v} type="button" onClick={() => set("setupTasks", { ...tasks, [f2.key]: opt.v })}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md border"
                      style={{ borderColor: val === opt.v ? "#16171B" : "#DEDACD", background: val === opt.v ? "#16171B" : "#fff", color: val === opt.v ? "#fff" : "#5F5E5A" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: "#DEDACD" }}>キャンセル</button>
        <button onClick={() => onSave(c, f)} disabled={!c.companyName.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#16171B" }}>保存する</button>
      </div>
    </div>
  );
}

function ClientsPage({ clients, setClients, finance, setFinance, currentUser, onOpenClient }) {
  const [editing, setEditing] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const canEdit = true;
  const isAdmin = (currentUser.roles || []).includes("admin");

  const save = (c, f) => {
    setClients(prev => {
      const exists = prev.some(x => x.id === c.id);
      return exists ? prev.map(x => x.id === c.id ? c : x) : [...prev, c];
    });
    if (f) {
      setFinance(prev => {
        const exists = prev.some(x => x.clientId === c.id);
        return exists ? prev.map(x => x.clientId === c.id ? f : x) : [...prev, f];
      });
    }
    setEditing(null);
  };
  const remove = (id) => {
    setClients(prev => prev.filter(x => x.id !== id));
    setConfirmDeleteId(null);
  };

  if (editing) return <ClientForm client={editing} finance={finance.find(x => x.clientId === editing.id)} isAdmin={isAdmin} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>クライアント管理</h2>
        {canEdit && (
          <button onClick={() => setEditing(emptyClient())} className="flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: "#D6248A" }}>
            <Plus size={15} /> クライアント追加
          </button>
        )}
      </div>
      {clients.length === 0 && (
        <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>
          まだクライアントが登録されていません。
        </div>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map(c => (
          <div key={c.id} className="rounded-2xl p-4 border cursor-pointer hover:shadow-sm transition" style={{ borderColor: "#DEDACD", background: "#fff" }} onClick={() => onOpenClient(c.id)}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{c.companyName}</p>
                <p className="text-xs mt-0.5" style={{ color: "#8B897F" }}>{c.ceoName}</p>
              </div>
              {canEdit && (
                <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                  {confirmDeleteId === c.id ? (
                    <>
                      <button onClick={() => remove(c.id)} className="text-[11px] font-semibold px-2 py-1 rounded text-white" style={{ background: "#A32D2D" }}>本当に削除</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="p-1.5 rounded-lg hover:bg-black/5"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing(c)} className="p-1.5 rounded-lg hover:bg-black/5"><Pencil size={14} /></button>
                      {isAdmin && <button onClick={() => setConfirmDeleteId(c.id)} className="p-1.5 rounded-lg hover:bg-black/5"><Trash2 size={14} /></button>}
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs mt-2 line-clamp-2" style={{ color: "#5F5E5A" }}>{c.business}</p>
            <div className="flex items-center gap-1.5 mt-3">
              <Badge tone="coral">{c.plan || "プラン未設定"}</Badge>
              <Badge tone="gray">月{c.monthlyCount || 0}本</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientDetail({ client, clients, setClients, finance, setFinance, reels, currentUser, onBack, onGoReels }) {
  const [editing, setEditing] = useState(false);
  const canEdit = true;
  const isAdmin = (currentUser.roles || []).includes("admin");

  const clientReels = reels.filter(r => r.clientId === client.id);
  const postedCount = clientReels.filter(r => r.completedStages >= 5).length;

  if (editing) {
    return <ClientForm client={client} finance={finance.find(x => x.clientId === client.id)} isAdmin={isAdmin} onCancel={() => setEditing(false)} onSave={(c, f) => {
      setClients(prev => prev.map(x => x.id === c.id ? c : x));
      if (f) {
        setFinance(prev => {
          const exists = prev.some(x => x.clientId === c.id);
          return exists ? prev.map(x => x.clientId === c.id ? f : x) : [...prev, f];
        });
      }
      setEditing(false);
    }} />;
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: "#8B897F" }}><ArrowLeft size={15} /> クライアント一覧</button>

      <div className="rounded-2xl p-5 border mb-4" style={{ borderColor: "#DEDACD", background: "#fff" }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700 }}>{client.companyName}</h2>
            <p className="text-sm mt-0.5 flex items-center gap-1" style={{ color: "#5F5E5A" }}><User size={13} />{client.ceoName}</p>
            <p className="text-sm mt-0.5 flex items-center gap-1" style={{ color: "#5F5E5A" }}><MapPin size={13} />{client.address}</p>
            {client.website && <a href={client.website} target="_blank" rel="noreferrer" className="text-sm mt-0.5 flex items-center gap-1" style={{ color: "#96185E" }}><Link2 size={13} />{client.website}</a>}
          </div>
          {canEdit && <button onClick={() => setEditing(true)} className="p-2 rounded-lg border" style={{ borderColor: "#DEDACD" }}><Pencil size={15} /></button>}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>事業内容</p>
            <p className="text-sm">{client.business || "―"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>アピールポイント</p>
            <p className="text-sm">{client.appeal || "―"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>プラン / 月間本数</p>
            <p className="text-sm">{client.plan || "―"} ・ 月{client.monthlyCount || 0}本</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>契約終了予定日</p>
            <p className="text-sm">{client.contractEndDate || "―"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>投稿曜日</p>
            <p className="text-sm">{(client.postDays || []).length > 0 ? client.postDays.slice().sort().map(i => WEEKDAYS[i]).join("・") : "―"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>備考</p>
            <p className="text-sm">{client.notes || "―"}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "#8B897F" }}>初期設定タスク</p>
          <div className="flex flex-wrap gap-1.5">
            {SETUP_TASK_FIELDS.map(f => {
              const val = getSetupTasks(client)[f.key];
              const tone = val === "done" ? "teal" : val === "unnecessary" ? "gray" : "amber";
              const text = val === "done" ? `✅ ${f.label}` : val === "unnecessary" ? `${f.label}（不要）` : `${f.label}（未完了）`;
              return <Badge key={f.key} tone={tone}>{text}</Badge>;
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "#8B897F" }}><Wallet size={12} /> 契約・料金情報（統括管理者専用・経理管理と連動）</p>
            {(() => {
              const cf = finance.find(x => x.clientId === client.id) || emptyFinance(client.id);
              return (
                <div className="grid md:grid-cols-4 gap-4">
                  <div><p className="text-xs" style={{ color: "#8B897F" }}>契約開始日</p><p className="text-sm">{cf.contractStart || "―"}</p></div>
                  <div><p className="text-xs" style={{ color: "#8B897F" }}>契約終了日</p><p className="text-sm">{cf.contractEnd || "―"}</p></div>
                  <div><p className="text-xs" style={{ color: "#8B897F" }}>月額料金</p><p className="text-sm">{cf.monthlyFee ? `¥${parseFloat(cf.monthlyFee).toLocaleString()}` : "―"}</p></div>
                  <div><p className="text-xs" style={{ color: "#8B897F" }}>契約料金</p><p className="text-sm">{cf.contractFee ? `¥${parseFloat(cf.contractFee).toLocaleString()}` : "―"}</p></div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4 mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          {[{ label: "Instagram", data: client.instagram, hasPassword: true }, { label: "TikTok", data: client.tiktok, hasPassword: true }, { label: "YouTube", data: client.youtube || {}, hasPassword: false }].map(sns => (
            <div key={sns.label} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
              <p className="text-xs font-bold mb-2">{sns.label}</p>
              {sns.data.url ? (
                <a href={sns.data.url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 mb-1" style={{ color: "#96185E" }}>{sns.data.url} <ExternalLink size={11} /></a>
              ) : <p className="text-xs mb-1" style={{ color: "#A9A79C" }}>URL未設定</p>}
              <p className="text-xs" style={{ color: "#5F5E5A" }}>ID: {sns.data.id || "―"}</p>
              {sns.hasPassword && <p className="text-xs" style={{ color: "#5F5E5A" }}>PW: {sns.data.password ? "••••••••" : "―"}</p>}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>指定ハッシュタグ</p>
          <p className="text-sm">{[client.hashtag1, client.hashtag2, client.hashtag3].filter(Boolean).join(" ") || "―"}</p>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => onGoReels(client.id)} className="text-sm font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ background: "#16171B" }}>
            <Video size={15} /> 動画制作管理を開く
          </button>
          <Badge tone="teal">今月投稿済み {postedCount}/{clientReels.length}</Badge>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const d = new Date(ts);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReelCard({ reel, client, users, calendarEvents, setCalendarEvents, onChange, onDelete, onDuplicate, canEdit, currentUser, showClient }) {
  const [expanded, setExpanded] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(reel);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setDraft(reel); setDirty(false); }, [reel.id]);

  const editors = users.filter(u => (u.roles || []).includes("editor"));
  const shooters = users.filter(u => (u.roles || []).includes("shooter"));
  const isAdmin = currentUser?.roles?.includes("admin");

  const syncEditCalendar = (updated) => {
    syncReelEditCalendar(setCalendarEvents, updated.id, updated.editStartDate, updated.editEndDate);
  };

  // 「保存する」ボタンを押すまで反映されない、下書き編集用
  const set = (patch) => { setDraft(prev => ({ ...prev, ...patch })); setDirty(true); };
  const saveDraft = () => {
    onChange(draft);
    if (draft.editStartDate !== reel.editStartDate || draft.editEndDate !== reel.editEndDate) {
      syncEditCalendar(draft);
    }
    setDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  // チェックリストの提出やパイプラインのクリックなど、即座に反映すべき操作用
  const update = (patch) => {
    const updated = { ...reel, ...patch };
    onChange(updated);
    setDraft(prev => ({ ...prev, ...patch }));
    if ("editStartDate" in patch || "editEndDate" in patch) {
      syncEditCalendar(updated);
    }
  };

  const buildHashtagSuffix = () => {
    const tags = [client?.hashtag1, client?.hashtag2, client?.hashtag3]
      .map(t => (t || "").trim())
      .filter(Boolean)
      .map(t => t.startsWith("#") ? t : "#" + t);
    return tags.join("\n");
  };

  const genCaption = async () => {
    setGenLoading(true);
    setGenError("");
    try {
      const text = await callApi("/api/caption", {
        clientName: client?.companyName,
        clientBusiness: client?.business,
        theme: draft.theme,
        transcript: draft.transcript,
        memo: draft.memo,
      });
      let clean = text.trim();
      const suffix = buildHashtagSuffix();
      if (suffix) clean = clean + "\n\n" + suffix;
      const historyEntry = { id: uid("cap"), text: clean, createdAt: Date.now() };
      set({ caption: clean, captionHistory: [historyEntry, ...(draft.captionHistory || [])] });
    } catch (e) {
      setGenError("キャプション生成に失敗しました：" + (e.message || "不明なエラー"));
    } finally {
      setGenLoading(false);
    }
  };

  const applyHashtagsToCaption = () => {
    const suffix = buildHashtagSuffix();
    if (!suffix) return;
    const lines = (draft.caption || "").split("\n");
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    const isSingleHashtag = (line) => {
      const t = line.trim();
      return t.length > 0 && t.startsWith("#") && !t.slice(1).includes("#") && t.split(/\s+/).length === 1;
    };
    while (lines.length && isSingleHashtag(lines[lines.length - 1])) lines.pop();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    const newCaption = [...lines, "", suffix].join("\n");
    set({ caption: newCaption });
  };

  const [copied, setCopied] = useState(false);
  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(draft.caption || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setGenError("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  const applyHistoryCaption = (text) => set({ caption: text });
  const deleteHistoryCaption = (id) => set({ captionHistory: (draft.captionHistory || []).filter(h => h.id !== id) });

  const toggleCheck = (key) => update({ checklist: { ...(reel.checklist || emptyChecklist()), [key]: !((reel.checklist || {})[key]) } });
  const setCheckMemo = (memo) => update({ checklist: { ...(reel.checklist || emptyChecklist()), memo } });
  const submitCheck = () => {
    update({ checkSubmitted: true, checkSubmittedAt: new Date().toISOString(), completedStages: Math.max(reel.completedStages, 4) });
  };
  const checklist = reel.checklist || emptyChecklist();
  const checkedCount = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#DEDACD", background: "#fff" }}>
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showClient && <p className="text-[11px] font-semibold truncate" style={{ color: "#D6248A" }}>{client?.companyName || "クライアント不明"} ・ {monthLabel(reel.yearMonth)}</p>}
            <p className="font-bold truncate">{reel.theme || "（テーマ未設定）"}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#8B897F" }}>{reel.editInstructions || "編集指示未入力"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {reel.assignedStaffId && <Badge tone="gray">{users.find(u => u.id === reel.assignedStaffId)?.name || "担当者"}</Badge>}
            {reel.completedStages >= 5 && <Badge tone="teal">投稿済み</Badge>}
            {onDuplicate && canEdit && (
              <button title="この動画を複製" onClick={(e) => { e.stopPropagation(); onDuplicate(reel); }} className="p-1 rounded-lg hover:bg-black/5"><Copy size={14} /></button>
            )}
            <ChevronRight size={16} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
          </div>
        </div>
        <div className="mt-3"><Pipeline compact completedStages={reel.completedStages} onAdvance={canEdit ? (i) => update({ completedStages: i + 1 }) : null} onRegress={canEdit ? (i) => update({ completedStages: i }) : null} /></div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "#EFEDE4" }} onClick={e => e.stopPropagation()}>
          <div className="grid md:grid-cols-2 gap-x-4">
            <Field label="テーマ"><TextInput value={draft.theme} onChange={e => set({ theme: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="担当撮影者">
              <select value={draft.assignedStaffId || ""} onChange={e => set({ assignedStaffId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {shooters.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Google Drive 保存先URL">
              <div className="flex gap-1">
                <TextInput value={draft.driveUrl} onChange={e => set({ driveUrl: e.target.value })} placeholder="https://drive.google.com/..." disabled={!canEdit} />
                {draft.driveUrl && <a href={draft.driveUrl} target="_blank" rel="noreferrer" className="shrink-0 flex items-center justify-center w-9 rounded-lg border" style={{ borderColor: "#DEDACD" }}><Link2 size={14} /></a>}
              </div>
            </Field>
            <Field label="編集指示"><TextArea rows={2} value={draft.editInstructions} onChange={e => set({ editInstructions: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="台本（任意）"><TextArea rows={2} value={draft.script} onChange={e => set({ script: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="①カット担当">
              <select value={draft.cutEditorId || ""} onChange={e => set({ cutEditorId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="②テロップ担当">
              <select value={draft.telopEditorId || ""} onChange={e => set({ telopEditorId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="③効果音担当">
              <select value={draft.sfxEditorId || ""} onChange={e => set({ sfxEditorId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="編集予定日（カレンダーと連動）">
              <div className="flex items-center gap-1">
                <TextInput type="date" value={draft.editStartDate || ""} onChange={e => set({ editStartDate: e.target.value })} disabled={!canEdit} />
                <span className="text-xs shrink-0" style={{ color: "#8B897F" }}>〜</span>
                <TextInput type="date" value={draft.editEndDate || ""} onChange={e => set({ editEndDate: e.target.value })} disabled={!canEdit} />
              </div>
            </Field>
            <Field label="編集工数（統括管理者のみ設定可）">
              <select value={draft.editWorkload || ""} onChange={e => set({ editWorkload: e.target.value })} disabled={!isAdmin} className={inputCls} style={inputStyle}>
                <option value="">未設定</option>
                {EDIT_WORKLOAD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>

          <div className="rounded-xl p-3 my-2" style={{ background: "#FAF8F3" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold flex items-center gap-1.5"><ClipboardList size={13} color="#0E90B8" /> ④修正チェック</p>
              {reel.checkSubmitted && <Badge tone="teal">提出済み ・ {timeAgo(reel.checkSubmittedAt)}</Badge>}
            </div>
            <Field label="チェック担当者">
              <select value={reel.editorSecondaryId || ""} onChange={e => update({ editorSecondaryId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <div className="space-y-1.5">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label key={item.key} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={!!checklist[item.key]} onChange={() => canEdit && toggleCheck(item.key)} disabled={!canEdit} className="mt-0.5" />
                  <span>{i + 1}. {item.label}</span>
                </label>
              ))}
            </div>
            <Field label="動画の文字起こし（任意・AIキャプション生成にも使用されます）"><TextArea rows={3} value={draft.transcript} onChange={e => set({ transcript: e.target.value })} placeholder="完成した動画の文字起こしを貼り付け（なくても生成可）" disabled={!canEdit} /></Field>
            <Field label="メモ欄"><TextArea rows={2} value={checklist.memo} onChange={e => setCheckMemo(e.target.value)} disabled={!canEdit} /></Field>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "#8B897F" }}>チェック済み {checkedCount}/{CHECKLIST_ITEMS.length}</span>
              {canEdit && (
                <button onClick={submitCheck} disabled={!reel.editorSecondaryId} title={!reel.editorSecondaryId ? "チェック担当者を選択してください" : ""} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: "#0E90B8" }}>
                  チェック結果を提出
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl p-3 my-2" style={{ background: "#FAF8F3" }}>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><Sparkles size={13} color="#D6248A" /> AIキャプション作成</p>
            <div className="grid md:grid-cols-2 gap-x-4">
              <Field label="動画概要メモ"><TextArea rows={3} value={draft.memo} onChange={e => set({ memo: e.target.value })} placeholder="動画の要点・伝えたいことのメモ" disabled={!canEdit} /></Field>
            </div>
            <p className="text-[11px] mb-2" style={{ color: "#A9A79C" }}>
              指定ハッシュタグ：{[client?.hashtag1, client?.hashtag2, client?.hashtag3].filter(Boolean).join(" ") || "未設定（クライアント情報の編集画面から設定できます）"}
            </p>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button onClick={genCaption} disabled={genLoading} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
                  {genLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {genLoading ? "生成中..." : (draft.caption ? "AIで再生成" : "AIでキャプションを生成")}
                </button>
              )}
              {canEdit && draft.caption && (
                <button onClick={applyHashtagsToCaption} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#DEDACD", color: "#5F5E5A" }}>
                  指定ハッシュタグを末尾に反映
                </button>
              )}
            </div>
            {genError && <p className="text-xs mt-1" style={{ color: "#A32D2D" }}>{genError}</p>}
            <Field label="キャプション">
              <TextArea rows={4} value={draft.caption} onChange={e => set({ caption: e.target.value })} disabled={!canEdit} />
              {draft.caption && (
                <button onClick={copyCaption} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 mt-1.5" style={{ background: copied ? "#0E90B8" : "#16171B" }}>
                  {copied ? <CircleCheck size={12} /> : <Copy size={12} />} {copied ? "コピーしました" : "キャプションをコピー"}
                </button>
              )}
            </Field>
            {(draft.captionHistory || []).length > 0 && (
              <button onClick={() => setShowHistory(s => !s)} className="text-xs font-semibold" style={{ color: "#5F5E5A" }}>
                生成履歴を見る（{draft.captionHistory.length}件）{showHistory ? " ▲" : " ▼"}
              </button>
            )}
            {showHistory && (
              <div className="space-y-2 mt-2">
                {(draft.captionHistory || []).map(h => (
                  <div key={h.id} className="rounded-lg p-2.5" style={{ background: "#fff", border: "1px solid #EFEDE4" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px]" style={{ color: "#8B897F" }}>{timeAgo(h.createdAt)}</span>
                      <div className="flex items-center gap-2">
                        {canEdit && <button onClick={() => applyHistoryCaption(h.text)} className="text-[11px] font-semibold" style={{ color: "#D6248A" }}>この内容を使う</button>}
                        {canEdit && <button onClick={() => deleteHistoryCaption(h.id)} className="text-[11px]" style={{ color: "#A32D2D" }}>削除</button>}
                      </div>
                    </div>
                    <p className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.6, color: "#5F5E5A" }}>{h.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl p-3 my-2" style={{ background: "#FAF8F3" }}>
            <p className="text-xs font-bold mb-2">投稿情報</p>
            <Field label="投稿日"><TextInput type="date" value={draft.postedDate} onChange={e => set({ postedDate: e.target.value })} disabled={!canEdit} /></Field>
            <div className="grid md:grid-cols-3 gap-x-4">
              {[
                { key: "instagram", label: "Instagram" },
                { key: "tiktok", label: "TikTok" },
                { key: "youtube", label: "YouTube" },
              ].map(sns => (
                <div key={sns.key}>
                  <Field label={`${sns.label} 投稿URL`}>
                    <div className="flex gap-1">
                      <TextInput value={draft[sns.key + "Url"] || ""} onChange={e => set({ [sns.key + "Url"]: e.target.value })} placeholder="https://..." disabled={!canEdit} />
                      {draft[sns.key + "Url"] && (
                        <a href={draft[sns.key + "Url"]} target="_blank" rel="noreferrer" className="shrink-0 flex items-center justify-center px-2 rounded-lg border text-xs font-semibold" style={{ borderColor: "#DEDACD" }}>
                          開く
                        </a>
                      )}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="再生数"><TextInput type="number" value={draft[sns.key + "Views"] || ""} onChange={e => set({ [sns.key + "Views"]: e.target.value })} disabled={!canEdit} /></Field>
                    <Field label="いいね数"><TextInput type="number" value={draft[sns.key + "Likes"] || ""} onChange={e => set({ [sns.key + "Likes"]: e.target.value })} disabled={!canEdit} /></Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 px-4 py-2.5 flex items-center justify-between gap-2" style={{ background: "linear-gradient(to top, #fff 70%, transparent)" }}>
            <span className="text-xs font-semibold" style={{ color: dirty ? "#A32D2D" : "#8B897F" }}>
              {dirty ? "未保存の変更があります" : justSaved ? "保存しました" : ""}
            </span>
            {canEdit && (
              <button onClick={saveDraft} disabled={!dirty} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#16171B" }}>
                保存する
              </button>
            )}
          </div>

          {canEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => onDelete(reel.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#A32D2D" }}>本当に削除する</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs font-semibold" style={{ color: "#8B897F" }}>キャンセル</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs font-semibold flex items-center gap-1 mt-1" style={{ color: "#A32D2D" }}>
                <Trash2 size={13} /> この動画を削除
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function NewReelModal({ client, ym, users, existingReels, onCreate, onClose }) {
  const [form, setForm] = useState({ theme: "", editInstructions: "", script: "", driveUrl: "", assignedStaffId: "" });
  const [dupSource, setDupSource] = useState("");

  const applyDuplicate = (id) => {
    setDupSource(id);
    if (!id) return;
    const src = existingReels.find(r => r.id === id);
    if (!src) return;
    setForm({ theme: src.theme, editInstructions: src.editInstructions, script: src.script, driveUrl: "", assignedStaffId: src.assignedStaffId || "" });
  };

  const submit = () => {
    const base = emptyReel(client.id, ym);
    onCreate({ ...base, ...form });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,23,27,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5" style={{ background: "#fff" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>新規動画登録</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>{client?.companyName} ・ {monthLabel(ym)}</p>

        {existingReels.length > 0 && (
          <Field label="過去の動画を複製して作成（任意）">
            <select value={dupSource} onChange={e => applyDuplicate(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">複製しない（新規に入力）</option>
              {existingReels.map(r => <option key={r.id} value={r.id}>{monthLabel(r.yearMonth)} ・ {r.theme || "（テーマ未設定）"}</option>)}
            </select>
          </Field>
        )}

        <Field label="テーマ"><TextInput value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="今月のリールテーマ" /></Field>
        <Field label="編集指示"><TextArea rows={3} value={form.editInstructions} onChange={e => setForm(f => ({ ...f, editInstructions: e.target.value }))} placeholder="テロップの雰囲気、使う素材、尺の目安など" /></Field>
        <Field label="台本（任意）"><TextArea rows={2} value={form.script} onChange={e => setForm(f => ({ ...f, script: e.target.value }))} /></Field>
        <Field label="Google Drive 保存先URL（任意）"><TextInput value={form.driveUrl} onChange={e => setForm(f => ({ ...f, driveUrl: e.target.value }))} placeholder="https://drive.google.com/..." /></Field>
        <Field label="担当撮影者（任意）">
          <select value={form.assignedStaffId} onChange={e => setForm(f => ({ ...f, assignedStaffId: e.target.value }))} className={inputCls} style={inputStyle}>
            <option value="">未割り当て</option>
            {users.filter(u => (u.roles || []).includes("shooter")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: "#DEDACD" }}>キャンセル</button>
          <button onClick={submit} disabled={!form.theme.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#D6248A" }}>登録する</button>
        </div>
      </div>
    </div>
  );
}

function ReelsPage({ clients, reels, setReels, users, calendarEvents, setCalendarEvents, currentUser, focusClientId }) {
  const [clientId, setClientId] = useState(focusClientId || clients[0]?.id || "");
  const [ym, setYm] = useState(currentYearMonth());
  const [staffFilter, setStaffFilter] = useState("");
  const [showAllMonths, setShowAllMonths] = useState(false);
  const canEdit = true;
  const client = clients.find(c => c.id === clientId);
  const allClientsMode = clientId === "__all__";

  useEffect(() => { if (focusClientId) setClientId(focusClientId); }, [focusClientId]);

  const [showNew, setShowNew] = useState(false);
  const list = reels
    .filter(r => allClientsMode || r.clientId === clientId)
    .filter(r => showAllMonths || r.yearMonth === ym)
    .filter(r => !staffFilter || r.assignedStaffId === staffFilter)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  const addReel = () => {
    if (!clientId || allClientsMode) return;
    setShowNew(true);
  };
  const createReel = (r) => { setReels(prev => [...prev, r]); setShowNew(false); };
  const updateReel = (r) => setReels(prev => prev.map(x => x.id === r.id ? r : x));
  const deleteReel = (id) => setReels(prev => prev.filter(x => x.id !== id));
  const duplicateReelInPlace = (r) => setReels(prev => [...prev, duplicateReel(r, clientId, ym)]);

  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-4">動画制作管理</h2>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 220 }}>
          <option value="">クライアントを選択</option>
          <option value="__all__">すべてのクライアントを表示</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg border px-1" style={{ borderColor: "#DEDACD", opacity: showAllMonths ? 0.4 : 1 }}>
          <button onClick={() => shiftMonth(-1)} className="p-1.5" disabled={showAllMonths}><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold px-1 w-24 text-center">{monthLabel(ym)}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5" disabled={showAllMonths}><ChevronRight size={15} /></button>
        </div>
        <button onClick={() => setShowAllMonths(s => !s)} className="text-sm font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: showAllMonths ? "#D6248A" : "#DEDACD", background: showAllMonths ? "#FBE4F1" : "#fff", color: showAllMonths ? "#D6248A" : "#5F5E5A" }}>
          全ての動画
        </button>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 180 }}>
          <option value="">担当撮影者（全員）</option>
          {users.filter(u => (u.roles || []).includes("shooter")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {clientId && !allClientsMode && (
          <button onClick={addReel} className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-lg text-white ml-auto" style={{ background: "#D6248A" }}>
            <Plus size={15} /> 動画を追加
          </button>
        )}
      </div>

      {client && !allClientsMode && !showAllMonths && (
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>{client.companyName} ・ {monthLabel(ym)} の制作予定 {client.monthlyCount || 0}本 ／ 登録済み {list.length}本</p>
      )}
      {allClientsMode && (
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>すべてのクライアント{showAllMonths ? "・全期間" : "・" + monthLabel(ym)} ／ 該当 {list.length}本</p>
      )}

      {!clientId && <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>クライアントを選択してください。</div>}
      {clientId && list.length === 0 && <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>該当する動画はまだありません。{!allClientsMode && "「動画を追加」から作成できます。"}</div>}

      <div className="space-y-3">
        {list.map(r => <ReelCard key={r.id} reel={r} client={clients.find(c => c.id === r.clientId)} users={users} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} currentUser={currentUser} onChange={updateReel} onDelete={deleteReel} onDuplicate={duplicateReelInPlace} canEdit={true} showClient={allClientsMode || showAllMonths} />)}
      </div>

      {showNew && client && (
        <NewReelModal
          client={client}
          ym={ym}
          users={users}
          existingReels={reels.filter(r => r.clientId === clientId)}
          onCreate={createReel}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

const EVENT_TYPES = [
  { key: "shoot", label: "撮影", color: "#D6248A" },
  { key: "edit", label: "編集稼働", color: "#0E90B8" },
];

function emptyCalendarEvent() {
  return { id: uid("event"), staffId: "", reelIds: [], type: "shoot", startDate: "", endDate: "", note: "", createdAt: new Date().toISOString() };
}

function CalendarWidget({ events, setEvents, users, reels, setReels, clients }) {
  const [month, setMonth] = useState(currentYearMonth());
  const [form, setForm] = useState(emptyCalendarEvent());
  const [showForm, setShowForm] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState(null);

  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = firstDay.getDay();

  const shiftMonth = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };

  const dateStr = (day) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const eventsOnDay = (day) => {
    const ds = dateStr(day);
    return events.filter(e => e.startDate && e.endDate && e.startDate <= ds && e.endDate >= ds);
  };

  const editableReels = reels.filter(r => r.completedStages < 5);
  const toggleReelId = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  const applyDatesToReels = (reelIds, startDate, endDate) => {
    if (!reelIds || reelIds.length === 0 || !setReels) return;
    setReels(prev => prev.map(r => reelIds.includes(r.id) ? { ...r, editStartDate: startDate, editEndDate: endDate } : r));
  };
  const clearDatesFromReels = (reelIds) => {
    if (!reelIds || reelIds.length === 0 || !setReels) return;
    setReels(prev => prev.map(r => reelIds.includes(r.id) ? { ...r, editStartDate: "", editEndDate: "" } : r));
  };

  const addEvent = () => {
    if (!form.staffId || !form.startDate) return;
    const endDate = (form.type === "edit" ? form.endDate : "") || form.startDate;
    const newEvent = { ...form, id: uid("event"), endDate };
    setEvents(prev => [...prev, newEvent]);
    if (form.type === "edit" && form.reelIds.length > 0) {
      applyDatesToReels(form.reelIds, form.startDate, endDate);
    }
    setForm(emptyCalendarEvent());
    setShowForm(false);
  };
  const removeEvent = (id) => {
    const ev = events.find(e => e.id === id);
    setEvents(prev => prev.filter(e => e.id !== id));
    if (ev?.type === "edit" && ev.reelIds?.length) {
      clearDatesFromReels(ev.reelIds);
    }
  };

  const startEditEvent = (ev) => {
    setEditingEventId(ev.id);
    setEditForm({ ...ev, reelIds: ev.reelIds || [] });
  };
  const cancelEditEvent = () => { setEditingEventId(null); setEditForm(null); };
  const saveEditEvent = () => {
    if (!editForm.staffId || !editForm.startDate) return;
    const endDate = (editForm.type === "edit" ? editForm.endDate : "") || editForm.startDate;
    const prevEvent = events.find(e => e.id === editForm.id);
    // 対象動画から外れたものの日付をクリア
    const removedReelIds = (prevEvent?.reelIds || []).filter(id => !editForm.reelIds.includes(id));
    if (removedReelIds.length) clearDatesFromReels(removedReelIds);
    setEvents(prev => prev.map(e => e.id === editForm.id ? { ...editForm, endDate } : e));
    if (editForm.type === "edit" && editForm.reelIds.length > 0) {
      applyDatesToReels(editForm.reelIds, editForm.startDate, endDate);
    }
    setEditingEventId(null);
    setEditForm(null);
  };

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const todayStr = new Date().toISOString().slice(0, 10);

  const selectedStaff = selectedStaffId ? users.find(u => u.id === selectedStaffId) : null;
  const staffSchedule = selectedStaffId
    ? events.filter(e => e.staffId === selectedStaffId).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
    : [];

  const reelLabel = (r) => {
    const c = clients.find(x => x.id === r.clientId);
    return `${c?.companyName || ""} ・ ${r.theme || "テーマ未設定"}`;
  };

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="font-bold flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Calendar size={16} color="#D6248A" /> 月間カレンダー（撮影日・編集稼働期間）</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedStaffId || ""} onChange={e => setSelectedStaffId(e.target.value || null)} className={inputCls} style={{ ...inputStyle, width: 200 }}>
            <option value="">スタッフの予定を確認・編集</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button onClick={() => setShowForm(s => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ background: "#D6248A" }}><Plus size={13} />予定を登録</button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl p-3 mb-3 grid md:grid-cols-6 gap-2 items-end" style={{ background: "#FAF8F3" }}>
          <Field label="種別">
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, staffId: "", reelIds: [] }))} className={inputCls} style={inputStyle}>
              {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="担当者">
            <select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))} className={inputCls} style={inputStyle}>
              <option value="">選択してください</option>
              {users.filter(u => form.type === "shoot" ? (u.roles || []).includes("shooter") : (u.roles || []).includes("editor")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {form.type === "edit" && (
            <Field label="対象動画（複数選択可・任意）">
              <div className="max-h-28 overflow-y-auto rounded-lg border p-1.5 space-y-1" style={{ borderColor: "#DEDACD", background: "#fff" }}>
                {editableReels.length === 0 && <p className="text-[11px]" style={{ color: "#A9A79C" }}>対象動画がありません</p>}
                {editableReels.map(r => (
                  <label key={r.id} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input type="checkbox" checked={form.reelIds.includes(r.id)} onChange={() => setForm(f => ({ ...f, reelIds: toggleReelId(f.reelIds, r.id) }))} />
                    <span className="truncate">{reelLabel(r)}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label={form.type === "shoot" ? "撮影日" : "開始日"}>
            <TextInput type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </Field>
          {form.type === "edit" && (
            <Field label="終了日">
              <TextInput type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </Field>
          )}
          <Field label="メモ（任意）">
            <TextInput value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="クライアント名など" />
          </Field>
          <button onClick={addEvent} disabled={!form.staffId || !form.startDate} className="text-xs font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-40 h-fit" style={{ background: "#16171B" }}>登録する</button>
        </div>
      )}

      {selectedStaff && (
        <div className="rounded-xl p-3 mb-3" style={{ background: "#FDE7F2" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold" style={{ color: "#96185E" }}>{selectedStaff.name}さんのスケジュール一覧（過去分も編集・削除できます）</p>
            <button onClick={() => { setSelectedStaffId(null); cancelEditEvent(); }} className="text-xs" style={{ color: "#96185E" }}><X size={14} /></button>
          </div>
          {staffSchedule.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>予定はありません。</p>}
          <div className="space-y-1.5">
            {staffSchedule.map(ev => {
              const type = EVENT_TYPES.find(t => t.key === ev.type);
              const linkedReels = (ev.reelIds || []).map(id => reels.find(r => r.id === id)).filter(Boolean);
              const isPast = ev.endDate && ev.endDate < todayStr;
              const isEditing = editingEventId === ev.id;

              if (isEditing) {
                return (
                  <div key={ev.id} className="rounded-lg p-2.5 space-y-1.5" style={{ background: "#fff", border: "1px solid #D6248A" }}>
                    <div className="grid grid-cols-2 gap-1.5">
                      <TextInput type="date" value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
                      <TextInput type="date" value={editForm.endDate} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} disabled={editForm.type === "shoot"} />
                    </div>
                    <select value={editForm.staffId} onChange={e => setEditForm(f => ({ ...f, staffId: e.target.value }))} className={inputCls} style={{ ...inputStyle, fontSize: 11 }}>
                      {users.filter(u => editForm.type === "shoot" ? (u.roles || []).includes("shooter") : (u.roles || []).includes("editor")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    {editForm.type === "edit" && (
                      <div className="max-h-24 overflow-y-auto rounded-lg border p-1.5 space-y-1" style={{ borderColor: "#DEDACD" }}>
                        {editableReels.map(r => (
                          <label key={r.id} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                            <input type="checkbox" checked={editForm.reelIds.includes(r.id)} onChange={() => setEditForm(f => ({ ...f, reelIds: toggleReelId(f.reelIds, r.id) }))} />
                            <span className="truncate">{reelLabel(r)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <TextInput value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} placeholder="メモ" style={{ fontSize: 11 }} />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelEditEvent} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border" style={{ borderColor: "#DEDACD" }}>キャンセル</button>
                      <button onClick={saveEditEvent} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: "#D6248A" }}>保存する</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={ev.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "#fff", opacity: isPast ? 0.55 : 1 }}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="rounded px-1.5 py-0.5 text-white" style={{ background: type?.color, fontSize: 10 }}>{type?.label}</span>
                      {ev.startDate}{ev.endDate && ev.endDate !== ev.startDate ? ` 〜 ${ev.endDate}` : ""}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "#8B897F" }}>
                      {linkedReels.length > 0
                        ? linkedReels.map(r => r.theme || "動画").join("・")
                        : (ev.note || "メモなし")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEditEvent(ev)} className="text-[11px] font-semibold" style={{ color: "#5F5E5A" }}>編集</button>
                    {confirmDeleteEventId === ev.id ? (
                      <>
                        <button onClick={() => { removeEvent(ev.id); setConfirmDeleteEventId(null); }} className="text-[11px] font-semibold px-2 py-0.5 rounded text-white" style={{ background: "#A32D2D" }}>本当に削除</button>
                        <button onClick={() => setConfirmDeleteEventId(null)} className="text-[11px]" style={{ color: "#8B897F" }}>キャンセル</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteEventId(ev.id)} className="text-[11px]" style={{ color: "#A32D2D" }}>削除</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold">{monthLabel(month)}</span>
        <button onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["日", "月", "火", "水", "木", "金", "土"].map(w => <div key={w} className="text-center text-[11px] font-semibold" style={{ color: "#8B897F" }}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = dateStr(day);
          const dayEvents = eventsOnDay(day);
          return (
            <div key={i} className="rounded-lg p-1" style={{ minHeight: 64, background: ds === todayStr ? "#FDE7F2" : "#FAF8F3", border: ds === todayStr ? "1px solid #D6248A" : "1px solid transparent" }}>
              <p className="text-[11px] font-semibold" style={{ color: "#5F5E5A" }}>{day}</p>
              <div className="space-y-0.5 mt-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const staff = users.find(u => u.id === ev.staffId);
                  const type = EVENT_TYPES.find(t => t.key === ev.type);
                  const linkedReels = (ev.reelIds || []).map(id => reels.find(r => r.id === id)).filter(Boolean);
                  const label = linkedReels.length > 0
                    ? (linkedReels[0].theme || "動画") + (linkedReels.length > 1 ? ` 他${linkedReels.length - 1}件` : "")
                    : (staff?.name || "?");
                  const tooltip = `${type?.label} ・ ${staff?.name || ""}${linkedReels.length ? " ・ " + linkedReels.map(r => r.theme || "動画").join("、") : ""}${ev.note ? " ・ " + ev.note : ""}（クリックでスケジュール一覧を表示）`;
                  return (
                    <div key={ev.id} onClick={() => setSelectedStaffId(ev.staffId)} title={tooltip} className="text-[9px] px-1 py-0.5 rounded truncate cursor-pointer" style={{ background: type?.color, color: "#fff" }}>
                      {type?.label}：{label}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardPage({ clients, reels, setReels, users, currentUser, finance, boardPosts, setBoardPosts, calendarEvents, setCalendarEvents, onGoReels }) {
  const ym = currentYearMonth();
  const totalReels = reels.length;
  const posted = reels.filter(r => r.completedStages >= 5).length;
  const inProgress = totalReels - posted;
  const overdue = reels.filter(r => r.completedStages < 5 && r.yearMonth < ym);
  const editors = users.filter(u => (u.roles || []).includes("editor"));

  const stats = [
    { label: "登録クライアント", value: clients.length, icon: Building2, tone: "gray" },
    { label: "今月の動画本数", value: reels.filter(r => r.yearMonth === ym).length, icon: Video, tone: "coral" },
    { label: "投稿済み", value: posted, icon: CircleCheck, tone: "teal" },
    { label: "制作中", value: inProgress, icon: Clock, tone: "amber" },
  ];

  // クライアントの投稿状況（全クライアント）
  const clientPostStatus = clients.map(c => {
    const monthly = parseInt(c.monthlyCount) || 0;
    const postedThisMonth = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages >= 5).length;
    const onTrack = monthly === 0 || postedThisMonth >= monthly;
    const clientReels = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages < 5);
    const best = clientReels.sort((a, b) => b.completedStages - a.completedStages)[0];
    return { client: c, monthly, postedThisMonth, onTrack, reel: best || null };
  }).sort((a, b) => (a.onTrack === b.onTrack ? 0 : a.onTrack ? 1 : -1));

  // 編集指示が記入され、カット・テロップ・効果音のいずれかが未割当の動画
  const pickupList = reels.filter(r => r.completedStages >= 2 && r.completedStages < 5 && r.editInstructions
    && (!r.cutEditorId || !r.telopEditorId || !r.sfxEditorId));
  const [pickupChoice, setPickupChoice] = useState({});
  const getPickup = (reelId) => pickupChoice[reelId] || { editorId: "", roles: [], date: "" };
  const setPickup = (reelId, patch) => setPickupChoice(prev => ({ ...prev, [reelId]: { ...getPickup(reelId), ...patch } }));
  const togglePickupRole = (reelId, roleKey) => {
    const cur = getPickup(reelId);
    const roles = cur.roles.includes(roleKey) ? cur.roles.filter(r => r !== roleKey) : [...cur.roles, roleKey];
    setPickup(reelId, { roles });
  };
  const confirmPickup = (reelId) => {
    const choice = getPickup(reelId);
    if (!choice.editorId || choice.roles.length === 0) return;
    setReels(prev => prev.map(r => {
      if (r.id !== reelId) return r;
      const patch = { ...r };
      choice.roles.forEach(roleKey => { patch[roleKey] = choice.editorId; });
      if (choice.date) { patch.editStartDate = choice.date; patch.editEndDate = choice.date; }
      return patch;
    }));
    if (choice.date) syncReelEditCalendar(setCalendarEvents, reelId, choice.date, choice.date, choice.editorId);
    setPickupChoice(prev => ({ ...prev, [reelId]: { editorId: "", roles: [], date: "" } }));
  };

  // 一括でチェック担当者を指定（カット・テロップ・効果音がすべて完了した動画）
  const needsChecker = reels.filter(r => r.cutEditorId && r.telopEditorId && r.sfxEditorId && !r.editorSecondaryId && r.completedStages < 5);
  const [selectedForBulk, setSelectedForBulk] = useState([]);
  const [bulkChecker, setBulkChecker] = useState("");
  const toggleBulk = (id) => setSelectedForBulk(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const applyBulkChecker = () => {
    if (!bulkChecker || selectedForBulk.length === 0) return;
    setReels(prev => prev.map(r => selectedForBulk.includes(r.id) ? { ...r, editorSecondaryId: bulkChecker } : r));
    setSelectedForBulk([]);
    setBulkChecker("");
  };

  // 提出済みチェック一覧
  const submittedChecks = reels.filter(r => r.checkSubmitted).sort((a, b) => (b.checkSubmittedAt || 0) - (a.checkSubmittedAt || 0));

  // 掲示板
  const [boardTheme, setBoardTheme] = useState("");
  const [boardText, setBoardText] = useState("");
  const [boardAuthorId, setBoardAuthorId] = useState(currentUser.id);
  const postBoard = () => {
    if (!boardText.trim()) return;
    const author = users.find(u => u.id === boardAuthorId) || currentUser;
    setBoardPosts(prev => [{ id: uid("post"), authorId: author.id, authorName: author.name, theme: boardTheme.trim(), content: boardText.trim(), createdAt: new Date().toISOString() }, ...prev]);
    setBoardTheme("");
    setBoardText("");
  };
  const deleteBoard = (id) => setBoardPosts(prev => prev.filter(p => p.id !== id));

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-1">ダッシュボード</h2>
      <p className="text-sm mb-4" style={{ color: "#8B897F" }}>{currentUser.name}さん（{roleLabels(currentUser.roles)}） こんにちは。</p>

      <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>全体の進行状況</p>
        <div className="flex items-center justify-between flex-wrap gap-4">
          {STAGES.map((s, i) => {
            const doneCount = reels.filter(r => r.completedStages > i).length;
            const notDoneCount = totalReels - doneCount;
            return (
              <div key={s.key} className="text-center">
                <div className="mx-auto rounded-full flex items-center justify-center mb-1" style={{ width: 40, height: 40, background: "#FAF8F3" }}>
                  <s.icon size={17} color="#5F5E5A" />
                </div>
                <p className="text-lg font-bold">{doneCount}<span className="text-xs font-normal" style={{ color: "#8B897F" }}> 完了</span></p>
                <p className="text-xs font-semibold" style={{ color: "#A32D2D" }}>{notDoneCount} 未完了</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#8B897F" }}>{s.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
            <s.icon size={18} color="#8B897F" />
            <p className="text-2xl font-bold mt-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "#8B897F" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <CalendarWidget events={calendarEvents} setEvents={setCalendarEvents} users={users} reels={reels} setReels={setReels} clients={clients} />

      {((currentUser.roles || []).includes("editor") || (currentUser.roles || []).includes("admin")) && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><MessageSquare size={16} color="#D6248A" /> 編集指示一覧（担当編集者募集中）</p>
          {pickupList.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>担当者待ちの編集指示はありません。</p>}
          <div className="space-y-2">
            {pickupList.map(r => {
              const c = clients.find(x => x.id === r.clientId);
              const openRoles = EDIT_ROLE_FIELDS.filter(f => !r[f.key]);
              const choice = getPickup(r.id);
              return (
                <div key={r.id} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{c?.companyName} ・ {r.theme || "（テーマ未設定）"}</p>
                    {r.editWorkload && <Badge tone="amber">工数 {r.editWorkload}</Badge>}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#5F5E5A" }}>{r.editInstructions}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <select value={choice.editorId} onChange={e => setPickup(r.id, { editorId: e.target.value })} className={inputCls} style={{ ...inputStyle, width: 160 }}>
                      <option value="">動画編集者を選択</option>
                      {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    {openRoles.map(f => (
                      <label key={f.key} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: choice.roles.includes(f.key) ? "#D6248A" : "#DEDACD", background: choice.roles.includes(f.key) ? "#FBE4F1" : "#fff" }}>
                        <input type="checkbox" checked={choice.roles.includes(f.key)} onChange={() => togglePickupRole(r.id, f.key)} />
                        {f.label}
                      </label>
                    ))}
                    <TextInput type="date" value={choice.date} onChange={e => setPickup(r.id, { date: e.target.value })} title="編集する日（カレンダーに反映されます）" style={{ width: 150 }} />
                    <button onClick={() => confirmPickup(r.id)} disabled={!choice.editorId || choice.roles.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: "#D6248A" }}>
                      担当する
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(currentUser.roles || []).includes("admin") && needsChecker.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><UserCheck size={16} color="#D6248A" /> 修正チェック担当の指定</p>
          <div className="space-y-1.5 mb-3">
            {needsChecker.map(r => {
              const c = clients.find(x => x.id === r.clientId);
              const names = EDIT_ROLE_FIELDS.map(f => users.find(u => u.id === r[f.key])?.name).filter(Boolean).join("・");
              return (
                <label key={r.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                  <input type="checkbox" checked={selectedForBulk.includes(r.id)} onChange={() => toggleBulk(r.id)} />
                  <span>{c?.companyName} ・ {r.theme || "（テーマ未設定）"} <span style={{ color: "#8B897F" }}>（編集: {names}）</span></span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={bulkChecker} onChange={e => setBulkChecker(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 200 }}>
              <option value="">チェック担当者を選択</option>
              {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={applyBulkChecker} disabled={!bulkChecker || selectedForBulk.length === 0} className="text-xs font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#16171B" }}>選択した{selectedForBulk.length}件に一括指定</button>
          </div>
        </div>
      )}

      {(currentUser.roles || []).includes("admin") && submittedChecks.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><ClipboardList size={16} color="#0E90B8" /> 修正チェック提出一覧</p>
          <div className="space-y-2">
            {submittedChecks.slice(0, 8).map(r => {
              const c = clients.find(x => x.id === r.clientId);
              const checker = users.find(u => u.id === r.editorSecondaryId);
              const checkedCount = CHECKLIST_ITEMS.filter(i => (r.checklist || {})[i.key]).length;
              return (
                <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left rounded-xl p-3 hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{c?.companyName} ・ {r.theme || "（テーマ未設定）"}</p>
                    <Badge tone={checkedCount === CHECKLIST_ITEMS.length ? "teal" : "amber"}>{checkedCount}/{CHECKLIST_ITEMS.length}項目OK</Badge>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#8B897F" }}>チェック担当: {checker?.name || "不明"} ・ {timeAgo(r.checkSubmittedAt)}</p>
                  {r.checklist?.memo && <p className="text-xs mt-1" style={{ color: "#5F5E5A" }}>メモ: {r.checklist.memo}</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Calendar size={16} color="#D6248A" /> クライアントの投稿状況</p>
        {clientPostStatus.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>クライアントがまだ登録されていません。</p>}
        <div className="space-y-2">
          {clientPostStatus.map(({ client, monthly, postedThisMonth, onTrack, reel }) => (
            <div key={client.id} className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: onTrack ? "#FAF8F3" : "#FCEBEB", border: onTrack ? "1px solid transparent" : "1px solid #F0A5A5" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{client.companyName}</p>
                  <Badge tone={onTrack ? "teal" : "red"}>今月 {postedThisMonth}/{monthly} 本投稿済み</Badge>
                </div>
                {reel && (
                  <div className="mt-1">
                    {reel.completedStages >= 4 ? (
                      <span className="text-xs" style={{ color: "#0E90B8" }}>完成済み・投稿待ち：{reel.theme || "（テーマ未設定）"}</span>
                    ) : (
                      <span className="text-xs" style={{ color: "#854F0B" }}>制作中：{reel.theme || "（テーマ未設定）"} ・ 次工程 {STAGES[reel.completedStages]?.label}</span>
                    )}
                  </div>
                )}
                {!reel && !onTrack && <span className="text-xs" style={{ color: "#A32D2D" }}>この月の動画がまだ登録されていません</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {reel ? (
                  <>
                    {reel.completedStages >= 4 && (
                      <button onClick={() => setReels(prev => prev.map(r => r.id === reel.id ? { ...r, completedStages: 5, postedDate: r.postedDate || new Date().toISOString().slice(0, 10) } : r))} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#0E90B8" }}>投稿完了にする</button>
                    )}
                    <button onClick={() => onGoReels(client.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#DEDACD" }}>詳細を開く</button>
                  </>
                ) : (
                  <button onClick={() => onGoReels(client.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#D6248A" }}>動画を登録する</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Megaphone size={16} color="#D6248A" /> 掲示板（情報共有）</p>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <TextInput value={boardTheme} onChange={e => setBoardTheme(e.target.value)} placeholder="テーマ（例：連絡・相談・お知らせ）" />
          </div>
          <select value={boardAuthorId} onChange={e => setBoardAuthorId(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 160 }}>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex items-start gap-2 mb-3">
          <TextArea rows={2} value={boardText} onChange={e => setBoardText(e.target.value)} placeholder="スタッフ全員に共有したい連絡事項を書き込む" />
          <button onClick={postBoard} disabled={!boardText.trim()} className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#D6248A" }}>投稿</button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {boardPosts.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>まだ投稿はありません。</p>}
          {boardPosts.map(p => (
            <div key={p.id} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold">{p.authorName}</p>
                  {p.theme && <Badge tone="coral">{p.theme}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: "#8B897F" }}>{timeAgo(p.createdAt)}</span>
                  {(p.authorId === currentUser.id || (currentUser.roles || []).includes("admin")) && (
                    <button onClick={() => deleteBoard(p.id)} className="text-[11px]" style={{ color: "#A32D2D" }}>削除</button>
                  )}
                </div>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{p.content}</p>
            </div>
          ))}
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#FCEBEB", border: "1px solid #F0A5A5" }}>
          <p className="font-bold mb-2 text-sm" style={{ color: "#A32D2D" }}>先月以前で未完了の動画（{overdue.length}件）</p>
          <div className="space-y-1">
            {overdue.slice(0, 5).map(r => {
              const c = clients.find(x => x.id === r.clientId);
              return (
                <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left text-sm flex items-center justify-between px-3 py-2 rounded-lg bg-white/60 hover:bg-white">
                  <span>{c?.companyName} ・ {r.theme || "（テーマ未設定）"}</span>
                  <Badge tone="amber">{STAGES[r.completedStages]?.label}待ち</Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(currentUser.roles || []).includes("admin") && finance.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-2 text-sm">今月の入金状況サマリー</p>
          <div className="flex gap-2 flex-wrap">
            <Badge tone="teal">入金済み {clients.filter(c => (finance.find(f => f.clientId === c.id)?.paidMonths || []).includes(ym)).length}</Badge>
            <Badge tone="red">未入金 {clients.filter(c => !(finance.find(f => f.clientId === c.id)?.paidMonths || []).includes(ym)).length}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}

function ResearchPage({ clients }) {
  const [genre, setGenre] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [minViews, setMinViews] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const [proposalClientId, setProposalClientId] = useState(clients[0]?.id || "");
  const proposalClient = clients.find(c => c.id === proposalClientId);
  const [purpose, setPurpose] = useState("");
  const [structure, setStructure] = useState("");
  const [shootCount, setShootCount] = useState(3);
  const [proposal, setProposal] = useState("");
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [proposalError, setProposalError] = useState("");

  const search = async () => {
    setLoading(true);
    setError("");
    try {
      const text = await callApi("/api/trend", { genre, minFollowers, minViews });
      const entry = { id: uid("trend"), genre, minFollowers, minViews, text: text.trim(), createdAt: Date.now() };
      setHistory(prev => [entry, ...prev]);
    } catch (e) {
      setError("検索に失敗しました：" + (e.message || "不明なエラー"));
    } finally {
      setLoading(false);
    }
  };

  const generateProposal = async () => {
    if (!proposalClient) return;
    setLoadingProposal(true);
    setProposalError("");
    setProposal("");
    try {
      const text = await callApi("/api/proposal", {
        clientName: proposalClient.companyName,
        clientBusiness: proposalClient.business,
        clientAppeal: proposalClient.appeal,
        clientPlan: proposalClient.plan,
        purpose, structure, shootCount,
      });
      setProposal(text);
    } catch (e) {
      setProposalError("提案の生成に失敗しました：" + (e.message || "不明なエラー"));
    } finally {
      setLoadingProposal(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-4">リサーチ・企画</h2>

      <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-2 flex items-center gap-1.5"><Sparkles size={16} color="#D6248A" /> AI企画提案（トレンドリサーチ）</p>
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>最新のSNSトレンドをAIが検索し、選択したクライアントの情報・目的・構成をもとに次回撮影の企画・台本案を提案します。</p>
        <Field label="クライアント">
          <select value={proposalClientId} onChange={e => setProposalClientId(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 260 }}>
            <option value="">クライアントを選択</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </Field>
        <div className="grid md:grid-cols-3 gap-x-4">
          <Field label="目的"><TextInput value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="例：新規集客、認知拡大、来店促進" /></Field>
          <Field label="構成・演出の方向性"><TextInput value={structure} onChange={e => setStructure(e.target.value)} placeholder="例：ビフォーアフター、スタッフ紹介" /></Field>
          <Field label="撮影本数"><TextInput type="number" value={shootCount} onChange={e => setShootCount(e.target.value)} min={1} /></Field>
        </div>
        <button onClick={generateProposal} disabled={loadingProposal || !proposalClientId} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
          {loadingProposal ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {loadingProposal ? "リサーチ中..." : "企画を提案してもらう"}
        </button>
        {proposalError && <p className="text-xs mt-1" style={{ color: "#A32D2D" }}>{proposalError}</p>}
        {proposal && <div className="mt-2 p-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "#FAF8F3", lineHeight: 1.7 }}>{proposal}</div>}
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-2 flex items-center gap-1.5"><Sparkles size={16} color="#D6248A" /> バズっているショート動画を探す</p>
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>ジャンルと、フォロワー数・再生数の条件を指定すると、AIがWeb検索を使って条件に近いバズっているInstagramのリールを3つ探します。企画・撮影のアイデア出しにご活用ください。</p>
        <div className="grid md:grid-cols-3 gap-x-4">
          <Field label="ジャンル"><TextInput value={genre} onChange={e => setGenre(e.target.value)} placeholder="例：美容室、飲食店、不動産" /></Field>
          <Field label="フォロワー数（以上）"><TextInput type="number" value={minFollowers} onChange={e => setMinFollowers(e.target.value)} placeholder="例：10000" /></Field>
          <Field label="再生数（以上）"><TextInput type="number" value={minViews} onChange={e => setMinViews(e.target.value)} placeholder="例：100000" /></Field>
        </div>
        <button onClick={search} disabled={loading} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {loading ? "検索中..." : "バズ動画を3つ探す"}
        </button>
        {error && <p className="text-xs mt-1" style={{ color: "#A32D2D" }}>{error}</p>}
      </div>

      {history.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3">検索結果</p>
          <div className="space-y-2">
            {history.map(p => (
              <div key={p.id} className="rounded-lg p-2.5" style={{ background: "#FAF8F3", border: "1px solid #EFEDE4" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: "#8B897F" }}>{p.genre || "ジャンル未指定"} ・ フォロワー{p.minFollowers ? `${p.minFollowers}以上` : "指定なし"} ・ 再生数{p.minViews ? `${p.minViews}以上` : "指定なし"} ・ {timeAgo(p.createdAt)}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.6, color: "#5F5E5A" }}>{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-2" style={{ color: "#A9A79C" }}>この検索結果は、画面を再読み込みすると消えます。必要なものはメモや動画の企画欄にコピーしてご利用ください。</p>
        </div>
      )}
    </div>
  );
}

function TasksPage({ clients, reels, users, onGoReels, onGoClient }) {
  const ym = currentYearMonth();
  const editors = users.filter(u => (u.roles || []).includes("editor"));
  const [editorFilter, setEditorFilter] = useState("");

  const postClients = clients.map(c => {
    const monthly = parseInt(c.monthlyCount) || 0;
    const postedThisMonth = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages >= 5).length;
    if (postedThisMonth >= monthly) return null;
    const ready = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages === 4)[0];
    return { client: c, monthly, postedThisMonth, ready };
  }).filter(Boolean);

  const editItems = reels.filter(r => r.completedStages === 2 || r.completedStages === 3)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  const shootItems = reels.filter(r => r.completedStages === 0)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  // 初期設定タスク（インスタプロフィール・ハイライト・公式LINE・LP）が未完了のクライアント
  const setupClients = clients.map(c => {
    const tasks = getSetupTasks(c);
    const pending = SETUP_TASK_FIELDS.filter(f => tasks[f.key] === "pending");
    if (pending.length === 0) return null;
    return { client: c, pending };
  }).filter(Boolean);

  // 選択した編集者が現在進めている案件（カット・テロップ・効果音・修正チェックいずれかで担当している、未完了の動画すべて）
  const editorCases = editorFilter
    ? reels.filter(r => r.completedStages < 5 && (r.cutEditorId === editorFilter || r.telopEditorId === editorFilter || r.sfxEditorId === editorFilter || r.editorSecondaryId === editorFilter))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    : [];
  const selectedEditor = editors.find(u => u.id === editorFilter);

  const TaskCard = ({ title, icon: Icon, tone, count, children }) => (
    <div className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold flex items-center gap-1.5"><Icon size={15} color={tone} /> {title}</p>
        <Badge tone="gray">{count}件</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>タスク管理</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "#5F5E5A" }}>編集者ごとの進行状況</span>
          <select value={editorFilter} onChange={e => setEditorFilter(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 200 }}>
            <option value="">編集者を選択</option>
            {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {editorFilter && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold flex items-center gap-1.5"><Scissors size={15} color="#0E90B8" /> {selectedEditor?.name}さんが進めている案件</p>
            <Badge tone="gray">{editorCases.length}件</Badge>
          </div>
          {editorCases.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>現在担当している案件はありません。</p>}
          <div className="grid md:grid-cols-2 gap-2">
            {editorCases.map(r => {
              const c = clients.find(x => x.id === r.clientId);
              const roleNames = [];
              if (r.cutEditorId === editorFilter) roleNames.push("①カット");
              if (r.telopEditorId === editorFilter) roleNames.push("②テロップ");
              if (r.sfxEditorId === editorFilter) roleNames.push("③効果音");
              if (r.editorSecondaryId === editorFilter) roleNames.push("④修正チェック");
              const role = roleNames.join("＋");
              return (
                <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                  <p className="font-semibold">{c?.companyName} ・ {r.theme || "テーマ未設定"}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge tone="teal">{role}</Badge>
                    <span style={{ color: "#8B897F" }}>{monthLabel(r.yearMonth)} ・ 現在: {STAGES[r.completedStages]?.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <TaskCard title="投稿すべきクライアント一覧" icon={Send} tone="#D6248A" count={postClients.length}>
          {postClients.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>今月の投稿予定はすべて達成しています。</p>}
          {postClients.map(({ client, monthly, postedThisMonth, ready }) => (
            <button key={client.id} onClick={() => onGoReels(client.id)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
              <p className="font-semibold">{client.companyName}</p>
              <p style={{ color: "#8B897F" }}>今月 {postedThisMonth}/{monthly} 本投稿済み</p>
              {ready && <Badge tone="teal">完成済み・投稿待ち</Badge>}
            </button>
          ))}
        </TaskCard>

        <TaskCard title="動画編集すべき一覧" icon={Scissors} tone="#0E90B8" count={editItems.length}>
          {editItems.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>編集待ちの動画はありません。</p>}
          {editItems.map(r => {
            const c = clients.find(x => x.id === r.clientId);
            const openRoles = r.completedStages === 2 ? EDIT_ROLE_FIELDS.filter(f => !r[f.key]).map(f => f.label) : [];
            const checker = users.find(u => u.id === r.editorSecondaryId);
            return (
              <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                <p className="font-semibold">{c?.companyName} ・ {r.theme || "テーマ未設定"}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge tone="amber">{r.completedStages === 2 ? `${openRoles.join("・")}待ち` : "④修正チェック待ち"}</Badge>
                  <span style={{ color: "#8B897F" }}>{monthLabel(r.yearMonth)}{r.completedStages === 3 && checker ? ` ・ 担当: ${checker.name}` : ""}</span>
                </div>
              </button>
            );
          })}
        </TaskCard>

        <TaskCard title="撮影すべき一覧" icon={Camera} tone="#854F0B" count={shootItems.length}>
          {shootItems.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>撮影待ちの動画はありません。</p>}
          {shootItems.map(r => {
            const c = clients.find(x => x.id === r.clientId);
            const shooter = users.find(u => u.id === r.assignedStaffId);
            return (
              <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                <p className="font-semibold">{c?.companyName} ・ {r.theme || "テーマ未設定"}</p>
                <p style={{ color: "#8B897F" }}>{monthLabel(r.yearMonth)}{shooter ? ` ・ 担当: ${shooter.name}` : " ・ 担当者未割り当て"}</p>
              </button>
            );
          })}
        </TaskCard>

        <TaskCard title="初期設定 未完了一覧" icon={CircleCheck} tone="#6B3FA0" count={setupClients.length}>
          {setupClients.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>初期設定タスクはすべて完了しています。</p>}
          {setupClients.map(({ client, pending }) => (
            <button key={client.id} onClick={() => onGoClient && onGoClient(client.id)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
              <p className="font-semibold">{client.companyName}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {pending.map(f => <Badge key={f.key} tone="amber">{f.label}</Badge>)}
              </div>
            </button>
          ))}
        </TaskCard>
      </div>
    </div>
  );
}

function AnalyticsPage({ clients, reels, users }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const posted = reels.filter(r => r.clientId === clientId && r.completedStages >= 5);
  const months = [...new Set(posted.map(r => r.yearMonth))].sort().reverse();
  const client = clients.find(c => c.id === clientId);
  const [reportState, setReportState] = useState({});
  const [imagesByMonth, setImagesByMonth] = useState({});

  const addImages = async (m, fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
    const readOne = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1] || "";
        resolve({ name: file.name, mediaType: file.type, data: base64, previewUrl: result });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const newImages = await Promise.all(files.map(readOne));
    setImagesByMonth(prev => ({ ...prev, [m]: [...(prev[m] || []), ...newImages] }));
  };
  const removeImage = (m, idx) => {
    setImagesByMonth(prev => ({ ...prev, [m]: (prev[m] || []).filter((_, i) => i !== idx) }));
  };

  const genReport = async (m, rows) => {
    setReportState(prev => ({ ...prev, [m]: { loading: true, error: "", text: prev[m]?.text || "" } }));
    try {
      const text = await callApi("/api/report", {
        clientName: client?.companyName,
        monthLabel: monthLabel(m),
        posts: rows.map(r => ({ theme: r.theme, instagramUrl: r.instagramUrl, tiktokUrl: r.tiktokUrl, youtubeUrl: r.youtubeUrl })),
        images: (imagesByMonth[m] || []).map(img => ({ mediaType: img.mediaType, data: img.data })),
      });
      setReportState(prev => ({ ...prev, [m]: { loading: false, error: "", text } }));
    } catch (e) {
      setReportState(prev => ({ ...prev, [m]: { loading: false, error: "レポート作成に失敗しました：" + (e.message || "不明なエラー"), text: prev[m]?.text || "" } }));
    }
  };

  const printReport = (m) => {
    const el = document.getElementById("printable-report");
    if (el) {
      el.dataset.title = `${client?.companyName || ""} ${monthLabel(m)} 月次レポート`;
      el.dataset.body = reportState[m]?.text || "";
      window.print();
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-4">分析資料</h2>

      <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 220 }}>
        <option value="">クライアントを選択</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
      </select>

      {months.map(m => {
        const rows = posted.filter(r => r.yearMonth === m);
        const totalReelViews = (r) => (parseInt(r.instagramViews) || 0) + (parseInt(r.tiktokViews) || 0) + (parseInt(r.youtubeViews) || 0);
        const totalViews = rows.reduce((s, r) => s + totalReelViews(r), 0);
        const avg = rows.length ? Math.round(totalViews / rows.length) : 0;
        const rs = reportState[m] || {};
        return (
          <div key={m} className="rounded-2xl p-5 mt-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
            <p className="font-bold mb-3">{monthLabel(m)} の月次レポート</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>投稿本数</p><p className="text-xl font-bold">{rows.length}</p></div>
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>合計再生数（IG+TikTok+YouTube）</p><p className="text-xl font-bold">{totalViews.toLocaleString()}</p></div>
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>平均再生数</p><p className="text-xl font-bold">{avg.toLocaleString()}</p></div>
            </div>
            <div className="space-y-1 mb-3">
              {rows.sort((a, b) => totalReelViews(b) - totalReelViews(a)).map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg" style={{ background: "#FAF8F3" }}>
                  <span>{r.theme || "テーマ未設定"}</span>
                  <span style={{ color: "#8B897F" }}>{totalReelViews(r).toLocaleString()} 回</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><Sparkles size={13} color="#D6248A" /> AIによる報告書作成</p>
              <p className="text-[11px] mb-2" style={{ color: "#A9A79C" }}>各動画に登録されたSNS投稿URLに加えて、Instagram・TikTok・公式LINEなどのインサイト画面のスクリーンショットをアップロードすると、AIがそこに表示された数値を読み取ってレポートに反映します。</p>

              <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: "#DEDACD" }}>
                <ImageIcon size={13} /> インサイトのスクリーンショットを追加
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addImages(m, e.target.files); e.target.value = ""; }} />
              </label>

              {(imagesByMonth[m] || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(imagesByMonth[m] || []).map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.previewUrl} alt={img.name} className="rounded-lg object-cover" style={{ width: 64, height: 64, border: "1px solid #DEDACD" }} />
                      <button onClick={() => removeImage(m, i)} className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center" style={{ width: 18, height: 18, background: "#A32D2D" }}>
                        <X size={11} color="#fff" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-2">
                <button onClick={() => genReport(m, rows)} disabled={rs.loading} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
                  {rs.loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {rs.loading ? "作成中..." : "AIでレポート数値を調べる"}
                </button>
                {rs.text && (
                  <button onClick={() => printReport(m)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#DEDACD" }}>
                    A4 PDFとして出力
                  </button>
                )}
              </div>
              {rs.error && <p className="text-xs mt-1" style={{ color: "#A32D2D" }}>{rs.error}</p>}
              {rs.text && (
                <TextArea rows={8} value={rs.text} onChange={e => setReportState(prev => ({ ...prev, [m]: { ...prev[m], text: e.target.value } }))} className="mt-2" />
              )}
            </div>
          </div>
        );
      })}
      {clientId && months.length === 0 && <div className="text-center py-16 rounded-2xl border border-dashed mt-4" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>投稿済みの動画がまだありません。</div>}

      <PrintableReport />
    </div>
  );
}

// PDF出力用の非表示コンテナ。印刷時（window.print）にのみ表示され、A4サイズで出力されます。
function PrintableReport() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener("beforeprint", handler);
    return () => window.removeEventListener("beforeprint", handler);
  }, []);
  const el = typeof document !== "undefined" ? document.getElementById("printable-report") : null;
  const title = el?.dataset?.title || "";
  const body = el?.dataset?.body || "";
  return (
    <div id="printable-report" data-title={title} data-body={body} className="printable-report-content">
      <h1>{title}</h1>
      <pre>{body}</pre>
    </div>
  );
}

function FinancePage({ clients, finance, setFinance, reels, users }) {
  const upsert = (clientId, patch) => {
    setFinance(prev => {
      const exists = prev.some(f => f.clientId === clientId);
      if (exists) return prev.map(f => f.clientId === clientId ? { ...f, ...patch } : f);
      return [...prev, { ...emptyFinance(clientId), ...patch }];
    });
  };
  const resetFinance = (clientId) => {
    setFinance(prev => prev.filter(f => f.clientId !== clientId));
  };

  const [selectedId, setSelectedId] = useState(null);
  const [confirmResetId, setConfirmResetId] = useState(null);

  const editors = users.filter(u => (u.roles || []).includes("editor"));
  const editedReels = reels.filter(r => r.completedStages >= 4 && (r.cutEditorId || r.telopEditorId || r.sfxEditorId));

  const totalMonthlyRevenue = clients.reduce((sum, c) => {
    const f = finance.find(x => x.clientId === c.id);
    return sum + effectiveMonthlyFee(f);
  }, 0);

  const togglePaidMonth = (clientId, ym) => {
    const f = finance.find(x => x.clientId === clientId) || emptyFinance(clientId);
    const paid = f.paidMonths || [];
    const next = paid.includes(ym) ? paid.filter(m => m !== ym) : [...paid, ym];
    upsert(clientId, { paidMonths: next });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={20} />
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>経理管理（統括管理者専用）</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "#8B897F" }}>契約・請求・入金状況を管理します。この情報は統括管理者のみが閲覧できます。</p>

      {editors.length > 0 && (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5"><Scissors size={16} color="#0E90B8" /> 編集者別 月間編集完了本数・報酬</p>
          <p className="text-[11px] mb-2" style={{ color: "#A9A79C" }}>カット・テロップ・効果音のいずれかを担当した動画をカウントします（1本の動画で複数の工程を担当した場合、それぞれの工程で1本としてカウントされます）</p>
          {editedReels.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>編集完了した動画がまだありません。</p>}
          <div className="space-y-3">
            {editors.map(ed => {
              const mine = editedReels.filter(r => r.cutEditorId === ed.id || r.telopEditorId === ed.id || r.sfxEditorId === ed.id);
              if (mine.length === 0) return null;
              const byMonth = {};
              mine.forEach(r => {
                if (!byMonth[r.yearMonth]) byMonth[r.yearMonth] = { count: 0, reward: 0 };
                byMonth[r.yearMonth].count += 1;
                byMonth[r.yearMonth].reward += (parseFloat(r.editWorkload) || 0) * 1000;
              });
              const monthKeys = Object.keys(byMonth).sort().reverse();
              return (
                <div key={ed.id} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
                  <p className="text-sm font-semibold mb-2">{ed.name}</p>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {monthKeys.map(m => (
                      <div key={m} className="rounded-lg p-2" style={{ background: "#fff", border: "1px solid #EFEDE4" }}>
                        <p className="text-xs font-semibold">{monthLabel(m)}</p>
                        <p className="text-xs" style={{ color: "#8B897F" }}>編集完了 {byMonth[m].count}本</p>
                        <p className="text-xs" style={{ color: "#8B897F" }}>報酬合計 ¥{byMonth[m].reward.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold">クライアント一覧</p>
          <Badge tone="teal">月の合計売上見込み ¥{totalMonthlyRevenue.toLocaleString()}</Badge>
        </div>
        {clients.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>クライアントを登録すると経理情報を管理できます。</p>}
        <div className="space-y-2">
          {clients.map(c => {
            const f = finance.find(x => x.clientId === c.id) || emptyFinance(c.id);
            const isSelected = selectedId === c.id;
            const contractMonths = getContractMonths(f);
            const paidCount = (f.paidMonths || []).filter(m => contractMonths.includes(m)).length;
            const fee = effectiveMonthlyFee(f);
            return (
              <div key={c.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid #EFEDE4" }}>
                <button onClick={() => setSelectedId(isSelected ? null : c.id)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate">{c.companyName}</span>
                    <Badge tone="gray">入金 {paidCount}/{contractMonths.length}ヶ月</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">¥{fee.toLocaleString()}/月{!f.monthlyFee && f.contractFee ? "（契約料金より算出）" : ""}</span>
                    <ChevronRight size={16} style={{ transform: isSelected ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </div>
                </button>

                {isSelected && (
                  <div className="p-4" style={{ background: "#fff" }}>
                    <div className="grid md:grid-cols-4 gap-3">
                      <Field label="契約開始日"><TextInput type="date" value={f.contractStart} onChange={e => upsert(c.id, { contractStart: e.target.value })} /></Field>
                      <Field label="契約終了日"><TextInput type="date" value={f.contractEnd} onChange={e => upsert(c.id, { contractEnd: e.target.value })} /></Field>
                      <Field label="月額料金"><TextInput type="number" value={f.monthlyFee} onChange={e => upsert(c.id, { monthlyFee: e.target.value })} placeholder="円" /></Field>
                      <Field label="契約料金"><TextInput type="number" value={f.contractFee} onChange={e => upsert(c.id, { contractFee: e.target.value })} placeholder="円" /></Field>
                    </div>
                    {!f.monthlyFee && f.contractFee && (
                      <p className="text-[11px] mb-2" style={{ color: "#A9A79C" }}>月額料金が未入力のため、契約料金÷12ヶ月（¥{Math.round(parseFloat(f.contractFee) / 12).toLocaleString()}/月）を売上見込みに使用しています。</p>
                    )}

                    <div className="rounded-xl p-3 mt-2" style={{ background: "#FAF8F3" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "#5F5E5A" }}>月次請求・入金管理</p>

                      <p className="text-xs font-semibold mb-1" style={{ color: "#5F5E5A" }}>請求日（月ごと）</p>
                      <div className="grid grid-cols-6 md:grid-cols-12 gap-1 mb-3">
                        {getContractMonths(f).map(ym => {
                          const [yy, mm] = ym.split("-");
                          const val = (f.billingDates || {})[ym] || "";
                          return (
                            <div key={ym} className="flex flex-col items-center gap-1">
                              <span className="text-[10px] font-semibold" style={{ color: "#8B897F" }}>{yy.slice(2)}/{parseInt(mm)}月</span>
                              <input
                                type="date"
                                value={val}
                                onChange={e => upsert(c.id, { billingDates: { ...(f.billingDates || {}), [ym]: e.target.value } })}
                                className="text-[10px] rounded-lg border px-1 py-1.5 w-full text-center"
                                style={{ borderColor: "#DEDACD", background: "#fff" }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-xs font-semibold mt-2 mb-1" style={{ color: "#5F5E5A" }}>
                        入金ステータス（{f.contractStart && f.contractEnd ? `契約期間：${f.contractStart}〜${f.contractEnd}` : `${getContractMonths(f)[0].split("-")[0]}年度：4月〜翌3月（契約期間未設定のため）`}）
                      </p>
                      <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
                        {getContractMonths(f).map(ym => {
                          const [yy, mm] = ym.split("-");
                          const paid = (f.paidMonths || []).includes(ym);
                          return (
                            <button key={ym} onClick={() => togglePaidMonth(c.id, ym)}
                              className="flex flex-col items-center gap-1 rounded-lg py-2 border"
                              style={{ borderColor: paid ? "#0E90B8" : "#DEDACD", background: paid ? "#E1F4FA" : "#fff" }}>
                              <span className="text-[10px] font-semibold" style={{ color: "#5F5E5A" }}>{yy.slice(2)}/{parseInt(mm)}月</span>
                              {paid ? <CircleCheck size={14} color="#0E90B8" /> : <Circle size={14} color="#DEDACD" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Field label="備考"><TextArea rows={1} value={f.notes} onChange={e => upsert(c.id, { notes: e.target.value })} /></Field>

                    <div className="flex justify-end mt-2">
                      {confirmResetId === c.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: "#A32D2D" }}>この経理情報をリセットしますか？</span>
                          <button onClick={() => { resetFinance(c.id); setConfirmResetId(null); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#A32D2D" }}>リセットする</button>
                          <button onClick={() => setConfirmResetId(null)} className="text-xs font-semibold" style={{ color: "#8B897F" }}>キャンセル</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmResetId(c.id)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#A32D2D" }}>
                          <Trash2 size={13} /> この経理情報をリセット
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StaffForm({ user, onSave, onCancel }) {
  const [u, setU] = useState({ ...emptyUser(), ...user });
  const set = (key, val) => setU(prev => ({ ...prev, [key]: val }));

  return (
    <div className="rounded-2xl p-5 border" style={{ borderColor: "#DEDACD", background: "#fff" }}>
      <p className="font-bold text-lg mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>スタッフ登録</p>

      <Field label="役割（複数選択可）">
        <div className="grid grid-cols-3 gap-2">
          {((u.roles || []).includes("admin") ? ROLES : SELECTABLE_ROLES).map(r => (
            <button key={r.key} type="button" onClick={() => set("roles", (u.roles || []).includes(r.key) ? (u.roles || []).filter(x => x !== r.key) : [...(u.roles || []), r.key])}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border"
              style={{ borderColor: (u.roles || []).includes(r.key) ? "#16171B" : "#DEDACD", background: (u.roles || []).includes(r.key) ? "#16171B" : "#fff" }}>
              <r.icon size={18} color={(u.roles || []).includes(r.key) ? "#fff" : "#5F5E5A"} />
              <span className="text-xs font-semibold" style={{ color: (u.roles || []).includes(r.key) ? "#fff" : "#5F5E5A" }}>{r.label}</span>
            </button>
          ))}
        </div>
        {(u.roles || []).includes("admin") && <p className="text-[11px] mt-1" style={{ color: "#A9A79C" }}>統括管理者は屋宜様のみです。役割を変更すると統括管理権限が失われます。</p>}
      </Field>

      <div className="grid md:grid-cols-2 gap-x-6 mt-3">
        <Field label="名前（必須）"><TextInput value={u.name} onChange={e => set("name", e.target.value)} placeholder="山田 太郎" /></Field>
        <Field label="メールアドレス"><TextInput type="email" value={u.email} onChange={e => set("email", e.target.value)} placeholder="taro@example.com" /></Field>
        <p className="text-[11px] -mt-2 mb-3 md:col-span-2" style={{ color: "#A9A79C" }}>本人がこのメールアドレスでサインアップすると、このプロフィールに自動的に紐付きます。</p>
        <Field label="電話番号"><TextInput value={u.phone} onChange={e => set("phone", e.target.value)} placeholder="090-0000-0000" /></Field>
        <Field label="入社日"><TextInput type="date" value={u.joinDate} onChange={e => set("joinDate", e.target.value)} /></Field>

        <Field label="契約形態">
          <div className="grid grid-cols-2 gap-2">
            {CONTRACT_TYPES.map(t => (
              <button key={t} type="button" onClick={() => set("contractType", t)}
                className="text-xs font-semibold py-2 rounded-lg border"
                style={{ borderColor: u.contractType === t ? "#16171B" : "#DEDACD", background: u.contractType === t ? "#16171B" : "#fff", color: u.contractType === t ? "#fff" : "#5F5E5A" }}>
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="稼働状況">
          <div className="grid grid-cols-3 gap-2">
            {WORK_STATUSES.map(s => (
              <button key={s} type="button" onClick={() => set("workStatus", s)}
                className="text-xs font-semibold py-2 rounded-lg border"
                style={{ borderColor: u.workStatus === s ? "#16171B" : "#DEDACD", background: u.workStatus === s ? "#16171B" : "#fff", color: u.workStatus === s ? "#fff" : "#5F5E5A" }}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="得意ジャンル・スキル"><TextArea rows={2} value={u.skills} onChange={e => set("skills", e.target.value)} placeholder="営業・提案資料作成・撮影・動画編集・CANVAデザイン・SNS運用など" /></Field>
        <Field label="稼働可能曜日・時間帯"><TextArea rows={2} value={u.availability} onChange={e => set("availability", e.target.value)} placeholder="平日18時以降、土日終日 など" /></Field>

        <Field label="振込先銀行口座"><PasswordField value={u.bankAccount} onChange={e => set("bankAccount", e.target.value)} placeholder="銀行名・支店名・口座種別・口座番号・名義" /></Field>
        <Field label="備考メモ"><TextArea rows={2} value={u.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: "#DEDACD" }}>キャンセル</button>
        <button onClick={() => onSave(u)} disabled={!u.name.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#D6248A" }}>保存する</button>
      </div>
    </div>
  );
}

function UsersPage({ users, setUsers, currentUser }) {
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const save = (u) => {
    setUsers(prev => {
      const exists = prev.some(x => x.id === u.id);
      return exists ? prev.map(x => x.id === u.id ? u : x) : [...prev, u];
    });
    setEditing(null);
  };
  const remove = (id) => {
    if (id === currentUser.id) return;
    setUsers(prev => prev.filter(u => u.id !== id));
    setConfirmDeleteId(null);
  };

  if (editing) return <StaffForm user={editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>メンバー管理</h2>
        <button onClick={() => setEditing(emptyUser())} className="flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: "#D6248A" }}>
          <Plus size={15} /> スタッフを登録
        </button>
      </div>

      {users.length === 0 && (
        <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>まだスタッフが登録されていません。</div>
      )}

      <div className="space-y-2">
        {users.map(u => {
          const expanded = expandedId === u.id;
          return (
            <div key={u.id} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
              <button onClick={() => setExpandedId(expanded ? null : u.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm truncate">{u.name}</span>
                  {u.id === currentUser.id && <Badge tone="gray">あなた</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {(u.roles || []).map(rk => (
                    <Badge key={rk} tone={ROLES.find(r => r.key === rk)?.color}>{roleLabel(rk)}</Badge>
                  ))}
                  <Badge tone={workStatusTone[u.workStatus] || "gray"}>{u.workStatus || "稼働中"}</Badge>
                  <ChevronRight size={16} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                </div>
              </button>
              {expanded && (
                <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "#EFEDE4" }}>
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
                    <p><span style={{ color: "#8B897F" }}>メール：</span>{u.email || "―"}</p>
                    <p><span style={{ color: "#8B897F" }}>電話：</span>{u.phone || "―"}</p>
                    <p><span style={{ color: "#8B897F" }}>入社日：</span>{u.joinDate || "―"}</p>
                    <p><span style={{ color: "#8B897F" }}>契約形態：</span>{u.contractType || "―"}</p>
                    <p className="md:col-span-2"><span style={{ color: "#8B897F" }}>得意ジャンル・スキル：</span>{u.skills || "―"}</p>
                    <p className="md:col-span-2"><span style={{ color: "#8B897F" }}>稼働可能曜日・時間帯：</span>{u.availability || "―"}</p>
                    <p><span style={{ color: "#8B897F" }}>振込先銀行口座：</span>{u.bankAccount ? "••••••••（登録済み）" : "―"}</p>
                    <p className="md:col-span-2"><span style={{ color: "#8B897F" }}>備考：</span>{u.notes || "―"}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setEditing(u)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1" style={{ borderColor: "#DEDACD" }}><Pencil size={13} />編集する</button>
                    {u.id !== currentUser.id && (
                      confirmDeleteId === u.id ? (
                        <>
                          <button onClick={() => remove(u.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#A32D2D" }}>本当に削除する</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-semibold" style={{ color: "#8B897F" }}>キャンセル</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(u.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ color: "#A32D2D" }}><Trash2 size={13} />削除する</button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("ReVALUE Studio Manager crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      const msg = (this.state.error && this.state.error.message) ? this.state.error.message : String(this.state.error);
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#16171B", padding: 24 }}>
          <div style={{ maxWidth: 480, width: "100%", background: "#FAF8F3", borderRadius: 16, padding: 24 }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>画面の表示中にエラーが発生しました</p>
            <p style={{ fontSize: 13, color: "#5F5E5A", marginBottom: 12, lineHeight: 1.6 }}>
              下のエラー内容をClaudeに伝えていただくと、原因を特定して修正できます。まずは「最初からやり直す」でリセットをお試しください。
            </p>
            <div style={{ fontSize: 11, color: "#A32D2D", background: "#FCEBEB", borderRadius: 8, padding: 10, marginBottom: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {msg}
            </div>
            <button
              onClick={() => { this.setState({ error: null }); }}
              style={{ background: "#D6248A", color: "#fff", padding: "8px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}
            >
              最初からやり直す
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [reels, setReels] = useState([]);
  const [finance, setFinance] = useState([]);
  const [boardPosts, setBoardPosts] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [openClientId, setOpenClientId] = useState(null);
  const [reelsFocusClient, setReelsFocusClient] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [pageHistory, setPageHistory] = useState([]);

  const navigateTo = (newPage, opts = {}) => {
    setPageHistory(prev => [...prev, { page, openClientId, reelsFocusClient }]);
    setPage(newPage);
    setOpenClientId(opts.openClientId ?? null);
    setReelsFocusClient(opts.reelsFocusClient ?? null);
  };

  const goBack = () => {
    setPageHistory(prev => {
      if (prev.length === 0) {
        setPage("dashboard"); setOpenClientId(null); setReelsFocusClient(null);
        return prev;
      }
      const last = prev[prev.length - 1];
      setPage(last.page);
      setOpenClientId(last.openClientId);
      setReelsFocusClient(last.reelsFocusClient);
      return prev.slice(0, -1);
    });
  };

  const prevIds = useRef({ clients: new Set(), reels: new Set(), users: new Set(), finance: new Set(), boardPosts: new Set(), calendarEvents: new Set() });

  // 認証セッションの監視
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ログイン後：全データ読み込み＋自分のプロフィール特定
  const loadAllData = async () => {
    try {
      const [u, c, r, f, b, ev] = await Promise.all([
        fetchAll("profiles"), fetchAll("clients"), fetchAll("reels"), fetchAll("finance", "client_id"), fetchAll("board_posts"), fetchAll("calendar_events"),
      ]);
      const normalizedReels = r.map(normalizeReel);
      setUsers(u);
      setClients(c);
      setReels(normalizedReels);
      setFinance(f);
      setBoardPosts(b);
      setCalendarEvents(ev);
      prevIds.current = {
        clients: new Set(c.map(x => x.id)),
        reels: new Set(normalizedReels.map(x => x.id)),
        users: new Set(u.map(x => x.id)),
        finance: new Set(f.map(x => x.clientId)),
        boardPosts: new Set(b.map(x => x.id)),
        calendarEvents: new Set(ev.map(x => x.id)),
      };
      const me = u.find(x => x.authUserId === session?.user?.id);
      setCurrentUser(me || null);
      setDataLoaded(true);
    } catch (e) {
      console.error("データ読み込みに失敗しました", e);
    }
  };

  useEffect(() => {
    if (session) loadAllData();
    else { setDataLoaded(false); setCurrentUser(null); }
  }, [session]);

  // 各テーブルの変更をSupabaseへ同期（一括upsert＋削除分の反映）
  const makeSync = (table, idField, idKey) => {
    return async (rows) => {
      if (!dataLoaded) return;
      const currentIdSet = new Set(rows.map(r => r[idKey]));
      const prevIdSet = prevIds.current[table] || new Set();
      try {
        if (rows.length) await bulkUpsert(table, rows, idField);
        for (const id of prevIdSet) {
          if (!currentIdSet.has(id)) await deleteRow(table, id, idField);
        }
      } catch (e) {
        console.error(`sync failed for ${table}`, e);
      }
      prevIds.current[table] = currentIdSet;
    };
  };
  const syncClients = useCallback(makeSync("clients", "id", "id"), [dataLoaded]);
  const syncReels = useCallback(makeSync("reels", "id", "id"), [dataLoaded]);
  const syncUsers = useCallback(makeSync("profiles", "id", "id"), [dataLoaded]);
  const syncFinance = useCallback(makeSync("finance", "client_id", "clientId"), [dataLoaded]);
  const syncBoardPosts = useCallback(makeSync("board_posts", "id", "id"), [dataLoaded]);
  const syncCalendarEvents = useCallback(makeSync("calendar_events", "id", "id"), [dataLoaded]);

  useEffect(() => { syncClients(clients); }, [clients]);
  useEffect(() => { syncReels(reels); }, [reels]);
  useEffect(() => { syncUsers(users); }, [users]);
  useEffect(() => { syncFinance(finance); }, [finance]);
  useEffect(() => { syncBoardPosts(boardPosts); }, [boardPosts]);
  useEffect(() => { syncCalendarEvents(calendarEvents); }, [calendarEvents]);

  const goReels = (clientId) => { navigateTo("reels", { reelsFocusClient: clientId }); };
  const goClientDetail = (clientId) => { navigateTo("clients", { openClientId: clientId }); };
  const logout = async () => { await supabase.auth.signOut(); setPage("dashboard"); };

  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState("");
  const impersonate = async (targetUserId) => {
    if (!targetUserId || targetUserId === currentUser.id) return;
    setImpersonating(true);
    setImpersonateError("");
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, accessToken: sess?.access_token }),
      });
      const data = await res.json();
      if (data.error) { setImpersonateError(data.error); setImpersonating(false); return; }
      const { error } = await supabase.auth.verifyOtp({ token_hash: data.hashedToken, type: "magiclink" });
      if (error) { setImpersonateError(error.message); setImpersonating(false); return; }
      window.location.reload();
    } catch (e) {
      setImpersonateError(e.message || "切り替えに失敗しました");
      setImpersonating(false);
    }
  };

  const navItems = useMemo(() => {
    const base = [
      { key: "dashboard", label: "ダッシュボード", icon: LayoutDashboard, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "clients", label: "クライアント", icon: Users, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "reels", label: "動画制作管理", icon: Video, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "research", label: "リサーチ・企画", icon: Sparkles, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "tasks", label: "タスク管理", icon: CheckSquare, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "analytics", label: "分析資料", icon: BarChart3, roles: ["admin", "editor"] },
      { key: "finance", label: "経理管理", icon: Wallet, roles: ["admin"] },
      { key: "users", label: "メンバー管理", icon: UserCog, roles: ["admin"] },
    ];
    return base.filter(i => !currentUser || i.roles.some(r => (currentUser.roles || []).includes(r)));
  }, [currentUser]);

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#16171B" }}><Loader2 className="animate-spin" color="#fff" /></div>;
  }

  if (!session) {
    return <LoginScreen onAuthed={() => {}} />;
  }

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "#16171B" }}>
        <Loader2 className="animate-spin" color="#fff" />
        <p className="text-xs" style={{ color: "#8B897F" }}>データを読み込んでいます…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: "#16171B" }}>
        <p className="text-sm" style={{ color: "#fff" }}>プロフィールが見つかりませんでした。</p>
        <p className="text-xs" style={{ color: "#8B897F" }}>管理者にアカウントの状態をご確認ください。</p>
        <button onClick={logout} className="text-xs font-semibold px-4 py-2 rounded-lg text-white mt-2" style={{ background: "#D6248A" }}>ログアウト</button>
      </div>
    );
  }

  const openClient = clients.find(c => c.id === openClientId);

  const renderPage = () => {
    if (page === "clients" && openClient) {
      return <ClientDetail client={openClient} clients={clients} setClients={setClients} finance={finance} setFinance={setFinance} reels={reels} currentUser={currentUser} onBack={() => setOpenClientId(null)} onGoReels={goReels} />;
    }
    switch (page) {
      case "dashboard": return <DashboardPage clients={clients} reels={reels} setReels={setReels} users={users} currentUser={currentUser} finance={finance} boardPosts={boardPosts} setBoardPosts={setBoardPosts} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} onGoReels={goReels} />;
      case "clients": return <ClientsPage clients={clients} setClients={setClients} finance={finance} setFinance={setFinance} currentUser={currentUser} onOpenClient={setOpenClientId} />;
      case "reels": return <ReelsPage clients={clients} reels={reels} setReels={setReels} users={users} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} currentUser={currentUser} focusClientId={reelsFocusClient} />;
      case "research": return <ResearchPage clients={clients} />;
      case "tasks": return <TasksPage clients={clients} reels={reels} users={users} onGoReels={goReels} onGoClient={goClientDetail} />;
      case "analytics": return <AnalyticsPage clients={clients} reels={reels} users={users} />;
      case "finance": return (currentUser.roles || []).includes("admin") ? <FinancePage clients={clients} finance={finance} setFinance={setFinance} reels={reels} users={users} /> : null;
      case "users": return (currentUser.roles || []).includes("admin") ? <UsersPage users={users} setUsers={setUsers} currentUser={currentUser} /> : null;
      default: return null;
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F4F2EA", minHeight: "100vh", color: "#16171B" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        input:disabled, textarea:disabled, select:disabled { opacity: .6; }
        ::selection { background: #D6248A; color: #fff; }
      `}</style>

      <div className="flex">
        <aside className={`fixed md:static z-40 top-0 left-0 h-full md:h-auto md:min-h-screen w-64 shrink-0 transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`} style={{ background: "#16171B" }}>
          <div className="p-5 flex items-center gap-2">
            <div className="flex items-center justify-center" style={{ width: 38, height: 38 }}><img src="/logo-mark.png" alt="ReVALUE" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
            <div>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#fff", fontSize: 15, lineHeight: 1.1 }}>ReVALUE</p>
              <p style={{ color: "#8B897F", fontSize: 11 }}>Studio Manager</p>
            </div>
            <button className="ml-auto md:hidden" onClick={() => setNavOpen(false)}><X size={18} color="#fff" /></button>
          </div>
          <nav className="px-3 mt-2 space-y-1">
            {navItems.map(item => (
              <button key={item.key} onClick={() => { navigateTo(item.key); setNavOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{ background: page === item.key ? "#D6248A" : "transparent", color: page === item.key ? "#fff" : "#B9B7AD" }}>
                <item.icon size={17} /> {item.label}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-0 left-0 w-full p-4">
            <div className="rounded-xl p-3" style={{ background: "#222329" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#D6248A", color: "#fff", fontWeight: 700, fontSize: 12 }}>
                  {currentUser.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600 }} className="truncate">{currentUser.name}</p>
                  <p style={{ color: "#8B897F", fontSize: 11 }}>{roleLabels(currentUser.roles)}</p>
                </div>
                <button onClick={logout} className="ml-auto shrink-0" title="ログアウト"><LogOut size={15} color="#8B897F" /></button>
              </div>
              {(currentUser.roles || []).includes("admin") && (
                <>
                  <select
                    value=""
                    disabled={impersonating}
                    onChange={e => impersonate(e.target.value)}
                    title="統括管理者専用：他のスタッフのアカウントに切り替え"
                    className="w-full text-xs rounded-lg px-2 py-1.5 disabled:opacity-50"
                    style={{ background: "#16171B", color: "#B9B7AD", border: "1px solid #3A3B42" }}
                  >
                    <option value="">{impersonating ? "切り替え中..." : "他のスタッフに切り替え"}</option>
                    {users.filter(u => u.id !== currentUser.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  {impersonateError && <p className="text-[11px] mt-1" style={{ color: "#F0A5A5" }}>{impersonateError}</p>}
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="md:hidden flex items-center justify-between p-4 border-b" style={{ borderColor: "#DEDACD", background: "#fff" }}>
            <button onClick={() => setNavOpen(true)}><Menu size={20} /></button>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ReVALUE Studio</p>
            <div style={{ width: 20 }} />
          </div>
          <div className="p-4 md:p-8 max-w-6xl mx-auto">
            {page !== "dashboard" && (
              <button onClick={goBack} className="flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: "#8B897F" }}>
                <ArrowLeft size={15} /> 戻る
              </button>
            )}
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
