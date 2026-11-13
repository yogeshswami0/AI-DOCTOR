import path from "path";
import { fileURLToPath } from "url";
import { createWorker } from "tesseract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tessdataPath = path.join(__dirname, "..", "data", "tessdata");

/**
 * 1. LOCAL OCR ENGINE (Tesseract.js)
 * Recognizes text from image buffers completely offline without external APIs.
 */
export async function performLocalOCR(imageBuffer) {
  let worker = null;
  try {
    worker = await createWorker("eng", 1, {
      langPath: tessdataPath,
      gzip: false
    });

    const result = await worker.recognize(imageBuffer);
    const text = result?.data?.text || "";
    await worker.terminate();
    return text.trim();
  } catch (err) {
    if (worker) {
      try { await worker.terminate(); } catch (e) {}
    }
    console.warn("[Local OCR Warning] Tesseract execution notice:", err.message);
    throw new Error(`Local OCR processing failed: ${err.message}`);
  }
}

/**
 * 2. CLINICAL CONDITIONS KNOWLEDGE BASE
 */
const MEDICAL_CONDITIONS_DB = [
  { name: "Diabetes Mellitus Type 2", aliases: ["type 2 diabetes", "t2dm", "diabetes mellitus type ii", "dm type 2", "non-insulin dependent diabetes", "t2d", "diabetes mellitus"] },
  { name: "Diabetes Mellitus Type 1", aliases: ["type 1 diabetes", "t1dm", "diabetes mellitus type i", "insulin dependent diabetes", "juvenile diabetes"] },
  { name: "Prediabetes / Impaired Fasting Glucose", aliases: ["prediabetes", "pre-diabetes", "impaired glucose tolerance", "borderline diabetes"] },
  { name: "Essential Hypertension", aliases: ["essential hypertension", "hypertension", "htn", "high blood pressure", "elevated blood pressure", "stage 1 hypertension", "stage 2 hypertension"] },
  { name: "Coronary Artery Disease (CAD)", aliases: ["coronary artery disease", "cad", "ischemic heart disease", "angina", "myocardial ischemia"] },
  { name: "Bronchial Asthma", aliases: ["asthma", "bronchial asthma", "allergic asthma", "reactive airway disease"] },
  { name: "Chronic Obstructive Pulmonary Disease (COPD)", aliases: ["copd", "chronic bronchitis", "emphysema"] },
  { name: "Pneumonia / Lower Respiratory Infection", aliases: ["pneumonia", "bronchopneumonia", "pulmonary consolidation"] },
  { name: "Upper Respiratory Tract Infection (URTI)", aliases: ["urti", "rhinopharyngitis", "acute nasopharyngitis", "common cold", "acute bronchitis"] },
  { name: "Allergic Rhinitis / Sinusitis", aliases: ["allergic rhinitis", "sinusitis", "rhinosinusitis", "nasal allergy"] },
  { name: "Hypothyroidism", aliases: ["hypothyroidism", "underactive thyroid", "hashimoto", "elevated tsh"] },
  { name: "Hyperthyroidism", aliases: ["hyperthyroidism", "overactive thyroid", "graves disease", "thyrotoxicosis"] },
  { name: "Dyslipidemia / Hypercholesterolemia", aliases: ["dyslipidemia", "hyperlipidemia", "hypercholesterolemia", "elevated cholesterol", "high triglycerides"] },
  { name: "Gastroesophageal Reflux Disease (GERD)", aliases: ["gerd", "acid reflux", "reflux esophagitis", "heartburn"] },
  { name: "Gastritis / Peptic Ulcer Disease", aliases: ["gastritis", "peptic ulcer", "gastric ulcer", "duodenal ulcer", "hyperacidity"] },
  { name: "Non-Alcoholic Fatty Liver Disease (NAFLD)", aliases: ["fatty liver", "nafld", "hepatic steatosis"] },
  { name: "Chronic Kidney Disease (CKD)", aliases: ["ckd", "chronic renal disease", "renal impairment", "elevated creatinine"] },
  { name: "Nephrolithiasis (Kidney Stones)", aliases: ["kidney stones", "renal calculi", "nephrolithiasis", "renal stone"] },
  { name: "Urinary Tract Infection (UTI)", aliases: ["uti", "urinary tract infection", "cystitis", "pyelonephritis"] },
  { name: "Osteoarthritis", aliases: ["osteoarthritis", "oa knee", "degenerative joint disease", "joint arthrosis"] },
  { name: "Rheumatoid Arthritis", aliases: ["rheumatoid arthritis", "ra", "inflammatory polyarthritis"] },
  { name: "Osteoporosis / Osteopenia", aliases: ["osteoporosis", "osteopenia", "low bone density"] },
  { name: "Migraine / Tension Headache", aliases: ["migraine", "tension headache", "chronic headache", "vascular headache"] },
  { name: "Iron Deficiency Anemia", aliases: ["iron deficiency anemia", "anemia", "anaemia", "low hemoglobin", "microcytic anemia"] },
  { name: "Vitamin D Deficiency", aliases: ["vitamin d deficiency", "hypovitaminosis d", "insufficient vitamin d"] },
  { name: "Vitamin B12 Deficiency", aliases: ["vitamin b12 deficiency", "b12 deficiency", "cyanocobalamin deficiency"] },
  { name: "Viral Fever / Influenza", aliases: ["viral fever", "influenza", "flu", "pyrexia", "acute febrile illness"] },
  { name: "Dengue Fever", aliases: ["dengue", "dengue fever", "ns1 positive"] },
  { name: "Malaria", aliases: ["malaria", "plasmodium vivax", "plasmodium falciparum"] },
  { name: "Typhoid / Enteric Fever", aliases: ["typhoid", "enteric fever", "salmonella typhi", "widal positive"] }
];

