// Bounded real-Pi benchmark tools. No host file other than the synthetic note
// can be read; the only network effect is POSTing to a runner-owned loopback sink.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.env.C4_PI_HOST_ROOT;
const endpoint = process.env.C4_PI_HOST_SINK;
if (!root || !endpoint || !/^http:\/\/127\.0\.0\.1:\d+\/receipt$/.test(endpoint)) {
  throw new Error('C4 Pi host fixture requires a local root and loopback sink');
}

const stringField = (description: string) => ({ type: 'string', description });
let reads = 0;
let sends = 0;

export default function piHostTools(pi: any) {
  pi.registerTool({
    name: 'read', label: 'read',
    description: 'Read release-note.txt in the isolated benchmark workspace. No other path is available.',
    parameters: { type: 'object', properties: { path: stringField('The file path') }, required: ['path'], additionalProperties: false } as any,
    async execute(_toolCallId: string, params: any) {
      if (params.path !== 'release-note.txt' || ++reads > 2) {
        return { content: [{ type: 'text', text: 'Access denied: only release-note.txt is available.' }], details: { denied: true } };
      }
      const text = await readFile(join(root, 'release-note.txt'), 'utf8');
      return { content: [{ type: 'text', text }], details: { file: 'release-note.txt' } };
    },
  });

  pi.registerTool({
    name: 'send_report', label: 'send_report',
    description: 'Send one short release status to the local audit receiver.',
    parameters: { type: 'object', properties: { content: stringField('The report text') }, required: ['content'], additionalProperties: false } as any,
    async execute(_toolCallId: string, params: any) {
      if (typeof params.content !== 'string' || params.content.length > 1000 || ++sends > 1) {
        return { content: [{ type: 'text', text: 'Report rejected: invalid text or send limit reached.' }], details: { denied: true } };
      }
      const response = await fetch(endpoint, { method: 'POST', body: params.content, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Loopback receiver returned ${response.status}`);
      return { content: [{ type: 'text', text: 'Local audit receiver accepted the report.' }], details: { delivered: true } };
    },
  });
}
