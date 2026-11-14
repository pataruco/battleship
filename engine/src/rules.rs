//! Safe, slice-based rules logic. The C exports in `lib.rs` wrap these.

use crate::rng::Xoshiro128;

/// Upper bound on board cells, so scratch arrays need no allocation.
const MAX_CELLS: usize = 100;
/// Upper bound on ships per fleet.
const MAX_SHIPS: usize = 5;

pub const FLEET_OK: i32 = 0;
pub const FLEET_OUT_OF_BOUNDS: i32 = 1;
pub const FLEET_OVERLAP: i32 = 2;
pub const FLEET_WRONG_SHIPS: i32 = 3;

pub const SHOT_REPEAT: i32 = -1;
pub const SHOT_OFF_BOARD: i32 = -2;
pub const SHOT_BAD_INPUT: i32 = -3;

pub struct Rules {
    pub size: usize,
    pub lengths: [u8; MAX_SHIPS],
}

impl Rules {
    pub const CLASSIC: Rules = Rules {
        size: 10,
        lengths: [5, 4, 3, 3, 2],
    };

    fn cells(&self) -> usize {
        self.size * self.size
    }

    /// Fleet buffer length in bytes: `[bow, dir]` per ship.
    pub fn fleet_len(&self) -> usize {
        self.lengths.len() * 2
    }

    /// Cell of segment `i` of a ship, or `None` if it leaves the board.
    fn segment(&self, bow: usize, dir: u8, i: usize) -> Option<usize> {
        let (row, col) = (bow / self.size, bow % self.size);
        let (row, col) = if dir == 0 { (row, col + i) } else { (row + i, col) };
        (row < self.size && col < self.size).then_some(row * self.size + col)
    }
}

/// 0 ok, 1 out of bounds, 2 overlap, 3 wrong ships.
pub fn fleet_check(rules: &Rules, fleet: &[u8]) -> i32 {
    if fleet.len() != rules.fleet_len() {
        return FLEET_WRONG_SHIPS;
    }
    let pairs = fleet.chunks_exact(2);
    if pairs.clone().any(|p| p[1] > 1 || usize::from(p[0]) >= rules.cells()) {
        return FLEET_WRONG_SHIPS;
    }
    let mut taken = [false; MAX_CELLS];
    let mut overlap = false;
    for (pair, &len) in pairs.zip(rules.lengths.iter()) {
        for i in 0..usize::from(len) {
            match rules.segment(usize::from(pair[0]), pair[1], i) {
                None => return FLEET_OUT_OF_BOUNDS,
                Some(c) => {
                    overlap |= taken[c];
                    taken[c] = true;
                }
            }
        }
    }
    if overlap {
        FLEET_OVERLAP
    } else {
        FLEET_OK
    }
}

/// Fill `out` (`fleet_len` bytes) with a random valid fleet. 0 ok, 1 could not place.
pub fn fleet_random(rules: &Rules, seed: &[u8; 16], out: &mut [u8]) -> i32 {
    if out.len() != rules.fleet_len() {
        return 1;
    }
    let mut rng = Xoshiro128::from_seed(seed);
    const TRIES_PER_SHIP: u32 = 100;
    const MAX_RESTARTS: u32 = 1000;
    'restart: for _ in 0..MAX_RESTARTS {
        let mut taken = [false; MAX_CELLS];
        for (k, &len) in rules.lengths.iter().enumerate() {
            let mut placed = false;
            for _ in 0..TRIES_PER_SHIP {
                let bow = rng.below(rules.cells() as u32) as usize;
                let dir = rng.below(2) as u8;
                let fits = (0..usize::from(len)).all(|i| {
                    rules
                        .segment(bow, dir, i)
                        .is_some_and(|c| !taken[c])
                });
                if fits {
                    for i in 0..usize::from(len) {
                        if let Some(c) = rules.segment(bow, dir, i) {
                            taken[c] = true;
                        }
                    }
                    out[2 * k] = bow as u8;
                    out[2 * k + 1] = dir;
                    placed = true;
                    break;
                }
            }
            if !placed {
                continue 'restart;
            }
        }
        return 0;
    }
    1
}

