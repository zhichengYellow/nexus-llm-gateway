"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-7xl font-bold text-zinc-800 mb-4 tracking-tight">404</div>
        <h1 className="text-xl font-bold text-zinc-200 mb-2">页面未找到</h1>
        <p className="text-zinc-500 text-sm mb-6">你访问的页面不存在，请检查地址是否正确</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}