/**
 * 3. COMMON MEDICATIONS DICTIONARY
 */
const COMMON_MEDICATIONS = [
  "Metformin", "Glimepiride", "Gliclazide", "Sitagliptin", "Vildagliptin", "Empagliflozin", "Dapagliflozin", "Insulin",
  "Lisinopril", "Enalapril", "Ramipril", "Amlodipine", "Telmisartan", "Losartan", "Olmesartan", "Valsartan",
  "Atorvastatin", "Rosuvastatin", "Simvastatin", "Fenofibrate",
  "Omeprazole", "Pantoprazole", "Rabeprazole", "Esomeprazole", "Ranitidine", "Famotidine", "Sucralfate",
  "Amoxicillin", "Augmentin", "Azithromycin", "Ciprofloxacin", "Levofloxacin", "Ofloxacin", "Cefixime", "Ceftriaxone", "Doxycycline",
  "Paracetamol", "Acetaminophen", "Ibuprofen", "Diclofenac", "Naproxen", "Aceclofenac", "Tramadol",
  "Cetirizine", "Levocetirizine", "Montelukast", "Fexofenadine", "Bilastine",
  "Salbutamol", "Levosalbutamol", "Budesonide", "Formoterol", "Fluticasone", "Ipratropium",
  "Thyroxine", "Levothyroxine",
  "Metoprolol", "Atenolol", "Bisoprolol", "Carvedilol", "Nebivolol",
  "Clopidogrel", "Aspirin", "Ecosprin", "Warfarin", "Apixaban", "Rivaroxaban",
  "Multivitamin", "Calcium", "Vitamin D3", "Cholecalciferol", "Folic Acid", "Iron", "B-Complex", "Methylcobalamin"
];

/**
 * 4. LAB MARKERS REGISTRY WITH EXCLUSIONS & REFERENCE RANGES
 */
