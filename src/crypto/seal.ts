import { b64urlDecode, isSecret } from './link';

export type Channel = 'doc' | 'here';

export type Sealer = {
  seal(channel: Channel, data: Uint8Array): Promise<Uint8Array>;
  open(channel: Channel, data: Uint8Array): Promise<Uint8Array | null>;
  sealJson(channel: Channel, value: unknown): Promise<Uint8Array>;
  openJson<T>(channel: Channel, data: Uint8Array): Promise<T | null>;
};

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export async function createSealer(id: string, secret: string): Promise<Sealer> {
  if (!isSecret(secret)) throw new Error('bad secret');
  const ikm = await crypto.subtle.importKey('raw', b64urlDecode(secret) as BufferSource, 'HKDF', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(id), info: enc.encode('bship/v1') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const aad = (channel: Channel) => enc.encode(`bship/v1/${id}/${channel}`);

  const seal: Sealer['seal'] = async (channel, data) => {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(channel) },
        key,
        data as BufferSource,
      ),
    );
    const out = new Uint8Array(1 + IV_LEN + ct.length);
    out[0] = VERSION;
    out.set(iv, 1);
    out.set(ct, 1 + IV_LEN);
    return out;
  };

  const open: Sealer['open'] = async (channel, data) => {
    if (data.length < 1 + IV_LEN + TAG_LEN || data[0] !== VERSION) return null;
    try {
      const iv = data.slice(1, 1 + IV_LEN);
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad(channel) },
        key,
        data.slice(1 + IV_LEN),
      );
      return new Uint8Array(pt);
    } catch {
      return null;
    }
  };

  return {
    seal,
    open,
    sealJson: (channel, value) => seal(channel, enc.encode(JSON.stringify(value))),
    async openJson<T>(channel: Channel, data: Uint8Array): Promise<T | null> {
      const pt = await open(channel, data);
      if (!pt) return null;
      try {
        return JSON.parse(dec.decode(pt)) as T;
      } catch {
        return null;
      }
    },
  };
}
