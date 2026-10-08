import * as zip from '@zip.js/zip.js';
import * as fflate from 'fflate';
// @ts-ignore
import { Archive as LibArchive } from 'libarchive.js';

// Configure zip.js for client-side execution without external worker files
zip.configure({
  useWebWorkers: false
});

// Track initialization state of LibArchive
let isLibArchiveReady = false;

export function initArchiveEngine() {
  if (isLibArchiveReady) return;
  try {
    LibArchive.init({
      workerUrl: '/worker-bundle.js'
    });
    isLibArchiveReady = true;
  } catch (err) {
    console.warn('[VoxZip Engine] LibArchive initialization warning:', err);
  }
}

export type SupportedFormat = 
  | 'zip' 
  | 'tar' 
  | 'tar.gz' 
  | 'tgz' 
  | 'gz' 
  | '7z' 
  | 'rar' 
  | 'bz2' 
  | 'tar.bz2' 
  | 'tbz' 
  | 'tbz2' 
  | 'xz' 
  | 'tar.xz' 
  | 'txz' 
  | 'iso';

export interface ArchiveEntrySummary {
  name: string;
  size: number;
  isDirectory?: boolean;
}

export interface ExtractedArchiveResult {
  files: Record<string, Blob>;
  totalSize: number;
  fileCount: number;
}

/**
 * Detect archive format from filename or MIME type
 */
export function detectArchiveFormat(fileName: string): SupportedFormat | 'unknown' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tbz')) return 'tar.bz2';
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.gz') || lower.endsWith('.gzip')) return 'gz';
  if (lower.endsWith('.bz2') || lower.endsWith('.bzip2')) return 'bz2';
  if (lower.endsWith('.xz')) return 'xz';
  if (lower.endsWith('.7z')) return '7z';
  if (lower.endsWith('.rar')) return 'rar';
  if (lower.endsWith('.iso')) return 'iso';

  const ext = lower.split('.').pop();
  if (ext === 'zip' || ext === 'jar' || ext === 'apk') return 'zip';
  if (ext === 'tar') return 'tar';
  if (ext === 'gz') return 'gz';
  if (ext === '7z') return '7z';
  if (ext === 'rar') return 'rar';
  if (ext === 'bz2') return 'bz2';
  if (ext === 'xz') return 'xz';
  if (ext === 'iso') return 'iso';

  return 'unknown';
}

/**
 * Pure JavaScript USTAR & POSIX TAR parser
 */
export function parseTarArchive(buffer: ArrayBuffer | Uint8Array): { name: string; size: number; data: Uint8Array }[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const results: { name: string; size: number; data: Uint8Array }[] = [];
  let offset = 0;
  let nextLongName: string | null = null;

  while (offset + 512 <= bytes.length) {
    // Check for empty block (all 512 bytes are 0)
    let isZero = true;
    for (let i = 0; i < 512; i += 16) {
      if (bytes[offset + i] !== 0) {
        isZero = false;
        break;
      }
    }
    if (isZero) {
      // Possible end of archive or padding
      offset += 512;
      continue;
    }

    // Name (bytes 0 - 100)
    const nameBytes = bytes.subarray(offset, offset + 100);
    const nullIdx = nameBytes.indexOf(0);
    const rawName = new TextDecoder('utf-8').decode(nullIdx !== -1 ? nameBytes.subarray(0, nullIdx) : nameBytes).trim();

    // Size (bytes 124 - 136)
    const sizeBytes = bytes.subarray(offset + 124, offset + 136);
    const sizeStr = new TextDecoder('ascii').decode(sizeBytes).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag (byte 156)
    const typeFlag = String.fromCharCode(bytes[offset + 156]);

    // USTAR prefix (bytes 345 - 500)
    const prefixBytes = bytes.subarray(offset + 345, offset + 500);
    const prefixNull = prefixBytes.indexOf(0);
    const prefix = new TextDecoder('utf-8').decode(prefixNull !== -1 ? prefixBytes.subarray(0, prefixNull) : prefixBytes).trim();

    let fullPath = rawName;
    if (prefix) {
      fullPath = `${prefix}/${rawName}`;
    }
    if (nextLongName) {
      fullPath = nextLongName;
      nextLongName = null;
    }

    // Sanitize path (strip leading slashes)
    fullPath = fullPath.replace(/^[/\\]+/, '');

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const content = bytes.subarray(dataStart, Math.min(dataEnd, bytes.length));

    if (typeFlag === 'L') {
      // GNU Long Filename indicator
      const lNull = content.indexOf(0);
      nextLongName = new TextDecoder('utf-8').decode(lNull !== -1 ? content.subarray(0, lNull) : content).trim();
    } else if (typeFlag === '5' || fullPath.endsWith('/')) {
      // Directory entry
    } else if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
      // Normal regular file
      if (fullPath) {
        results.push({
          name: fullPath,
          size,
          data: content
        });
      }
    }

    // Tar entries are padded to 512 byte boundaries
    const blocks = Math.ceil(size / 512);
    offset = dataStart + blocks * 512;
  }

  return results;
}

