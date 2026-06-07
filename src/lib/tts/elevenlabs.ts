/**
 * ElevenLabs text-to-speech (server-side). Returns raw mp3 bytes or `null` on
 * any failure (unconfigured key, network, non-audio response, timeout) so the
 * client can fall back to the browser voice. The API key stays on the server.
 *
 * Pick a voice in the ElevenLabs dashboard and set ELEVENLABS_VOICE_ID; the
 * default is a bright young female preset.
 */
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // "Bella"
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';
const TIMEOUT_MS = Number(process.env.ELEVENLABS_TIMEOUT_MS || '20000');

export function isElevenLabsConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0;
}

export async function synthesizeElevenLabs(text: string): Promise<ArrayBuffer | null> {
  if (!isElevenLabsConfigured()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY as string,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`ElevenLabs TTS error (${res.status}):`, await res.text().catch(() => ''));
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.error('ElevenLabs TTS request failed:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
