/**
 * Bun + Windows mediasoup IPC workaround.
 *
 * On Windows, Bun's `child_process.spawn()` creates broken stdio pipe handles
 * for fd >= 3 (oven-sh/bun#11044). mediasoup uses fd 3 (producer channel) and
 * fd 4 (consumer channel) for FlatBuffers IPC with its C++ worker.
 *
 * Fix: monkey-patch `child_process.spawn` for the mediasoup-worker spawn call,
 * replacing it with `Bun.spawn()` which correctly returns raw fd numbers for
 * extra stdio handles.
 *
 * Based on Sharkord's implementation:
 * https://github.com/Sharkord/sharkord/blob/main/apps/server/src/utils/bun-mediasoup-workaround.ts
 */

import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const isBun = typeof globalThis.Bun !== "undefined";
const isWindows = process.platform === "win32";

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let originalSpawn: Function | null = null;
let patched = false;

function createBunPipeSocket(
  fd: number,
  mode: "read" | "write"
): EventEmitter & {
  write: (chunk: Buffer | Uint8Array, encoding?: string) => boolean;
  destroy: () => void;
  readable: boolean;
  writable: boolean;
  readableFlowing: boolean | null;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    write: (chunk: Buffer | Uint8Array, encoding?: string) => boolean;
    destroy: () => void;
    readable: boolean;
    writable: boolean;
    readableFlowing: boolean | null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bunSocket: any = null;
  let destroyed = false;

  emitter.readable = mode === "read";
  emitter.writable = mode === "write";
  emitter.readableFlowing = null;

  emitter.write = (
    chunk: Buffer | Uint8Array,
    _encoding?: string,
    callback?: (error?: Error | null) => void
  ): boolean => {
    if (destroyed) {
      callback?.(new Error("Socket is destroyed"));
      return false;
    }
    if (!bunSocket) {
      callback?.(new Error("Socket not ready"));
      return false;
    }
    try {
      const n = bunSocket.write(chunk);
      bunSocket.flush();
      callback?.(null);
      return n > 0;
    } catch (err: unknown) {
      callback?.(err as Error);
      return false;
    }
  };

  emitter.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (bunSocket) {
      try {
        bunSocket.end();
      } catch {
        /* ignore */
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Bun.connect as any)({
    fd,
    socket: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      open(socket: any) {
        bunSocket = socket;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data(_socket: any, data: Uint8Array) {
        if (mode === "read" && !destroyed) {
          emitter.emit("data", Buffer.from(data));
        }
      },
      close() {
        if (!destroyed) {
          emitter.emit("end");
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error(_socket: any, err: Error) {
        if (!destroyed) {
          emitter.emit("error", err);
        }
      },
      drain() {},
    },
  }).catch((err: Error) => {
    if (!destroyed) {
      emitter.emit("error", err);
    }
  });

  return emitter;
}

function pumpBunStreamToReadable(
  bunStream: ReadableStream<Uint8Array> | null,
  readable: Readable
) {
  if (!bunStream) return;
  const reader = bunStream.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          readable.push(null);
          break;
        }
        readable.push(Buffer.from(value));
      }
    } catch {
      readable.push(null);
    }
  })();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapBunSubprocess(bunChild: any): EventEmitter {
  const wrapper = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: Readable;
    stderr: Readable;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stdio: any[];
    kill: (signal?: string) => void;
  };

  wrapper.pid = bunChild.pid;

  const stdoutReadable = new Readable({ read() {} });
  const stderrReadable = new Readable({ read() {} });
  pumpBunStreamToReadable(bunChild.stdout, stdoutReadable);
  pumpBunStreamToReadable(bunChild.stderr, stderrReadable);
  wrapper.stdout = stdoutReadable;
  wrapper.stderr = stderrReadable;

  const producerFd = bunChild.stdio[3];
  const consumerFd = bunChild.stdio[4];

  if (typeof producerFd !== "number" || typeof consumerFd !== "number") {
    throw new Error(
      `[bun-mediasoup-fix] Expected fd numbers for stdio[3] and stdio[4], ` +
        `got: ${typeof producerFd}, ${typeof consumerFd}`
    );
  }

  const producerSocket = createBunPipeSocket(producerFd, "write");
  const consumerSocket = createBunPipeSocket(consumerFd, "read");

  wrapper.stdio = [
    null,
    stdoutReadable,
    stderrReadable,
    producerSocket,
    consumerSocket,
  ];

  wrapper.kill = (signal?: string) => {
    try {
      bunChild.kill(signal);
    } catch {
      try {
        bunChild.kill();
      } catch {
        /* ignore */
      }
    }
  };

  bunChild.exited
    .then((exitCode: number) => {
      wrapper.emit("exit", exitCode, null);
      setTimeout(() => wrapper.emit("close", exitCode, null), 0);
    })
    .catch((err: Error) => {
      wrapper.emit("error", err);
    });

  return wrapper;
}

export function patchSpawnForMediasoup(): void {
  if (!isBun || !isWindows || patched) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("node:child_process");
  originalSpawn = cp.spawn;

  cp.spawn = function patchedSpawn(
    command: string,
    args?: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any
  ) {
    const isMediasoupWorker =
      typeof command === "string" &&
      command.includes("mediasoup-worker") &&
      Array.isArray(options?.stdio) &&
      options.stdio.length >= 5;

    if (!isMediasoupWorker) {
      return originalSpawn!.call(cp, command, args, options);
    }

    console.log(
      "[bun-mediasoup-workaround] Intercepting spawn of mediasoup-worker with Bun.spawn()"
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bunSpawnOptions: any = {
      stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
      env: options?.env || process.env,
    };
    if (options?.cwd) bunSpawnOptions.cwd = options.cwd;
    if (typeof options?.detached === "boolean")
      bunSpawnOptions.detached = options.detached;
    if (typeof options?.uid === "number") bunSpawnOptions.uid = options.uid;
    if (typeof options?.gid === "number") bunSpawnOptions.gid = options.gid;

    const bunChild = Bun.spawn([command, ...(args || [])], bunSpawnOptions);
    return wrapBunSubprocess(bunChild);
  };

  patched = true;
}

export function restoreSpawn(): void {
  if (!patched || !originalSpawn) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("node:child_process");
  cp.spawn = originalSpawn;
  originalSpawn = null;
  patched = false;
}
