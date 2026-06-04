import mongoose from "mongoose";

const ConsultMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ConsultationSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  patientName: {
    type: String,
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  doctorName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "active"],
    default: "pending"
  },
  messages: [ConsultMessageSchema]
}, {
  timestamps: true
});

// A patient and doctor should only have one consultation session
ConsultationSchema.index({ patientId: 1, doctorId: 1 }, { unique: true });

export default mongoose.model("Consultation", ConsultationSchema);
