const board_src = document.querySelector("[js-board]");

class Board {

    constructor(test = false) {
        // Initialising tiles:
        this.init(test);

    }

    init (test) {

        this.test = test;
        this.tiles = [];
        this.panic = {
            w: false,
            b: false,
            w_chain: false,
            b_chain: false
        };
        this.UF = new Utile_functions(this);

        this.Recorder = new Store();


        for (let y = 7; y >= 0; y--) {
            for (let x = 0; x < 8; x++) {
                if (this.tiles[x] == undefined) {
                    this.tiles[x] = [];
                }
                this.tiles[x].unshift(new Tile(x, y, this.test, this));
            }
        }

        this.Al_control = false;

    }

    start(fen, test = false, starts = 1) {
        this.fen = fen;
        this.pieces = this.UF.fen_translator(fen, test);
        this.starts = starts;

        let selected = new Selected()
        // CORE FUNCTION!!!

        this.MI = new Mover(this, starts);
        this.MI.init_moves();

        if (test) return; // This is VERY temporary
        board_src.addEventListener("pointerdown", (e) => {

            let info = this.UF.clicked_info(e);
            this.core(selected, info);

        });

    }

    reset() {

        for (let prop in this) {
            if (prop === 'fen' || prop == 'starts') continue;
            prop = false;
        }

        this.init(true);
        this.start(this.fen, true, this.starts)

    }

    core (selected, info, Al = false) {

        if (this.MI.masterblock) return;

        if (!selected.tile && !info.occupation) return false;
        if (!selected.tile && info.occupation.color != this.MI.player) return;

        if (selected.tile == info.tile) {
            selected.reset();
            return false;
        }

        if (((!selected.tile && info.occupation) || (selected.piece && info.color == selected.piece.color)) && !Al) {
            selected = selected.update(info.tile, info.occupation);
            return false;
        }

        if (selected.piece) {

            if (this.panic[(this.MI.player > 0) ? 'w' : 'b']) {
                if (!this.panic_moves(selected.tile, info.tile)) return false;
            }

            selected.piece.moves.forEach(m => {

                if (m.x == info.tile.x && m.y == info.tile.y) {

                    this.move(selected, info);
                    return true;

                }
            });
        }

    }

    /**
     * Conducts basic moves on the board
     * @param {Selected} selected target, as defined by the class. Consists of tile and piece on the tile.
     * @param {Info} info Basically class with details about current target. Newer thing
     */
    async move (selected, info) {
        if (!selected.piece) return;
        this.Recorder.store(selected, info, this);
        this.UF.special_moves(selected, info);
        info.tile.remove_piece();
        info.tile.place_piece(selected.piece);
        selected.piece.move(info.x, info.y);
        selected.tile.remove_piece();
        selected.reset();
        await this.UF.special_promotion(info).then(_ => {
            this.MI.masterblock = false;
            this.MI.next_turn();
        });
    }

    panic_mode(king) {
        this.panic[(king.occupation.color > 0) ? 'w' : 'b'] = king;
        this.panic[(king.occupation.color > 0) ? 'w_chain' : 'b_chain'] = (king => {

            const res = [];
            let f = -1;

            for (let c = 0; c < king.attacked.length; c++) {
                const attacker = king.attacked[c].occupation;
                if (attacker.color == king.occupation.color) continue;

                f++;
                res.push([]);
                // If I am on a column, I will take everything between these 2 pieces and push it in.

                if (king.x == attacker.x && king.y != attacker.y && (attacker.acronym == 'q' || attacker.acronym == 'r')) {
                    for (let i = king.y; i >= 0 && i < 8;) {
                        if (i != king.y) {
                            res[f].push(this.UF.getTile(king.x, i));
                        }
                        if (i == attacker.y) break;
                        if (king.y > attacker.y) {
                            i--;
                            continue;
                        }
                        i++;
                    }
                }

                // Same thing, but row.
                if (king.y == attacker.y && king.x != attacker.x && (attacker.acronym == 'q' || attacker.acronym == 'r')) {
                    for (let i = king.x; i >= 0 && i < 8;) {
                        if (i != king.x) {
                            res[f].push(this.UF.getTile(i, king.y));
                        }
                        if (i == attacker.x) break;
                        if (king.x > attacker.x) {
                            i--;
                            continue;
                        }
                        i++;
                    }
                }

                if (king.y != attacker.y && king.x != attacker.x && (attacker.acronym == 'q' || attacker.acronym == 'b' || attacker.acronym == 'p')) {

                    let i = attacker.x;
                    let j = attacker.y;
                    while (i != king.x || j != king.y) {

                        res[f].push(this.UF.getTile(i, j));

                        if (king.x > attacker.x) {
                            i++;
                        }
                        else {
                            i--;
                        }

                        if (king.y > attacker.y) {
                            j++;
                        }
                        else {
                            j--;
                        }

                        if (i == king.x && j == king.y) break;

                    }

                }

                if (attacker.acronym == 'n' || attacker.acronym == 'p') {
                    res[f].push(this.UF.getTile(attacker.x, attacker.y));
                }

            }

            res[f].push(king);
            return res;

        })(king);

    }

