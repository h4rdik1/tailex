/**
 * Zip-bomb protection for DOCX (docs/SECURITY.md T1). A DOCX is a ZIP archive; a tiny ZIP can
 * claim to unpack into gigabytes. Before handing the file to mammoth, we read the ZIP's
 * "central directory" (its table of contents, at the end of the file) and add up the
 * uncompressed sizes it declares. Too big, too many files, or a ZIP64 archive → rejected.
 *
 * ZIP layout used here (APPNOTE.TXT):
 * - End of central directory (EOCD): signature 0x06054b50, within the last 64 KiB + 22 bytes.
 *   Offset 10: total entries (2 bytes). Offset 16: central directory start (4 bytes).
 * - Each central directory entry: signature 0x02014b50. Offset 24: uncompressed size (4 bytes).
 *   Offsets 28/30/32: lengths of file name, extra field, comment. Fixed part is 46 bytes.
 */
export const DOCX_LIMITS = {
  maxUncompressedBytes: 10 * 1024 * 1024,
  maxEntries: 500,
} as const;

const EOCD_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_MARKER = 0xffffffff;

export type ZipCheck = { ok: true } | { ok: false; reason: string };

export function checkZipLimits(file: Buffer): ZipCheck {
  const eocd = findEndOfCentralDirectory(file);
  if (eocd === -1) return { ok: false, reason: 'not a readable ZIP' };

  const entryCount = file.readUInt16LE(eocd + 10);
  if (entryCount > DOCX_LIMITS.maxEntries) return { ok: false, reason: 'too many files' };

  let offset = file.readUInt32LE(eocd + 16);
  let total = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > file.length || file.readUInt32LE(offset) !== ENTRY_SIGNATURE) {
      return { ok: false, reason: 'damaged ZIP directory' };
    }
    const size = file.readUInt32LE(offset + 24);
    if (size === ZIP64_MARKER) return { ok: false, reason: 'ZIP64 is not supported' };
    total += size;
    if (total > DOCX_LIMITS.maxUncompressedBytes) return { ok: false, reason: 'unpacks too large' };

    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true };
}

/** Scans backwards from the end, because the EOCD may be followed by a comment. */
function findEndOfCentralDirectory(file: Buffer): number {
  const lowest = Math.max(0, file.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = file.length - EOCD_MIN_SIZE; offset >= lowest; offset -= 1) {
    if (file.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}
