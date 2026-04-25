import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box';

export interface DemuxedVideoSample {
  /** Mutable on purpose — the consumer is allowed to clear this once the
   *  sample has been handed to a decoder, so the source File buffer can
   *  be GC'd in chunks instead of held in full for the whole export. */
  data: Uint8Array;
  /** Microseconds. */
  timestamp: number;
  /** Microseconds. */
  duration: number;
  isKey: boolean;
}

export interface DemuxedAudioSample {
  data: Uint8Array;
  /** Microseconds. */
  timestamp: number;
  /** Microseconds. */
  duration: number;
}

export interface DemuxedVideo {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  /** AVC/HEVC codec description (avcC/hvcC payload, no box header). */
  description?: Uint8Array;
  /** Container rotation in degrees (0/90/180/270). HTMLVideoElement applies
   *  this implicitly when rendering, but a raw VideoDecoder does not — so
   *  we apply it during the canvas transform when re-encoding. */
  rotationDeg: number;
  samples: DemuxedVideoSample[];
}

export interface DemuxedAudio {
  codec: string;
  sampleRate: number;
  channelCount: number;
  description?: Uint8Array;
  samples: DemuxedAudioSample[];
}

export interface DemuxResult {
  video: DemuxedVideo;
  audio: DemuxedAudio | null;
}

/**
 * Demux an MP4 file using mp4box.js — extracts encoded video samples,
 * encoded audio samples, codec descriptions, and container rotation
 * metadata. Designed to feed straight into WebCodecs `VideoDecoder` and
 * `mp4-muxer.addAudioChunkRaw`.
 */
