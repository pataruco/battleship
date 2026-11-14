//! Sea-battle rules engine, compiled to WASM without wasm-bindgen.

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
