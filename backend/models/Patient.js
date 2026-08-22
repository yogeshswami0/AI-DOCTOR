import mongoose from "mongoose";

const PatientSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: ""
  },
  name: {
    type: String,
    required: true
  },
  age: {
    type: Number,
    required: true
  },
  gender: {
    type: String,
    required: true
  },
  bloodGroup: {
    type: String,
    required: true
  },
  riskBadge: {
    type: String,
    default: "Low Risk"
  },
  riskClass: {
    type: String,
    default: "risk-low"
  },
  vitals: {
    labels: [String],
    bpSystolic: [Number],
    bpDiastolic: [Number],
    sugar: [Number]
  },
  latestVitals: {
    bp: String,
    bpTrend: String,
    bpTrendClass: String,
    sugar: Number,
    sugarTrend: String,
    sugarTrendClass: String
  },
  reportSummary: {
    type: String,
    default: ""
  },
  reports: [
    {
      name: { type: String, required: true },
      diagnosed_conditions: [String],
      prescribed_medications: [
        {
          name: String,
          dosage: String,
          frequency: String,
          duration: String
        }
      ],
      abnormal_lab_markers: [
        {
          test_name: String,
          value: String,
          status: String
        }
      ],
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, {
  timestamps: true
});

export default mongoose.model("Patient", PatientSchema);
