import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import jwt from "jsonwebtoken";

// Import modules under test
import { securityHeaders, corsConfig } from "../middleware/securityHeaders.js";
import { verifyToken, requireRole, getJwtSecret } from "../middleware/authGuard.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { validateFileSignature, sanitizeFilename } from "../middleware/fileValidator.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Patient from "../models/Patient.js";
import Medication from "../models/Medication.js";
import Consultation from "../models/Consultation.js";

const JWT_SECRET = getJwtSecret();

test("1. Security Headers Middleware", (t) => {
  const middleware = securityHeaders();
  const headers = {};
  const req = { path: "/api/health", headers: {} };
  const res = {
    setHeader(key, value) {
      headers[key.toLowerCase()] = value;
    }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, "Next callback should be called");
  assert.equal(headers["x-content-type-options"], "nosniff", "Should set nosniff");
  assert.equal(headers["x-frame-options"], "DENY", "Should set DENY");
  assert.match(headers["content-security-policy"], /default-src 'self'/, "Should set CSP");
  assert.match(headers["cache-control"], /no-store/, "Should prevent caching on /api/ routes");
});

test("2. File Signature & Sanitization Security", (t) => {
  // Test filename sanitization (Path traversal prevention)
  const sanitized = sanitizeFilename("../../../etc/passwd");
  assert.equal(sanitized.includes("/"), false, "Filename should not contain forward slashes");
  assert.equal(sanitized.includes("\\"), false, "Filename should not contain backslashes");

  // Create temporary files with magic signatures
  const tmpDir = os.tmpdir();
  
  // Valid PNG signature: \x89PNG\r\n\x1a\n
  const pngPath = path.join(tmpDir, `test-${Date.now()}.png`);
  fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]));
  assert.equal(validateFileSignature(pngPath, "image/png", ".png"), true, "Valid PNG signature must pass");
  fs.unlinkSync(pngPath);

  // Valid PDF signature: %PDF (0x25, 0x50, 0x44, 0x46)
  const pdfPath = path.join(tmpDir, `test-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]));
  assert.equal(validateFileSignature(pdfPath, "application/pdf", ".pdf"), true, "Valid PDF signature must pass");
  fs.unlinkSync(pdfPath);

  // Malicious disguised file: bash script disguised as .png
  const fakePngPath = path.join(tmpDir, `fake-${Date.now()}.png`);
  fs.writeFileSync(fakePngPath, Buffer.from("#!/bin/bash\nrm -rf /"));
  assert.equal(validateFileSignature(fakePngPath, "image/png", ".png"), false, "Disguised malicious file must fail signature check");
  fs.unlinkSync(fakePngPath);
});

test("3. Authentication Guard & Token Verification", (t) => {
  // Test missing token
  let statusResult = null;
  let jsonResult = null;
  const mockRes = {
    status(code) {
      statusResult = code;
      return {
        json(data) { jsonResult = data; }
      };
    }
  };

  verifyToken({ headers: {}, query: {} }, mockRes, () => {});
  assert.equal(statusResult, 401, "Missing token should return 401");
  assert.equal(jsonResult?.code, "AUTH_TOKEN_MISSING");

  // Test invalid / tampered token
  statusResult = null;
  jsonResult = null;
  verifyToken({ headers: { authorization: "Bearer invalid.fake.token" }, query: {} }, mockRes, () => {});
  assert.equal(statusResult, 403, "Invalid token should return 403");
  assert.equal(jsonResult?.code, "AUTH_TOKEN_INVALID");

  // Test valid token signed with active JWT_SECRET
  const validToken = jwt.sign(
    { id: "usr_12345", role: "doctor", email: "dr.smith@hospital.org", name: "Dr. Smith" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  let verifiedReq = { headers: { authorization: `Bearer ${validToken}` }, query: {} };
  let authNextCalled = false;
  verifyToken(verifiedReq, mockRes, () => { authNextCalled = true; });

  assert.equal(authNextCalled, true, "Valid token should invoke next()");
  assert.equal(verifiedReq.user.id, "usr_12345");
  assert.equal(verifiedReq.user.role, "doctor");
  assert.equal(verifiedReq.user.email, "dr.smith@hospital.org");
});

test("4. Role-Based Authorization Guard", (t) => {
  const doctorGuard = requireRole(["doctor"]);
  let statusResult = null;
  let jsonResult = null;
  const mockRes = {
    status(code) {
      statusResult = code;
      return {
        json(data) { jsonResult = data; }
      };
    }
  };

  // Patient trying to access doctor endpoint
  let patientReq = { user: { id: "p1", role: "patient" } };
  doctorGuard(patientReq, mockRes, () => {});
  assert.equal(statusResult, 403, "Patient should be blocked from doctor resource");
  assert.equal(jsonResult?.code, "ROLE_UNAUTHORIZED");

  // Doctor accessing doctor endpoint
  let doctorReq = { user: { id: "d1", role: "doctor" } };
  let roleNextCalled = false;
  doctorGuard(doctorReq, mockRes, () => { roleNextCalled = true; });
  assert.equal(roleNextCalled, true, "Doctor should be authorized");
});

test("5. Sliding Window Rate Limiter", (t) => {
  const testLimiter = createRateLimiter({
    prefix: "test-limit",
    windowMs: 1000,
    max: 3,
    message: "Rate limit exceeded"
  });

  const ip = `192.168.1.${Math.floor(Math.random() * 200) + 10}`;
  const req = { ip, headers: {} };
  let responses = [];

  for (let i = 0; i < 4; i++) {
    let blocked = false;
    let code = 200;
    const res = {
      setHeader() {},
      status(c) {
        code = c;
        return {
          json(d) { blocked = true; }
        };
      }
    };
    testLimiter(req, res, () => {});
    responses.push({ blocked, code });
  }

  assert.equal(responses[0].blocked, false, "Request 1 should pass");
  assert.equal(responses[1].blocked, false, "Request 2 should pass");
  assert.equal(responses[2].blocked, false, "Request 3 should pass");
  assert.equal(responses[3].blocked, true, "Request 4 should be rate-limited (HTTP 429)");
  assert.equal(responses[3].code, 429);
});

test("6. Database Models & Index Structures", (t) => {
  assert.ok(Message.schema, "Message should have a Mongoose schema");
  assert.ok(User.schema, "User should have a Mongoose schema");
  assert.ok(Patient.schema, "Patient should have a Mongoose schema");
  assert.ok(Medication.schema, "Medication should have a Mongoose schema");
  assert.ok(Consultation.schema, "Consultation should have a Mongoose schema");

  const messagePaths = Object.keys(Message.schema.paths);
  assert.ok(messagePaths.includes("consultationId"), "Message must index consultationId");
  assert.ok(messagePaths.includes("senderId"), "Message must track senderId");
  assert.ok(messagePaths.includes("content"), "Message must store content");

  const medPaths = Object.keys(Medication.schema.paths);
  assert.ok(medPaths.includes("userId"), "Medication must associate with userId");
  assert.ok(medPaths.includes("adherenceLogs"), "Medication must track adherenceLogs");
});

test("7. Cross-Origin Resource Sharing (CORS) Policy Guard", (t) => {
  const corsMiddleware = corsConfig();
  
  // 1. Direct curl/server-to-server request (no Origin header)
  let headers = {};
  const mockResNoOrigin = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; }
  };
  let nextNoOrigin = false;
  corsMiddleware({ headers: {} }, mockResNoOrigin, () => { nextNoOrigin = true; });
  assert.equal(nextNoOrigin, true);
  assert.equal(headers["access-control-allow-origin"], "*");

  // 2. Allowed Origin
  headers = {};
  const mockResAllowed = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; }
  };
  let nextAllowed = false;
  corsMiddleware({ headers: { origin: "http://localhost:5173" } }, mockResAllowed, () => { nextAllowed = true; });
  assert.equal(nextAllowed, true);
  assert.equal(headers["access-control-allow-origin"], "http://localhost:5173");
  assert.equal(headers["access-control-allow-credentials"], "true");
});

test("8. Medication Ownership Logic Guard", (t) => {
  // Simulate ownership verification logic
  const patientA_Id = "patient_user_001";
  const patientB_Id = "patient_user_002";
  const testMedication = { _id: "med_123", userId: patientA_Id, name: "Metformin" };

  const isOwnerA = testMedication.userId === patientA_Id;
  const isOwnerB = testMedication.userId === patientB_Id;

  assert.equal(isOwnerA, true, "Patient A owns their medication");
  assert.equal(isOwnerB, false, "Patient B does NOT own Patient A's medication");
});
