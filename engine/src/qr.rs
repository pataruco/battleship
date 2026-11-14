//! QR encoder for invite links (ECC medium, no ECC boost).

use qrcodegen::{QrCode, QrCodeEcc, QrSegment, Version};

/// Medium ECC, boost off (`encode_text` would silently boost to H when it fits).
fn build(text: &[u8]) -> Option<QrCode> {
    let text = core::str::from_utf8(text).ok()?;
    let segs = QrSegment::make_segments(text);
    QrCode::encode_segments_advanced(
        &segs,
        QrCodeEcc::Medium,
        Version::MIN,
        Version::MAX,
        None,
        false,
    )
    .ok()
}

/// Encode `text`; write `side*side` bytes (1 dark, 0 light, row-major) to
/// `out` and return `side`. -1 not encodable, -2 `out` too small.
pub fn qr_encode_into(text: &[u8], out: &mut [u8]) -> i32 {
    let Some(qr) = build(text) else {
        return -1;
    };
    let side = qr.size();
    let cells = (side * side) as usize;
    if out.len() < cells {
        return -2;
    }
    for y in 0..side {
        for x in 0..side {
            out[(y * side + x) as usize] = u8::from(qr.get_module(x, y));
        }
    }
    side
}

#[cfg(test)]
mod tests {
    use super::*;

    const URL: &str = "https://pataruco.github.io/battleship/#/g/0b9e4a52-6c1e-4d7a-9f3b-2a4c5d6e7f80/AbCdEfGhIjKlMnOpQrStUv";

    #[test]
    fn roundtrips_through_a_decoder() {
        let mut out = [0u8; 177 * 177];
        let side = qr_encode_into(URL.as_bytes(), &mut out);
        assert!(side > 0 && side <= 41, "side {side}");
        let side = side as usize;
        let (quiet, scale) = (4, 4);
        let dim = (side + 2 * quiet) * scale;
        let mut img = rqrr::PreparedImage::prepare_from_greyscale(dim, dim, |x, y| {
            let (mx, my) = (
                (x / scale) as isize - quiet as isize,
                (y / scale) as isize - quiet as isize,
            );
            let dark = (0..side as isize).contains(&mx)
                && (0..side as isize).contains(&my)
                && out[my as usize * side + mx as usize] == 1;
            if dark {
                0
            } else {
                255
            }
        });
        let grids = img.detect_grids();
        assert_eq!(grids.len(), 1);
        let (_, text) = grids[0].decode().expect("decodes");
        assert_eq!(text, URL);
    }

    #[test]
    fn ecc_level_is_not_boosted() {
        let qr = build(b"hi").expect("encodes");
        assert_eq!(qr.error_correction_level(), QrCodeEcc::Medium);
    }

    #[test]
    fn small_capacity_is_refused() {
        let mut out = [0u8; 10];
        assert_eq!(qr_encode_into(URL.as_bytes(), &mut out), -2);
    }

    #[test]
    fn oversized_text_is_not_encodable() {
        let big = vec![b'a'; 4000];
        let mut out = vec![0u8; 177 * 177];
        assert_eq!(qr_encode_into(&big, &mut out), -1);
    }

    #[test]
    fn invalid_utf8_is_not_encodable() {
        let mut out = [0u8; 177 * 177];
        assert_eq!(qr_encode_into(&[0xff, 0xfe], &mut out), -1);
    }
}
