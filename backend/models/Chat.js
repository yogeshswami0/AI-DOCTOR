import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  role: {
    type: String, // "user" or "assistant"
    required: true
  },
  content: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    default: ""
  },
  fileName: {
    type: String,
    default: ""
  },
  fileType: {
    type: String,
    default: ""
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ChatSchema = new mongoose.Schema({
  portal: {
    type: String, // "doctor" or "patient"
    required: true
  },
  sessionId: {
    type: String, // can be a patient ID or a random UUID
    required: true
  },
  messages: [ChatMessageSchema]
}, {
  timestamps: true
});

// Compound index to quickly find chats by portal and sessionId
ChatSchema.index({ portal: 1, sessionId: 1 }, { unique: true });

export default mongoose.model("Chat", ChatSchema);
