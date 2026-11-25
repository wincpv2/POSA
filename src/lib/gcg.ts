export type GcgMode = 'auto' | 'live' | 'mock';
export type GcgChannel = 'gx' | 'gy' | 'gz' | 'ax' | 'ay' | 'az';

export type GcgSample = Record<GcgChannel | 't', number | null>;

export type GcgSnapshot = {
  source: 'live' | 'mock' | 'unavailable';
  status: 'connected' | 'offline' | 'backup' | 'demo';
  samples: GcgSample[];
  bpm: number | null;
  sampleRateHz: number | null;
  quality: number | null;
  model: string;
  updatedAt: number;
  error: string | null;
};

export async function getGcgSnapshot(mode: GcgMode, board: string, signal: AbortSignal): Promise<GcgSnapshot> {
  const response = await fetch(`/api/gcg?mode=${mode}&board=${encodeURIComponent(board)}`, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not read GCG data.');
  return payload;
}