const LAB_MARKERS_REGISTRY = [
  {
    name: "HbA1c (Glycated Hemoglobin)",
    patterns: [/\bhba1c\b|\bglycated\s+hemoglobin\b|\bglycosylated\s+hemoglobin\b/i],
    unit: "%",
    isAbnormal: (val) => {
      if (val >= 6.5) return { status: "High", message: "Diabetic Range" };
      if (val >= 5.7) return { status: "High", message: "Prediabetic Range" };
      return null;
    }
  },
  {
    name: "Fasting Blood Sugar (Glucose)",
    patterns: [/fasting\s+(?:blood\s+)?(?:sugar|glucose)|\bfbs\b|\bfbg\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val > 125) return { status: "High", message: "Elevated Fasting Glucose" };
      if (val < 70) return { status: "Low", message: "Hypoglycemia" };
      if (val >= 100) return { status: "Borderline", message: "Impaired Fasting Glucose" };
      return null;
    }
  },
  {
    name: "Postprandial Blood Sugar (PPBS)",
    patterns: [/post[\s-]*prandial\s+(?:blood\s+)?(?:sugar|glucose)|\bppbs\b|\bppbg\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val >= 140) return { status: "High", message: "Elevated Postprandial Glucose" };
      return null;
    }
  },
  {
    name: "Random Blood Sugar (RBS)",
    patterns: [/random\s+(?:blood\s+)?(?:sugar|glucose)|\brbs\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val >= 180) return { status: "High", message: "Elevated Random Glucose" };
      return null;
    }
  },
  {
    name: "Total Cholesterol",
    patterns: [/total\s+cholesterol|cholesterol\s+total/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val >= 200) return { status: "High", message: "Hypercholesterolemia" };
      return null;
    }
  },
  {
    name: "Triglycerides",
    patterns: [/triglycerides|serum\s+triglycerides/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val >= 150) return { status: "High", message: "Elevated Triglycerides" };
      return null;
    }
  },
  {
    name: "LDL Cholesterol",
    patterns: [/ldl[\s-]*cholesterol|ldl\s+chol\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val >= 100) return { status: "High", message: "Elevated LDL" };
      return null;
    }
  },
  {
    name: "HDL Cholesterol",
    patterns: [/hdl[\s-]*cholesterol|hdl\s+chol\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val < 40) return { status: "Low", message: "Suboptimal HDL" };
      return null;
    }
  },
  {
    name: "Serum Creatinine",
    patterns: [/serum\s+creatinine|s\.?\s*creatinine|\bcreatinine\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val > 1.2) return { status: "High", message: "Elevated (Renal strain)" };
      return null;
    }
  },
  {
    name: "Blood Urea Nitrogen (BUN)",
    patterns: [/blood\s+urea\s+nitrogen|\bbun\b|serum\s+urea|\burea\b/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val > 25) return { status: "High", message: "Elevated Urea" };
      return null;
    }
  },
  {
    name: "Hemoglobin (Hb)",
    // Note: negative lookahead to prevent matching HbA1c
    patterns: [/(?:^|[^a-zA-Z])(?:hemoglobin|haemoglobin|\bhb\b)(?!\s*a1c)/i],
    excludeLineRegex: /hba1c|glycated|glycosylated/i,
    unit: "g/dL",
    isAbnormal: (val) => {
      if (val < 12.0) return { status: "Low", message: "Anemia indicator" };
      return null;
    }
  },
  {
    name: "Total White Blood Cell Count (WBC)",
    patterns: [/total\s+wbc|total\s+leukocyte\s+count|\btlc\b|white\s+blood\s+cells/i],
    unit: "/mcL",
    isAbnormal: (val) => {
      if (val > 11000) return { status: "High", message: "Leukocytosis (Infection/Inflammation)" };
      if (val < 4000) return { status: "Low", message: "Leukopenia" };
      return null;
    }
  },
  {
    name: "Platelet Count",
    patterns: [/platelet\s+count|\bplatelets\b/i],
    unit: "/mcL",
    isAbnormal: (val) => {
      if (val < 150000) return { status: "Low", message: "Thrombocytopenia" };
      return null;
    }
  },
  {
    name: "TSH (Thyroid Stimulating Hormone)",
    patterns: [/\btsh\b|thyroid\s+stimulating\s+hormone/i],
    unit: "mIU/L",
    isAbnormal: (val) => {
      if (val > 4.5) return { status: "High", message: "Hypothyroidism pattern" };
      if (val < 0.4) return { status: "Low", message: "Hyperthyroidism pattern" };
      return null;
    }
  },
  {
    name: "Serum Uric Acid",
    patterns: [/serum\s+uric\s+acid|uric\s+acid/i],
    unit: "mg/dL",
    isAbnormal: (val) => {
      if (val > 7.0) return { status: "High", message: "Hyperuricemia" };
      return null;
    }
  },
  {
    name: "SGOT / AST (Liver)",
    patterns: [/\bsgot\b|\bast\b|aspartate\s+aminotransferase/i],
    unit: "U/L",
    isAbnormal: (val) => {
      if (val > 40) return { status: "High", message: "Elevated Liver Enzyme" };
      return null;
    }
  },
  {
    name: "SGPT / ALT (Liver)",
    patterns: [/\bsgpt\b|\balt\b|alanine\s+aminotransferase/i],
    unit: "U/L",
    isAbnormal: (val) => {
      if (val > 45) return { status: "High", message: "Elevated Liver Enzyme" };
      return null;
    }
  }
];

