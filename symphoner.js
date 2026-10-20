const digit = {
    A: 0,
    C: 1,
    G: 2,
    T: 3
};

const standard_pitchmap = [
    { min: 0,  max: 16, note_num: 0 },  // C
    { min: 16, max: 32, note_num: 2 },  // D
    { min: 32, max: 48, note_num: 4 },  // E
    { min: 48, max: 64, note_num: 7 },  // G
];

function baseToInt(letters, digitmap = digit) {
    let num = 0;
    for (const base of letters) {
        num = num * 4 + digitmap[base];
    }
    return num;
}

class CodonNote {
    constructor(seq, pitchmap = standard_pitchmap, octave = 0) {
        const pitch_point = baseToInt(seq.slice(0, 3));
        const map = pitchmap.find(dict => pitch_point >= dict.min && pitch_point < dict.max);

        this.note_num = octave * 12 + map.note_num;
        this.gap = baseToInt(seq.slice(3, 5));
        this.color = baseToInt(seq.slice(5, 6));
    }
}