/** Web Worker entry: runs the physics engine off the main thread. */
import { createEngine } from './engine.ts'
import type { Reply, Request } from './protocol.ts'

const scope = self as unknown as { postMessage(m: Reply): void; onmessage: ((e: MessageEvent<Request>) => void) | null }
const handle = createEngine((r) => scope.postMessage(r))
scope.onmessage = (e) => handle(e.data)
