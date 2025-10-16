import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualFs } from '../../backend/tools/file_system';
import { AGENT_WORKSPACE_ROOT } from '../../backend/constants';

// Mock R2 bucket - simple in-memory implementation
class MockR2Bucket {
  private storage = new Map<string, ArrayBuffer>();

  async get(key: string) {
    const data = this.storage.get(key);
    if (!data) return null;
    
    return {
      body: data,
      text: async () => new TextDecoder().decode(data),
      arrayBuffer: async () => data,
    };
  }

  async put(key: string, value: string | ArrayBuffer) {
    const buffer = typeof value === 'string' 
      ? new TextEncoder().encode(value).buffer 
      : value;
    this.storage.set(key, buffer);
  }

  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix || '';
    const keys: string[] = [];
    for (const [key] of this.storage) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return { objects: keys.map(key => ({ key })) };
  }

  async delete(key: string) {
    this.storage.delete(key);
  }
}

describe('File System Tools', () => {
  let fs: VirtualFs;
  let mockR2: MockR2Bucket;
  const agentType = 'research-agent';
  const agentName = 'test-agent';
  const prefix = `${AGENT_WORKSPACE_ROOT}${agentType}/${agentName}/`;

  beforeEach(() => {
    // Create fresh mock R2 and VirtualFs for each test
    mockR2 = new MockR2Bucket();
    fs = new VirtualFs(mockR2 as any, prefix);
  });

  describe('constants', () => {
    it('has correct workspace root', () => {
      expect(AGENT_WORKSPACE_ROOT).toBe('memory/');
    });

    it('constructs correct agent prefix', () => {
      expect(prefix).toBe('memory/research-agent/test-agent/');
      expect(prefix.startsWith(AGENT_WORKSPACE_ROOT)).toBe(true);
    });
  });

  describe('write_file', () => {
    it('writes new file to R2', async () => {
      const path = 'report.md';
      const content = '# Research Report\n\nFindings...';

      await fs.writeFile(path, content);

      // Verify file exists with correct content
      const result = await fs.readFile(path);
      expect(result).toBe(content);
    });

    it('overwrites existing file', async () => {
      const path = 'report.md';
      const oldContent = '# Original';
      const newContent = '# Updated Report\n\nNew data';

      // Write initial file
      await fs.writeFile(path, oldContent);
      expect(await fs.readFile(path)).toBe(oldContent);

      // Overwrite
      await fs.writeFile(path, newContent);
      const updated = await fs.readFile(path);
      
      expect(updated).toBe(newContent);
      expect(updated).not.toBe(oldContent);
    });

    it('normalizes path with .. to stay in workspace', async () => {
      const path = '../other-agent/steal.md';
      const content = 'hack';

      await fs.writeFile(path, content);

      // VirtualFs normalizes .. to other-agent/steal.md (stays in workspace)
      const files = await fs.listFiles();
      expect(files).toEqual(['other-agent/steal.md']);
      
      // Can read back from same path
      const readBack = await fs.readFile(path);
      expect(readBack).toBe(content);
      
      // Verify the actual stored path has no .. 
      const directRead = await fs.readFile('other-agent/steal.md');
      expect(directRead).toBe(content);
    });
  });

  describe('read_file', () => {
    it('reads existing file', async () => {
      const path = 'notes.md';
      const content = '# Meeting Notes\n\n- Point 1';

      await fs.writeFile(path, content);
      const result = await fs.readFile(path);

      expect(result).toBe(content);
    });

    it('returns null for missing file', async () => {
      const result = await fs.readFile('nonexistent.md');
      expect(result).toBeNull();
    });

    it('returns null when trying to read directory', async () => {
      // Setup: write files in research/ directory
      await fs.writeFile('research/a.md', 'A');
      await fs.writeFile('research/b.md', 'B');

      // Try to read directory (path ends with /)
      const result = await fs.readFile('research/');

      // VirtualFs returns null (doesn't exist as file)
      expect(result).toBeNull();

      // Verify directory has files
      const files = await fs.listFiles();
      const researchFiles = files.filter(f => f.startsWith('research/'));
      expect(researchFiles.length).toBeGreaterThan(0);
    });
  });

  describe('list_files', () => {
    it('lists files with nested structure', async () => {
      // Setup files
      await fs.writeFile('report.md', 'Report');
      await fs.writeFile('notes.md', 'Notes');
      await fs.writeFile('research/dmd-analysis.md', 'DMD');
      await fs.writeFile('research/data/summary.md', 'Summary');

      const files = await fs.listFiles();

      // Verify all files present
      expect(files).toContain('report.md');
      expect(files).toContain('notes.md');
      expect(files).toContain('research/dmd-analysis.md');
      expect(files).toContain('research/data/summary.md');
      expect(files).toHaveLength(4);

      // Files should be sorted
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it('returns empty array for empty workspace', async () => {
      const files = await fs.listFiles();
      expect(files).toEqual([]);
    });
  });
});
