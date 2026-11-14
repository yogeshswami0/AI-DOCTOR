import path from "path";
import fs from "fs";

/**
 * Validates file magic bytes (file signature) to prevent malicious files disguised as images/PDFs.
 */
export function validateFileSignature(filePath, mimeType, extension) {
  try {
    if (!fs.existsSync(filePath)) return false;

    // Read first 16 bytes for magic number analysis
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const ext = extension.toLowerCase();

    // 1. JPEG (FF D8 FF)
    if (ext === ".jpg" || ext === ".jpeg") {
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }

    // 2. PNG (89 50 4E 47 0D 0A 1A 0A)
    if (ext === ".png") {
      return (
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4E && buffer[3] === 0x47
      );
    }

    // 3. PDF (%PDF = 25 50 44 46)
    if (ext === ".pdf") {
      return (
        buffer[0] === 0x25 && buffer[1] === 0x50 &&
        buffer[2] === 0x44 && buffer[3] === 0x46
      );
    }

    // 4. WebP / RIFF container (RIFF .... WEBP)
    if (ext === ".webp") {
      const isRiff = buffer.toString("ascii", 0, 4) === "RIFF";
      const isWebp = buffer.toString("ascii", 8, 12) === "WEBP";
      return isRiff && isWebp;
    }

    // 5. Audio WebM / Video WebM (Matroska / EBML = 1A 45 DF A3)
    if (ext === ".webm" || ext === ".mkv") {
      return (
        buffer[0] === 0x1A && buffer[1] === 0x45 &&
        buffer[2] === 0xDF && buffer[3] === 0xA3
      );
    }

    // 6. MP3 (ID3 or Sync word FF FB / FF F3)
    if (ext === ".mp3") {
      const isId3 = buffer.toString("ascii", 0, 3) === "ID3";
      const isSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
      return isId3 || isSync;
    }

    // 7. MP4 / MOV (ftyp container)
    if (ext === ".mp4" || ext === ".mov") {
      const ftyp = buffer.toString("ascii", 4, 8);
      return ftyp === "ftyp";
    }

    // 8. OGG (OggS)
    if (ext === ".ogg" || ext === ".oga") {
      return buffer.toString("ascii", 0, 4) === "OggS";
    }

    // 9. Plain text or common office docs
    if ([".txt", ".csv", ".docx", ".xlsx"].includes(ext)) {
      return true;
    }

    return false;
  } catch (err) {
    console.warn("[File Signature Check Error]:", err.message);
    return false;
  }
}

/**
 * Sanitizes and validates filename to prevent path traversal
 */
export function sanitizeFilename(originalName) {
  const base = path.basename(originalName);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}