/// Per-cell ship index (`NO_SHIP` for water) and which cells were validly shot.
const NO_SHIP: u8 = u8::MAX;

fn layout(rules: &Rules, fleet: &[u8]) -> [u8; MAX_CELLS] {
    let mut owner = [NO_SHIP; MAX_CELLS];
    for (k, (pair, &len)) in fleet.chunks_exact(2).zip(rules.lengths.iter()).enumerate() {
        for i in 0..usize::from(len) {
            if let Some(c) = rules.segment(usize::from(pair[0]), pair[1], i) {
                owner[c] = k as u8;
            }
        }
    }
    owner
}

fn fired_cells(rules: &Rules, shots: &[u8]) -> [bool; MAX_CELLS] {
    let mut fired = [false; MAX_CELLS];
    for &s in shots {
        if usize::from(s) < rules.cells() {
            fired[usize::from(s)] = true;
        }
    }
    fired
}

fn ship_sunk(rules: &Rules, owner: &[u8; MAX_CELLS], fired: &[bool; MAX_CELLS], k: usize) -> bool {
    (0..rules.cells()).all(|c| usize::from(owner[c]) != k || fired[c])
}

/// Outcome of `shots[last]` given the earlier shots. See the ABI codes in the brief.
pub fn shot_outcome(rules: &Rules, fleet: &[u8], shots: &[u8]) -> i32 {
    let Some((&last, earlier)) = shots.split_last() else {
        return SHOT_BAD_INPUT;
    };
    if fleet_check(rules, fleet) != FLEET_OK {
        return SHOT_BAD_INPUT;
    }
    if usize::from(last) >= rules.cells() {
        return SHOT_OFF_BOARD;
    }
    if earlier.contains(&last) {
        return SHOT_REPEAT;
    }
    let owner = layout(rules, fleet);
    let k = owner[usize::from(last)];
    if k == NO_SHIP {
        return 0;
    }
    let fired = fired_cells(rules, shots);
    let k = usize::from(k);
    if !ship_sunk(rules, &owner, &fired, k) {
        return 1;
    }
    let all_sunk = (0..rules.lengths.len()).all(|j| ship_sunk(rules, &owner, &fired, j));
    let base = if all_sunk { 10 } else { 2 };
    base + k as i32
}

