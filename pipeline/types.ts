export type ShowConfig = {
  id: string;
  name: string;
  rssUrl: string;
};

export type EpisodeMetadata = {
  id: string;
  showId: string;
  showName: string;
  title: string;
  pubDate: string;
  declaredDurationSec: number | null;
  audioDurationSec: number;
  link: string | null;
  audioUrl: string;
  audioFile: string;
};

export type EpisodesFile = {
  generatedAt: string;
  episodes: EpisodeMetadata[];
};

export type ChunkMetadata = {
  index: number;
  offsetSec: number;
  durationSec: number;
  overlapBeforeSec: number;
  audioFile: string;
};

export type SpekoTranscriptResult = {
  text: string;
  provider: string | null;
  model: string | null;
  confidence: number | null;
  failoverCount: number | null;
};

export type ChunkTranscript = ChunkMetadata &
  SpekoTranscriptResult & {
    schemaVersion: 1;
    showId: string;
    episodeId: string;
    audioSha256: string;
    transcribedAt: string;
  };