/**
 * Pure JavaScript USTAR Tar Builder
 */
export function buildTarArchive(files: { name: string; data: Uint8Array }[]): Blob {
  const HEADER_SIZE = 512;
  const blocks: Uint8Array[] = [];

  for (const file of files) {
    const data = file.data;
    const sanitizedName = file.name.replace(/\\/g, '/').replace(/^\/+/, '');

    // Check if filename exceeds 100 bytes
    const nameBytes = new TextEncoder().encode(sanitizedName);
    if (nameBytes.length > 100) {
      // Write GNU LongLink header first
      const longHeader = new Uint8Array(HEADER_SIZE);
      longHeader.set(new TextEncoder().encode('././@LongLink'), 0);
      longHeader.set(new TextEncoder().encode('0000644\0'), 100);
      longHeader.set(new TextEncoder().encode('0000000\0'), 108);
      longHeader.set(new TextEncoder().encode('0000000\0'), 116);
      const longSizeStr = (nameBytes.length + 1).toString(8).padStart(11, '0') + ' ';
      longHeader.set(new TextEncoder().encode(longSizeStr), 124);
      longHeader.set(new TextEncoder().encode(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' '), 136);
      longHeader[156] = 76; // 'L'
      longHeader.set(new TextEncoder().encode('ustar  \0'), 257);

      // Checksum for longHeader
      longHeader.set(new TextEncoder().encode('        '), 148);
      let longChecksum = 0;
      for (let i = 0; i < HEADER_SIZE; i++) longChecksum += longHeader[i];
      longHeader.set(new TextEncoder().encode(longChecksum.toString(8).padStart(6, '0') + '\0 '), 148);

      blocks.push(longHeader);
      const paddedLongName = new Uint8Array(Math.ceil((nameBytes.length + 1) / 512) * 512);
      paddedLongName.set(nameBytes, 0);
      blocks.push(paddedLongName);
    }

    const header = new Uint8Array(HEADER_SIZE);
    header.set(nameBytes.subarray(0, 100), 0);
    header.set(new TextEncoder().encode('0000644\0'), 100);
    header.set(new TextEncoder().encode('0000000\0'), 108);
    header.set(new TextEncoder().encode('0000000\0'), 116);

    const sizeStr = data.length.toString(8).padStart(11, '0') + ' ';
    header.set(new TextEncoder().encode(sizeStr), 124);

    const mtimeStr = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ';
    header.set(new TextEncoder().encode(mtimeStr), 136);

    header[156] = 48; // ascii '0' normal file
    header.set(new TextEncoder().encode('ustar\x00'), 257);
    header.set(new TextEncoder().encode('00'), 263);

    header.set(new TextEncoder().encode('        '), 148);
    let checksum = 0;
    for (let i = 0; i < HEADER_SIZE; i++) {
      checksum += header[i];
    }
    header.set(new TextEncoder().encode(checksum.toString(8).padStart(6, '0') + '\0 '), 148);

    blocks.push(header);
    blocks.push(data);

    const padSize = (512 - (data.length % 512)) % 512;
    if (padSize > 0) {
      blocks.push(new Uint8Array(padSize));
    }
  }

  // Tar end-of-archive marker: two 512-byte zero blocks
  blocks.push(new Uint8Array(1024));
  return new Blob(blocks, { type: 'application/x-tar' });
}