    czechMate(king) {

        if (this.panic[(king.occupation.color > 0) ? 'w' : 'b'] !== king) return;
        for (const m of king.occupation.moves) {
            if (this.panic_moves(king, m, king)) return;
        }
        // This is the thing that screwed me over...

        const a_enemy = king.attacked.filter(a => {
            return a.occupation.color !== king.occupation.color;
        });

        if (a_enemy.length < 2) {
            for (const p of this.pieces) {
                if (p.color !== king.occupation.color) continue;
                const p_b = this.UF.getTile(p.x, p.y);
                if (!p_b) return;
                for (const m of p_b.moves) {
                    if (this.panic_moves(p_b, m, king)) return;
                }
            }
        }

        this.MI.masterblock = true;

        const win_message = `${(king.occupation.color > 0) ? 'Černá' : 'Bílá'} právě vyhrála!!!`;
        alert(win_message)

    }

    calm_mode(king) {
        this.panic[(king.occupation.color > 0) ? 'w' : 'b'] = false;
        this.panic[(king.occupation.color > 0) ? 'w_chain' : 'b_chain'] = false
    }

    /**
     *
     * @param {Tile} old Old tile from which I make a move. Typically selected.tile prop
     * @param {Tile} move New tile where I want to go. Typically info.tile prop
     * @returns {bool} Returns if the move can be considered as valid panic move.
     */
    panic_moves(old, move, king = this.panic[(this.MI.player > 0) ? 'w' : 'b']) {

        const threat = king.attacked.filter(a => {
                return a.occupation.color !== king.occupation.color;
            });
        const chain = this.panic[(king.occupation.color > 0) ? 'w_chain' : 'b_chain'];

        const threat_direction_vector = chain.map((c, i) => {

            if (c.length < 2 || threat[i].occupation.acronym == 'p' || threat[i].occupation.acronym == 'n') return false;

            const x = c[0].x - c[1].x;
            const y = c[0].y - c[1].y;

            const followup = this.UF.getTile(c[c.length - 1].x - x, c[c.length - 1].y - y);
            const predecessor = this.UF.getTile(c[c.length - 1].x + x, c[c.length - 1].y + y);

            return [predecessor, followup];

        });


        if (old.occupation.acronym == 'k') {
            // I will deny moving directly away from the threat...

            if (!move.attacked.length) return true;
            for (const a of move.attacked) {
                if (a.occupation.color !== king.occupation.color) return false;
            }

            for (const in_line of threat_direction_vector) {

                if (!in_line[0] || !in_line[1]) continue;

                for (const t of threat) {
                    if (in_line[0] == move && in_line[0] !== t) return false;
                    if (in_line[1] == move && in_line[1] !== t) return false;
                }

            }

            return true;

        }

        if (threat.length === 1) {
            const attacker = threat[0];

            if (move == attacker) return true;

            // Since there is only 1 threat, there will naturally be only 1 chain
            if (chain[0].length > 2) {

                let res = chain[0].filter(c => {

                    return c == move;

                });

                if (res.length > 0) return true;

            }

        }

        return false;

    }

    /**
     *
     * @param {Array<Tile>} beamed Array of tiles with occupation that are THEORETICALLY attacked
     */
    pin (beamed) {

        // There is king; there are only two pieces; the other piece is of different color
        let condition = [false, false, false];
        let middle = false;
        const source = beamed.shift();

        for (const t of beamed) {

            if (!t.occupation) continue;

            if (t.occupation.color === source.occupation.color) return;

            if (t.occupation.acronym !== 'k' && !condition[1]) {
                condition[1] = true;
                middle = t;
                continue;
            }

            if (t.occupation.acronym !== 'k' && condition[1]) return;

            if (t.occupation.acronym === 'k' && middle) {
                condition[0] = true;
                if (t.occupation.color !== middle.occupation.color) return;
                condition[2] = true;

                if (condition[0] && condition[1] && condition[2]) break;
                return;
            }

        }

        if (!(condition[0] && condition[1] && condition[2])) return;
        // PIN IT!

        middle.occupation.pin(source, beamed);

    }

    d_b_r() {
        this.MI.masterblock = true;
        window.alert("Deuce by repetition");
    }

