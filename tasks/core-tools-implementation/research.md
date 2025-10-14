# Core Tools Implementation - Research Findings

**Task:** Implement core agent tools (agent management, file system, web search, email, async execution)  
**Date:** October 14, 2025  
**Research Method:** Parallel deep research using NIA agents + web search

---

## Table of Contents

1. [Inter-Durable Object Communication](#inter-durable-object-communication)
2. [Workers AI Function Calling](#workers-ai-function-calling)
3. [Email Service Options](#email-service-options)
4. [Parallel Async Operations](#parallel-async-operations)
5. [R2 File Storage Patterns](#r2-file-storage-patterns)
6. [Key Takeaways & Implementation Recommendations](#key-takeaways--implementation-recommendations)

---

## Inter-Durable Object Communication

### Pattern: RPC Method Invocation (RECOMMENDED)

**Why:** Type-safe, ergonomic, avoids manual Request/Response handling.

```typescript
// Durable Object class with RPC methods
export class Counter {
  private count = 0;
  constructor(private state: DurableObjectState) {}
  
  async increment(by: number): Promise<number> {
    this.count += by;
    await this.state.storage.put("count", this.count);
    return this.count;
  }
  
  async getCount(): Promise<number> {
    const stored = await this.state.storage.get<number>("count");
    return stored || 0;
  }
}

// In your Worker or another Durable Object (TypeScript)
const stub = env.COUNTER_NS.get(env.COUNTER_NS.idFromName("global"));
const newCount = await stub.increment(5);
console.log("Count is now", newCount);
```

**Type Safety with TypeScript:**
```typescript
// wrangler.toml type definitions
declare global {
  interface Env {
    RESEARCH_AGENT: DurableObjectNamespace<ResearchAgent>;
    INTERACTION_AGENT: DurableObjectNamespace<InteractionAgent>;
  }
}
```

### Pattern: HTTP Fetch (Alternative)

For when you need HTTP-like semantics or REST-style routing:

```typescript
// Send a POST to /increment on the Durable Object
const stub = env.MY_DO_NAMESPACE.get(env.MY_DO_NAMESPACE.idFromName(counterName));
const response = await stub.fetch(
  new Request("https://dummy/increment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 1 })
  })
);
const data = await response.json();
```

### Best Practices

✅ **Prefer RPC interface** over raw fetch for type safety  
✅ **Use `DurableObjectNamespace<T>`** in TypeScript for compile-time checks  
✅ **Handle errors** with try/catch and meaningful status codes  
✅ **Avoid circular dependencies** between Durable Objects  
✅ **Consider latency** - each DO-to-DO call adds network overhead  

### State Management

```typescript
export class ChatRoom {
  constructor(private state: DurableObjectState) {}
  
  async fetch(request: Request) {
    const messages = (await this.state.storage.get<string[]>("msgs")) || [];
    
    if (request.method === "POST") {
      const { text } = await request.json();
      messages.push(text);
      await this.state.storage.put("msgs", messages);
      return new Response(JSON.stringify({ ok: true }));
    }
    
    return new Response(JSON.stringify({ messages }));
  }
}
```

**Key:** Use `this.state.storage` for transactional key-value storage. Reads and writes within one async call are atomic.

---

## Workers AI Function Calling

### Status: Limited Official Documentation

⚠️ **Finding:** Official Cloudflare documentation on Workers AI function calling with Llama 3.3 is sparse as of Oct 2025.

### What We Know

From GitHub issues and community sources:

1. **Embedded Function Calling** - Cloudflare has blog posts about "embedded function calling" for reduced latency
2. **Tool Schema Format** - Likely follows OpenAI-compatible tool definitions
3. **Implementation Pattern** - Need to parse tool calls from LLM responses

### Community Example (from workerd issue #2418)

```typescript
const tools = [{
  name: "get_github_user",
  description: "Provides publicly available information about someone with a GitHub account.",
  parameters: {
    type: "object",
    properties: {
      username: {
        type: "string",
        description: "The handle for the GitHub user account."
      }
    },
    required: ["username"]
  }
}];

const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  messages: [...],
  tools: tools
});

// Parse tool calls from response
if (response.tool_calls) {
  for (const tool_call of response.tool_calls) {
    const username = tool_call.arguments.username;
    const url = `https://api.github.com/users/${username}`;
    // Execute tool...
  }
}
```

### Recommended Approach

**Option A: Native Workers AI Function Calling**
- Use if Workers AI officially supports it
- Check latest docs: https://developers.cloudflare.com/workers-ai/

**Option B: Structured Output Parsing**
- Prompt LLM to return JSON with tool calls
- Parse structured output manually
- More control, works with any LLM

**Option C: Cloudflare Workflows**
- Use Workflows for orchestrating complex multi-step tool execution
- Durable execution across steps
- Scales without custom infrastructure

---

## Email Service Options

### Comparison Matrix

| Service | Free Tier | Pricing | Integration | Best For |
|---------|-----------|---------|-------------|----------|
| **Resend** | 3k emails/mo, 100/day | $20/mo (50k) | Native SDK, React Email | Modern dev UX, simple transactional |
| **SendGrid** | 100 emails/day (60d trial) | $19.95/mo (50k) | Direct API via fetch | Enterprise features, analytics |
| **MailChannels** | 100 emails/day | $79.99/mo (40k) | Simple fetch API | Cloudflare-friendly, anti-spam |
| **Amazon SES** | 3k emails/mo (12mo) | $0.10 per 1k | aws4fetch library | Pay-as-you-go, AWS ecosystem |

### Recommended: Resend (for our use case)

**Why:**
- Modern developer experience
- Native Cloudflare Workers SDK
- Free tier sufficient for demo
- Easy integration

**Implementation:**

```typescript
import { Resend } from 'resend';

export default {
  async fetch(request, env) {
    const resend = new Resend(env.RESEND_API_KEY);
    
    const data = await resend.emails.send({
      from: 'Medical Agent <agent@yourdomain.com>',
      to: ['expert@example.com'],
      subject: 'Research Request: DMD Treatments',
      html: '<p>Request for latest safety data...</p>',
    });
    
    return Response.json(data);
  },
};
```

**Setup:**
```bash
npm install resend
wrangler secret put RESEND_API_KEY
```

### Alternative: MailChannels (No API Key)

Good for simple needs without account setup:

```typescript
const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: 'recipient@example.com', name: 'Recipient' }]
    }],
    from: { email: 'sender@example.com', name: 'Sender' },
    subject: 'Test',
    content: [{ type: 'text/plain', value: 'Test' }]
  })
});
```

**Note:** Requires DNS Domain Lockdown record.

---

## Parallel Async Operations

### Core Patterns

#### 1. Basic Parallel Fetch with Promise.all

```typescript
export default {
  async fetch(request, env, ctx) {
    const urls = [
      'https://api.example.com/data1',
      'https://api.example.com/data2',
      'https://api.example.com/data3'
    ];
    
    // Start all fetches simultaneously
    const fetchPromises = urls.map(url => fetch(url));
    
    // Await all to complete
    const responses = await Promise.all(fetchPromises);
    
    // Parse JSON in parallel
    const results = await Promise.all(responses.map(r => r.json()));
    
    return new Response(JSON.stringify(results));
  }
};
```

#### 2. Handling Mixed Outcomes with Promise.allSettled

```typescript
const results = await Promise.allSettled([
  operation1(),
  operation2(),
  operation3()
]);

