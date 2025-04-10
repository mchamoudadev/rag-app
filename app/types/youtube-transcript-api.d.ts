declare module 'youtube-transcript-api' {
  interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
  }

  class TranscriptAPI {
    static getTranscript(videoId: string, config?: any): Promise<TranscriptSegment[]>;
  }

  export default TranscriptAPI;
} 