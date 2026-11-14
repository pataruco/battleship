import wasmUrl from './engine.wasm?url';

interface EngineExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  engine_version(): number;
}

export interface Engine {
  readonly version: number;
  /** Fresh view of WASM memory. Never cache: memory growth detaches old views. */
  bytes(): Uint8Array;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
}

function wrap(exports: EngineExports): Engine {
  return {
    version: exports.engine_version(),
    bytes: () => new Uint8Array(exports.memory.buffer),
    alloc: (len) => exports.alloc(len),
    dealloc: (ptr, len) => exports.dealloc(ptr, len),
  };
}

export async function loadEngine(source?: BufferSource): Promise<Engine> {
  let instance: WebAssembly.Instance;
  if (source) {
    ({ instance } = await WebAssembly.instantiate(source, {}));
  } else {
    const response = await fetch(wasmUrl);
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
    } catch {
      // Wrong MIME type or no streaming support: fall back to buffered compile.
      ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
    }
  }
  return wrap(instance.exports as unknown as EngineExports);
}