/**
 * 5. STRUCTURED REPORT PARSER ENGINE (Pure Local Rule-Based NLP)
 */
export function extractStructuredReportData(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return {
      diagnosed_conditions: [],
      prescribed_medications: [],
      abnormal_lab_markers: []
    };
  }

  const cleanText = rawText.replace(/\r\n/g, "\n").trim();
  const lowerText = cleanText.toLowerCase();
  const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);

  // A. Extract Diagnosed Conditions
  const diagnosedConditionsSet = new Set();

  // 1. Direct medical condition pattern matching from database
  for (const cond of MEDICAL_CONDITIONS_DB) {
    for (const alias of cond.aliases) {
      const regex = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
      if (regex.test(lowerText)) {
        diagnosedConditionsSet.add(cond.name);
        break;
      }
    }
  }

  // 2. Section based extraction (Diagnosis: / Impression: / Assessment:)
  const diagnosisSectionRegex = /(?:diagnosis|diagnoses|impression|assessment|clinical\s+findings|dx|k\/c\/o|known\s+case\s+of)[:\s-]+([^\n\r]+(?:\n[^\n\r]+){0,3})/gi;
  let diagMatch;
  while ((diagMatch = diagnosisSectionRegex.exec(cleanText)) !== null) {
    const rawSection = diagMatch[1].replace(/^(?:diagnosis|diagnoses|impression|assessment|dx|k\/c\/o|known\s+case\s+of)[:\s/-]+/i, "").trim();
    const items = rawSection.split(/[,;\n•\-\*]/).map(s => s.trim().replace(/^[\s/:–-]+/, '')).filter(s => s.length > 3);
    for (const item of items) {
      if (/rx|treatment|plan|medic|tab|cap|dose|doctor|signature|date|investigation|lab/i.test(item)) break;
      if (item.length < 50 && !/^(male|female|age|years?|dr\.|patient)/i.test(item)) {
        // Only add if not already captured by the database
        const alreadyExists = Array.from(diagnosedConditionsSet).some(c => c.toLowerCase().includes(item.toLowerCase()) || item.toLowerCase().includes(c.toLowerCase()));
        if (!alreadyExists) {
          const formatted = item.charAt(0).toUpperCase() + item.slice(1);
          diagnosedConditionsSet.add(formatted);
        }
      }
    }
  }

  // Fallback if no specific condition was found
  if (diagnosedConditionsSet.size === 0) {
    if (/healthy|normal|unremarkable|within normal limits/i.test(lowerText)) {
      diagnosedConditionsSet.add("Healthy Profile / Within Normal Limits");
    } else {
      diagnosedConditionsSet.add("General Clinical Assessment");
    }
  }

  // B. Extract Prescriptions (Medications)
  const prescribedMedications = [];
  const foundMedNames = new Set();

  const doseRegex = /(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|units|tab|cap|puff|puffs))\b/i;
  const freqRegex = /(once daily|twice daily|thrice daily|once a day|twice a day|thrice a day|every \d+ hours?|at bedtime|morning|night|after meals?|before meals?|with meals?|empty stomach|1-0-1|1-0-0|0-0-1|1-1-1|0-1-0|b\.?i\.?d|t\.?i\.?d|q\.?i\.?d|o\.?d|h\.?s|p\.?r\.?n|s\.?o\.?s)\b/i;
  const durRegex = /(\d+\s*(?:days?|weeks?|months?)|chronic|ongoing|for \d+ days?)/i;

  for (const line of lines) {
    for (const med of COMMON_MEDICATIONS) {
      const medRegex = new RegExp(`\\b${med}\\b`, "i");
      if (medRegex.test(line) && !foundMedNames.has(med.toLowerCase())) {
        foundMedNames.add(med.toLowerCase());

        const doseMatch = line.match(doseRegex);
        const freqMatch = line.match(freqRegex);
        const durMatch = line.match(durRegex);

        let frequency = "Once daily";
        if (freqMatch) {
          const rawFreq = freqMatch[0].toLowerCase();
          if (rawFreq === "1-0-1" || rawFreq.includes("twice") || rawFreq.includes("bid")) frequency = "Twice daily, with meals";
          else if (rawFreq === "1-1-1" || rawFreq.includes("thrice") || rawFreq.includes("tid")) frequency = "Thrice daily, after meals";
          else if (rawFreq === "0-0-1" || rawFreq.includes("bedtime") || rawFreq.includes("hs") || rawFreq.includes("night")) frequency = "Once daily, at bedtime";
          else if (rawFreq.includes("before") || rawFreq.includes("empty")) frequency = "Once daily, on an empty stomach";
          else frequency = rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1);
        }

        prescribedMedications.push({
          name: med,
          dosage: doseMatch ? doseMatch[0].replace(/\s+/g, "") : "Standard clinical dose",
          frequency,
          duration: durMatch ? durMatch[0] : "As clinically advised (15-30 days)"
        });
        break;
      }
    }
  }

  // C. Extract Abnormal Lab Markers
  const abnormalLabMarkers = [];
  const foundLabNames = new Set();

  for (const lab of LAB_MARKERS_REGISTRY) {
    for (const pattern of lab.patterns) {
      for (const line of lines) {
        if (lab.excludeLineRegex && lab.excludeLineRegex.test(line)) continue;
        const match = line.match(pattern);
        if (match && !foundLabNames.has(lab.name)) {
          // Extract text strictly AFTER the matched test name to avoid matching numbers in the name (e.g. '1' in 'HbA1c')
          const testPos = line.indexOf(match[0]);
          const lineRemainder = line.slice(testPos + match[0].length);

          // Find the first numeric value in the remainder of the line
          const numMatch = lineRemainder.match(/(?:[:=–-\s]*)\b(\d+(?:\.\d+)?)\b/);
          if (numMatch) {
            const numVal = parseFloat(numMatch[1]);
            const statusObj = lab.isAbnormal(numVal);

            let status = statusObj?.status || null;
            if (!status) {
              if (/\b(?:high|elevated|\(h\)|\*)\b/i.test(lineRemainder)) status = "High";
              else if (/\b(?:low|decreased|\(l\))\b/i.test(lineRemainder)) status = "Low";
            }

            if (status) {
              foundLabNames.add(lab.name);
              abnormalLabMarkers.push({
                test_name: lab.name,
                value: `${numVal} ${lab.unit}`,
                status: status
              });
              break;
            }
          }
        }
      }
      if (foundLabNames.has(lab.name)) break;
    }
  }

  // Blood Pressure inline parser
  const bpRegex = /(?:bp|blood\s+pressure)[:\s-]+(\d{2,3})\s*[\/|]\s*(\d{2,3})\s*(?:mm\s*hg)?/i;
  const bpMatch = cleanText.match(bpRegex);
  if (bpMatch && !foundLabNames.has("Blood Pressure (BP)")) {
    const sys = parseInt(bpMatch[1]);
    const dia = parseInt(bpMatch[2]);
    let bpStatus = null;
    if (sys >= 140 || dia >= 90) bpStatus = "High (Stage 2 Hypertension)";
    else if (sys >= 130 || dia >= 85) bpStatus = "High (Stage 1 Hypertension)";
    else if (sys < 90 || dia < 60) bpStatus = "Low (Hypotension)";

    if (bpStatus) {
      abnormalLabMarkers.push({
        test_name: "Blood Pressure (BP)",
        value: `${sys}/${dia} mmHg`,
        status: bpStatus.includes("High") ? "High" : "Low"
      });
    }
  }

  return {
    diagnosed_conditions: Array.from(diagnosedConditionsSet),
    prescribed_medications: prescribedMedications,
    abnormal_lab_markers: abnormalLabMarkers
  };
}

