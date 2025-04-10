import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  uploadDate: {
    type: Date,
    default: Date.now,
  },
  pineconeId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['pdf', 'youtube'],
    required: true,
  },
  videoId: {
    type: String,
    required: function() { return this.type === 'youtube'; }
  },
  duration: {
    type: Number,
    required: function() { return this.type === 'youtube'; }
  },
  channelTitle: {
    type: String,
    required: function() { return this.type === 'youtube'; }
  },
  publishedAt: {
    type: Date,
    required: function() { return this.type === 'youtube'; }
  },
  thumbnail: {
    default: String,
    medium: String,
    high: String,
    standard: String,
    maxres: String
  },
  tags: [String],
  categoryId: String,
  viewCount: Number,
  likeCount: Number,
  commentCount: Number,
  hasTranscript: {
    type: Boolean,
    default: false
  }
});

export default mongoose.models.Document || mongoose.model('Document', DocumentSchema); 