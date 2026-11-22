"use client";

import { useEffect, useState } from "react";
import { readPref, writePref } from "@/components/labels";
import { relTime } from "@/lib/format";
import { usePrintStations } from "@/lib/queries";
import type { PrintStation } from "@/lib/types";

/**
 * 인쇄 노트북 (v11) — 노트북을 등록해 두고 폰에서 그 노트북으로 라벨을 보내요.
 * 노트북의 인쇄 스테이션이 ‘자동 인쇄’를 켜 두면 30초마다 ‘켜져 있어요’를 알려요(last_seen_at).
 */

/** 이 기기가 등록한 인쇄 노트북 id (노트북 쪽) */
export const STATION_KEY = "popo.stationId";
/** 폰에서 라벨을 보낼 노트북 id (보내는 쪽) */
const SEND_KEY = "popo.sendStation";
/** 노트북이 이만큼 안에 알렸으면 ‘켜져 있음’ */
export const STATION_ONLINE_MS = 75_000;
/** 노트북이 ‘켜져 있어요’를 알리는 간격 */
export const STATION_BEAT_MS = 30_000;

export const stationOnline = (s: Pick<PrintStation, "last_seen_at">, now = Date.now()) =>
  Boolean(s.last_seen_at && now - new Date(s.last_seen_at).getTime() < STATION_ONLINE_MS);

/** 보낼 노트북 고르기 — 하나뿐이면 그걸로, 고른 건 이 기기에 기억해요. 등록된 노트북이 없으면 null(아무 노트북이나) */
export function useSendStation(): { stations: PrintStation[]; target: PrintStation | null; setTarget: (id: string) => void } {
  const { data: stations = [] } = usePrintStations();
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 기기에 기억한 값은 화면이 뜬 뒤에만 읽을 수 있어요
    setChosen(readPref(SEND_KEY));
  }, []);
  const target = stations.find((s) => s.id === chosen) ?? (stations.length ? stations[0] : null);
  return {
    stations,
    target,
    setTarget: (id) => {
      setChosen(id);
      writePref(SEND_KEY, id);
    },
  };
}

/** 보낼 노트북 고르기 + 켜져 있는지 */
export function StationPicker({ stations, target, setTarget }: ReturnType<typeof useSendStation>) {
  if (!stations.length) {
    return (
      <p className="text-xs text-ink-faint">
        노트북 인쇄 스테이션에서 ‘이 노트북 등록’을 하면, 여기서 노트북이 켜져 있는지 보고 골라 보낼 수 있어요.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {stations.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {stations.map((s) => (
            <button key={s.id} type="button" className="chip" data-on={target?.id === s.id} onClick={() => setTarget(s.id)}>
              {stationOnline(s) ? "🟢" : "⚪"} {s.name}
            </button>
          ))}
        </div>
      )}
      {target && <StationStatus station={target} />}
    </div>
  );
}

export function StationStatus({ station }: { station: PrintStation }) {
  const on = stationOnline(station);
  return (
    <p className={`rounded-2xl px-3 py-2 text-xs ${on ? "bg-matcha-100 text-matcha-700" : "bg-butter-100 text-butter-700"}`}>
      {on
        ? `🟢 ${station.name} · 자동 인쇄 켜져 있어요. 보내면 바로 나와요`
        : `⚪ ${station.name} · 꺼져 있어요${station.last_seen_at ? ` (마지막 ${relTime(station.last_seen_at)})` : ""}. 보내 두면 노트북에서 인쇄 스테이션을 켤 때 나와요`}
    </p>
  );
}
