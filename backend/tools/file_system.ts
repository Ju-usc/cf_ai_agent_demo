// Using global Cloudflare Workers types: R2Bucket, R2ObjectBody

export interface VirtualFsOptions {
  author?: string;
  contentType?: string;
  maxRetries?: number;
}

function normalizePath(inputPath: string): string {
  // Remove leading slashes and collapse .. and . segments
  const segments = inputPath
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
}

async function withRetries<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  // Exponential backoff starting at 100ms
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt += 1;
      const message = String(error?.message || error);
      const isRetryable = /(?:429|503|rate limit|temporary)/i.test(message);
      if (!isRetryable || attempt > maxRetries) throw error;
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 5000);
      await sleep(backoffMs);
    }
  }
}

export class VirtualFs {
  private readonly bucket: R2Bucket;
  private readonly workspacePath: string; // e.g., "memory/agents/dmd-research/"
  private readonly defaultRetries: number;

  constructor(bucket: R2Bucket, workspacePath: string, options?: { maxRetries?: number }) {
    this.bucket = bucket;
    this.workspacePath = workspacePath.replace(/\/+$/, '') + '/';
    this.defaultRetries = options?.maxRetries ?? 3;
  }

  private getKey(path: string): string {
    const safePath = normalizePath(path);
    return `${this.workspacePath}${safePath}`;
  }

  async writeFile(path: string, content: string, options?: VirtualFsOptions): Promise<void> {
    const key = this.getKey(path);
    const timestamp = new Date().toISOString();
    const contentType = options?.contentType ?? 'text/plain; charset=utf-8';

    await withRetries(
      () =>
        this.bucket.put(key, content, {
          httpMetadata: { contentType },
          customMetadata: {
            timestamp,
            author: options?.author ?? 'system',
          },
        }),
      this.defaultRetries,
    );
  }

  async readFile(path: string): Promise<string | null> {
    const key = this.getKey(path);
    const obj = await withRetries<R2ObjectBody | null>(
      () => this.bucket.get(key),
      this.defaultRetries,
    );
    if (!obj) return null;

    // R2Object can be returned as R2ObjectBody with .text()
    const text: string = await obj.text();
    return text;
  }

  async listFiles(dir?: string): Promise<string[]> {
    const safeDir = dir ? normalizePath(dir) + '/' : '';
    const prefix = `${this.workspacePath}${safeDir}`;

    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      // Include metadata to support future enhancements
      const result = await withRetries(
        () =>
          this.bucket.list({
            prefix,
            limit: 1000,
            cursor,
          }),
        this.defaultRetries,
      );

      for (const obj of result.objects) {
        // Strip workspace prefix
        const relative = obj.key.substring(this.workspacePath.length);
        keys.push(relative);
      }

      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    // Return unique, sorted keys for deterministic behavior
    return Array.from(new Set(keys)).sort();
  }

  async deleteFile(path: string): Promise<void> {
    const key = this.getKey(path);
    await withRetries(() => this.bucket.delete(key), this.defaultRetries);
  }
}