results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`Operation ${index} succeeded:`, result.value);
  } else {
    console.error(`Operation ${index} failed:`, result.reason);
  }
});
```

**When to use:**
- ✅ `Promise.all` - When all operations must succeed, fail-fast behavior
- ✅ `Promise.allSettled` - When you need all results regardless of failures

#### 3. Background Tasks with ctx.waitUntil

```typescript
export default {
  async fetch(request, env, ctx) {
    // Handle main request
    const response = new Response("Request processed");
    
    // Background task (continues after response sent)
    ctx.waitUntil(
      (async () => {
        await logToAnalytics(request);
        await updateCache(env);
        await sendNotification(env);
      })()
    );
    
    return response;
  }
};
```

**Key:** `ctx.waitUntil` extends Worker lifetime for non-critical work without blocking response.

#### 4. Concurrent Mapping with Limit

Avoid resource exhaustion by batching:

```typescript
async function mapWithConcurrency(inputs, mapper, limit = 5) {
  const results = [];
  for (let i = 0; i < inputs.length; i += limit) {
    const batch = inputs.slice(i, i + limit).map(mapper);
    results.push(...await Promise.all(batch));
  }
  return results;
}

// Usage
const data = await mapWithConcurrency(
  urls,
  url => fetch(url).then(r => r.json()),
  6  // max 6 concurrent requests
);
```

### Error Handling Best Practices

```typescript
export default {
  async fetch(request, env, ctx) {
    const tasks = urls.map(url => fetch(url).then(res => res.json()));
    
    try {
      const results = await Promise.all(tasks);
      return new Response(JSON.stringify(results));
    } catch (error) {
      console.error('Batch fetch failed:', error);
      return new Response('Error fetching data', { status: 500 });
    }
  }
};
```

### Performance Best Practices

✅ **Batch independent tasks** with Promise.all  
✅ **Offload non-critical work** to ctx.waitUntil  
✅ **Limit concurrency** to prevent CPU/memory exhaustion  
✅ **Use Promise.allSettled** when failures shouldn't abort everything  
✅ **Consider Cloudflare Queues** for long-running/retryable tasks  

---

## R2 File Storage Patterns

### Upload Patterns

#### 1. Simple PUT Upload (Small Files)

```typescript
export default {
  async fetch(request, env) {
    if (request.method === 'POST') {
      const key = new URL(request.url).pathname.slice(1);
      const data = await request.arrayBuffer();
      
      await env.MY_BUCKET.put(key, data, {
        httpMetadata: {
          contentType: request.headers.get('Content-Type')
        },
        customMetadata: {
          uploadedBy: 'agent-v1',
          timestamp: Date.now().toString()
        }
      });
      
      return new Response('Upload successful');
    }
  }
};
```

#### 2. Streaming Upload (Large Files)

```typescript
export default {
  async fetch(request, env) {
    if (request.method === 'PUT') {
      const key = new URL(request.url).pathname.slice(1);
      
      // Stream directly without buffering
      await env.MY_BUCKET.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get('Content-Type')
        }
      });
      
      return new Response('Streaming upload complete');
    }
  }
};
```

#### 3. Multipart Upload (Files > 5MB)

```typescript
export default {
  async fetch(request, env) {
    const key = 'large-file.dat';
    
    // 1. Initiate multipart upload
    const multipart = await env.MY_BUCKET.createMultipartUpload(key);
    
    // 2. Upload parts in parallel
    const data = await request.arrayBuffer();
    const partSize = Math.ceil(data.byteLength / 2);
    const uploadedParts = [];
    
    for (let i = 0; i < 2; i++) {
      const start = i * partSize;
      const end = Math.min(data.byteLength, start + partSize);
      const partBuffer = data.slice(start, end);
      
      const part = await env.MY_BUCKET.uploadPart(
        key,
        multipart.uploadId,
        i + 1,
        partBuffer
      );
      
      uploadedParts.push({
        partNumber: i + 1,
        etag: part.etag
      });
    }
    
    // 3. Complete multipart upload
    await env.MY_BUCKET.completeMultipartUpload(
      key,
      multipart.uploadId,
      uploadedParts
    );
    
    return new Response('Multipart upload complete');
  }
};
```

### Download Patterns

#### 1. Direct GET

```typescript
const object = await env.MY_BUCKET.get(key);
if (!object) {
  return new Response('Not found', { status: 404 });
}

