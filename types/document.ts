export interface Thumbnail {
  default: string;
  medium: string;
  high: string;
  standard: string;
  maxres: string;
}

export interface Document {
  _id: string;
  fileName: string;
  fileUrl: string;
  uploadDate: string;
  pineconeId: string;
  userId: string;
  type?: 'youtube' | 'pdf';
  
  // YouTube specific fields
  videoId?: string;
  duration?: number;
  channelTitle?: string;
  publishedAt?: string;
  tags?: string[];
  categoryId?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  hasTranscript?: boolean;
  thumbnail?: Thumbnail;
} 