    /**
     * Function which takes the current game situation and provides evaluation for given color
     * @param {int} color Color of the desired eval
     * @returns {int} Evaluation of the position
     */
    eval(color) {

        // This thing sort of works. I need to FIRST project all my moves, eliminate some under some threshold (like -100) and only THEN subtract the best counterplay.

        const rating = (x) => {

            let EVAL = 0;
            let control = 0;

            for (const t of x.UF.get_all_tiles()) {
                // Pieces I influence...
                for (const a of t.attacked) {
                    if (a.occupation.color === color) {
                        control += ((color > 0) ? t.y : 7-t.y);
                        continue;
                    }
                    control -= ((color > 0) ? 7-t.y : t.y) * .1;
                }
            }

            // My pieces:
            EVAL += 1.5 * control;

            let piece_count = 0;
            x.pieces.forEach(p => {
                if (p.x === false || p.y === false) return;
                if (p.color === color) {
                    piece_count += p.value;
                } else {
                    piece_count -= p.value * 1;
                }
            });

            EVAL += piece_count;

            // Can I possibly take? -- This one has problems...
            let offenses = 0;
            x.pieces.forEach(p => {
                if (p.x === false || p.y === false || p.color === color) return;
                const home = x.UF.getTile(p.x, p.y);
                let first = true, new_offense = 0;
                home.attacked.forEach(a => {
                    if (a.occupation.color === color) {
                        new_offense += p.value * ((first) ? 1 : 0.5);
                        first = false;
                    }
                    else {
                        new_offense *= 0.75;
                    }
                });
                offenses += new_offense;
            })

            EVAL += 4 * offenses;
            if (check[0] > 30) return;
            check[0]++;

            return EVAL;

        }

        // My positions:

        const my_moves = [];

        const x = new Board(true);
        x.start(this.Recorder.generate_report(-1), true, color);
        x.pieces.forEach(p => {
            if (p.color !== color) return;
            p.moves.forEach(m => {
                const y = new Board(true);
                y.start(this.Recorder.generate_report(-1), true, color);
                const from = new Selected(y.UF.getTile(p.x, p.y));
                const to = new Info(y.UF.getTile(m.x, m.y));

                if (y.core(from, to, true) === false) return;
                my_moves.push({from: x.UF.getTile(p.x, p.y), to: m, value: rating(y)});

            });
        });

        return my_moves;

    }

}

class Tile {

    constructor (x, y, test, board) {

        this.x = x;
        this.y = y;
        this.occupation = false;
        // COLOR?
        this.test = test;
        this.board = board;

        this.attacked = [];
        this.influenced = false;

        if (test) return;

        this.classes = (_ => {
            if ((x + !(y % 2)) % 2) {
                return ['c-board__tile', 'c-board__tile--black'];
            }
            return ['c-board__tile', 'c-board__tile--white'];
        })();

        // Placing element
        this.element = document.createElement('div');
        this.classes.forEach(c => {
            this.element.classList.add(c);
        });
        this.element.setAttribute('x', x);
        this.element.setAttribute('y', y);
        board_src.appendChild(this.element);


    }

    place_piece(piece) {
        this.occupation = piece;
        if (this.test || !piece.element) return;
        this.element.appendChild(piece.element);
    }

    remove_piece() {
        if (!this.occupation) return;
        if (this.occupation.color != this.board.MI.player) {
            this.occupation.x = false;
            this.occupation.y = false;
        }

        this.occupation = false;

        if (this.test) return;

        if (this.element.children.length) {
            this.element.removeChild(this.element.firstChild);
        }
    }

    attack (t) {
        if (!t.occupation || !t.occupation.acronym) return;
        this.attacked.push(t);
        if (this.test) return;
        let code = (t.occupation.color > 0) ? 'w' : 'b';
        this.element.classList.add("c-board__tile--attacked_" + code);
    }

    retreat() {
        this.attacked = [];
        if (this.test) return;
        this.element.classList.remove("c-board__tile--attacked_w");
        this.element.classList.remove("c-board__tile--attacked_b")
    }

}

/**
 * Class that stores info about original piece before moving
 */
class Selected {

    /**
     * Selected constructor takes in two arguments: tile
     * @param {Tile} tile targeted tile
     */
    constructor (tile = false) {
        this.tile = tile;
        this.piece = tile.occupation;

    }

    update (tile, piece) {

        if (this.piece) {
            this.piece.deactivate();
        }

        this.tile = tile;
        this.piece = piece;
        this.piece.activate();
    }

    reset () {
        this.piece.deactivate();
        this.tile = false;
        this.piece = false;
    }

}

/**
 * Parent class for individual piece classes
 * Should never be called directly
 * Contains basic piece information
 */