return new Response(object.body, {
  headers: {
    'Content-Type': object.httpMetadata.contentType || 'application/octet-stream',
    'Content-Length': object.size.toString(),
  },
});
```

#### 2. Streaming Download

```typescript
const object = await env.MY_BUCKET.get(key);
if (!object) {
  return new Response('Not found', { status: 404 });
}

// object.body is already a ReadableStream
return new Response(object.body, {
  headers: object.httpMetadata,
});
```

### Listing Operations

```typescript
export default {
  async fetch(request, env) {
    const prefix = 'photos/';
    const delimiter = '/';
    let cursor;
    const allKeys = [];
    
    do {
      const listResult = await env.MY_BUCKET.list({
        prefix,
        delimiter,
        limit: 100,
        cursor,
        include: ['httpMetadata', 'customMetadata'],
      });
      
      // Process objects
      for (const obj of listResult.objects) {
        console.log(`Key: ${obj.key}, Size: ${obj.size}`);
        allKeys.push(obj.key);
      }
      
      // Handle subdirectories
      for (const commonPrefix of listResult.delimitedPrefixes) {
        console.log('Found folder:', commonPrefix);
      }
      
      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);
    
    return new Response(JSON.stringify({ keys: allKeys }));
  }
};
```

### Sandboxed File System Pattern

Create a virtual file system layer backed by R2:

```typescript
export class VirtualFs {
  constructor(r2Bucket) {
    this.bucket = r2Bucket;
    this.index = new Map();  // Map<path, { size, mtime }>
  }
  