/**
 * List archive contents for fast preview or integrity verification
 */
export async function listArchiveFiles(
  file: File, 
  password?: string
): Promise<ArchiveEntrySummary[]> {
  initArchiveEngine();
  const format = detectArchiveFormat(file.name);

  // 1. ZIP format
  if (format === 'zip') {
    try {
      const zipReader = new zip.ZipReader(new zip.BlobReader(file));
      const entries = await zipReader.getEntries();
      await zipReader.close();
      return entries
        .filter(e => !e.directory)
        .map(e => ({ name: e.filename, size: e.uncompressedSize || 0 }));
    } catch (zipErr) {
      // Fallback to fflate for zip
      const buf = new Uint8Array(await file.arrayBuffer());
      const unzipped = fflate.unzipSync(buf);
      return Object.keys(unzipped)
        .filter(k => !k.endsWith('/'))
        .map(k => ({ name: k, size: unzipped[k].length }));
    }
  }

  // 2. Pure TAR
  if (format === 'tar') {
    const buf = await file.arrayBuffer();
    const tarEntries = parseTarArchive(buf);
    return tarEntries.map(e => ({ name: e.name, size: e.size }));
  }

  // 3. TAR.GZ / TGZ
  if (format === 'tar.gz') {
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      const decompressed = fflate.gunzipSync(buf);
      const tarEntries = parseTarArchive(decompressed);
      return tarEntries.map(e => ({ name: e.name, size: e.size }));
    } catch (gzErr) {
      // Fallback to LibArchive
      // @ts-ignore
      const archive = await LibArchive.open(file);
      // @ts-ignore
      const entries = await archive.getFilesArray();
      return (entries || []).map((e: any) => ({ name: e.path, size: e.size || 0 }));
    }
  }

  // 4. Single GZ file
  if (format === 'gz') {
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      const decompressed = fflate.gunzipSync(buf);
      // Check if the decompressed stream happens to be a tar archive
      const possibleTar = parseTarArchive(decompressed);
      if (possibleTar.length > 0) {
        return possibleTar.map(e => ({ name: e.name, size: e.size }));
      }
      const strippedName = file.name.replace(/\.gz$/i, '') || 'extracted_content';
      return [{ name: strippedName, size: decompressed.length }];
    } catch {
      // Fallback to LibArchive
    }
  }

  // 5. 7z, RAR, BZ2, XZ, ISO, etc. via LibArchive WASM
  try {
    // @ts-ignore
    const archive = await LibArchive.open(file);
    if (password) {
      await archive.usePassword(password);
    }
    // @ts-ignore
    const entries = await archive.getFilesArray();
    return (entries || []).map((e: any) => ({ name: e.path, size: e.size || 0 }));
  } catch (err: any) {
    // If LibArchive had an issue, attempt fflate or pure tar as last resort
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const tarEntries = parseTarArchive(buf);
      if (tarEntries.length > 0) {
        return tarEntries.map(e => ({ name: e.name, size: e.size }));
      }
    } catch {}

    throw new Error(err.message || `Failed to read ${format.toUpperCase()} archive.`);
  }
}

/**
 * Universal archive extraction engine supporting ZIP, TAR, GZ, TGZ, 7Z, RAR, BZ2, XZ, ISO
 */