export async function demuxMp4(file: File): Promise<DemuxResult> {
  const buffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isoFile = createFile() as any;

  const videoSamples: DemuxedVideoSample[] = [];
  const audioSamples: DemuxedAudioSample[] = [];
  let videoTrackId = -1;
  let audioTrackId = -1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let videoTrackInfo: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let audioTrackInfo: any = null;

  await new Promise<void>((resolve, reject) => {
    isoFile.onError = (module: string, message: string) =>
      reject(new Error(`mp4box: ${module}: ${message}`));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isoFile.onReady = (info: any) => {
      const v = info.videoTracks?.[0];
      const a = info.audioTracks?.[0];
      if (!v) {
        reject(new Error('demux_no_video_track'));
        return;
      }
      videoTrackInfo = v;
      videoTrackId = v.id;
      isoFile.setExtractionOptions(v.id, null, { nbSamples: 1000 });
      if (a) {
        audioTrackInfo = a;
        audioTrackId = a.id;
        isoFile.setExtractionOptions(a.id, null, { nbSamples: 1000 });
      }
      isoFile.start();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isoFile.onSamples = (id: number, _user: unknown, samples: any[]) => {
      if (id === videoTrackId) {
        for (const s of samples) {
          videoSamples.push({
            data: copySampleData(s.data),
            timestamp: usFromTimescale(s.cts, s.timescale),
            duration: usFromTimescale(s.duration, s.timescale),
            isKey: !!s.is_sync,
          });
        }
      } else if (id === audioTrackId) {
        for (const s of samples) {
          audioSamples.push({
            data: copySampleData(s.data),
            timestamp: usFromTimescale(s.cts, s.timescale),
            duration: usFromTimescale(s.duration, s.timescale),
          });
        }
      }
    };

    const mp4buf = MP4BoxBuffer.fromArrayBuffer(buffer, 0);
    isoFile.appendBuffer(mp4buf);
    isoFile.flush();

    // For non-fragmented MP4 the buffer is processed synchronously inside
    // appendBuffer — onReady + all onSamples have already fired by the
    // time we get here.
    resolve();
  });

  if (!videoTrackInfo) throw new Error('demux_no_video_track');

  const videoDescription = extractVideoDescription(isoFile, videoTrackInfo.id);
  const audioDescription = audioTrackInfo
    ? extractEsdsDescription(isoFile, audioTrackInfo.id)
    : undefined;

  const rotationDeg = matrixToRotation(videoTrackInfo.matrix);

  return {
    video: {
      codec: videoTrackInfo.codec,
      codedWidth: videoTrackInfo.video?.width ?? videoTrackInfo.track_width,
      codedHeight: videoTrackInfo.video?.height ?? videoTrackInfo.track_height,
      description: videoDescription,
      rotationDeg,
      samples: videoSamples,
    },
    audio: audioTrackInfo
      ? {
          codec: audioTrackInfo.codec,
          sampleRate: audioTrackInfo.audio.sample_rate,
          channelCount: audioTrackInfo.audio.channel_count,
          description:
            audioDescription ??
            buildAacLcConfig(
              audioTrackInfo.audio.sample_rate,
              audioTrackInfo.audio.channel_count
            ),
          samples: audioSamples,
        }
      : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function copySampleData(data: any): Uint8Array {
  // mp4box hands us a typed-array view backed by its big buffer; we want
  // an independent copy so the underlying buffer can be GC'd later.
  if (data instanceof Uint8Array) {
    const out = new Uint8Array(data.byteLength);
    out.set(data);
    return out;
  }
  return new Uint8Array(data);
}

function usFromTimescale(value: number, timescale: number): number {
  if (!timescale) return 0;
  return Math.round((value * 1_000_000) / timescale);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideoDescription(file: any, trackId: number): Uint8Array | undefined {
  const trak = file.getTrackById(trackId);
  if (!trak) return undefined;
  const entries = trak.mdia?.minf?.stbl?.stsd?.entries ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of entries as any[]) {
    // Each video codec stores its decoder config in a different child box:
    //   H.264 → avcC  (Box,     skip 8 bytes header)
    //   HEVC  → hvcC  (Box,     skip 8 bytes header)
    //   VP9   → vpcC  (FullBox, skip 12 bytes — header + version/flags)
    //   AV1   → av1C  (Box,     skip 8 bytes header)
    // WebCodecs' VideoDecoder wants the codec configuration record itself
    // — for vpcC that's the VPCodecConfigurationRecord, which lives AFTER
    // the FullBox version+flags. Including those 4 bytes is what was
    // breaking the VP9 path with "Decoding error.".
    let box: unknown = null;
    let skip = 8;
    if (entry.avcC) { box = entry.avcC; skip = 8; }
    else if (entry.hvcC) { box = entry.hvcC; skip = 8; }
    else if (entry.vpcC) { box = entry.vpcC; skip = 12; }
    else if (entry.av1C) { box = entry.av1C; skip = 8; }
    if (!box) continue;

    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (box as any).write(stream);
    // mp4box's DataStream backing buffer can be over-allocated past the
    // actual content. Use `stream.byteLength` (virtual length), not
    // `stream.buffer.byteLength`.
    const length = stream.byteLength - skip;
    if (length <= 0) continue;
    const out = new Uint8Array(length);
    out.set(new Uint8Array(stream.buffer, skip, length));
    return out;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEsdsDescription(file: any, trackId: number): Uint8Array | undefined {
  const trak = file.getTrackById(trackId);
  if (!trak) return undefined;
  const entries = trak.mdia?.minf?.stbl?.stsd?.entries ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of entries as any[]) {
    const esds = entry.esds;
    if (!esds) continue;
    // Walk the descriptor tree: ES_Descriptor → DecoderConfigDescriptor
    // → DecoderSpecificInfo (tag 0x05). The DecoderSpecificInfo's data is
    // the AudioSpecificConfig that WebCodecs / mp4-muxer want.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (node: any): Uint8Array | undefined => {
      if (!node) return undefined;
      if (node.tag === 0x05 && node.data) return new Uint8Array(node.data);
      if (Array.isArray(node.descs)) {
        for (const child of node.descs) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return undefined;
    };
    const found = walk(esds.esd ?? esds);
    if (found) return found;
  }
  return undefined;
}

/** Synthesize a 2-byte AAC-LC AudioSpecificConfig when esds isn't parseable. */
function buildAacLcConfig(sampleRate: number, channelCount: number): Uint8Array {
  const sampleRateIndex: Record<number, number> = {
    96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4,
    32000: 5, 24000: 6, 22050: 7, 16000: 8, 12000: 9,
    11025: 10, 8000: 11, 7350: 12,
  };
  const idx = sampleRateIndex[sampleRate] ?? 4; // default 44.1kHz
  const aot = 2; // AAC-LC
  const cc = channelCount;
  const byte0 = (aot << 3) | (idx >> 1);
  const byte1 = ((idx & 1) << 7) | (cc << 3);
  return new Uint8Array([byte0, byte1]);
}

/**
 * Decode an MP4 transformation matrix to a clockwise rotation in degrees.
 * Returns 0/90/180/270; falls back to 0 for non-rotation matrices.
 *
 * MP4 matrix layout: `[a, b, u, c, d, v, x, y, w]` — values are stored in
 * 16.16 fixed point (so 65536 == 1.0). We only need the 2×2 rotation part:
 *   { a b }
 *   { c d }
 */
function matrixToRotation(matrix: number[] | undefined): number {
  if (!matrix || matrix.length < 9) return 0;
  const FIXED = 65536;
  const a = matrix[0] / FIXED;
  const b = matrix[1] / FIXED;
  const c = matrix[3] / FIXED;
  const d = matrix[4] / FIXED;
  const eps = 0.01;
  if (Math.abs(a - 1) < eps && Math.abs(b) < eps && Math.abs(c) < eps && Math.abs(d - 1) < eps) return 0;
  if (Math.abs(a) < eps && Math.abs(b - 1) < eps && Math.abs(c + 1) < eps && Math.abs(d) < eps) return 90;
  if (Math.abs(a + 1) < eps && Math.abs(b) < eps && Math.abs(c) < eps && Math.abs(d + 1) < eps) return 180;
  if (Math.abs(a) < eps && Math.abs(b + 1) < eps && Math.abs(c - 1) < eps && Math.abs(d) < eps) return 270;
  return 0;
}
