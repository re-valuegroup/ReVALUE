"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Video, CheckSquare, BarChart3, Wallet, UserCog,
  Plus, X, Pencil, Trash2, Instagram, ExternalLink, Sparkles, ChevronRight,
  ChevronLeft, Menu, LogOut, Eye, EyeOff, Calendar, TrendingUp, FileText,
  Link2, Loader2, Camera, Scissors, MessageSquare, Send, Clock,
  CircleCheck, Circle, ArrowLeft, Building2, User, MapPin, Info, Copy,
  ClipboardList, MessageCircle, Megaphone, UserCheck, Image as ImageIcon,
  KeyRound, DollarSign
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAll, upsertRow, deleteRow, bulkUpsert } from "@/lib/db";

const STAGES = [
  { key: "shoot", label: "撮影", icon: Camera },
  { key: "edit_request", label: "編集指示", icon: MessageSquare },
  { key: "editing", label: "編集", icon: Scissors },
  { key: "revision", label: "修正チェック", icon: CheckSquare },
  { key: "caption", label: "キャプション", icon: FileText },
  { key: "posted", label: "投稿", icon: Send },
];

const ROLES = [
  { key: "admin", label: "統括管理者", color: "coral", icon: UserCog },
  { key: "editor", label: "動画編集者", color: "teal", icon: Scissors },
  { key: "shooter", label: "動画撮影者", color: "amber", icon: Camera },
  { key: "designer", label: "画像作成者", color: "purple", icon: ImageIcon },
];
const SELECTABLE_ROLES = ROLES.filter(r => r.key !== "admin");
const EDIT_WORKLOAD_OPTIONS = [1, 1.5, 2, 2.5, 3];

const CONTRACT_TYPES = ["正社員", "業務委託", "アルバイト", "その他"];
const WORK_STATUSES = ["稼働中", "休止中", "退職"];
const workStatusTone = { "稼働中": "teal", "休止中": "amber", "退職": "gray" };

const roleLabel = (k) => ROLES.find(r => r.key === k)?.label || k;
const roleLabels = (roles) => (roles && roles.length ? roles.map(roleLabel).join("・") : "未設定");

function emptyUser() {
  return {
    id: uid(), name: "", roles: ["shooter"],
    email: "", phone: "", joinDate: "", contractType: "業務委託",
    skills: "", availability: "", bankAccount: "",
    workStatus: "稼働中", notes: "", createdAt: new Date().toISOString(),
  };
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
  if (!res.ok) throw new Error(data.error || "AI応答の取得に失敗しました");
  return data.text;
}

const emptyClient = () => ({
  id: uid(),
  companyName: "", ceoName: "", address: "", website: "",
  instagram: { url: "", id: "", password: "" },
  tiktok: { url: "", id: "", password: "" },
  business: "", appeal: "", plan: "", monthlyCount: 4,
  contractEndDate: "",
  notes: "", createdAt: new Date().toISOString(),
});

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
  editorPrimaryId: "", editorSecondaryId: "",
  editStartDate: "", editEndDate: "", editWorkload: "",
  checklist: emptyChecklist(), checkSubmitted: false, checkSubmittedAt: null,
  theme: "", script: "", editInstructions: "", driveUrl: "",
  transcript: "", memo: "", caption: "",
  captionHistory: [], scriptProposals: [],
  completedStages: 0, postedDate: "", views7day: "",
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
  clientId, contractStart: "", contractEnd: "", monthlyFee: "",
  billingDate: "", paymentStatus: "未請求", notes: "",
});

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
              {!compact && <span className="text-[10px] mt-1" style={{ color: done ? "#0E90B8" : isNext ? "#D6248A" : "#A9A79C", fontWeight: 600 }}>{s.label}</span>}
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
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { name: name.trim(), roles } },
        });
        if (err) throw err;
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
            <PasswordField name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="統括管理者から共有されたパスワード" />
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

function ClientForm({ client, onSave, onCancel }) {
  const [c, setC] = useState(client);
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
        <Field label="備考メモ"><TextArea rows={2} value={c.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </div>

      <div className="grid md:grid-cols-2 gap-x-6 mt-2 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
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
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: "#DEDACD" }}>キャンセル</button>
        <button onClick={() => onSave(c)} disabled={!c.companyName.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "#16171B" }}>保存する</button>
      </div>
    </div>
  );
}

function ClientsPage({ clients, setClients, currentUser, onOpenClient }) {
  const [editing, setEditing] = useState(null);
  const canEdit = currentUser.roles.includes("admin");

  const save = (c) => {
    setClients(prev => {
      const exists = prev.some(x => x.id === c.id);
      return exists ? prev.map(x => x.id === c.id ? c : x) : [...prev, c];
    });
    setEditing(null);
  };
  const remove = (id) => {
    if (!confirm("このクライアントを削除しますか？")) return;
    setClients(prev => prev.filter(x => x.id !== id));
  };

  if (editing) return <ClientForm client={editing} onSave={save} onCancel={() => setEditing(null)} />;

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
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditing(c)} className="p-1.5 rounded-lg hover:bg-black/5"><Pencil size={14} /></button>
                  <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg hover:bg-black/5"><Trash2 size={14} /></button>
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

