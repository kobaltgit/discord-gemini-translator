/**
 * scripts/pack.js
 * Zero-dependency Chrome Web Store production package builder.
 * Produces clean, compliant .zip archives directly in dist/ directory.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

// Read manifest for versioning
const manifestRaw = fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestRaw);
const version = manifest.version || "1.0.0";
const zipName = `discord-gemini-translator-v${version}.zip`;
const zipPath = path.join(DIST_DIR, zipName);

// Items to include in the production extension package
const INCLUDE_PATHS = [
  "manifest.json",
  "background",
  "content",
  "popup",
  "icons",
  "_locales",
];

const IGNORE_PATTERNS = [
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
  /\.git/i,
  /\.map$/i,
  /\.log$/i,
];

function collectFiles(baseDir) {
  const fileList = [];

  for (const item of INCLUDE_PATHS) {
    const fullPath = path.join(baseDir, item);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      fileList.push(item);
    } else if (stat.isDirectory()) {
      const walk = (dir, relPrefix) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const entryRel = path.join(relPrefix, entry.name).replace(/\\/g, "/");
          if (IGNORE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;

          const entryFull = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(entryFull, entryRel);
          } else if (entry.isFile()) {
            fileList.push(entryRel);
          }
        }
      };
      walk(fullPath, item);
    }
  }

  return fileList.sort();
}

/**
 * Minimal standard ZIP format writer using native zlib and Buffer.
 */
function createZipArchive(files, baseDir) {
  const localChunks = [];
  const centralChunks = [];
  let currentOffset = 0;

  for (const relPath of files) {
    const fullPath = path.join(baseDir, relPath);
    const fileBuf = fs.readFileSync(fullPath);
    const stat = fs.statSync(fullPath);

    const normPath = relPath.replace(/\\/g, "/");
    const nameBuf = Buffer.from(normPath, "utf8");

    // Standard MS-DOS date/time format
    const mtime = stat.mtime || new Date();
    const dosTime =
      (mtime.getHours() << 11) |
      (mtime.getMinutes() << 5) |
      (Math.floor(mtime.getSeconds() / 2));
    const dosDate =
      ((mtime.getFullYear() - 1980) << 9) |
      ((mtime.getMonth() + 1) << 5) |
      mtime.getDate();

    // Deflate compression
    const compressedBuf = zlib.deflateRawSync(fileBuf, { level: 9 });
    const crc = zlib.crc32 ? zlib.crc32(fileBuf) : 0;
    const isDeflated = compressedBuf.length < fileBuf.length;

    const method = isDeflated ? 8 : 0;
    const finalData = isDeflated ? compressedBuf : fileBuf;
    const compSize = finalData.length;
    const uncompSize = fileBuf.length;

    // Local file header (30 bytes + nameBuf.length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // Bit flag (UTF-8 enabled)
    localHeader.writeUInt16LE(method, 8);     // Compression method
    localHeader.writeUInt16LE(dosTime, 10);   // File mod time
    localHeader.writeUInt16LE(dosDate, 12);   // File mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC32
    localHeader.writeUInt32LE(compSize, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    localChunks.push(localHeader, nameBuf, finalData);

    // Central directory header (46 bytes + nameBuf.length)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // Bit flag (UTF-8)
    centralHeader.writeUInt16LE(method, 10);    // Compression method
    centralHeader.writeUInt16LE(dosTime, 12);   // Mod time
    centralHeader.writeUInt16LE(dosDate, 14);   // Mod date
    centralHeader.writeUInt32LE(crc, 16);       // CRC32
    centralHeader.writeUInt32LE(compSize, 20);  // Compressed size
    centralHeader.writeUInt32LE(uncompSize, 24);// Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // Name length
    centralHeader.writeUInt16LE(0, 30);         // Extra length
    centralHeader.writeUInt16LE(0, 32);         // Comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk start
    centralHeader.writeUInt16LE(0, 36);         // Internal attributes
    centralHeader.writeUInt32LE(0x81a40000, 38);// External attributes (-rw-r--r--)
    centralHeader.writeUInt32LE(currentOffset, 42); // Offset of local header

    centralChunks.push(centralHeader, nameBuf);

    currentOffset += 30 + nameBuf.length + compSize;
  }

  const centralDirOffset = currentOffset;
  const centralDirSize = centralChunks.reduce((acc, c) => acc + c.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // EOCD signature
  eocd.writeUInt16LE(0, 4);                   // Disk number
  eocd.writeUInt16LE(0, 6);                   // Disk with start of CD
  eocd.writeUInt16LE(files.length, 8);        // Number of CD entries on disk
  eocd.writeUInt16LE(files.length, 10);       // Total number of CD entries
  eocd.writeUInt32LE(centralDirSize, 12);      // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);    // Offset of central directory
  eocd.writeUInt16LE(0, 20);                  // Comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

function pack() {
  console.log(`📦 Packaging Chrome Extension: ${manifest.name} v${version}`);

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const files = collectFiles(ROOT_DIR);
  console.log(`\n📄 Included files (${files.length}):`);
  for (const f of files) {
    const size = fs.statSync(path.join(ROOT_DIR, f)).size;
    console.log(`  - ${f} (${(size / 1024).toFixed(1)} KB)`);
  }

  const zipBuffer = createZipArchive(files, ROOT_DIR);
  fs.writeFileSync(zipPath, zipBuffer);

  const zipSizeKb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`\n✅ Production package created successfully:`);
  console.log(`   Path: ${zipPath}`);
  console.log(`   Size: ${zipSizeKb} KB`);
}

pack();
