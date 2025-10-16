# VirtualFs Test Specification

## Overview
Tests for R2-based file system implementation (`backend/tools/file_system.ts`). VirtualFs provides a filesystem-like interface over R2 object storage with workspace isolation per agent.

## Design Principles
- **R2 is flat storage**: Keys like `research/notes.md` are strings, not hierarchical directories
- **No mkdir needed**: Creating `a/b/c/file.md` automatically creates the "path"
- **Workspace isolation**: Constructor receives prefix (e.g., `memory/research-agent/test-agent/`)
- **Path normalization**: Resolves `..` and `.` to prevent escaping workspace

---

## Constants

### Purpose
Verify workspace root constant is correctly defined and used.

### Test Cases

#### AGENT_WORKSPACE_ROOT value
- **Verification**: Constant equals `"memory/"`
- **Rationale**: Single source of truth for all agent workspaces

#### Prefix construction
- **Setup**: `agentType = 'research-agent'`, `agentName = 'test-agent'`
- **Verification**: `${AGENT_WORKSPACE_ROOT}${agentType}/${agentName}/` equals `"memory/research-agent/test-agent/"`
- **Rationale**: Ensures consistent workspace path format

---

## writeFile

### Purpose
Verify files can be written to R2 storage with proper path handling.

### Test Cases

#### Write new file
- **Input**: `path = "report.md"`, `content = "# Research Report\n\nFindings..."`
- **Expected**: File written successfully
- **Verification**: `readFile("report.md")` returns same content

#### Overwrite existing file
- **Setup**: File "report.md" exists with content "# Original"
- **Input**: `path = "report.md"`, `content = "# Updated Report\n\nNew data"`
- **Expected**: File overwritten with new content
- **Verification**: 
  - `readFile("report.md")` returns new content
  - Old content no longer exists

#### Path normalization with ..
- **Input**: `path = "../other-agent/steal.md"`, `content = "hack"`
- **Expected**: Path normalized to stay within workspace
- **Verification**: 
  - File written as `other-agent/steal.md` (no escape)
  - Can read from both `"../other-agent/steal.md"` and `"other-agent/steal.md"`

---

## readFile

### Purpose
Verify files can be read from R2 storage.

### Test Cases

#### Read existing file
- **Setup**: File "notes.md" with content "# Meeting Notes\n\n- Point 1"
- **Input**: `path = "notes.md"`
- **Expected**: Returns `"# Meeting Notes\n\n- Point 1"`

#### File not found
- **Input**: `path = "nonexistent.md"`
- **Expected**: Returns `null`

#### Read directory (ends with /)
- **Setup**: Files "research/a.md" and "research/b.md" exist
- **Input**: `path = "research/"`
- **Expected**: Returns `null` (directories don't exist as files)
- **Verification**: `listFiles()` shows research/ files exist

---

## listFiles

### Purpose
Display all files in workspace.

### Test Cases

#### List nested structure
- **Setup**: Write files:
  - "report.md"
  - "notes.md"
  - "research/dmd-analysis.md"
  - "research/data/summary.md"
- **Expected**: Returns array with all 4 paths
- **Verification**: 
  - All paths present
  - Sorted alphabetically
  - Correct length

#### Empty workspace
- **Setup**: No files written
- **Expected**: Returns empty array `[]`

---

## Testing Approach

### Mock R2 instead of real bindings
- **Why**: Importing `env` from `cloudflare:test` loads agents SDK → MCP SDK → ajv (CommonJS) → breaks
- **Solution**: Create simple in-memory MockR2Bucket
- **Benefits**: Fast, deterministic, no SDK issues

### MockR2Bucket interface
```typescript
class MockR2Bucket {
  private storage = new Map<string, ArrayBuffer>();
  async get(key: string): Promise<R2ObjectBody | null>
  async put(key: string, value: string | ArrayBuffer): Promise<void>
  async list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>
  async delete(key: string): Promise<void>
}
```

---

## Success Criteria

- [ ] All 10 tests passing
- [ ] Constants validated
- [ ] Write operations tested (new, overwrite, path normalization)
- [ ] Read operations tested (existing, missing, directory)
- [ ] List operations tested (nested, empty)
- [ ] No dependency on agents SDK
- [ ] Tests run in <2 seconds

**Total: 10 tests**
