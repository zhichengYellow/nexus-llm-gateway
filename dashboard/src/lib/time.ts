import { format, addHours } from "date-fns";

/**
 * 解析后端时间（ISO UTC），强制转换为北京时间（东八区）
 * 不依赖浏览器时区，直接 +8h 后取 UTC 字段
 */
export function parseBeijing(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return d;
  // UTC 时间加 8 小时 = 北京时间
  return addHours(d, 8);
}

/** 图表 X 轴刻度：只显示 HH:mm（北京时间） */
export function formatBeijingTime(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return format(bj, "HH:mm");
}

/** Hover Tooltip：完整北京时间 YYYY-MM-DD HH:mm */
export function formatBeijingFull(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return format(bj, "yyyy-MM-dd HH:mm");
}

/** 表格/列表里的相对时间（北京时间） */
export function formatBeijingDateTime(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return format(bj, "MM-dd HH:mm:ss");
}

/** 今日日期（北京时间）显示用 */
export function todayBeijing(): { date: string; time: string } {
  const now = new Date();
  const bj = addHours(now, 8);
  return {
    date: format(bj, "yyyy-MM-dd"),
    time: format(bj, "HH:mm:ss"),
  };
}