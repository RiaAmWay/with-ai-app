"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/* ================= 型とデータ ================= */

type SubKind = "point" | "question" | "memorize" | "extra";

type SubNote = {
  id: string;
  kind: SubKind;
  html: string;
  createdAt: number;
};

type Note = {
  id: string;
  title: string;
  subject: string;
  html: string;
  base: number; // 全体の文字サイズ(px)
  subs: SubNote[];
  updatedAt: number;
};

const STORAGE_KEY = "study-memo-v1";

const SUB_KINDS: Record<
  SubKind,
  { label: string; icon: string; card: string; chip: string }
> = {
  point: {
    label: "ポイント",
    icon: "💡",
    card: "bg-pink-50 border-pink-200",
    chip: "bg-pink-200 text-pink-800",
  },
  question: {
    label: "疑問",
    icon: "❓",
    card: "bg-rose-50 border-rose-200",
    chip: "bg-rose-200 text-rose-800",
  },
  memorize: {
    label: "暗記",
    icon: "📌",
    card: "bg-fuchsia-50 border-fuchsia-200",
    chip: "bg-fuchsia-200 text-fuchsia-800",
  },
  extra: {
    label: "補足",
    icon: "📝",
    card: "bg-white border-pink-100",
    chip: "bg-pink-100 text-pink-700",
  },
};

const MARKER_COLORS = [
  { key: "yellow", label: "きいろ", color: "#fff17a" },
  { key: "pink", label: "ピンク", color: "#ffb3cf" },
  { key: "green", label: "みどり", color: "#b9f2c8" },
  { key: "blue", label: "みずいろ", color: "#b5e3ff" },
  { key: "purple", label: "むらさき", color: "#dcc7ff" },
] as const;

const FONT_SIZES = [
  { key: "s", label: "小", cls: "text-xs" },
  { key: "m", label: "標準", cls: "text-sm" },
  { key: "l", label: "大", cls: "text-base" },
  { key: "xl", label: "特大", cls: "text-lg font-bold" },
] as const;

const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function sampleNote(): Note {
  return {
    id: uid(),
    title: "はじめてのメモ",
    subject: "使い方",
    base: 16,
    updatedAt: Date.now(),
    html:
      '<span class="fs-xl">学習メモ帳へようこそ</span>\n' +
      '文字を選んでから上のツールバーを押すと、<span class="mk mk-half mk-yellow">マーカー</span>を引いたり、<span class="fs-l">文字の大きさ</span>を変えたりできます。\n' +
      '<span class="mk mk-full mk-pink">暗記モード</span>をオンにすると、マーカー部分が隠れて赤シートのように使えます。\n' +
      "下の「＋ メモを追加」から、このメモに付せんメモを付けられます。",
    subs: [
      {
        id: uid(),
        kind: "point",
        createdAt: Date.now(),
        html: "付せんメモにも<b>マーカー</b>や文字サイズが使えます。",
      },
    ],
  };
}

function newNote(): Note {
  return {
    id: uid(),
    title: "",
    subject: "",
    html: "",
    base: 16,
    subs: [],
    updatedAt: Date.now(),
  };
}

function newSub(kind: SubKind): SubNote {
  return { id: uid(), kind, html: "", createdAt: Date.now() };
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Note[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* 読めないときはサンプルから */
  }
  return [sampleNote()];
}

/* ================= 選択範囲の装飾 ================= */

const TMP_FONT = "__memo_tmp__";

function activeEditor(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const node = sel.anchorNode;
  const el = node instanceof Element ? node : node?.parentElement;
  return (el?.closest("[data-editor]") as HTMLElement | null) ?? null;
}

