//! Sea-battle rules engine, compiled to WASM without wasm-bindgen.

mod rng;
pub mod rules;

use rules::Rules;

/// Rules version stored in every game doc (`engine` field).
pub const RULES_VERSION: u32 = 1;

/// Allocate `len` bytes inside WASM memory and hand the pointer to the host.
#[no_mangle]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let mut buf: Vec<u8> = Vec::with_capacity(len as usize);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `alloc`.
///
/// # Safety
/// `ptr` and `len` must come from a prior `alloc(len)` call, freed once.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: u32) {
    drop(Vec::from_raw_parts(ptr, 0, len as usize));
}

#[no_mangle]
pub extern "C" fn engine_version() -> u32 {
    RULES_VERSION
}

const FLEET_BYTES: usize = 10;
const BOARD_BYTES: usize = 100;

/// # Safety
/// `fleet` must point to 10 readable bytes.
#[no_mangle]
pub unsafe extern "C" fn fleet_check(fleet: *const u8) -> i32 {
    rules::fleet_check(&Rules::CLASSIC, core::slice::from_raw_parts(fleet, FLEET_BYTES))
}

/// # Safety
/// `seed` must point to 16 readable bytes and `out` to 10 writable bytes.
#[no_mangle]
pub unsafe extern "C" fn fleet_random(seed: *const u8, out: *mut u8) -> i32 {
    let mut s = [0u8; 16];
    s.copy_from_slice(core::slice::from_raw_parts(seed, 16));
    rules::fleet_random(
        &Rules::CLASSIC,
        &s,
        core::slice::from_raw_parts_mut(out, FLEET_BYTES),
    )
}

/// # Safety
/// `fleet` must point to 10 readable bytes and `shots` to `n` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn shot_outcome(fleet: *const u8, shots: *const u8, n: u32) -> i32 {
    let shots = if n == 0 {
        &[][..]
    } else {
        core::slice::from_raw_parts(shots, n as usize)
    };
    rules::shot_outcome(
        &Rules::CLASSIC,
        core::slice::from_raw_parts(fleet, FLEET_BYTES),
        shots,
    )
}

/// # Safety
/// `fleet` must point to 10 readable bytes, `shots` to `n` readable bytes
/// and `out` to 100 writable bytes.
#[no_mangle]
pub unsafe extern "C" fn board_cells(
    fleet: *const u8,
    shots: *const u8,
    n: u32,
    reveal: u32,
    out: *mut u8,
) {
    let shots = if n == 0 {
        &[][..]
    } else {
        core::slice::from_raw_parts(shots, n as usize)
    };
    rules::board_cells(
        &Rules::CLASSIC,
        core::slice::from_raw_parts(fleet, FLEET_BYTES),
        shots,
        reveal != 0,
        core::slice::from_raw_parts_mut(out, BOARD_BYTES),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_one() {
        assert_eq!(engine_version(), 1);
    }

    #[test]
    fn alloc_roundtrip() {
        let p = alloc(16);
        assert!(!p.is_null());
        unsafe { dealloc(p, 16) };
    }
}