function ClientDetail({ client, clients, setClients, reels, currentUser, onBack, onGoReels }) {
  const [editing, setEditing] = useState(false);
  const canEdit = currentUser.roles.includes("admin");
  const [proposal, setProposal] = useState("");
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [proposalError, setProposalError] = useState("");

  const clientReels = reels.filter(r => r.clientId === client.id);
  const postedCount = clientReels.filter(r => r.completedStages >= 6).length;

  const generateProposal = async () => {
    setLoadingProposal(true);
    setProposalError("");
    setProposal("");
    try {
      const text = await callApi("/api/proposal", {
        clientName: client.companyName,
        clientBusiness: client.business,
        clientAppeal: client.appeal,
        clientPlan: client.plan,
      });
      setProposal(text);
    } catch (e) {
      setProposalError("提案の生成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoadingProposal(false);
    }
  };

  if (editing) {
    return <ClientForm client={client} onCancel={() => setEditing(false)} onSave={(c) => { setClients(prev => prev.map(x => x.id === c.id ? c : x)); setEditing(false); }} />;
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
            <p className="text-xs font-semibold mb-1" style={{ color: "#8B897F" }}>備考</p>
            <p className="text-sm">{client.notes || "―"}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t" style={{ borderColor: "#EFEDE4" }}>
          {[{ label: "Instagram", data: client.instagram, tone: "coral" }, { label: "TikTok", data: client.tiktok, tone: "gray" }].map(sns => (
            <div key={sns.label} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
              <p className="text-xs font-bold mb-2">{sns.label}</p>
              {sns.data.url ? (
                <a href={sns.data.url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 mb-1" style={{ color: "#96185E" }}>{sns.data.url} <ExternalLink size={11} /></a>
              ) : <p className="text-xs mb-1" style={{ color: "#A9A79C" }}>URL未設定</p>}
              <p className="text-xs" style={{ color: "#5F5E5A" }}>ID: {sns.data.id || "―"}</p>
              <p className="text-xs" style={{ color: "#5F5E5A" }}>PW: {sns.data.password ? "••••••••" : "―"}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => onGoReels(client.id)} className="text-sm font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ background: "#16171B" }}>
            <Video size={15} /> 動画制作管理を開く
          </button>
          <Badge tone="teal">今月投稿済み {postedCount}/{clientReels.length}</Badge>
        </div>
      </div>

      {(currentUser.roles.includes("shooter") || currentUser.roles.includes("admin")) && (
        <div className="rounded-2xl p-5 border" style={{ borderColor: "#DEDACD", background: "#fff" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Sparkles size={16} color="#D6248A" /> AI企画提案（トレンドリサーチ）</p>
            <button onClick={generateProposal} disabled={loadingProposal} className="text-sm font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
              {loadingProposal ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loadingProposal ? "リサーチ中..." : "提案を生成"}
            </button>
          </div>
          <p className="text-xs mb-2" style={{ color: "#8B897F" }}>最新のSNSトレンドをAIが検索し、クライアント情報をもとに次回撮影の企画・台本案を提案します。</p>
          {proposalError && <p className="text-sm" style={{ color: "#A32D2D" }}>{proposalError}</p>}
          {proposal && <div className="mt-2 p-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "#FAF8F3", lineHeight: 1.7 }}>{proposal}</div>}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const d = new Date(ts);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReelCard({ reel, client, users, calendarEvents, setCalendarEvents, onChange, onDelete, onDuplicate, canEdit, currentUser }) {
  const [expanded, setExpanded] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [showScriptProposals, setShowScriptProposals] = useState(false);

  const editors = users.filter(u => u.roles.includes("editor"));
  const shooters = users.filter(u => u.roles.includes("shooter"));
  const isAdmin = currentUser?.roles?.includes("admin");

  const syncEditCalendar = (updated) => {
    if (!setCalendarEvents) return;
    setCalendarEvents(prev => {
      const existing = prev.find(e => e.reelId === updated.id && e.type === "edit");
      if (!updated.editStartDate) {
        return existing ? prev.filter(e => e.id !== existing.id) : prev;
      }
      const endDate = updated.editEndDate || updated.editStartDate;
      if (existing) {
        return prev.map(e => e.id === existing.id ? { ...e, startDate: updated.editStartDate, endDate, staffId: updated.editorPrimaryId || e.staffId } : e);
      }
      return [...prev, { id: uid(), type: "edit", reelId: updated.id, staffId: updated.editorPrimaryId || "", startDate: updated.editStartDate, endDate, note: "", createdAt: new Date().toISOString() }];
    });
  };

  const update = (patch) => {
    const updated = { ...reel, ...patch };
    onChange(updated);
    if ("editStartDate" in patch || "editEndDate" in patch || "editorPrimaryId" in patch) {
      syncEditCalendar(updated);
    }
  };

  const genCaption = async () => {
    setGenLoading(true);
    setGenError("");
    try {
      const text = await callApi("/api/caption", {
        clientName: client?.companyName,
        clientBusiness: client?.business,
        theme: reel.theme,
        transcript: reel.transcript,
        memo: reel.memo,
      });
      const clean = text.trim();
      const historyEntry = { id: uid(), text: clean, createdAt: Date.now() };
      update({ caption: clean, captionHistory: [historyEntry, ...(reel.captionHistory || [])] });
    } catch (e) {
      setGenError("キャプション生成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setGenLoading(false);
    }
  };

  const applyHistoryCaption = (text) => update({ caption: text });
  const deleteHistoryCaption = (id) => update({ captionHistory: (reel.captionHistory || []).filter(h => h.id !== id) });

  const genScript = async () => {
    setScriptLoading(true);
    setScriptError("");
    try {
      const text = await callApi("/api/script", {
        clientName: client?.companyName,
        clientBusiness: client?.business,
        clientAppeal: client?.appeal,
        clientPlan: client?.plan,
        theme: reel.theme,
      });
      const clean = text.trim();
      const entry = { id: uid(), text: clean, createdAt: Date.now() };
      update({ scriptProposals: [entry, ...(reel.scriptProposals || [])] });
      setShowScriptProposals(true);
    } catch (e) {
      setScriptError("台本提案の生成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setScriptLoading(false);
    }
  };
  const applyScriptProposal = (text) => update({ script: text });

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
            <p className="font-bold truncate">{reel.theme || "（テーマ未設定）"}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#8B897F" }}>{reel.editInstructions || "編集指示未入力"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {reel.assignedStaffId && <Badge tone="gray">{users.find(u => u.id === reel.assignedStaffId)?.name || "担当者"}</Badge>}
            {reel.completedStages >= 6 && <Badge tone="teal">投稿済み</Badge>}
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
            <Field label="テーマ"><TextInput value={reel.theme} onChange={e => update({ theme: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="担当撮影者">
              <select value={reel.assignedStaffId || ""} onChange={e => update({ assignedStaffId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {shooters.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Google Drive 保存先URL">
              <div className="flex gap-1">
                <TextInput value={reel.driveUrl} onChange={e => update({ driveUrl: e.target.value })} placeholder="https://drive.google.com/..." disabled={!canEdit} />
                {reel.driveUrl && <a href={reel.driveUrl} target="_blank" rel="noreferrer" className="shrink-0 flex items-center justify-center w-9 rounded-lg border" style={{ borderColor: "#DEDACD" }}><Link2 size={14} /></a>}
              </div>
            </Field>
            <Field label="編集指示"><TextArea rows={2} value={reel.editInstructions} onChange={e => update({ editInstructions: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="第一段階：メイン編集者">
              <select value={reel.editorPrimaryId || ""} onChange={e => update({ editorPrimaryId: e.target.value })} disabled={!canEdit} className={inputCls} style={inputStyle}>
                <option value="">未割り当て</option>
                {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="編集予定日（カレンダーと連動）">
              <div className="flex items-center gap-1">
                <TextInput type="date" value={reel.editStartDate || ""} onChange={e => update({ editStartDate: e.target.value })} disabled={!canEdit} />
                <span className="text-xs shrink-0" style={{ color: "#8B897F" }}>〜</span>
                <TextInput type="date" value={reel.editEndDate || ""} onChange={e => update({ editEndDate: e.target.value })} disabled={!canEdit} />
              </div>
            </Field>
            <Field label="編集工数（統括管理者のみ設定可）">
              <select value={reel.editWorkload || ""} onChange={e => update({ editWorkload: e.target.value })} disabled={!isAdmin} className={inputCls} style={inputStyle}>
                <option value="">未設定</option>
                {EDIT_WORKLOAD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {reel.editWorkload && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#8B897F" }}>
                  <DollarSign size={12} /> 報酬単価: ¥{(parseFloat(reel.editWorkload) * 1000).toLocaleString()}
                </p>
              )}
            </Field>
          </div>

          <div className="rounded-xl p-3 my-2" style={{ background: "#FAF8F3" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold flex items-center gap-1.5"><ClipboardList size={13} color="#0E90B8" /> 修正チェック（第二段階）</p>
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold flex items-center gap-1.5"><Sparkles size={13} color="#D6248A" /> AI台本提案（トレンドリサーチ）</p>
              {canEdit && (
                <button onClick={genScript} disabled={scriptLoading} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
                  {scriptLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {scriptLoading ? "リサーチ中..." : "台本を提案してもらう"}
                </button>
              )}
            </div>
            {scriptError && <p className="text-xs mb-1" style={{ color: "#A32D2D" }}>{scriptError}</p>}
            <Field label="台本"><TextArea rows={3} value={reel.script} onChange={e => update({ script: e.target.value })} disabled={!canEdit} /></Field>
            {(reel.scriptProposals || []).length > 0 && (
              <button onClick={() => setShowScriptProposals(s => !s)} className="text-xs font-semibold" style={{ color: "#5F5E5A" }}>
                過去の提案を見る（{reel.scriptProposals.length}件）{showScriptProposals ? " ▲" : " ▼"}
              </button>
            )}
            {showScriptProposals && (
              <div className="space-y-2 mt-2">
                {(reel.scriptProposals || []).map(p => (
                  <div key={p.id} className="rounded-lg p-2.5" style={{ background: "#fff", border: "1px solid #EFEDE4" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px]" style={{ color: "#8B897F" }}>{timeAgo(p.createdAt)}</span>
                      {canEdit && <button onClick={() => applyScriptProposal(p.text)} className="text-[11px] font-semibold" style={{ color: "#D6248A" }}>台本欄に反映</button>}
                    </div>
                    <p className="text-xs whitespace-pre-wrap" style={{ lineHeight: 1.6, color: "#5F5E5A" }}>{p.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl p-3 my-2" style={{ background: "#FAF8F3" }}>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><Sparkles size={13} color="#D6248A" /> AIキャプション作成</p>
            <div className="grid md:grid-cols-2 gap-x-4">
              <Field label="動画概要メモ"><TextArea rows={3} value={reel.memo} onChange={e => update({ memo: e.target.value })} placeholder="動画の要点・伝えたいことのメモ" disabled={!canEdit} /></Field>
              <Field label="動画の文字起こし（任意）"><TextArea rows={3} value={reel.transcript} onChange={e => update({ transcript: e.target.value })} placeholder="完成した動画の文字起こしを貼り付け（なくても生成可）" disabled={!canEdit} /></Field>
            </div>
            {canEdit && (
              <button onClick={genCaption} disabled={genLoading} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#D6248A" }}>
                {genLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {genLoading ? "生成中..." : (reel.caption ? "AIで再生成" : "AIでキャプションを生成")}
              </button>
            )}
            {genError && <p className="text-xs mt-1" style={{ color: "#A32D2D" }}>{genError}</p>}
            <Field label="キャプション"><TextArea rows={4} value={reel.caption} onChange={e => update({ caption: e.target.value })} disabled={!canEdit} /></Field>
            {(reel.captionHistory || []).length > 0 && (
              <button onClick={() => setShowHistory(s => !s)} className="text-xs font-semibold" style={{ color: "#5F5E5A" }}>
                生成履歴を見る（{reel.captionHistory.length}件）{showHistory ? " ▲" : " ▼"}
              </button>
            )}
            {showHistory && (
              <div className="space-y-2 mt-2">
                {(reel.captionHistory || []).map(h => (
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

          <div className="grid md:grid-cols-2 gap-x-4">
            <Field label="投稿日"><TextInput type="date" value={reel.postedDate} onChange={e => update({ postedDate: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="投稿後1週間の再生回数"><TextInput type="number" value={reel.views7day} onChange={e => update({ views7day: e.target.value })} disabled={!canEdit} /></Field>
          </div>

          {canEdit && (
            <button onClick={() => confirm("この動画を削除しますか？") && onDelete(reel.id)} className="text-xs font-semibold flex items-center gap-1 mt-1" style={{ color: "#A32D2D" }}>
              <Trash2 size={13} /> この動画を削除
            </button>
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
            {users.filter(u => u.roles.includes("shooter")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
  const canEdit = true;
  const client = clients.find(c => c.id === clientId);

  useEffect(() => { if (focusClientId) setClientId(focusClientId); }, [focusClientId]);

  const [showNew, setShowNew] = useState(false);
  const list = reels.filter(r => r.clientId === clientId && r.yearMonth === ym && (!staffFilter || r.assignedStaffId === staffFilter));

  const addReel = () => {
    if (!clientId) return;
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
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg border px-1" style={{ borderColor: "#DEDACD" }}>
          <button onClick={() => shiftMonth(-1)} className="p-1.5"><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold px-1 w-24 text-center">{monthLabel(ym)}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5"><ChevronRight size={15} /></button>
        </div>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 180 }}>
          <option value="">担当撮影者（全員）</option>
          {users.filter(u => u.roles.includes("shooter")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {clientId && (
          <button onClick={addReel} className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-lg text-white ml-auto" style={{ background: "#D6248A" }}>
            <Plus size={15} /> 動画を追加
          </button>
        )}
      </div>

      {client && (
        <p className="text-xs mb-3" style={{ color: "#8B897F" }}>{client.companyName} ・ {monthLabel(ym)} の制作予定 {client.monthlyCount || 0}本 ／ 登録済み {list.length}本</p>
      )}

      {!clientId && <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>クライアントを選択してください。</div>}
      {clientId && list.length === 0 && <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>この月の動画はまだありません。「動画を追加」から作成できます。</div>}

      <div className="space-y-3">
        {list.map(r => <ReelCard key={r.id} reel={r} client={client} users={users} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} currentUser={currentUser} onChange={updateReel} onDelete={deleteReel} onDuplicate={duplicateReelInPlace} canEdit={true} />)}
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
  return { id: uid(), staffId: "", reelId: "", type: "shoot", startDate: "", endDate: "", note: "", createdAt: new Date().toISOString() };
}

function CalendarWidget({ events, setEvents, users, reels, setReels, clients }) {
  const [month, setMonth] = useState(currentYearMonth());
  const [form, setForm] = useState(emptyCalendarEvent());
  const [showForm, setShowForm] = useState(false);

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

  const editableReels = reels.filter(r => r.completedStages < 6);

  const addEvent = () => {
    if (!form.staffId || !form.startDate) return;
    const endDate = (form.type === "edit" ? form.endDate : "") || form.startDate;
    const newEvent = { ...form, id: uid(), endDate };
    setEvents(prev => [...prev, newEvent]);
    // 編集稼働の予定に動画が紐付けられていたら、動画制作管理側にも反映する
    if (form.type === "edit" && form.reelId && setReels) {
      setReels(prev => prev.map(r => r.id === form.reelId
        ? { ...r, editStartDate: form.startDate, editEndDate: endDate, editorPrimaryId: form.staffId || r.editorPrimaryId }
        : r));
    }
    setForm(emptyCalendarEvent());
    setShowForm(false);
  };
  const removeEvent = (id) => {
    const ev = events.find(e => e.id === id);
    setEvents(prev => prev.filter(e => e.id !== id));
    if (ev?.type === "edit" && ev.reelId && setReels) {
      setReels(prev => prev.map(r => r.id === ev.reelId ? { ...r, editStartDate: "", editEndDate: "" } : r));
    }
  };

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="font-bold flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Calendar size={16} color="#D6248A" /> 月間カレンダー（撮影日・編集稼働期間）</p>
        <button onClick={() => setShowForm(s => !s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ background: "#D6248A" }}><Plus size={13} />予定を登録</button>
      </div>

      {showForm && (
        <div className="rounded-xl p-3 mb-3 grid md:grid-cols-6 gap-2 items-end" style={{ background: "#FAF8F3" }}>
          <Field label="種別">
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, staffId: "", reelId: "" }))} className={inputCls} style={inputStyle}>
              {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="担当者">
            <select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))} className={inputCls} style={inputStyle}>
              <option value="">選択してください</option>
              {users.filter(u => form.type === "shoot" ? u.roles.includes("shooter") : u.roles.includes("editor")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {form.type === "edit" && (
            <Field label="対象動画（任意）">
              <select value={form.reelId} onChange={e => setForm(f => ({ ...f, reelId: e.target.value }))} className={inputCls} style={inputStyle}>
                <option value="">選択しない</option>
                {editableReels.map(r => {
                  const c = clients.find(x => x.id === r.clientId);
                  return <option key={r.id} value={r.id}>{c?.companyName} ・ {r.theme || "テーマ未設定"}</option>;
                })}
              </select>
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
                  const linkedReel = ev.reelId ? reels.find(r => r.id === ev.reelId) : null;
                  const linkedClient = linkedReel ? clients.find(c => c.id === linkedReel.clientId) : null;
                  const label = linkedReel ? (linkedReel.theme || "動画") : (staff?.name || "?");
                  const tooltip = `${type?.label} ・ ${staff?.name || ""}${linkedReel ? " ・ " + (linkedClient?.companyName || "") + " " + (linkedReel.theme || "") : ""}${ev.note ? " ・ " + ev.note : ""}（クリックで削除）`;
                  return (
                    <div key={ev.id} onClick={() => confirm("この予定を削除しますか？") && removeEvent(ev.id)} title={tooltip} className="text-[9px] px-1 py-0.5 rounded truncate cursor-pointer" style={{ background: type?.color, color: "#fff" }}>
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
  const posted = reels.filter(r => r.completedStages >= 6).length;
  const inProgress = totalReels - posted;
  const overdue = reels.filter(r => r.completedStages < 6 && r.yearMonth < ym);
  const stageCounts = STAGES.map((s, i) => reels.filter(r => r.completedStages === i).length);
  const editors = users.filter(u => u.roles.includes("editor"));

  const stats = [
    { label: "登録クライアント", value: clients.length, icon: Building2, tone: "gray" },
    { label: "今月の動画本数", value: reels.filter(r => r.yearMonth === ym).length, icon: Video, tone: "coral" },
    { label: "投稿済み", value: posted, icon: CircleCheck, tone: "teal" },
    { label: "制作中", value: inProgress, icon: Clock, tone: "amber" },
  ];

  // 直近で投稿すべきクライアント
  const priorityClients = clients.map(c => {
    const monthly = parseInt(c.monthlyCount) || 0;
    const postedThisMonth = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages >= 6).length;
    if (postedThisMonth >= monthly) return null;
    const clientReels = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages < 6);
    const best = clientReels.sort((a, b) => b.completedStages - a.completedStages)[0];
    return { client: c, monthly, postedThisMonth, reel: best || null };
  }).filter(Boolean);

  // 編集指示が記入され、メイン編集者が未割当の動画
  const pickupList = reels.filter(r => r.completedStages >= 2 && !r.editorPrimaryId && r.editInstructions);
  const [pickupChoice, setPickupChoice] = useState({});
  const assignPrimary = (reelId) => {
    const editorId = pickupChoice[reelId];
    if (!editorId) return;
    setReels(prev => prev.map(r => r.id === reelId ? { ...r, editorPrimaryId: editorId } : r));
    setPickupChoice(prev => ({ ...prev, [reelId]: "" }));
  };

  // 一括でチェック担当者を指定
  const needsChecker = reels.filter(r => r.editorPrimaryId && !r.editorSecondaryId && r.completedStages < 6);
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
    setBoardPosts(prev => [{ id: uid(), authorId: author.id, authorName: author.name, theme: boardTheme.trim(), content: boardText.trim(), createdAt: new Date().toISOString() }, ...prev]);
    setBoardTheme("");
    setBoardText("");
  };
  const deleteBoard = (id) => setBoardPosts(prev => prev.filter(p => p.id !== id));

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-1">ダッシュボード</h2>
      <p className="text-sm mb-4" style={{ color: "#8B897F" }}>{currentUser.name}さん（{roleLabels(currentUser.roles)}） こんにちは。</p>

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

      <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
        <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Calendar size={16} color="#D6248A" /> 直近で投稿すべきクライアント</p>
        {priorityClients.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>今月の投稿予定はすべて達成しています。</p>}
        <div className="space-y-2">
          {priorityClients.map(({ client, monthly, postedThisMonth, reel }) => (
            <div key={client.id} className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#FAF8F3" }}>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{client.companyName}</p>
                <p className="text-xs" style={{ color: "#8B897F" }}>今月 {postedThisMonth}/{monthly} 本投稿済み</p>
                {reel && (
                  <div className="mt-1">
                    {reel.completedStages >= 5 ? (
                      <span className="text-xs" style={{ color: "#0E90B8" }}>完成済み・投稿待ち：{reel.theme || "（テーマ未設定）"}</span>
                    ) : (
                      <span className="text-xs" style={{ color: "#854F0B" }}>制作中：{reel.theme || "（テーマ未設定）"} ・ 次工程 {STAGES[reel.completedStages]?.label}</span>
                    )}
                  </div>
                )}
                {!reel && <span className="text-xs" style={{ color: "#A32D2D" }}>この月の動画がまだ登録されていません</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {reel ? (
                  <>
                    {reel.completedStages >= 5 && (
                      <button onClick={() => setReels(prev => prev.map(r => r.id === reel.id ? { ...r, completedStages: 6, postedDate: r.postedDate || new Date().toISOString().slice(0, 10) } : r))} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#0E90B8" }}>投稿完了にする</button>
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

      {(currentUser.roles.includes("editor") || currentUser.roles.includes("admin")) && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><MessageSquare size={16} color="#D6248A" /> 編集指示一覧（担当編集者募集中）</p>
          {pickupList.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>担当者待ちの編集指示はありません。</p>}
          <div className="space-y-2">
            {pickupList.map(r => {
              const c = clients.find(x => x.id === r.clientId);
              return (
                <div key={r.id} className="rounded-xl p-3" style={{ background: "#FAF8F3" }}>
                  <p className="font-semibold text-sm">{c?.companyName} ・ {r.theme || "（テーマ未設定）"}</p>
                  <p className="text-xs mt-1" style={{ color: "#5F5E5A" }}>{r.editInstructions}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <select value={pickupChoice[r.id] || ""} onChange={e => setPickupChoice(prev => ({ ...prev, [r.id]: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 200 }}>
                      <option value="">動画編集者を選択</option>
                      {editors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button onClick={() => assignPrimary(r.id)} disabled={!pickupChoice[r.id]} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: "#D6248A" }}>この動画を担当する</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {currentUser.roles.includes("admin") && needsChecker.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><UserCheck size={16} color="#D6248A" /> 第二段階チェック担当の一括指定</p>
          <div className="space-y-1.5 mb-3">
            {needsChecker.map(r => {
              const c = clients.find(x => x.id === r.clientId);
              return (
                <label key={r.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                  <input type="checkbox" checked={selectedForBulk.includes(r.id)} onChange={() => toggleBulk(r.id)} />
                  <span>{c?.companyName} ・ {r.theme || "（テーマ未設定）"} <span style={{ color: "#8B897F" }}>（メイン: {users.find(u => u.id === r.editorPrimaryId)?.name}）</span></span>
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

      {currentUser.roles.includes("admin") && submittedChecks.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><ClipboardList size={16} color="#0E90B8" /> 第二段階チェック提出一覧</p>
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
        <p className="font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>全体の進行状況</p>
        <div className="flex items-center justify-between flex-wrap gap-4">
          {STAGES.map((s, i) => (
            <div key={s.key} className="text-center">
              <div className="mx-auto rounded-full flex items-center justify-center mb-1" style={{ width: 40, height: 40, background: "#FAF8F3" }}>
                <s.icon size={17} color="#5F5E5A" />
              </div>
              <p className="text-lg font-bold">{stageCounts[i]}</p>
              <p className="text-[11px]" style={{ color: "#8B897F" }}>{s.label}</p>
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
                  {(p.authorId === currentUser.id || currentUser.roles.includes("admin")) && (
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

      {currentUser.roles.includes("admin") && finance.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-2 text-sm">入金状況サマリー</p>
          <div className="flex gap-2 flex-wrap">
            {["未請求", "請求済み", "入金済み", "延滞"].map(st => (
              <Badge key={st} tone={st === "入金済み" ? "teal" : st === "延滞" ? "red" : st === "請求済み" ? "amber" : "gray"}>
                {st} {finance.filter(f => f.paymentStatus === st).length}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TasksPage({ clients, reels, users, onGoReels }) {
  const ym = currentYearMonth();
  const editors = users.filter(u => u.roles.includes("editor"));
  const [editorFilter, setEditorFilter] = useState("");

  // 投稿すべきクライアント一覧（今月の投稿本数が未達のクライアント）
  const postClients = clients.map(c => {
    const monthly = parseInt(c.monthlyCount) || 0;
    const postedThisMonth = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages >= 6).length;
    if (postedThisMonth >= monthly) return null;
    const ready = reels.filter(r => r.clientId === c.id && r.yearMonth === ym && r.completedStages === 5)[0];
    return { client: c, monthly, postedThisMonth, ready };
  }).filter(Boolean);

  // 動画編集すべき一覧（編集指示済み〜チェック待ちの動画）
  const editItems = reels.filter(r => r.completedStages === 2 || r.completedStages === 3)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  // 撮影すべき一覧（まだ撮影が終わっていない動画）
  const shootItems = reels.filter(r => r.completedStages === 0)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  // 選択した編集者が現在進めている案件（メイン編集・第二段階チェックいずれかで担当している、未完了の動画すべて）
  const editorCases = editorFilter
    ? reels.filter(r => r.completedStages < 6 && (r.editorPrimaryId === editorFilter || r.editorSecondaryId === editorFilter))
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
              const role = r.editorPrimaryId === editorFilter && r.editorSecondaryId === editorFilter
                ? "メイン編集＋第二段階チェック"
                : r.editorPrimaryId === editorFilter ? "メイン編集" : "第二段階チェック";
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

      <div className="grid md:grid-cols-3 gap-3">
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
            const editor = users.find(u => u.id === (r.completedStages === 2 ? r.editorPrimaryId : r.editorSecondaryId));
            return (
              <button key={r.id} onClick={() => onGoReels(r.clientId)} className="w-full text-left text-xs p-2.5 rounded-lg hover:bg-black/5" style={{ background: "#FAF8F3" }}>
                <p className="font-semibold">{c?.companyName} ・ {r.theme || "テーマ未設定"}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge tone="amber">{r.completedStages === 2 ? "メイン編集待ち" : "第二段階チェック待ち"}</Badge>
                  <span style={{ color: "#8B897F" }}>{monthLabel(r.yearMonth)}{editor ? ` ・ 担当: ${editor.name}` : ""}</span>
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
      </div>
    </div>
  );
}

function AnalyticsPage({ clients, reels, users }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const posted = reels.filter(r => r.clientId === clientId && r.completedStages >= 6);
  const months = [...new Set(posted.map(r => r.yearMonth))].sort().reverse();

  const editors = users.filter(u => u.roles.includes("editor"));
  const editedReels = reels.filter(r => r.completedStages >= 3 && r.editorPrimaryId);

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }} className="mb-4">分析資料</h2>

      {editors.length > 0 && (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
          <p className="font-bold mb-3 flex items-center gap-1.5"><Scissors size={16} color="#0E90B8" /> 編集者別 月間編集完了本数・報酬</p>
          {editedReels.length === 0 && <p className="text-xs" style={{ color: "#8B897F" }}>編集完了した動画がまだありません。</p>}
          <div className="space-y-3">
            {editors.map(ed => {
              const mine = editedReels.filter(r => r.editorPrimaryId === ed.id);
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

      <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 220 }}>
        <option value="">クライアントを選択</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
      </select>

      {months.map(m => {
        const rows = posted.filter(r => r.yearMonth === m);
        const totalViews = rows.reduce((s, r) => s + (parseInt(r.views7day) || 0), 0);
        const avg = rows.length ? Math.round(totalViews / rows.length) : 0;
        return (
          <div key={m} className="rounded-2xl p-5 mt-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
            <p className="font-bold mb-3">{monthLabel(m)} の月次レポート</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>投稿本数</p><p className="text-xl font-bold">{rows.length}</p></div>
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>合計再生数(1週間)</p><p className="text-xl font-bold">{totalViews.toLocaleString()}</p></div>
              <div className="rounded-xl p-3" style={{ background: "#FAF8F3" }}><p className="text-xs" style={{ color: "#8B897F" }}>平均再生数</p><p className="text-xl font-bold">{avg.toLocaleString()}</p></div>
            </div>
            <div className="space-y-1">
              {rows.sort((a, b) => (parseInt(b.views7day) || 0) - (parseInt(a.views7day) || 0)).map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg" style={{ background: "#FAF8F3" }}>
                  <span>{r.theme || "テーマ未設定"}</span>
                  <span style={{ color: "#8B897F" }}>{(parseInt(r.views7day) || 0).toLocaleString()} 回</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {clientId && months.length === 0 && <div className="text-center py-16 rounded-2xl border border-dashed mt-4" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>投稿済みの動画がまだありません。</div>}
    </div>
  );
}

function FinancePage({ clients, finance, setFinance }) {
  const upsert = (clientId, patch) => {
    setFinance(prev => {
      const exists = prev.some(f => f.clientId === clientId);
      if (exists) return prev.map(f => f.clientId === clientId ? { ...f, ...patch } : f);
      return [...prev, { ...emptyFinance(clientId), ...patch }];
    });
  };
  const statusTone = { "未請求": "gray", "請求済み": "amber", "入金済み": "teal", "延滞": "red" };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={20} />
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>経理管理（統括管理者専用）</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "#8B897F" }}>契約・請求・入金状況を管理します。この情報は統括管理者のみが閲覧できます。</p>
      <div className="space-y-3">
        {clients.map(c => {
          const f = finance.find(x => x.clientId === c.id) || emptyFinance(c.id);
          return (
            <div key={c.id} className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid #DEDACD" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold">{c.companyName}</p>
                <Badge tone={statusTone[f.paymentStatus] || "gray"}>{f.paymentStatus}</Badge>
              </div>
              <div className="grid md:grid-cols-5 gap-3">
                <Field label="契約開始日"><TextInput type="date" value={f.contractStart} onChange={e => upsert(c.id, { contractStart: e.target.value })} /></Field>
                <Field label="契約終了日"><TextInput type="date" value={f.contractEnd} onChange={e => upsert(c.id, { contractEnd: e.target.value })} /></Field>
                <Field label="月額料金"><TextInput type="number" value={f.monthlyFee} onChange={e => upsert(c.id, { monthlyFee: e.target.value })} placeholder="円" /></Field>
                <Field label="請求日"><TextInput type="date" value={f.billingDate} onChange={e => upsert(c.id, { billingDate: e.target.value })} /></Field>
                <Field label="入金ステータス">
                  <select value={f.paymentStatus} onChange={e => upsert(c.id, { paymentStatus: e.target.value })} className={inputCls} style={inputStyle}>
                    {["未請求", "請求済み", "入金済み", "延滞"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="備考"><TextArea rows={1} value={f.notes} onChange={e => upsert(c.id, { notes: e.target.value })} /></Field>
            </div>
          );
        })}
      </div>
      {clients.length === 0 && <div className="text-center py-16 rounded-2xl border border-dashed" style={{ borderColor: "#DEDACD", color: "#8B897F" }}>クライアントを登録すると経理情報を管理できます。</div>}
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
          {(u.roles.includes("admin") ? ROLES : SELECTABLE_ROLES).map(r => (
            <button key={r.key} type="button" onClick={() => set("roles", u.roles.includes(r.key) ? u.roles.filter(x => x !== r.key) : [...u.roles, r.key])}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border"
              style={{ borderColor: u.roles.includes(r.key) ? "#16171B" : "#DEDACD", background: u.roles.includes(r.key) ? "#16171B" : "#fff" }}>
              <r.icon size={18} color={u.roles.includes(r.key) ? "#fff" : "#5F5E5A"} />
              <span className="text-xs font-semibold" style={{ color: u.roles.includes(r.key) ? "#fff" : "#5F5E5A" }}>{r.label}</span>
            </button>
          ))}
        </div>
        {u.roles.includes("admin") && <p className="text-[11px] mt-1" style={{ color: "#A9A79C" }}>統括管理者は屋宜様のみです。役割を変更すると統括管理権限が失われます。</p>}
      </Field>

      <div className="grid md:grid-cols-2 gap-x-6 mt-3">
        <Field label="名前（必須）"><TextInput value={u.name} onChange={e => set("name", e.target.value)} placeholder="山田 太郎" /></Field>
        <Field label="メールアドレス"><TextInput type="email" value={u.email} onChange={e => set("email", e.target.value)} placeholder="taro@example.com" /></Field>
        <p className="text-[11px] -mt-2 mb-3" style={{ color: "#A9A79C" }}>本人がこのメールアドレスでサインアップすると、このプロフィールに自動的に紐付きます。</p>
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

  const save = (u) => {
    setUsers(prev => {
      const exists = prev.some(x => x.id === u.id);
      return exists ? prev.map(x => x.id === u.id ? u : x) : [...prev, u];
    });
    setEditing(null);
  };
  const remove = (id) => {
    if (id === currentUser.id) return;
    if (!confirm("このメンバーを削除しますか？")) return;
    setUsers(prev => prev.filter(u => u.id !== id));
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
                      <button onClick={() => remove(u.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ color: "#A32D2D" }}><Trash2 size={13} />削除する</button>
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

export default function App() {
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
      setUsers(u);
      setClients(c);
      setReels(r);
      setFinance(f);
      setBoardPosts(b);
      setCalendarEvents(ev);
      prevIds.current = {
        clients: new Set(c.map(x => x.id)),
        reels: new Set(r.map(x => x.id)),
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

  const goReels = (clientId) => { setReelsFocusClient(clientId); setPage("reels"); };
  const logout = async () => { await supabase.auth.signOut(); setPage("dashboard"); };

  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState("");
  const impersonate = async (targetUserId) => {
    if (!targetUserId || targetUserId === currentUser.id) return;
    setImpersonating(true);
    setImpersonateError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, accessToken: session?.access_token }),
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
      { key: "tasks", label: "タスク管理", icon: CheckSquare, roles: ["admin", "editor", "shooter", "designer"] },
      { key: "analytics", label: "分析資料", icon: BarChart3, roles: ["admin", "editor"] },
      { key: "finance", label: "経理管理", icon: Wallet, roles: ["admin"] },
      { key: "users", label: "メンバー管理", icon: UserCog, roles: ["admin"] },
    ];
    return base.filter(i => !currentUser || i.roles.some(r => currentUser.roles.includes(r)));
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
      return <ClientDetail client={openClient} clients={clients} setClients={setClients} reels={reels} currentUser={currentUser} onBack={() => setOpenClientId(null)} onGoReels={goReels} />;
    }
    switch (page) {
      case "dashboard": return <DashboardPage clients={clients} reels={reels} setReels={setReels} users={users} currentUser={currentUser} finance={finance} boardPosts={boardPosts} setBoardPosts={setBoardPosts} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} onGoReels={goReels} />;
      case "clients": return <ClientsPage clients={clients} setClients={setClients} currentUser={currentUser} onOpenClient={setOpenClientId} />;
      case "reels": return <ReelsPage clients={clients} reels={reels} setReels={setReels} users={users} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} currentUser={currentUser} focusClientId={reelsFocusClient} />;
      case "tasks": return <TasksPage clients={clients} reels={reels} users={users} onGoReels={goReels} />;
      case "analytics": return <AnalyticsPage clients={clients} reels={reels} users={users} />;
      case "finance": return currentUser.roles.includes("admin") ? <FinancePage clients={clients} finance={finance} setFinance={setFinance} /> : null;
      case "users": return currentUser.roles.includes("admin") ? <UsersPage users={users} setUsers={setUsers} currentUser={currentUser} /> : null;
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
              <button key={item.key} onClick={() => { setPage(item.key); setOpenClientId(null); if (item.key !== "reels") setReelsFocusClient(null); setNavOpen(false); }}
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
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
