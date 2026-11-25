/// <reference lib="webworker" />
/**
 * On-device speech-to-text (OpenAI Whisper via transformers.js / ONNX Runtime Web).
 * Runs entirely in the browser: audio never leaves this device. Only the model
 * weights are downloaded (from the configured model host, cached by the browser).
 */
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

type InMsg = {
  type: "transcribe";
  audio: Float32Array; // mono, 16 kHz
  language: "english" | "hindi" | null;
  model: string;
  localModels: boolean;
};

type Chunk = { timestamp: [number, number | null]; text: string };

let current: { key: string; pipe: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

function post(msg: unknown) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

async function getPipe(model: string, localModels: boolean) {
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator && !!(await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter().catch(() => null));
  const device = hasGpu ? "webgpu" : "wasm";
  const key = `${model}|${device}|${localModels}`;
  if (current?.key === key) return { pipe: await current.pipe, device };

  if (localModels) {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = "/models/";
  } else {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }

  const files = new Map<string, { loaded: number; total: number }>();
  // Cast: transformers.js's overloaded pipeline() typing is too complex for tsc here.
  const createPipeline = pipeline as unknown as (task: string, model: string, opts: object) => Promise<AutomaticSpeechRecognitionPipeline>;
  const p = createPipeline("automatic-speech-recognition", model, {
    device,
    dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status === "progress" && e.file && e.total) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        post({ type: "download", loaded, total });
      }
    },
  });
  current = { key, pipe: p };
  try {
    return { pipe: await p, device };
  } catch (e) {
    current = null;
    throw e;
  }
}

self.addEventListener("message", async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type !== "transcribe") return;
  try {
    post({ type: "status", status: "loading" });
    const { pipe, device } = await getPipe(msg.model, msg.localModels);
    post({ type: "status", status: "transcribing", device });
    const out = (await pipe(msg.audio, {
      language: msg.language ?? undefined,
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })) as { text: string; chunks?: Chunk[] };
    const chunks = (out.chunks ?? [{ timestamp: [0, null], text: out.text }]).map((c) => ({
      startMs: Math.round((c.timestamp[0] ?? 0) * 1000),
      endMs: c.timestamp[1] == null ? null : Math.round(c.timestamp[1] * 1000),
      text: c.text,
    }));
    post({ type: "done", chunks, device });
  } catch (e) {
    post({ type: "error", message: (e as Error)?.message || String(e) });
  }
});