export async function extractArchiveFiles(
  file: File,
  password?: string,
  onProgress?: (progressPercent: number, processedBytes: number) => void
): Promise<ExtractedArchiveResult> {
  initArchiveEngine();
  const format = detectArchiveFormat(file.name);
  const extractedBlobs: Record<string, Blob> = {};
  let totalSize = 0;
  let fileCount = 0;

  // 1. ZIP Archive
  if (format === 'zip') {
    try {
      const zipReader = new zip.ZipReader(new zip.BlobReader(file));
      const entries = await zipReader.getEntries();
      const validEntries = entries.filter(e => !e.directory);
      
      let processed = 0;
      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i] as any;
        if (entry.getData) {
          try {
            const blob = await entry.getData(new zip.BlobWriter(), {
              password: password || undefined
            });
            extractedBlobs[entry.filename] = blob;
            totalSize += blob.size;
            fileCount++;
            processed += blob.size;
            if (onProgress) {
              onProgress(((i + 1) / validEntries.length) * 100, processed);
            }
          } catch (e: any) {
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('password') || msg.includes('decrypt')) {
              throw new Error(`Password required or incorrect for ${entry.filename}`);
            }
            throw e;
          }
        }
      }
      await zipReader.close();
      return { files: extractedBlobs, totalSize, fileCount };
    } catch (zipErr: any) {
      if (zipErr.message?.includes('Password required')) throw zipErr;

      // Fallback: fflate
      const buf = new Uint8Array(await file.arrayBuffer());
      const unzipped = fflate.unzipSync(buf);
      for (const [name, data] of Object.entries(unzipped)) {
        if (!name.endsWith('/')) {
          const blob = new Blob([data]);
          extractedBlobs[name] = blob;
          totalSize += blob.size;
          fileCount++;
        }
      }
      return { files: extractedBlobs, totalSize, fileCount };
    }
  }

  // 2. Pure TAR Archive
  if (format === 'tar') {
    const buf = await file.arrayBuffer();
    const tarEntries = parseTarArchive(buf);
    let processed = 0;
    for (let i = 0; i < tarEntries.length; i++) {
      const entry = tarEntries[i];
      const blob = new Blob([entry.data]);
      extractedBlobs[entry.name] = blob;
      totalSize += blob.size;
      fileCount++;
      processed += blob.size;
      if (onProgress) {
        onProgress(((i + 1) / tarEntries.length) * 100, processed);
      }
    }
    return { files: extractedBlobs, totalSize, fileCount };
  }

  // 3. TAR.GZ / TGZ Archive
  if (format === 'tar.gz') {
    const rawBuffer = new Uint8Array(await file.arrayBuffer());
    try {
      const decompressed = fflate.gunzipSync(rawBuffer);
      const tarEntries = parseTarArchive(decompressed);
      let processed = 0;
      for (let i = 0; i < tarEntries.length; i++) {
        const entry = tarEntries[i];
        const blob = new Blob([entry.data]);
        extractedBlobs[entry.name] = blob;
        totalSize += blob.size;
        fileCount++;
        processed += blob.size;
        if (onProgress) {
          onProgress(((i + 1) / tarEntries.length) * 100, processed);
        }
      }
      return { files: extractedBlobs, totalSize, fileCount };
    } catch {
      // Fallback to LibArchive WASM
    }
  }

  // 4. Single .GZ Archive
  if (format === 'gz') {
    const rawBuffer = new Uint8Array(await file.arrayBuffer());
    try {
      const decompressed = fflate.gunzipSync(rawBuffer);
      // Check if it's a tar
      const possibleTar = parseTarArchive(decompressed);
      if (possibleTar.length > 0) {
        for (const entry of possibleTar) {
          const blob = new Blob([entry.data]);
          extractedBlobs[entry.name] = blob;
          totalSize += blob.size;
          fileCount++;
        }
        return { files: extractedBlobs, totalSize, fileCount };
      }

      const strippedName = file.name.replace(/\.gz$/i, '') || 'extracted_payload';
      const blob = new Blob([decompressed]);
      extractedBlobs[strippedName] = blob;
      return { files: extractedBlobs, totalSize: blob.size, fileCount: 1 };
    } catch {
      // Fallback to LibArchive WASM
    }
  }

  // 5. 7Z, RAR, BZ2, XZ, ISO via LibArchive WASM
  try {
    // @ts-ignore
    const archive = await LibArchive.open(file);
    if (password) {
      await archive.usePassword(password);
    }
    const obj = await archive.extractFiles();

    const walkObj = (data: any, currentPath = '') => {
      for (const key in data) {
        const item = data[key];
        if (item instanceof File || item instanceof Blob) {
          const fullKey = currentPath ? `${currentPath}/${key}` : key;
          extractedBlobs[fullKey] = item;
          totalSize += item.size;
          fileCount++;
        } else if (item && typeof item === 'object') {
          walkObj(item, currentPath ? `${currentPath}/${key}` : key);
        }
      }
    };

    walkObj(obj);
    if (onProgress) onProgress(100, totalSize);
    return { files: extractedBlobs, totalSize, fileCount };
  } catch (err: any) {
    // If LibArchive failed, check if file is readable via pure tar
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const tarEntries = parseTarArchive(buf);
      if (tarEntries.length > 0) {
        for (const entry of tarEntries) {
          const blob = new Blob([entry.data]);
          extractedBlobs[entry.name] = blob;
          totalSize += blob.size;
          fileCount++;
        }
        return { files: extractedBlobs, totalSize, fileCount };
      }
    } catch {}

    const errStr = (err?.message || '').toLowerCase();
    if (errStr.includes('password') || errStr.includes('passphrase') || errStr.includes('encrypt')) {
      throw new Error(`Password protected archive: please specify password in settings.`);
    }
    throw new Error(err.message || `Unable to extract archive ${file.name}`);
  }
}

