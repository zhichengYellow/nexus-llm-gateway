"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl text-gray-200 font-bold mb-4">404</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">页面未找到</h1>
        <p className="text-gray-500 text-sm mb-6">你访问的页面不存在，请检查地址是否正确</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}