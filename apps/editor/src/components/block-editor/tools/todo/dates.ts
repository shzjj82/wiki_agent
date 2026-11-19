import { appLocale } from "@/i18n";
import type { TodoStatus } from "./model";

export const DAY = 86_400_000;

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function utcDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function isoFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month - 1, 1);
  const cursor = new Date(year, month - 1, 1 - first.getDay());
  const last = new Date(year, month, 0);
  const weeks: Date[][] = [];
  while (cursor <= last) {
    const week: Date[] = [];
    for (let index = 0; index < 7; index += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export type GanttSegment = {
  name: string;
  status: TodoStatus;
  overdue: boolean;
  startCol: number;
  endCol: number;
  from: boolean;
  to: boolean;
};

export function packGantt(segments: GanttSegment[]): { segment: GanttSegment; lane: number }[] {
  const sorted = [...segments].sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
  const laneEnds: number[] = [];
  return sorted.map((segment) => {
    let lane = laneEnds.findIndex((end) => end < segment.startCol);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(segment.endCol);
    } else {
      laneEnds[lane] = segment.endCol;
    }
    return { segment, lane };
  });
}

export function formatPretty(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const thisYear = Number(todayIso().slice(0, 4));
  if (appLocale() === "zh") {
    return year === thisYear ? `${month}月${day}日` : `${year}年${month}月${day}日`;
  }
  return year === thisYear ? `${month}/${day}` : `${year}/${month}/${day}`;
}