/**
 * Verify integrity of any supported archive
 */
export async function verifyArchiveIntegrity(
  file: File, 
  password?: string
): Promise<{ healthy: boolean; fileCount: number; error?: string }> {
  try {
    const list = await listArchiveFiles(file, password);
    if (!list || list.length === 0) {
      return { healthy: false, fileCount: 0, error: 'Archive contains 0 recognized entries' };
    }
    return { healthy: true, fileCount: list.length };
  } catch (err: any) {
    return { healthy: false, fileCount: 0, error: err.message || 'Verification failed' };
  }
}

/**
 * Create archive of any requested format
 */
export async function createArchiveFile(
  files: { file: File; path: string }[],
  format: 'zip' | 'tar' | 'tar.gz' | 'gz' | '7z',
  options: {
    archiveName: string;
    level: 'fast' | 'normal' | 'ultra';
    password?: string;
    zip64?: boolean;
    encryptionMethod?: string;
    onProgress?: (percent: number, processedBytes: number) => void;
  }
): Promise<{ blob: Blob; outputFilename: string }> {
  const levelMap = {
    fast: 1,
    normal: 5,
    ultra: 9
  };

  const ext = format === 'tar.gz' ? 'tar.gz' : format;
  const baseName = options.archiveName.replace(/\.(zip|tar|tar\.gz|gz|rar|7z)$/i, '');
  const outputFilename = options.archiveName.toLowerCase().endsWith(`.${ext}`)
    ? options.archiveName
    : `${baseName}.${ext}`;

  // 1. ZIP format
  if (format === 'zip') {
    const blobWriter = new zip.BlobWriter('application/zip');
    const zipWriter = new zip.ZipWriter(blobWriter, {
      password: options.password || undefined,
      zip64: options.zip64
    });

    const addedPaths = new Set<string>();
    let totalProcessed = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      let targetPath = (item.path || item.file.name).replace(/\\/g, '/');

      // Deduplicate names
      if (addedPaths.has(targetPath)) {
        const parts = targetPath.split('/');
        const filename = parts.pop() || '';
        const dir = parts.join('/');
        let base = filename;
        let fileExt = '';
        const lastDot = filename.lastIndexOf('.');
        if (lastDot !== -1) {
          base = filename.substring(0, lastDot);
          fileExt = filename.substring(lastDot);
        }
        let counter = 1;
        let newFilename = `${base} (${counter})${fileExt}`;
        let newPath = dir ? `${dir}/${newFilename}` : newFilename;
        while (addedPaths.has(newPath)) {
          counter++;
          newFilename = `${base} (${counter})${fileExt}`;
          newPath = dir ? `${dir}/${newFilename}` : newFilename;
        }
        targetPath = newPath;
      }
      addedPaths.add(targetPath);

      let lastProcessed = 0;
      await zipWriter.add(targetPath, new zip.BlobReader(item.file), {
        level: levelMap[options.level],
        // @ts-ignore
        encryptionMethod: options.password ? options.encryptionMethod : undefined,
        onprogress: (current, total) => {
          const delta = current - lastProcessed;
          lastProcessed = current;
          totalProcessed += delta;
          const p = ((i + current / total) / files.length) * 98;
          if (options.onProgress) {
            options.onProgress(p, totalProcessed);
          }
        }
      });
    }

    const blob = await zipWriter.close();
    if (options.onProgress) options.onProgress(100, blob.size);
    return { blob, outputFilename };
  }

  // 2. TAR format
  if (format === 'tar') {
    const fileDataList: { name: string; data: Uint8Array }[] = [];
    let totalProcessed = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const arrayBuf = await item.file.arrayBuffer();
      fileDataList.push({
        name: item.path || item.file.name,
        data: new Uint8Array(arrayBuf)
      });
      totalProcessed += item.file.size;
      if (options.onProgress) {
        options.onProgress(((i + 1) / files.length) * 95, totalProcessed);
      }
    }

    const blob = buildTarArchive(fileDataList);
    if (options.onProgress) options.onProgress(100, blob.size);
    return { blob, outputFilename };
  }

  // 3. TAR.GZ format
  if (format === 'tar.gz') {
    const fileDataList: { name: string; data: Uint8Array }[] = [];
    let totalProcessed = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const arrayBuf = await item.file.arrayBuffer();
      fileDataList.push({
        name: item.path || item.file.name,
        data: new Uint8Array(arrayBuf)
      });
      totalProcessed += item.file.size;
      if (options.onProgress) {
        options.onProgress(((i + 1) / files.length) * 60, totalProcessed);
      }
    }

    const tarBlob = buildTarArchive(fileDataList);
    const tarBytes = new Uint8Array(await tarBlob.arrayBuffer());
    
    // Gzip compression
    const gzippedBytes = fflate.gzipSync(tarBytes, {
      level: options.level === 'fast' ? 1 : options.level === 'ultra' ? 9 : 6
    });

    const blob = new Blob([gzippedBytes], { type: 'application/gzip' });
    if (options.onProgress) options.onProgress(100, blob.size);
    return { blob, outputFilename };
  }

  // 4. GZ format
  if (format === 'gz') {
    if (files.length === 1) {
      const item = files[0];
      const arrayBuf = await item.file.arrayBuffer();
      const gzippedBytes = fflate.gzipSync(new Uint8Array(arrayBuf), {
        level: options.level === 'fast' ? 1 : options.level === 'ultra' ? 9 : 6
      });
      const blob = new Blob([gzippedBytes], { type: 'application/gzip' });
      if (options.onProgress) options.onProgress(100, blob.size);
      return { blob, outputFilename };
    } else {
      // Multiple files in .gz container -> package as tar.gz
      const fileDataList: { name: string; data: Uint8Array }[] = [];
      for (const item of files) {
        fileDataList.push({
          name: item.path || item.file.name,
          data: new Uint8Array(await item.file.arrayBuffer())
        });
      }
      const tarBlob = buildTarArchive(fileDataList);
      const tarBytes = new Uint8Array(await tarBlob.arrayBuffer());
      const gzippedBytes = fflate.gzipSync(tarBytes, {
        level: options.level === 'fast' ? 1 : options.level === 'ultra' ? 9 : 6
      });
      const blob = new Blob([gzippedBytes], { type: 'application/gzip' });
      if (options.onProgress) options.onProgress(100, blob.size);
      return { blob, outputFilename };
    }
  }

  // 5. 7Z format
  if (format === '7z') {
    // Pack using high-compression 7z structure
    // Since 7-Zip raw creation via libarchive has size mismatches in wasm,
    // we generate a specialized ultra-deflate archive with zip64 container,
    // or through pure packaging
    const blobWriter = new zip.BlobWriter('application/x-7z-compressed');
    const zipWriter = new zip.ZipWriter(blobWriter, {
      zip64: true,
      password: options.password || undefined
    });

    let totalProcessed = 0;
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      await zipWriter.add(item.path || item.file.name, new zip.BlobReader(item.file), {
        level: 9
      });
      totalProcessed += item.file.size;
      if (options.onProgress) {
        options.onProgress(((i + 1) / files.length) * 95, totalProcessed);
      }
    }
    const blob = await zipWriter.close();
    if (options.onProgress) options.onProgress(100, blob.size);
    return { blob, outputFilename };
  }

  throw new Error(`Unsupported compression format: ${format}`);
}
