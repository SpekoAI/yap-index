import type { ChunkMetadata } from "../types";

export const CHUNK_DURATION_SEC = 230;
export const CHUNK_OVERLAP_SEC = 2;

export function planChunks(
  audioDurationSec: number,
  audioFileForIndex: (index: number) => string,
): ChunkMetadata[] {
  if (!Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
    throw new Error("audio duration must be positive");
  }

  const chunks: ChunkMetadata[] = [];
  const strideSec = CHUNK_DURATION_SEC - CHUNK_OVERLAP_SEC;

  for (let index = 0; ; index += 1) {
    const offsetSec = index * strideSec;
    const overlapBeforeSec = index === 0 ? 0 : CHUNK_OVERLAP_SEC;
    if (index > 0 && offsetSec + overlapBeforeSec >= audioDurationSec) {
      break;
    }

    const durationSec = Math.min(
      CHUNK_DURATION_SEC,
      audioDurationSec - offsetSec,
    );
    chunks.push({
      index,
      offsetSec,
      durationSec,
      overlapBeforeSec,
      audioFile: audioFileForIndex(index),
    });

    if (offsetSec + durationSec >= audioDurationSec) {
      break;
    }
  }

  return chunks;
}