class Piece {
    constructor (x, y, color, test, board) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.src = '';
        this.moves = [];
        this.pinned = false;
        this.forbid_movement = false;
        this.test = test;
        this.board = board;
    }

    place() {
        this.board.UF.getTile(this.x, this.y).place_piece(this);
    }

    html(acronym, color) {
        if (this.test) return;
        this.src = 'pieces/Chess_' + acronym + ((color > 0) ? 'l' : 'd') + 't45.svg';
        this.element = document.createElement('img');
        this.element.src = this.src;
        this.element.classList.add("c-board__piece");
    }

    activate () {
        if (this.test) return;
        this.element.classList.add("c-board__piece--active");
        this.moves.forEach(m => {
            // Implement also panic function...

            if (this.board.panic[(this.color > 0) ? 'w' : 'b']) {
                // Queries for OK moves
                if (!this.board.panic_moves(this.board.UF.getTile(this.x, this.y), m)) return;
            }

            if (m.occupation) {
                m.element.classList.add("c-board__tile--take");
                return;
            }
            m.element.classList.add("c-board__tile--available");
        })
    }

    deactivate () {
        if (this.test) return;
        this.element.classList.remove("c-board__piece--active");
        this.board.UF.get_all_tiles().forEach(t => {
            t.element.classList.remove("c-board__tile--take");
            t.element.classList.remove("c-board__tile--available")
        })
    }

    move(x, y) {

        this.x = +x;
        this.y = +y;

    }

    a_push (tile) {
        if (this.forbid_movement) return;
        tile.attack(this.board.UF.getTile(this.x, this.y));
        if (tile.occupation.color == this.color) return;
        this.moves.push(tile);
    }

    validate_moves(beamed, x, y) {
        // How to set beamed here? 

        const t = this.board.UF.getTile(x, y);
        if (!t) return false;
        if (t.occupation) {
            if (t.occupation.color != this.color) {
                if (!beamed.length) {
                    this.a_push(t);
                }
                return true;
            }
            if (!beamed.length) {
                t.attack(this.board.UF.getTile(this.x, this.y))
            }
            return true;
        }
        if (!beamed.length) {
            this.a_push(t);
        }
        return (beamed => {
            if (!beamed.length) return false;
            return true;
        })(beamed);
    }

    pin (threat, beamed) {

        const pinned_moves = [];

        this.moves.forEach(m => {
            if (m === threat) {
                pinned_moves.push(m);
                return;
            }
            threat.occupation.moves.forEach(t => {
                if (m === t) {
                    pinned_moves.push(m);
                    return;
                }

                for (const b of beamed) {
                    if (b === m) {
                        pinned_moves.push(m);
                        continue;
                    }
                    if (!b.occupation.acronym == 'k') break;
                }
            });
        });

        this.moves = pinned_moves;

    }

}

class Pawn extends Piece {
    constructor (x, y, color, test, board) {
        super (x, y, color, test, board);
        this.acronym = 'p';
        this.type = 'Pawn';
        this.value = 1;
        this.html(this.acronym, this.color);
        this.moved = false;
        this.first_move = true;
    }

    f_moves() {
        // Regular moves
        let tile1 = this.board.UF.getTile(this.x, this.y + this.color);
        if (tile1 && !tile1.occupation) {
            this.moves.push(tile1);

            let tile2 = this.board.UF.getTile(this.x, this.y + 2 * this.color);
            if (tile2 && !tile2.occupation && this.first_move && this.y == ((this.color > 0) ? 1 : 6)) {
                this.moves.push(tile2);
            }
        }

        const koeficient = [-1, 1];
        koeficient.forEach(k => {
            const focus = this.board.UF.getTile(this.x + k, this.y + this.color);
            if (focus) {
                focus.attack(this.board.UF.getTile(this.x, this.y));
                if (focus.occupation && focus.occupation.color != this.color) {
                    this.moves.push(focus);
                }
            }
        });

        // En passant:
        let last_move = this.board.Recorder.moves[this.board.Recorder.moves.length - 1];
        if (!last_move) return;
        if (last_move.piece.acronym == 'p') {
            if (Math.abs(last_move.from.y - last_move.to.y) == 2) {
                if (this.y == last_move.to.y && Math.abs(this.x - last_move.to.x) == 1) {
                    this.a_push(this.board.UF.getTile(last_move.to.x, last_move.to.y + this.color));
                }
            }
        }

    }

}

class Rook extends Piece {   
    constructor (x, y, color, test, board) {
        super(x, y, color, test, board);

        this.acronym = 'r';
        this.type = 'Rook';
        this.value = 5;
        this.html(this.acronym, this.color);
        this.first_move = true;
    }