  async init() {
    // Load existing entries from R2
    const list = await this.bucket.list({ prefix: 'fs/' });
    for (const obj of list.objects) {
      const path = obj.key.slice(3);  // Remove 'fs/' prefix
      this.index.set(path, {
        size: obj.size,
        mtime: obj.customMetadata?.mtime || obj.uploaded
      });
    }
  }
  
  async writeFile(path, data) {
    const key = `fs/${path}`;
    const mtime = new Date().toISOString();
    
    await this.bucket.put(key, data, {
      customMetadata: { mtime }
    });
    
    this.index.set(path, {
      size: data.length,
      mtime
    });
  }
  
  async readFile(path) {
    const key = `fs/${path}`;
    const obj = await this.bucket.get(key);
    if (!obj) throw new Error('ENOENT');
    return obj.body;
  }
  
  async readdir(dir = '') {
    const prefix = `fs/${dir}${dir && '/'}`;
    const entries = new Set();
    
    const list = await this.bucket.list({ prefix });
    for (const obj of list.objects) {
      const rest = obj.key.slice(prefix.length);
      const name = rest.split('/')[0];
      entries.add(name);
    }
    
    return Array.from(entries);
  }
  
  async unlink(path) {
    const key = `fs/${path}`;
    await this.bucket.delete(key);
    this.index.delete(path);
  }
}
```

**Usage:**
```typescript
const fs = new VirtualFs(env.MY_R2_BUCKET);
await fs.init();

