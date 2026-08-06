import { formatInTimeZone } from "date-fns-tz";

/**
 * 解析后端时间（ISO UTC/带时区），统一按北京时间展示
 * 注意：new Date(iso) 已解析为绝对时刻,展示用 formatInTimeZone 强制 Asia/Shanghai,
 * 禁止再手动 ±8h(会造成双重转换)
 */
export function parseBeijing(iso: string): Date {
  return new Date(iso);
}

/** 图表 X 轴刻度：只显示 HH:mm（北京时间） */
export function formatBeijingTime(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return formatInTimeZone(bj, "Asia/Shanghai", "HH:mm");
}

/** Hover Tooltip：完整北京时间 YYYY-MM-DD HH:mm */
export function formatBeijingFull(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return formatInTimeZone(bj, "Asia/Shanghai", "yyyy-MM-dd HH:mm");
}

/** 表格/列表里的相对时间（北京时间） */
export function formatBeijingDateTime(iso: string): string {
  const bj = parseBeijing(iso);
  if (isNaN(bj.getTime())) return iso;
  return formatInTimeZone(bj, "Asia/Shanghai", "MM-dd HH:mm:ss");
}

/** 今日日期（北京时间）显示用 */
export function todayBeijing(): { date: string; time: string } {
  const now = new Date();
  return {
    date: formatInTimeZone(now, "Asia/Shanghai", "yyyy-MM-dd"),
    time: formatInTimeZone(now, "Asia/Shanghai", "HH:mm:ss"),
  };
}