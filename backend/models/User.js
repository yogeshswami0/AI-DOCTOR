import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["doctor", "patient"],
    required: true
  },
  // Doctor specific details
  specialty: {
    type: String,
    default: ""
  },
  experience: {
    type: Number,
    default: 0
  },
  licenseNumber: {
    type: String,
    default: ""
  },
  hospital: {
    type: String,
    default: ""
  },
  // Patient specific details
  age: {
    type: Number,
    default: 0
  },
  gender: {
    type: String,
    default: ""
  },
  bloodGroup: {
    type: String,
    default: ""
  },
  medicalHistory: {
    type: String,
    default: ""
  },
  bpSystolic: {
    type: Number,
    default: 120
  },
  bpDiastolic: {
    type: Number,
    default: 80
  },
  sugar: {
    type: Number,
    default: 90
  }
}, {
  timestamps: true
});

export default mongoose.model("User", UserSchema);
