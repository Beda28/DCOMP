import { Injectable }                from '@nestjs/common';
import type {} from 'multer';
import { createHash, randomUUID }     from 'node:crypto';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { resolve }                   from 'node:path';
import { apiError }                  from '../common/api-error.js';

@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? './uploads');

  inspect(file?: Express.Multer.File) {
    if (!file?.size) throw apiError(400, 'FILE_REQUIRED', '문서 파일을 선택해주세요.');
    const bytes = file.buffer;
    const contentType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : null;
    if (!contentType) throw apiError(415, 'UNSUPPORTED_FILE', 'PNG·JPEG·PDF 파일만 업로드할 수 있습니다.');
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const filename = /^[\x00-\xff]*$/.test(file.originalname) && !decoded.includes('\ufffd') ? decoded : file.originalname;
    const originalFilename = filename.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 255) || 'document';
    return { contentType, originalFilename, sizeBytes: String(file.size), sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  path(key: string): string {
    if (!/^\d+\/[a-f0-9-]{36}$/.test(key)) throw apiError(500, 'STORAGE_ERROR', '문서 저장 경로가 올바르지 않습니다.');
    return resolve(this.root, key);
  }

  async save(organizationId: number, bytes: Buffer): Promise<string> {
    const key = `${organizationId}/${randomUUID()}`;
    await mkdir(resolve(this.root, String(organizationId)), { recursive: true });
    await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o640 });
    return key;
  }

  async remove(key: string): Promise<void> { await unlink(this.path(key)); }

  async stream(key: string) {
    try { return (await open(this.path(key), 'r')).createReadStream(); }
    catch { throw apiError(503, 'FILE_UNAVAILABLE', '원본 파일을 읽을 수 없습니다. 잠시 후 다시 시도해주세요.'); }
  }
}