/** 選択範囲を <span class="..."> で包む（同じ種類の古い装飾は内側から外す） */
function wrapSelection(className: string, prefix: string) {
  const editor = activeEditor();
  if (!editor) return;

  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontName", false, TMP_FONT);

  const isSame = (c: string) => c === prefix || c.startsWith(prefix + "-");
  const spans: HTMLSpanElement[] = [];

  editor.querySelectorAll(`font[face="${TMP_FONT}"]`).forEach((font) => {
    // 内側の同じ種類の装飾を取り除く
    font.querySelectorAll("span").forEach((inner) => {
      const kept = [...inner.classList].filter((c) => !isSame(c));
      if (kept.length === inner.classList.length) return;
      if (kept.length === 0) inner.replaceWith(...inner.childNodes);
      else inner.className = kept.join(" ");
    });
    const span = document.createElement("span");
    span.className = className;
    span.append(...font.childNodes);
    font.replaceWith(span);
    spans.push(span);
  });

  // 選択範囲を復元
  if (spans.length > 0) {
    const range = document.createRange();
    range.setStartBefore(spans[0]);
    range.setEndAfter(spans[spans.length - 1]);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function runCommand(cmd: string, value?: string) {
  const editor = activeEditor();
  if (!editor) return;
  document.execCommand(cmd, false, value);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearFormat() {
  const editor = activeEditor();
  const sel = window.getSelection();
  if (!editor || !sel) return;
  document.execCommand("insertText", false, sel.toString());
}

/* ================= 編集エリア ================= */

function RichEditor({
  html,
  onChange,
  placeholder,
  className = "",
}: {
  html: string;
  onChange: (html: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [initial] = useState(html);

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = initial;
  }, [initial]);

  return (
    <div
      ref={ref}
      data-editor
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`memo-editor ${className}`}
      onInput={(e) => {
        const el = e.currentTarget;
        // 空になったら placeholder を出すために中身を掃除
        if (el.innerText.trim() === "" && !el.querySelector("img")) {
          el.innerHTML = "";
        }
        onChange(el.innerHTML);
      }}
      onPaste={(e) => {
        // 貼り付けは文字だけにする
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

/* ================= ツールバー ================= */

function ToolButton({
  children,
  onClick,
  title,
  active = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      // mousedown で preventDefault して選択範囲を保つ
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-8 min-w-8 rounded-full px-2.5 text-sm transition ${
        active
          ? "bg-pink-500 text-white shadow"
          : "bg-white text-pink-700 hover:bg-pink-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Toolbar({
  base,
  setBase,
  markStyle,
  setMarkStyle,
  lined,
  setLined,
  hideMarks,
  setHideMarks,
}: {
  base: number;
  setBase: (n: number) => void;
  markStyle: "half" | "full";
  setMarkStyle: (s: "half" | "full") => void;
  lined: boolean;
  setLined: (b: boolean) => void;
  hideMarks: boolean;
  setHideMarks: (b: boolean) => void;
}) {
  const group =
    "flex flex-wrap items-center gap-1.5 rounded-2xl bg-pink-50/80 px-2.5 py-1.5";
  const label = "mr-1 text-xs font-bold text-pink-500";

  return (
    <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-3xl border border-pink-200 bg-white/90 p-2 shadow-sm backdrop-blur">
      {/* マーカー */}
      <div className={group}>
        <span className={label}>🖍 マーカー</span>
        {MARKER_COLORS.map((m) => (
          <button
            key={m.key}
            type="button"
            title={`${m.label}のマーカー`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              wrapSelection(`mk mk-${markStyle} mk-${m.key}`, "mk")
            }
            className="h-7 w-7 rounded-full border-2 border-white shadow ring-1 ring-pink-200 transition hover:scale-110"
            style={{ background: m.color }}
          />
        ))}
        <div className="ml-1 flex overflow-hidden rounded-full ring-1 ring-pink-200">
          {(["half", "full"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMarkStyle(s)}
              className={`px-2.5 py-1 text-xs ${
                markStyle === s
                  ? "bg-pink-500 text-white"
                  : "bg-white text-pink-600"
              }`}
            >
              {s === "half" ? "下線風" : "ぬり"}
            </button>
          ))}
        </div>
        <ToolButton
          title="マーカーを消す"
          onClick={() => wrapSelection("mk mk-none", "mk")}
        >
          消す
        </ToolButton>
      </div>

      {/* 文字の大きさ */}
      <div className={group}>
        <span className={label}>🔠 文字</span>
        {FONT_SIZES.map((f) => (
          <ToolButton
            key={f.key}
            title={`選んだ文字を「${f.label}」に`}
            onClick={() => wrapSelection(`fs-${f.key}`, "fs")}
            className={f.cls}
          >
            {f.label}
          </ToolButton>
        ))}
        <ToolButton title="太字" onClick={() => runCommand("bold")}>
          <b>B</b>
        </ToolButton>
        <ToolButton title="書式をクリア" onClick={clearFormat}>
          ✕書式
        </ToolButton>
      </div>

      {/* 全体の大きさ・表示 */}
      <div className={group}>
        <span className={label}>👀 全体</span>
        <ToolButton
          title="全体の文字を小さく"
          onClick={() => setBase(Math.max(12, base - 1))}
        >
          A−
        </ToolButton>
        <span className="w-10 text-center text-xs tabular-nums text-pink-700">
          {base}px
        </span>
        <ToolButton
          title="全体の文字を大きく"
          onClick={() => setBase(Math.min(28, base + 1))}
        >
          A＋
        </ToolButton>
        <ToolButton
          title="ノートの罫線"
          active={lined}
          onClick={() => setLined(!lined)}
        >
          罫線
        </ToolButton>
        <ToolButton
          title="マーカー部分を隠す（カーソルを乗せると見える）"
          active={hideMarks}
          onClick={() => setHideMarks(!hideMarks)}
        >
          🙈 暗記モード
        </ToolButton>
      </div>
    </div>
  );
}

/* ================= 本体 ================= */

export default function MemoApp() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [currentId, setCurrentId] = useState<string>(() => notes[0].id);
  const [query, setQuery] = useState("");
  const [markStyle, setMarkStyle] = useState<"half" | "full">("half");
  const [lined, setLined] = useState(true);
  const [hideMarks, setHideMarks] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const current = notes.find((n) => n.id === currentId) ?? notes[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      /* 容量オーバーなどは無視 */
    }
  }, [notes]);

  const updateNote = (patch: Partial<Note>) =>
    setNotes((prev) =>
      prev.map((n) =>
        n.id === current.id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      ),
    );

  const updateSub = (subId: string, patch: Partial<SubNote>) =>
    setNotes((prev) =>
      prev.map((n) =>
        n.id === current.id
          ? {
              ...n,
              updatedAt: Date.now(),
              subs: n.subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
            }
          : n,
      ),
    );

  const addSub = (kind: SubKind) => {
    updateNote({
      subs: [
        ...current.subs,
        newSub(kind),
      ],
    });
    setAddMenuOpen(false);
  };

  const deleteSub = (subId: string) => {
    if (!confirm("この追加メモを削除しますか？")) return;
    updateNote({ subs: current.subs.filter((s) => s.id !== subId) });
  };

  const createNote = () => {
    const n = newNote();
    setNotes((prev) => [n, ...prev]);
    setCurrentId(n.id);
  };

  const deleteNote = () => {
    if (!confirm(`「${current.title || "無題のメモ"}」を削除しますか？`))
      return;
    const rest = notes.filter((n) => n.id !== current.id);
    const next = rest.length > 0 ? rest : [newNote()];
    setNotes(next);
    setCurrentId(next[0].id);
  };

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((n) => {
        if (!q) return true;
        const text = (n.title + n.subject + n.html).toLowerCase();
        return text.includes(q);
      });
  }, [notes, query]);

  const fmt = (t: number) =>
    new Date(t).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* ---------- サイドバー ---------- */}
      <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-pink-200 bg-white/60 p-4 backdrop-blur md:h-screen md:w-72 md:border-r md:border-b-0">
        <h1 className="flex items-center gap-2 text-xl font-bold text-pink-600">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-pink-500 text-white shadow">
            ✎
          </span>
          学習メモ帳
        </h1>

        <button
          type="button"
          onClick={createNote}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-400 py-2.5 font-bold text-white shadow-md transition hover:brightness-105 active:scale-[0.98]"
        >
          ＋ 新しいメモ
        </button>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 メモをさがす"
          className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm outline-none placeholder:text-pink-300 focus:ring-2 focus:ring-pink-300"
        />

        <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto md:max-h-none md:flex-1">
          {visibleNotes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setCurrentId(n.id)}
                className={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                  n.id === current.id
                    ? "border-pink-400 bg-pink-100 shadow-sm"
                    : "border-transparent bg-white hover:border-pink-200"
                }`}
              >
                <div className="truncate font-bold text-pink-900">
                  {n.title || "無題のメモ"}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-pink-400">
                  {n.subject && (
                    <span className="rounded-full bg-pink-200 px-2 py-0.5 text-pink-700">
                      {n.subject}
                    </span>
                  )}
                  {n.subs.length > 0 && <span>📎 {n.subs.length}</span>}
                  <span className="ml-auto">{fmt(n.updatedAt)}</span>
                </div>
              </button>
            </li>
          ))}
          {visibleNotes.length === 0 && (
            <li className="py-6 text-center text-sm text-pink-300">
              見つかりませんでした
            </li>
          )}
        </ul>
      </aside>

      {/* ---------- メイン ---------- */}
      <main
        className={`flex-1 overflow-y-auto p-4 md:h-screen md:p-8 ${
          hideMarks ? "hide-marks" : ""
        }`}
        style={{ "--memo-base": `${current.base}px` } as CSSProperties}
      >
        <div key={current.id} className="mx-auto flex max-w-4xl flex-col gap-4">
          {/* タイトル */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={current.subject}
              onChange={(e) => updateNote({ subject: e.target.value })}
              placeholder="科目"
              className="w-28 rounded-full bg-pink-200 px-4 py-1.5 text-sm font-bold text-pink-800 outline-none placeholder:text-pink-500/60 focus:ring-2 focus:ring-pink-400"
            />
            <input
              value={current.title}
              onChange={(e) => updateNote({ title: e.target.value })}
              placeholder="タイトルを入力"
              className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-pink-900 outline-none placeholder:text-pink-300"
            />
            <button
              type="button"
              onClick={deleteNote}
              className="rounded-full px-3 py-1.5 text-sm text-pink-400 transition hover:bg-pink-100 hover:text-pink-600"
            >
              🗑 削除
            </button>
          </div>

          <Toolbar
            base={current.base}
            setBase={(base) => updateNote({ base })}
            markStyle={markStyle}
            setMarkStyle={setMarkStyle}
            lined={lined}
            setLined={setLined}
            hideMarks={hideMarks}
            setHideMarks={setHideMarks}
          />

          {/* メインのメモ */}
          <section className="rounded-3xl border border-pink-200 bg-white p-5 shadow-[0_6px_24px_-12px_rgba(236,72,153,0.35)] md:p-7">
            <RichEditor
              html={current.html}
              onChange={(html) => updateNote({ html })}
              placeholder="ここに学習内容を書こう…"
              className={`min-h-[40vh] text-pink-950 ${lined ? "lined" : ""}`}
            />
          </section>

          {/* 追加メモ */}
          <section className="flex flex-col gap-3 pb-10">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-pink-600">
                📎 追加メモ
                <span className="ml-2 text-sm font-normal text-pink-400">
                  {current.subs.length}件
                </span>
              </h2>
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((o) => !o)}
                  className="rounded-full border-2 border-dashed border-pink-300 bg-white px-4 py-1.5 text-sm font-bold text-pink-500 transition hover:border-pink-500 hover:bg-pink-50"
                >
                  ＋ メモを追加
                </button>
                {addMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 flex w-40 flex-col overflow-hidden rounded-2xl border border-pink-200 bg-white shadow-lg">
                    {(Object.keys(SUB_KINDS) as SubKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => addSub(k)}
                        className="px-4 py-2 text-left text-sm text-pink-800 hover:bg-pink-50"
                      >
                        {SUB_KINDS[k].icon} {SUB_KINDS[k].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {current.subs.length === 0 ? (
              <p className="rounded-3xl border-2 border-dashed border-pink-200 py-8 text-center text-sm text-pink-300">
                ポイントや疑問を、付せんのように追加できます
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {current.subs.map((s) => {
                  const k = SUB_KINDS[s.kind];
                  return (
                    <div
                      key={s.id}
                      className={`group relative rounded-3xl border p-4 shadow-sm ${k.card}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <select
                          value={s.kind}
                          onChange={(e) =>
                            updateSub(s.id, { kind: e.target.value as SubKind })
                          }
                          className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-bold outline-none ${k.chip}`}
                        >
                          {(Object.keys(SUB_KINDS) as SubKind[]).map((kk) => (
                            <option key={kk} value={kk}>
                              {SUB_KINDS[kk].icon} {SUB_KINDS[kk].label}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-pink-300">
                          {fmt(s.createdAt)}
                        </span>
                        <button
                          type="button"
                          title="削除"
                          onClick={() => deleteSub(s.id)}
                          className="ml-auto grid h-6 w-6 place-items-center rounded-full text-pink-300 transition hover:bg-pink-200 hover:text-pink-600"
                        >
                          ×
                        </button>
                      </div>
                      <RichEditor
                        html={s.html}
                        onChange={(html) => updateSub(s.id, { html })}
                        placeholder={`${k.label}を書く…`}
                        className="min-h-16 text-pink-950"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
