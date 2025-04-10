import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  messages: [{
    id: String,
    content: String,
    role: {
      type: String,
      enum: ['user', 'assistant']
    },
    timestamp: Number
  }]
}, {
  timestamps: true
});

// Create compound index for faster queries
ChatSchema.index({ documentId: 1, userId: 1 }, { unique: true });

export default mongoose.models.Chat || mongoose.model('Chat', ChatSchema); 