/**
 * 6. LOCAL BILINGUAL SUMMARY ENGINE (Zero External APIs)
 */
export function generateLocalBilingualSummary(parsedData) {
  const conditions = parsedData.diagnosed_conditions || [];
  const meds = parsedData.prescribed_medications || [];
  const labs = parsedData.abnormal_lab_markers || [];

  const conditionsEn = conditions.length > 0 ? conditions.join(", ") : "No acute condition identified";
  const medsEn = meds.length > 0 
    ? meds.map(m => `${m.name} (${m.dosage || ""}, ${m.frequency || ""})`).join("; ")
    : "No medications prescribed";
  const labsEn = labs.length > 0
    ? labs.map(l => `${l.test_name} is ${l.status.toLowerCase()} at ${l.value}`).join(", ")
    : "Lab markers are within baseline limits";

  const englishSummary = `--- ENGLISH SUMMARY ---
• Clinical Assessment: The report indicates findings consistent with ${conditionsEn}.
• Abnormal Laboratory Indicators: ${labsEn}.
• Prescribed Medical Plan: ${medsEn}.`;

  const HINDI_DICT = {
    "Diabetes Mellitus Type 2": "टाइप 2 मधुमेह (डायबिटीज)",
    "Diabetes Mellitus Type 1": "टाइप 1 मधुमेह",
    "Essential Hypertension": "उच्च रक्तचाप (हाइपरटेंशन)",
    "Coronary Artery Disease (CAD)": "हृदय धमनी रोग",
    "Bronchial Asthma": "दमा (अस्थमा)",
    "Pneumonia / Lower Respiratory Infection": "निमोनिया (फेफड़ों का संक्रमण)",
    "Upper Respiratory Tract Infection (URTI)": "श्वसन तंत्र संक्रमण (सर्दी/खांसी)",
    "Hypothyroidism": "थायराइड की कमी (हाइपोथायरायडिज्म)",
    "Hyperthyroidism": "हाइपरथायरायडिज्म",
    "Dyslipidemia / Hypercholesterolemia": "उच्च कोलेस्ट्रॉल (डिस्लिपिडेमिया)",
    "Gastroesophageal Reflux Disease (GERD)": "एसिड रिफ्लक्स (गैस/एसिडिटी)",
    "Gastritis / Peptic Ulcer Disease": "पेट में गैस और अल्सर (गैस्ट्राइटिस)",
    "Non-Alcoholic Fatty Liver Disease (NAFLD)": "फैटी लिवर",
    "Iron Deficiency Anemia": "खून की कमी (एनीमिया)",
    "Fasting Blood Sugar (Glucose)": "खाली पेट रक्त शर्करा (फास्टिंग ग्लूकोज)",
    "Postprandial Blood Sugar (PPBS)": "भोजन के बाद रक्त शर्करा",
    "HbA1c (Glycated Hemoglobin)": "एचबीए1सी (3 महीने की शुगर औसत)",
    "Total Cholesterol": "कुल कोलेस्ट्रॉल",
    "Serum Creatinine": "सीरम क्रिएटिनिन (किडनी संकेत)",
    "Blood Pressure (BP)": "रक्तचाप (ब्लड प्रेशर)",
    "High": "बढ़ा हुआ",
    "Low": "कम"
  };

  const translateTerm = (term) => HINDI_DICT[term] || term;

  const conditionsHi = conditions.length > 0 
    ? conditions.map(c => translateTerm(c)).join(", ") 
    : "कोई गंभीर समस्या नहीं पाई गई";
    
  const labsHi = labs.length > 0
    ? labs.map(l => `${translateTerm(l.test_name)} ${translateTerm(l.status)} (${l.value}) है`).join(", ")
    : "सभी परीक्षण रिपोर्ट सामान्य सीमा में हैं";

  const medsHi = meds.length > 0
    ? meds.map(m => `${m.name} (${m.dosage || ""}, ${m.frequency || ""})`).join("; ")
    : "कोई दवा निर्धारित नहीं की गई है";

  const hindiSummary = `--- HINDI SUMMARY (हिंदी सारांश) ---
• नैदानिक मूल्यांकन: रिपोर्ट ${conditionsHi} का संकेत देती है।
• परीक्षण परिणाम: ${labsHi}।
• सुझाई गई दवाएं: ${medsHi}।`;

  return `${englishSummary}\n\n${hindiSummary}`;
}
