"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">页面出错了</h1>
        <p className="text-gray-500 text-sm mb-4">{error.message || "发生了未知错误"}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          重试
        </button>
      </div>
    </div>
  );
}