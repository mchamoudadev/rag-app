declare module 'youtube-captions-scraper' {
  interface SubtitleSegment {
    text: string;
    start: number;
    dur: number;
  }

  interface GetSubtitlesOptions {
    videoID: string;
    lang?: string;
  }

  export function getSubtitles(options: GetSubtitlesOptions): Promise<SubtitleSegment[]>;
} 