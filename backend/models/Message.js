import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  consultationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Consultation",
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ""
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
  fileSize: {
    type: String,
    default: ""
  }
}, {
  timestamps: true
});

// Compound index for high-speed chronological message retrieval and pagination
MessageSchema.index({ consultationId: 1, createdAt: 1 });

export default mongoose.model("Message", MessageSchema);
