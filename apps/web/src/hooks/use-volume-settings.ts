import { useCallback, useRef, useState } from "react";

export interface PeerAudioSettings {
  volume: number; // 0-200
  muted: boolean;
}

const STORAGE_PREFIX = "voice-control:";
const DEFAULT_SETTINGS: PeerAudioSettings = { volume: 100, muted: false };

function loadFromStorage(peerId: string): PeerAudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + peerId);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: typeof parsed.volume === "number" ? parsed.volume : 100,
        muted: typeof parsed.muted === "boolean" ? parsed.muted : false,
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveToStorage(peerId: string, settings: PeerAudioSettings) {
  localStorage.setItem(STORAGE_PREFIX + peerId, JSON.stringify(settings));
}

export function useVolumeSettings() {
  const [settingsMap, setSettingsMap] = useState<Map<string, PeerAudioSettings>>(new Map());
  const settingsRef = useRef(settingsMap);
  settingsRef.current = settingsMap;

  const getSettings = useCallback(
    (peerId: string): PeerAudioSettings => {
      return settingsMap.get(peerId) ?? loadFromStorage(peerId);
    },
    [settingsMap],
  );

  const setVolume = useCallback((peerId: string, volume: number) => {
    const clamped = Math.max(0, Math.min(200, volume));
    setSettingsMap((prev) => {
      const current = prev.get(peerId) ?? loadFromStorage(peerId);
      const updated = { ...current, volume: clamped };
      saveToStorage(peerId, updated);
      const next = new Map(prev);
      next.set(peerId, updated);
      return next;
    });
  }, []);

  const setMuted = useCallback((peerId: string, muted: boolean) => {
    setSettingsMap((prev) => {
      const current = prev.get(peerId) ?? loadFromStorage(peerId);
      const updated = { ...current, muted };
      saveToStorage(peerId, updated);
      const next = new Map(prev);
      next.set(peerId, updated);
      return next;
    });
  }, []);

  return { getSettings, setVolume, setMuted };
}

export type VolumeSettings = ReturnType<typeof useVolumeSettings>;
