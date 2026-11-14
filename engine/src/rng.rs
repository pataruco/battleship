//! xoshiro128** PRNG, seeded from 16 bytes.

/// Fixed non-zero state used when the seed is all zero.
const ZERO_SEED_STATE: [u32; 4] = [0x9E37_79B9, 0x243F_6A88, 0xB7E1_5162, 0xDEAD_BEEF];

pub struct Xoshiro128 {
    s: [u32; 4],
}

impl Xoshiro128 {
    pub fn from_seed(seed: &[u8; 16]) -> Self {
        let mut s = [0u32; 4];
        for (word, chunk) in s.iter_mut().zip(seed.as_chunks::<4>().0) {
            *word = u32::from_le_bytes(*chunk);
        }
        if s == [0; 4] {
            s = ZERO_SEED_STATE;
        }
        let mut rng = Self { s };
        // Low-entropy seeds (small counters) need a few rounds to diffuse.
        for _ in 0..16 {
            rng.next_u32();
        }
        rng
    }

    pub fn next_u32(&mut self) -> u32 {
        let s = &mut self.s;
        let result = s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s[1] << 9;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(11);
        result
    }

    /// Value in `0..bound` (modulo; the tiny bias is irrelevant for fleet placement).
    pub fn below(&mut self, bound: u32) -> u32 {
        self.next_u32() % bound
    }
}