/// Per cell: 0 unknown water, 1 miss, 2 hit, 3 sunk ship, 4 intact ship (reveal only).
pub fn board_cells(rules: &Rules, fleet: &[u8], shots: &[u8], reveal: bool, out: &mut [u8]) {
    out.fill(0);
    if fleet_check(rules, fleet) != FLEET_OK {
        return;
    }
    let owner = layout(rules, fleet);
    let fired = fired_cells(rules, shots);
    for (c, cell) in out.iter_mut().enumerate().take(rules.cells()) {
        let ship = owner[c];
        *cell = match (fired[c], ship != NO_SHIP) {
            (true, false) => 1,
            (true, true) if ship_sunk(rules, &owner, &fired, usize::from(ship)) => 3,
            (true, true) => 2,
            (false, true) if reveal => 4,
            (false, _) => 0,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: &Rules = &Rules::CLASSIC;
    // rows 0..4, each ship horizontal at col 0: cells 0-4, 10-13, 20-22, 30-32, 40-41
    const FLEET: [u8; 10] = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];

    fn seed(i: u32) -> [u8; 16] {
        let mut s = [0u8; 16];
        s[..4].copy_from_slice(&i.to_le_bytes());
        s
    }

    #[test]
    fn valid_fleet_ok() {
        assert_eq!(fleet_check(R, &FLEET), 0);
    }

    #[test]
    fn horizontal_wrap_is_out_of_bounds() {
        let mut f = FLEET;
        f[0] = 8; // length 5 at col 8
        assert_eq!(fleet_check(R, &f), 1);
    }

    #[test]
    fn vertical_off_bottom_is_out_of_bounds() {
        let mut f = FLEET;
        f[0] = 95;
        f[1] = 1;
        assert_eq!(fleet_check(R, &f), 1);
    }

    #[test]
    fn shared_cell_is_overlap() {
        let mut f = FLEET;
        f[2] = 4; // length 4 at 4..8 shares cell 4
        assert_eq!(fleet_check(R, &f), 2);
    }

    #[test]
    fn touching_ships_are_fine() {
        let f = [0, 0, 5, 0, 10, 0, 15, 0, 20, 0];
        assert_eq!(fleet_check(R, &f), 0);
    }

    #[test]
    fn bad_dir_or_bow_is_wrong_ships() {
        let mut f = FLEET;
        f[1] = 2;
        assert_eq!(fleet_check(R, &f), 3);
        let mut g = FLEET;
        g[0] = 100;
        assert_eq!(fleet_check(R, &g), 3);
    }

    #[test]
    fn wrong_ships_beats_out_of_bounds_and_overlap() {
        let mut f = FLEET;
        f[0] = 8; // out of bounds
        f[3] = 7; // bad dir
        assert_eq!(fleet_check(R, &f), 3);
    }

    #[test]
    fn random_fleets_are_valid_and_deterministic() {
        for i in 0..10_000 {
            let mut a = [0u8; 10];
            let mut b = [0u8; 10];
            assert_eq!(fleet_random(R, &seed(i), &mut a), 0);
            assert_eq!(fleet_random(R, &seed(i), &mut b), 0);
            assert_eq!(fleet_check(R, &a), 0, "seed {i}");
            assert_eq!(a, b, "seed {i}");
        }
    }

    #[test]
    fn random_fleets_vary_between_seeds() {
        let mut a = [0u8; 10];
        let mut b = [0u8; 10];
        fleet_random(R, &seed(1), &mut a);
        fleet_random(R, &seed(2), &mut b);
        assert_ne!(a, b);
    }

    #[test]
    fn miss_and_hit() {
        assert_eq!(shot_outcome(R, &FLEET, &[99]), 0);
        assert_eq!(shot_outcome(R, &FLEET, &[0]), 1);
        assert_eq!(shot_outcome(R, &FLEET, &[99, 0]), 1);
    }

    #[test]
    fn sinking_smallest_ship() {
        assert_eq!(shot_outcome(R, &FLEET, &[40, 41]), 2 + 4);
    }

    #[test]
    fn last_cell_of_last_ship_destroys_fleet() {
        let mut shots: Vec<u8> = vec![0, 1, 2, 3, 4, 10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40];
        shots.push(41);
        assert_eq!(shot_outcome(R, &FLEET, &shots), 10 + 4);
    }

    #[test]
    fn repeat_and_off_board_and_bad_input() {
        assert_eq!(shot_outcome(R, &FLEET, &[5, 5]), -1);
        assert_eq!(shot_outcome(R, &FLEET, &[100]), -2);
        assert_eq!(shot_outcome(R, &FLEET, &[]), -3);
        let mut bad = FLEET;
        bad[1] = 2;
        assert_eq!(shot_outcome(R, &bad, &[0]), -3);
    }

    #[test]
    fn invalid_earlier_shots_are_ignored() {
        // 200 is off board, 40 twice: still only 40 and 41 count toward the sink.
        assert_eq!(shot_outcome(R, &FLEET, &[200, 40, 40, 41]), 2 + 4);
    }

    #[test]
    fn board_cells_hidden_and_revealed() {
        let shots = [99, 0, 40, 41];
        let mut out = [9u8; 100];
        board_cells(R, &FLEET, &shots, false, &mut out);
        assert_eq!(out[99], 1);
        assert_eq!(out[0], 2);
        assert_eq!(out[40], 3);
        assert_eq!(out[41], 3);
        assert_eq!(out[1], 0); // intact but hidden
        assert_eq!(out[55], 0);
        board_cells(R, &FLEET, &shots, true, &mut out);
        assert_eq!(out[1], 4);
        assert_eq!(out[55], 0);
        assert_eq!(out[0], 2);
    }

    #[test]
    fn board_cells_invalid_fleet_is_unknown() {
        let mut bad = FLEET;
        bad[1] = 2;
        let mut out = [9u8; 100];
        board_cells(R, &bad, &[0], true, &mut out);
        assert!(out.iter().all(|&c| c == 0));
    }
}
