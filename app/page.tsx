"use client";

import dynamic from "next/dynamic";

// localStorage を使うのでブラウザでのみ描画する
const MemoApp = dynamic(() => import("./components/MemoApp"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-pink-400">
      読み込み中…
    </div>
  ),
});

export default function Home() {
  return <MemoApp />;
}