    f_moves() {

        let beamed = [];
        for (let i = this.x - 1; i >= 0; i--) {
            if (this.validate_moves(beamed, i, this.y)) {
                beamed.push(this.board.UF.getTile(i, this.y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.x + 1; i < 8; i++) {
            if (this.validate_moves(beamed, i, this.y)) {
                beamed.push(this.board.UF.getTile(i, this.y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.y - 1; i >= 0; i--) {
            if (this.validate_moves(beamed, this.x, i)) {
                beamed.push(this.board.UF.getTile(this.x, i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.y + 1; i < 8; i++) {
            if (this.validate_moves(beamed, this.x, i)) {
                beamed.push(this.board.UF.getTile(this.x, i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

    }

}

class Knight extends Piece {
    constructor (x, y, color, test, board) {
        super(x, y, color, test, board);

        this.acronym = 'n';
        this.type = 'Knight';
        this.value = 3;
        this.html(this.acronym, this.color);
    }

    f_moves() {
        for (let i = 1; i < 3; i++) {
            for (let j = 1; j < 3; j++) {
                if (i + j == 3 || Math.abs(i - j) == 3) {
                    const generator = combinations(i, j, this.x, this.y);
                    for (let _ = 0; _ < 4; _++) {
                        let s_gt = this.board.UF.getTile(...generator.next().value)
                        if (!s_gt) continue;
                        if (s_gt.occupation.color != this.color) {
                            this.a_push(s_gt);
                            continue;
                        }
                        s_gt.attack(this.board.UF.getTile(this.x, this.y));
                    }
                }
            }
        }
    }
}

class Bishop extends Piece {
    constructor (x, y, color, test, board) {
        super(x, y, color, test, board);

        this.acronym = 'b';
        this.type = 'Bishop';
        this.value = 3;
        this.html(this.acronym, this.color);
    }

    f_moves() {

        let i = 0, beamed = [];
        for (let x = this.x + 1; x < 8; x++) {
            i--;
            if (this.validate_moves(beamed, x, this.y + i)) {
                beamed.push(this.board.UF.getTile(x, this.y + i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let x = this.x - 1; x >= 0; x--) {
            i++;
            if (this.validate_moves(beamed, x, this.y + i)) {
                beamed.push(this.board.UF.getTile(x, this.y + i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let y = this.y - 1; y >= 0; y--) {
            i--;
            if (this.validate_moves(beamed, this.x + i, y)) {
                beamed.push(this.board.UF.getTile(this.x + i, y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let y = this.y + 1; y < 8; y++) {
            i++;
            if (this.validate_moves(beamed, this.x + i, y)) {
                beamed.push(this.board.UF.getTile(this.x + i, y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

    }
}

class Queen extends Piece {
    constructor (x, y, color, test, board) {
        super(x, y, color, test, board);

        this.acronym = 'q';
        this.type = 'Queen';
        this.value = 9;
        this.html(this.acronym, this.color);
    }

    f_moves() {

        let i = 0, beamed = [];

        for (let x = this.x + 1; x < 8; x++) {
            i--;
            if (this.validate_moves(beamed, x, this.y + i)) {
                beamed.push(this.board.UF.getTile(x, this.y + i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let x = this.x - 1; x >= 0; x--) {
            i++;
            if (this.validate_moves(beamed, x, this.y + i)) {
                beamed.push(this.board.UF.getTile(x, this.y + i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let y = this.y - 1; y >= 0; y--) {
            i--;
            if (this.validate_moves(beamed, this.x + i, y)) {
                beamed.push(this.board.UF.getTile(this.x + i, y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        i = 0, beamed = [];
        for (let y = this.y + 1; y < 8; y++) {
            i++;
            if (this.validate_moves(beamed, this.x + i, y)) {
                beamed.push(this.board.UF.getTile(this.x + i, y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        // Rook-like
        beamed = [];
        for (let i = this.x - 1; i >= 0; i--) {
            if (this.validate_moves(beamed, i, this.y)) {
                beamed.push(this.board.UF.getTile(i, this.y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.x + 1; i < 8; i++) {
            if (this.validate_moves(beamed, i, this.y)) {
                beamed.push(this.board.UF.getTile(i, this.y));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.y - 1; i >= 0; i--) {
            if (this.validate_moves(beamed, this.x, i)) {
                beamed.push(this.board.UF.getTile(this.x, i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

        beamed = [];
        for (let i = this.y + 1; i < 8; i++) {
            if (this.validate_moves(beamed, this.x, i)) {
                beamed.push(this.board.UF.getTile(this.x, i));
            }
        }
        beamed.unshift(this.board.UF.getTile(this.x, this.y));
        this.board.pin(beamed);

    }

}

/**
 * Too complex, needs documentation.
 * I basically need inputs from literally all pieces, since their position isn't really enough for me. I need to know about checks and so on.
 * Therefore, I have designed f_attacks function, which gets call BEFORE the main f_moves function.
 * This just goes through tiles around and marks them as attacked. Both colors then interact with forcefields in round 2, when all forcefields are set.
 * Round 2 = f_moves()
 */
class King extends Piece {
    // A strong contender for rewriting into something more legible...
    constructor (x, y, color, test, board) {
        super(x, y, color, test, board);

        this.acronym = 'k';
        this.type = 'King';
        this.value = 100;
        this.html(this.acronym, this.color);
        this.first_move = true;
    }

    f_attacks() {
        for (let i = -1; i < 2; i++) {
            for (let j = -1; j < 2; j++) {
                if (i == 0 && j == 0) continue;
                const focus = this.board.UF.getTile(this.x + i, this.y + j);
                if (!focus) continue;
                focus.attack(this.board.UF.getTile(this.x, this.y));
            }
        }
    }

    f_moves() {

        this.moves = [];
        if (this.board.UF.attacked_by_enemy(this.board.UF.getTile(this.x, this.y), this)) {
            this.board.panic_mode(this.board.UF.getTile(this.x, this.y));
        }
        else {
            this.board.calm_mode(this.board.UF.getTile(this.x, this.y));
        }

        for (let i = -1; i < 2; i++) {
            for (let j = -1; j < 2; j++) {
                if (i == 0 && j == 0) continue;
                let s_gt = this.board.UF.getTile(this.x + i, this.y + j)
                if (!s_gt) continue;
                if (!s_gt.occupation || s_gt.occupation.color != this.color) {
                    const prot = (s_gt => {
                        let block = false;
                        for (const x of s_gt.attacked) {
                            if (x.occupation.color !== this.color) {
                                block = true;
                                break;
                            }
                        }
                        return block;
                    })(s_gt);
                    if (prot) continue;
                    this.moves.push(s_gt);
                }
            }
        }

        const res_castle = i => {

            let i_tile = this.board.UF.getTile(i, this.y);
            for (const a of i_tile.attacked) {
                if (a.occupation.color !== this.color) return false;
            }
            let increment = (i > 4) ? 2 : -2;
            if ((i == 7 || i == 0) && i_tile.occupation && i_tile.occupation.acronym == 'r' && i_tile.occupation.color == this.color && i_tile.occupation.first_move) {
                this.moves.push(this.board.UF.getTile(this.x + increment, this.y));
                return false;
            }
            if (i_tile.occupation) return false;
            return true;
        }

        // Castles:
        if (this.first_move && this.x == 4 && this.y == ((this.color > 0) ? 0 : 7)) {
            // Start thinking...
            for (let i = this.x + 1; i < 8; i++) {
                if (!res_castle(i)) break;
            }

            for (let i = this.x - 1; i >= 0; i--) {
                if (!res_castle(i)) break;
            }

        }

    }

}

class Info {

    /**
     * @param {Tile} tile Wants a tile object, basically a piece destination
     */
    constructor (tile) {
        this.tile = tile;
        this.x = tile.x;
        this.y = tile.y;
        this.occupation = this.tile.occupation;
        this.color = (this.tile.occupation) ? this.occupation.color : false;
    }
}

// Used for knight jumps
function* combinations(i, j, x, y) {
    yield [x + i, y + j];
    yield [x - i, y - j];
    yield [x + i, y - j];
    yield [x - i, y + j];
}

class Store {
    constructor() {
        this.moves = [];
        this.boards = [];
        this.deuce_available = false;
    }
    store(selected, info, board) {
        this.moves.push({
            piece: selected.piece,
            color: selected.piece.color,
            from: selected.tile,
            to: info.tile
        });
        this.boards.push(board);

        this.deuce_by_repetition();

    }
    /**
     * Console-side testing function that produces a fen string from current situation. 
     * @param {int} move Move from which report should be generated. First move has value 1! Count from the end > negatives
     * @returns {string} Fen string with information
     */
    generate_report(move) {
        if (move < 0) {
            move = this.boards.length + 1 + move;
        }
        move--;

        let res = '';
        let counter = 0;
        const append = (piece) => {

            if (!piece) {
                counter ++;

                if (counter > 7) {
                    res += counter;
                    counter = 0;
                }

                return;
            }
            if (counter) {
                res += counter;
            }
            counter = 0;

            if (piece.color > 0) {
                res += piece.acronym.toLowerCase();
                return;
            }
                res += piece.acronym.toUpperCase();
        }

        for (let i = 0; i < 8; i++) {
            this.boards[move].tiles.forEach(c => {
                append(c[i].occupation);
            });
            if (counter) {
                res += counter;
                counter = 0;
            }
            if (i == 7) break;
            res += '/';
        }

        return res;

    }

    deuce_by_repetition() {

        let check = [];
        if (!this.moves.length) return;

        for (let i = this.moves.length - 1; i > this.moves.length - 8; i = i - 2) {
            if (!this.moves[i]) return;
            check.push(this.moves[i].to);
        }
        if (check[0] == check[2] && check[1] == check[3] && check[4] == check[6]) {
            if (this.deuce_available) {
                board.d_b_r();
                return;
            }
            this.deuce_available = true;
            return;
        }
        this.deuce_available = false;
        return;
    }

}

class Mover {

    constructor(board, starts) {
        this.player = starts;
        this.turn = 1;
        this.masterblock = false;
        this.disabled_Al = false;
        this.board = board;
    }

    next_turn() {

        this.turn++;
        this.player *= -1;

        this.check_for_deuce();
        this.init_moves();
        this.deuce_no_moves(1);
        this.deuce_no_moves(-1);

        if (this.board.test) return;

        if (this.player > 0) return;

        setTimeout(_ => {
            this.Al();
        }, Math.floor(Math.random() * 300));

    }

    Al () {
        if (!this.disabled_Al) {
            new Al_move(this.board);
        }
    }

    /**
     * @param {boolean} b Status of Al
     */
    toggle_Al(b) {
        this.disabled_Al = !b;
    }

    check_for_deuce() {

        const kings = [];
        for (const p of this.board.pieces) {
            if (p.x === false || p.y === false) continue;
            if (p.acronym !== 'k') return;
            kings.push(p);
        }

        if (kings.length !== 2) return;
        window.alert("Remíza na materiál")
        this.masterblock = true;

    }

    deuce_no_moves(color) {

        if (this.board.panic[(this.player > 0) ? 'w' : 'b']) return;
        const pieces = this.board.pieces.filter(p => {
            return p.color === color;
        });

        for (const p of pieces) {
            if (p.moves.length) return;
            for (const m of p.moves) {
                if (this.board.panic_moves(this.board.UF.getTile(p.x, p.y), m)) return;
            }
        }

        window.alert("Remíza na nemožnost pohybu")
        this.masterblock = true;

    }

    init_moves() {
        this.board.UF.get_all_tiles().forEach(t => {
            t.retreat();
        });
        const kings = [];
        this.board.pieces.forEach(p => {
            p.moves = [];
            if (p.acronym == 'k') {
                kings.push(p);
                return;
            }
            p.f_moves();
        });
        kings.forEach(k => {
            k.f_attacks();
        })
        kings.forEach(k => {
            k.f_moves();
            this.board.czechMate(this.board.UF.getTile(k.x, k.y));
        });
    }
}

class Al_move {

    constructor(board) {

        this.my_pieces = [];
        this.board = board;

        this.board.Al_control = -1;

        this.update_pieces();
        this.spent = [];

        this.self_weighted_move();

    }

    self_weighted_move() {
        const results = this.board.eval(this.board.Al_control);
        const results_sorted = this.board.UF.quickSortMoves(results, 0, results.length - 1);
        console.log(results_sorted);

        for (let i = 0; i < results_sorted.length; i++) {
            const from = new Selected(this.board.UF.getTile(results_sorted[i].from.x, results_sorted[i].from.y));
            const to   = new Info    (this.board.UF.getTile(results_sorted[i].to  .x, results_sorted[i].to.  y));
            if (this.board.core(from, to, true) === false) continue;
            break;
        }

    }

    update_pieces() {
        this.my_pieces = this.board.pieces.filter(p => {
            return p.x && p.y && p.color === this.board.Al_control;
        });
    }

    random_move() {

        // Narrow down selection, optimize. TMR / Whenever.
        // Continue testing and debugging with random moves.

        const pick_piece = () => {

            const piece = this.my_pieces[Math.floor(Math.random() * this.my_pieces.length)];

            if (piece.moves.length) return piece;
            return pick_piece();

        }

        const piece = pick_piece();

        const move = piece.moves[Math.floor(Math.random() * piece.moves.length)];

        const origin = new Selected(this.board.UF.getTile(piece.x, piece.y));
        if (this.spent.indexOf(origin) > 0) {
            this.random_move();
            return;
        }
        this.spent.push(origin);
        const target = new Info(move);

        const output = this.board.core(origin, target, true);

        if (output === false) {
            this.random_move();
        }
        if (output === undefined) return

    }

}

class Utile_functions {
    constructor(b) {
        this.board = b;
    }

    attacked_by_enemy (tile, piece) {
        for (const a of tile.attacked) {
            if (a.occupation.color != piece.color) return true;
        }
        return false;
    }

    special_moves(selected, info) {
        // Detekce prvního pohybu, rošády, en-passant možnost,...
        if ((selected.piece.acronym == 'p' || selected.piece.acronym == 'k' || selected.piece.acronym == 'r') && selected.piece.first_move) {
            selected.piece.first_move = false;
        }
        // Detect if player is trying to do en passant:
        if (selected.piece.acronym == 'p' && info.tile.x != selected.tile.x && !info.tile.occupation) {
            // Do all necessary en passant steps:
            let ptr = this.board.UF.getTile(info.x, info.y - selected.piece.color);
            ptr.remove_piece();
        }
    
        // Detect castles
        if (selected.piece.acronym == 'k' && Math.abs(selected.tile.x - info.x) == 2) {
    
            // Castle!
            let ptm = this.board.UF.getTile((info.x > 4) ? 7 : 0, info.y);
            let target = this.board.UF.getTile((info.x < 4) ? 3 : 5, info.y);
            ptm.occupation.move(target.x, target.y);
            target.place_piece(ptm.occupation)
            ptm.remove_piece();
    
        }
    
    }

        /**
     * @param {Event} e Pointer event associated with a click.
     * @returns {Info} Info object contains shortcuts to all tile information
     */
    clicked_info(e) {

        let target = e.target;
        if (e.target instanceof HTMLImageElement) {
            target = e.target.parentNode;
        }
        let x = target.getAttribute("x");
        let y = target.getAttribute("y");

        return new Info(this.board.UF.getTile(x, y));

    }

    special_promotion(info) {

        return new Promise ((resolve, reject) => {

            const piece = this.board.UF.getTile(info.x, info.y).occupation;

            if (piece.acronym !== 'p') {
                resolve();
                return;
            }

            const target = (piece.color > 0) ? 7 : 0;

            if (info.y != target) {
                resolve();
                return;
            }

            if (piece.color < 0) {
                _promote_event(piece, 'q', this.board, true);
                resolve();
                return;
            }

            this.board.MI.masterblock = true;

            const prom = document.querySelector("[js-prom]");
            prom.classList.toggle("c-promotion--active");
            const prom_children = prom.children;
            const pieces = ['r', 'n', 'b', 'q'];
            const srcs = _ => {
                const code = (piece.color > 0) ? 'l' : 'd';
                const res = pieces.map(p => {
                    return `pieces/Chess_${p}${code}t45.svg`;
                })

                return res;
            }
            srcs().forEach((v, i) => {
                const option = prom_children[i];
                const img = document.createElement('img');
                img.classList.add("c-promotion__tab");
                img.src = v;
                img.setAttribute("piece", pieces[i]);
                option.appendChild(img);
            });

            // Working section...

            /**
             * 
             * @param {Piece} piece Original pawn that arrived
             * @param {String} piece_to_change A string code for the new piece
             * @param {Bool} Al Is it Al?
             * @returns 
             */
            function _promote_event(piece, piece_to_change, board, Al = false) {
                
                const p_tile = board.UF.getTile(piece.x, piece.y);

                // const new_piece = new Queen(piece.x, piece.y, piece.color);
                const args = [piece.x, piece.y, piece.color, board.MI.Al_control, board];

                let new_piece;
                switch(piece_to_change) {
                    case 'q':
                        new_piece = new Queen(...args);
                        break;
                    case 'r':
                        new_piece = new Rook(...args);
                        break;
                    case 'b':
                        new_piece = new Bishop(...args);
                        break;
                    case 'n':
                        new_piece = new Knight(...args);
                        break;
                    default:
                        new_piece = new Queen(...args);
                }

                p_tile.remove_piece();

                p_tile.place_piece(new_piece);
                board.pieces.push(new_piece);

            }

            prom.addEventListener("pointerdown", e => {
                const target = e.target;
                if (!target.getAttribute('piece')) return;
                const piece_to_change = target.getAttribute('piece');

                _promote_event(piece, piece_to_change, this.board);

                for (const c of prom_children) {
                    c.removeChild(c.children[0])
                }

                prom.classList.toggle("c-promotion--active");

                resolve();
                return;

            }, {once: true});


        });

    }

        /**
     * Utile function that returns all tiles in one single array
     */
    get_all_tiles() {

        let all = [];
        this.board.tiles.forEach(t_row => {
            t_row.forEach(t => {
                all.push(t);
            })
        })

        return all;

    }

    /**
     * A shortcut utile function, which fetches queried tile
     * @param {number} x X coordinate
     * @param {number} y Y coordinate
     * @returns {Tile} Tile object, which is further accessible
     */
    getTile(x, y) {
        let x_safe = parseInt(+x), y_safe = parseInt(+y);
        if (x_safe > 7 || x_safe < 0 || y_safe > 7 || y_safe < 0) return false;
        return this.board.tiles[x_safe][y_safe];
    }


    /**
     * Function that translates fen string
     * @param fen - string to translate
     * @param place - decides whether should I place the piece or return everything in an array
     */
    fen_translator (fen, test = false) {
        const res = [];

        let y = 0, x = 0;
        for (let ch of fen) {
            if (parseInt(ch)) {
                x += +ch;
                continue;
            }
            if (x >= 8 || ch == '/') {
                x = 0;
                y ++;
                if (ch == '/') continue;
            }

            let color = ch => {
                if (ch === ch.toUpperCase()) return -1;
                return 1;
            };

            switch (ch.toLowerCase()) {
                case ("p"): {
                    res.push(new Pawn(x, y, color(ch), test, this.board));
                    break;
                }
                case ("r"): {
                    res.push(new Rook(x, y, color(ch), test, this.board));
                    break;
                }
                case ("b"): {
                    res.push(new Bishop(x, y, color(ch), test, this.board));
                    break;
                }
                case ("n"): {
                    res.push(new Knight(x, y, color(ch), test, this.board));
                    break;
                }
                case ("q"): {
                    res.push(new Queen(x, y, color(ch), test, this.board));
                    break;
                }
                case ("k"): {
                    res.push(new King(x, y, color(ch), test, this.board));
                    break;
                }
            }
            res[res.length - 1].place(test);

            x++;
        }

        return res;
    }

    /**
     * Helper function for Quick sort
     * @param {Array} items Array to sort
     * @param {number} leftIndex Start
     * @param {number} rightIndex End
     */
    swap(items, leftIndex, rightIndex){
        let temp = items[leftIndex];
        items[leftIndex] = items[rightIndex];
        items[rightIndex] = temp;
    }
    /**
     * Part of QSM function. Do not call manually.
     * @param {Array} items Array to sort
     * @param {number} left Sort from here
     * @param {number} right Sort to this index
     * @returns Index of the next middle
     */
    partition(items, left, right) {
        let pivot   = items[Math.floor((right + left) / 2)], //middle element
            i       = left, //left pointer
            j       = right; //right pointer
        while (i <= j) {
            while (items[i].value > pivot.value) {
                i++;
            }
            while (items[j].value < pivot.value) {
                j--;
            }
            if (i <= j) {
                this.swap(items, i, j); //sawpping two elements
                i++;
                j--;
            }
        }
        return i;
    }
    
    /**
     * @param {array} items Original array to be sorted
     * @param {number} left Initial position, typically 0
     * @param {number} right Initial end position, typically items.length - 1
     * @returns Sorted array
     */
    quickSortMoves(items, left, right) {
        let index;
        if (items.length > 1) {
            index = this.partition(items, left, right);
            if (left < index - 1) { //more elements on the left side of the pivot
                this.quickSortMoves(items, left, index - 1);
            }
            if (index < right) { //more elements on the right side of the pivot
                this.quickSortMoves(items, index, right);
            }
        }
        return items;
    }

}

function Chess (fen) {

    const board = new Board();
    board.start(fen);

}

const check = [0];

const norm = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
Chess(norm);