await fs.writeFile('reports/dmd_research.md', 'Report content...');
const content = await fs.readFile('reports/dmd_research.md');
const files = await fs.readdir('reports');
```

### Error Handling

```typescript
async function putObjectWithRetry(bucket, key, body, metadata, retries = 3) {
  const backoff = (attempt) => Math.pow(2, attempt) * 100;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await bucket.put(key, body, {
        httpMetadata: { contentType: metadata.contentType },
        customMetadata: metadata.custom
      });
    } catch (err) {
      // Retry on rate limit or server errors
      if (err.message.includes('429') || err.message.includes('503')) {
        await new Promise(res => setTimeout(res, backoff(i)));
        continue;
      }
      throw err;
    }
  }
  
  throw new Error(`Failed to upload ${key} after ${retries} attempts`);
}
```

---

## Key Takeaways & Implementation Recommendations

### 1. Agent Management Tools (Priority 1)

**Approach:**
- Use RPC-style Durable Object communication
- TypeScript `DurableObjectNamespace<T>` for type safety
- Implement tools: `create_agent`, `list_agents`, `message_agent`

**Example:**
```typescript
// In InteractionAgent
async create_agent(name: string, description: string, message: string) {
  const agentId = this.env.RESEARCH_AGENT.idFromName(name);
  const stub = this.env.RESEARCH_AGENT.get(agentId);
  
  await stub.initialize({ name, description, message });
  
  // Store in registry
  await this.env.DB.prepare(
    'INSERT INTO research_agents (id, name, description, workspace_path, created_at, last_active) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    agentId.toString(),
    name,
    description,
    `/memory/research_agents/${name}`,
    Date.now(),
    Date.now()
  ).run();
  
  return { agent_id: agentId.toString() };
}
```

### 2. File System Tools (Priority 2)

**Approach:**
- VirtualFs class wrapping R2
- Agent-specific workspace sandboxing (prefix: `memory/agents/{agent_name}/`)
- Tools: `write_file`, `read_file`, `list_files`

**Implementation:**
```typescript
// Each agent gets isolated workspace
const agentFs = new VirtualFs(env.R2, `memory/agents/${agentName}/`);
await agentFs.writeFile('reports/research.md', content);
```

### 3. Web Search Tool (Priority 3)

**Approach:**
- Perplexity API integration
- Use user-provided API key
- Domain filtering for medical sources

**Implementation:**
```typescript
async web_search(query: string, domains?: string[], max_results = 10) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [{ role: 'user', content: query }],
      max_tokens: max_results * 100
    })
  });
  
  return await response.json();
}
```

### 4. Email Tools (Priority 4)

**Approach:**
- Use Resend for modern dev UX
- Simple send/check pattern
- Store email IDs for tracking

**Implementation:**
```typescript
import { Resend } from 'resend';

async email_send(to: string, subject: string, body: string) {
  const resend = new Resend(this.env.RESEND_API_KEY);
  const { data } = await resend.emails.send({
    from: 'agent@yourdomain.com',
    to,
    subject,
    html: body
  });
  
  return { email_id: data.id };
}
```

### 5. Async Execution Pattern

**Approach:**
- Use `Promise.all` for parallel tool execution
- Use `Promise.allSettled` when some failures are acceptable
- Use `ctx.waitUntil` for background logging

**Example:**
```typescript
// Agent executes multiple tools in parallel
const [searchResults, fileContent, emailStatus] = await Promise.all([
  this.web_search('DMD treatments'),
  this.read_file('notes/previous_research.md'),
  this.email_check('email_123')
]);
```

### 6. Workers AI Function Calling

**Approach:**
- **Option A:** Use native Workers AI function calling if available (check latest docs)
- **Option B:** Structured output parsing with JSON schema
- **Option C:** Cloudflare Workflows for complex orchestration

**Recommended for MVP:** Option B (structured output parsing)
- More control over tool execution
- Works with any LLM model
- Easier to debug and test

---

## Next Steps

1. ✅ Research complete
2. 📝 Create implementation plan (plan.md)
3. 🛠️ Implement tools in this order:
   - Agent management (create, list, message)
   - File system (VirtualFs with R2)
   - Web search (Perplexity API)
   - Email (Resend)
4. 🧪 Test each tool in isolation
5. 🔗 Wire tools into agent system prompts
6. ✨ Build minimal UI to demo

---

## References

- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Resend Documentation](https://resend.com/docs)
- [Perplexity API Docs](https://docs.perplexity.ai/)
- NIA Deep Research Agent findings (October 2025)

