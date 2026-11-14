import mongoose from "mongoose";

const AdherenceLogSchema = new mongoose.Schema({
  date: {
    type: String, // format YYYY-MM-DD
    required: true
  },
  time: {
    type: String, // HH:MM
    required: true
  },
  status: {
    type: String,
    enum: ["taken", "missed"],
    required: true
  },
  loggedAt: {
    type: Date,
    default: Date.now
  }
});

const MedicationSchema = new mongoose.Schema({
  userId: {
    type: String, // Stores user ID (compatible with MongoDB ObjectId or local JSON fallback)
    required: true
  },
  name: {
    type: String,
    required: true
  },
  dosage: {
    type: String, // e.g., "1 pill", "5ml"
    required: true
  },
  frequency: {
    type: String, // "daily", "weekly", "twice-daily", "thrice-daily"
    required: true
  },
  time: {
    type: String, // e.g. "08:00" or comma-separated "08:00,20:00"
    required: true
  },
  startDate: {
    type: String, // format YYYY-MM-DD
    required: true
  },
  endDate: {
    type: String, // format YYYY-MM-DD
    default: ""
  },
  isActive: {
    type: Boolean,
    default: true
  },
  adherenceLogs: [AdherenceLogSchema]
}, {
  timestamps: true
});

MedicationSchema.index({ userId: 1 });
MedicationSchema.index({ userId: 1, isActive: 1 });
MedicationSchema.index({ createdAt: -1 });

export default mongoose.model("Medication", MedicationSchema);
