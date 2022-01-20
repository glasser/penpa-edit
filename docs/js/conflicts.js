class Conflicts {
    constructor(pu) {
        this.pu = pu;
        // Some validation functions or calculation functions may request the
        // same data multiple times on the same puzzle state, so we cache the
        // data and use get_data() to broker this.
        this.data_cache = [];
        // Answer numbers should be either blue, light blue, red, or green.
        this.permit_number_colors = new Set([2, 8, 9, 10]);
        // Fow now only check large numbers for conflicts.
        this.permit_number_size = new Set(["1"]);
    }

    reset() {
        this.data_cache = [];
        this.pu.conflict_cells = [];
    }

    get_data(item) {
        let function_name = 'calculate_' + item;
        if (!this.data_cache[function_name]) {
            // Don't have cached, calculate by running function.
            this.data_cache[function_name] = this[function_name]();
        }
        return this.data_cache[function_name];
    }

    //========================================================================
    // check_* function family:
    // Check solutions and mark any conflicts.
    //========================================================================

    // For an NxN grid, mark any duplicates between 1 and N as conflicts.
    check_latin_square() {
        const data = this.get_data('number_grid');
        const n = data.length;
        if (!n || data[0].length !== n) {
            // Empty or not square
            return;
        }
        const row = new Array(n);
        const col = new Array(n);
        for (let i = 0; i < n; i++) {
            row.fill(0);
            col.fill(0);
            let row_conflict = false;
            let col_conflict = false;
            for (let j = 0; j < n; j++) {
                // Subtract one to get 0-based index.
                const row_el = data[i][j] - 1;
                const col_el = data[j][i] - 1;
                if (row_el >= 0 && row_el < n) {
                    if (row[row_el]++) {
                        row_conflict = true;
                    }
                }
                if (col_el >= 0 && col_el < n) {
                    if (col[col_el]++) {
                        col_conflict = true;
                    }
                }
            }
            // Mark whole row as in conflict.
            // We could also consider just marking the affected cells?
            if (row_conflict) {
                for (let j = 0; j < n; j++) {
                    this.add_conflict(j, i);
                }
            }
            // Mark whole column as in conflict.
            if (col_conflict) {
                for (let j = 0; j < n; j++) {
                    this.add_conflict(i, j);
                }
            }
        }
    }

    // Check a classic sudoku puzzle.
    check_sudoku() {
        const data = this.get_data('number_grid');
        const n = data.length;
        if (n !== 9 || data[0].length !== 9) {
            // Not a 9x9 grid
            return;
        }
        this.check_latin_square();
        // Stop early if there are already conflicts.
        if (this.has_conflicts()) return;
        // Check 3x3 cells
        const cell = new Array(9);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                cell.fill(0);
                let cell_conflict = false;
                // Iterate over cell starting at (3i, 3j)
                for (let k = 0; k < 3; k++) {
                    for (let l = 0; l < 3; l++) {
                        // Convert to 0-based index
                        const el = data[3*i+k][3*j+l] - 1;
                        if (!(el >= 0 && el < n)) continue;
                        if (cell[el]++) {
                            cell_conflict = true;
                            break;
                        }
                    }
                }
                if (!cell_conflict) continue;
                // Mark whole cell as in conflict.
                // We could also consider just marking the affected cells?
                for (let k = 0; k < 3; k++) {
                    for (let l = 0; l < 3; l++) {
                        this.add_conflict(3*j+l, 3*i+k);
                    }
                }
            }
        }
    }

    // Check that consecutive values are only present exactly where bars are
    // between cells.
    check_consecutive() {
        const data = this.get_data('number_grid');
        const bars = this.get_data('grey_bars');

        // Helper subfunction. Checks the cell values and adds conflicts.
        const check_neighbors = function(x1, y1, index1, num1, x2, y2) {
            const index2 = this.xy_to_index(x2, y2);
            const num2 = data[y2][x2];
            if (isNaN(num2)) return;
            // Either zero or two of these should be true, otherwise we have a
            // conflict.
            const consecutive = Math.abs(num1 - num2) === 1;
            const has_bar = bars.has(index1 + ',' + index2);
            if (consecutive + has_bar === 1) {
                this.add_conflict(x1, y1);
                this.add_conflict(x2, y2);
            }
        }.bind(this);

        for (let y = 0; y < data.length; y++) {
            for (let x = 0; x < data[y].length; x++) {
                const index = this.xy_to_index(x, y);
                const num = data[y][x];
                if (isNaN(num)) continue;
                if (x + 1 < data[y].length) {
                    // Check right neighbor
                    check_neighbors(x, y, index, num, x+1, y);
                }
                if (y + 1 < data.length) {
                    // Check down neighbor
                    check_neighbors(x, y, index, num, x, y+1);
                }
            }
        }
    }

    // Check Star Battle puzzle.
    check_star_battle() {
        // Assume that there is a single number in the grid with the number
        // of stars per row/col/region.
        const number_keys = Object.keys(this.pu.pu_q.number);
        if (number_keys.length !== 1) return;
        const star_number = this.pu.pu_q.number[number_keys[0]];
        if (!Array.isArray(star_number) || star_number.length !== 3) return;
        // This is the number of stars per row/col/region.
        const nstars = parseInt(star_number[0]);
        if (nstars <= 0) return;

        // Get grids
        const stars = this.get_data('star_grid');
        const regions = this.get_data('region_grid');
        const n = stars.length;
        if (!n || stars[0].length !== n || regions.length !== n
            || regions[0].length !== n || regions.number_of_regions !== n) {
            // Unexpected grid data
            return;
        }

        // Helper function to check a neighbor. If (x2,y2) is also a star,
        // mark both as a conflict.
        const check_neighbor = function(x1, y1, x2, y2) {
            if (x2 < 0 || x2 >= n || y2 < 0 || y2 >= n) return;
            if (stars[y2][x2] === 0) return;
            this.add_conflict(x1, y1);
            this.add_conflict(x2, y2);
        }.bind(this);

        // Check neighbors
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (stars[y][x] === 0) continue;
                check_neighbor(x, y, x + 1, y); // Right
                check_neighbor(x, y, x - 1, y + 1); // Lower-left
                check_neighbor(x, y, x    , y + 1); // Lower
                check_neighbor(x, y, x + 1, y + 1); // Lower-right
            }
        }

        // Check rows and column conflicts.
        for (let i = 0; i < n; i++) {
            let row_sum = 0;
            let col_sum = 0;
            for (let j = 0; j < n; j++) {
                row_sum += stars[i][j];
                col_sum += stars[j][i];
            }
            if (row_sum > nstars) {
                for (let j = 0; j < n; j++) this.add_conflict(j, i);
            }
            if (col_sum > nstars) {
                for (let j = 0; j < n; j++) this.add_conflict(i, j);
            }
        }

        // Stop here if we already found conflicts.
        if (this.has_conflicts()) return;

        // Check region conflicts.
        const region_sums = [];
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (!(regions[y][x] in region_sums)) {
                    region_sums[regions[y][x]] = 0;
                }
                region_sums[regions[y][x]] += stars[y][x];
            }
        }
        if (region_sums.every(function(x) { return x <= nstars; })) {
            // Region sums okay.
            return;
        }
        // Mark region conflicts.
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (region_sums[regions[y][x]] > nstars) {
                    this.add_conflict(x, y);
                }
            }
        }
    }

    //========================================================================
    // calculate_* function family:
    // The purpose of these functions is to take the Puzzle instance, read the
    // question or answer data and produce meaningful data structures for
    // processing by check_* functions.
    //========================================================================

    // Get all the numbers from the grid (either question or answer) and
    // convert these to a 2D array.
    calculate_number_grid() {
        const nx = parseInt(this.pu.nx) - this.pu.space[2] - this.pu.space[3];
        const ny = parseInt(this.pu.ny) - this.pu.space[0] - this.pu.space[1];
        const grid = [];
        for (let i = 0; i < ny; i++) {
            let row = [];
            for (let j = 0; j < nx; j++) {
                row.push(this.read_number(j, i));
            }
            grid.push(row);
        }
        return grid;
    }

    // In consecutive sudoku puzzles there are bars between some cells.
    // Returns a set of sorted cell index pairs "index1,index2" for all cells
    // with a grey bar between them.
    calculate_grey_bars() {
        const bars = new Set();
        const symbol_indices = Object.keys(this.pu.pu_q.symbol);
        for (let index of symbol_indices) {
            const symbol = this.pu.pu_q.symbol[index];
            if (!Array.isArray(symbol) || symbol[1] !== "bars_G") {
                // Not a grey bar.
                continue;
            }
            const point = this.pu.point[index];
            if (!point || !point.neighbor || point.neighbor.length != 2 ||
                point.neighbor[0] == point.neighbor[1]) {
                // Unexpected neighbor data.
                continue;
            }
            const neighbor = point.neighbor.sort(function(a,b){return a-b;});
            bars.add(neighbor.join(','));
        }
        return bars;
    }

    // Calculate grid of star positions in the answer.
    // Where stars are present, the value will be 1, and where stars are absent
    // the value will be 0.
    calculate_star_grid() {
        const nx = parseInt(this.pu.nx) - this.pu.space[2] - this.pu.space[3];
        const ny = parseInt(this.pu.ny) - this.pu.space[0] - this.pu.space[1];
        const grid = [];
        for (let y = 0; y < ny; y++) {
            let row = [];
            for (let x = 0; x < nx; x++) {
                const index = this.xy_to_index(x, y);
                const symbol = this.pu.pu_a.symbol[index];
                // Only look for stars.
                const have_star = Array.isArray(symbol)
                                  && symbol.length === 3
                                  && symbol[0] === 2
                                  && symbol[1] === "star";
                row.push(0 + have_star);
            }
            grid.push(row);
        }
        return grid;
    }

    // Calculate bold regions as a grid.
    calculate_region_grid() {
        const regiondata = this.pu.getregiondata(this.pu.ny, this.pu.nx, "pu_q", false);
        const regions = this.trim_space_from_grid(regiondata);

        // Count and renumber as we go.
        const renumber = [];
        let number_of_regions = 0;
        for (const row of regions) {
            for (let i = 0; i < row.length; i++) {
                if (!(row[i] in renumber)) {
                    renumber[row[i]] = number_of_regions;
                    number_of_regions++;
                }
                row[i] = renumber[row[i]];
            }
        }
        regions.number_of_regions = number_of_regions;
        return regions;
    }

    //========================================================================
    // Helper functions
    //========================================================================

    // Read a single number from either the answer or question, that may be
    // any size but must be a shade of blue, green or red. The coordinates
    // x and y are relative to the puzzle grid.
    // Returns -1 if there is no number present of the designated color.
    read_number(x, y) {
        // Add space above and to the left.
        const index = this.xy_to_index(x, y);
        // For the question entry we check that it is black and large
        let entry = this.pu.pu_q.number[index];
        if (Array.isArray(entry) && entry.length === 3
            && entry[2] === "1" // Large
            && entry[1] === 1 // black
            && Number.isFinite(parseInt(entry[0]))) {
            return parseInt(entry[0]);
        }
        // For the answer entry we allow more colors/sizes
        entry = this.pu.pu_a.number[index];
        if (Array.isArray(entry) && entry.length === 3
            && this.permit_number_size.has(entry[2]) // Large
            && this.permit_number_colors.has(entry[1]) // black
            && Number.isFinite(parseInt(entry[0]))) {
            return parseInt(entry[0]);
        }
        return undefined;
    }

    // Add a cell as in conflict. The coordinates x and y are relative to the
    // puzzle grid.
    add_conflict(x, y) {
        // Add space above and to the left.
        const index = this.xy_to_index(x, y);
        if (this.pu.conflict_cells.includes(index)) return;
        this.pu.conflict_cells.push(index);
    }

    // Return whether there are already conflicts found.
    has_conflicts() {
        return this.pu.conflict_cells.length > 0;
    }

    // Convert an (x,y) coordinate, relative to the puzzle grid, to the pu index.
    xy_to_index(x, y) {
        return this.pu.nx0 * (y + this.pu.space[0] + 2) + x + this.pu.space[2] + 2;
    }

    // Convert a pu index to an (x,y) coordinate. Returns an array [x,y].
    index_to_xy(index) {
        const x = (index % this.pu.nx0) - this.pu.space[2] - 2;
        const y = Math.floor(index / this.pu.nx0) - this.pu.space[0] - 2;
        return [x,y];
    }

    // When a grid is calculated in terms of nx/ny, it will have extra space
    // that we want to remove.
    trim_space_from_grid(grid) {
        grid.splice(0, this.pu.space[0]); // Remove rows in space above
        grid.splice(-this.pu.space[1], this.pu.space[1]); // Space below
        // Count and renumber as we go.
        for (const row of grid) {
            row.splice(0, this.pu.space[2]); // Space to the left
            row.splice(-this.pu.space[3], this.pu.space[3]); // Right
        }
        return grid;
    }
}
