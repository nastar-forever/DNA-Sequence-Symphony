export const ctx = new AudioContext();

const digit = {
    A: 0,
    C: 1,
    G: 2,
    T: 3
};


const master = ctx.createGain();
const active_oscs = new Set();


export const standard_pitchmap = [
    { min: 0,  max: 16, note_num: 0 },  // C
    { min: 16, max: 32, note_num: 2 },  // D
    { min: 32, max: 48, note_num: 4 },  // E
    { min: 48, max: 64, note_num: 7 },  // G
];

export const standard_oscillator_map = [
    'sin',
    'triangle',
    'square',
    'sawtooth'
]

function base_to_int(letters, digitmap = digit) {
    let num = 0;
    for (const base of letters) {
        num = num * 4 + digitmap[base];
    }
    return num;
}


export function create_reverb_convolver(
    reverb_duration = 1.5,
    reverb_decay = 1.5,
) {
    const length = ctx.sampleRate * reverb_duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; ch++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, reverb_decay);
        }
    }

    const reverb_convolver = ctx.createConvolver();
    reverb_convolver.buffer = impulse;

    return reverb_convolver;
}


export class CodonNote {
    constructor(seq, octave = 4, gapscale = 0.065, pitchmap = standard_pitchmap, oscmap = standard_oscillator_map) {
        this.pitch_point = base_to_int(seq.slice(0, 3));
        const map = pitchmap.find(dict => this.pitch_point >= dict.min && this.pitch_point < dict.max);

        this.note_num = (1 + octave) * 12 + map.note_num;
        this.gap = base_to_int(seq.slice(3, 5)) * gapscale;
        this.osc_type = oscmap[base_to_int(seq.slice(5, 6))];
    }


    schedule_play(
        start,
        value = 0.35,
        enable_fadein = true,
        fadein = 0.015,
        enable_fadeout = true,
        fadeout = 0.015,
        reverb_convolver = null,
        reverb_dry = 0.7,
        reverb_wet = 0.3
    ) {
       
        const osc = ctx.createOscillator();
        osc.frequency.value = midiToFreq(this.note_num);
        
        const mastergain = ctx.createGain();
        
        if (reverb_convolver === null) {
            osc.connect(mastergain).connect(ctx.destination);

        } else {
            const reverb_master_gain = ctx.createGain();
            const reverb_dry_gain = ctx.createGain();
            const reverb_wet_gain = ctx.createGain();
            reverb_dry_gain.gain.value = reverb_dry;
            reverb_wet_gain.gain.value = reverb_wet;

            reverb_master_gain.connect(reverb_dry_gain).connect(ctx.destination);
            reverb_master_gain.connect(reverb_convolver).connect(reverb_wet_gain).connect(ctx.destination);

            osc.connect(mastergain).connect(reverb_master_gain);
        }


        if (enable_fadein) {
            mastergain.gain.setValueAtTime(0, start);
            mastergain.gain.linearRampToValueAtTime(value, start + fadein);

        } else {
            mastergain.gain.setValueAtTime(value, start)
        }


        if (enable_fadeout) {
            mastergain.gain.setValueAtTime(value, start + this.gap - fadein - fadeout);
            mastergain.gain.exponentialRampToValueAtTime(0, start + this.gap);
        }

        osc.start();
        osc.stop(start + this.gap);

        active_oscs.add(osc);
        osc.onended = () => active_oscs.delete(osc);
    }
}


export class Sequence {
    constructor() {
        this.sequence = [];
        this.reverb_convolver = create_reverb_convolver();
    }

    append_codonnote(codonnote) {
        this.sequence.push(codonnote);
    }

    parse_codonnote(sequence, octave=4, implant = true) {
        if (sequence.length === 0 || sequence.length % 6 !== 0 || !/^[ACGT]+$/.test(sequence)) {
            return null;
        }
        
        sequence = sequence.toUpperCase();
        let parsed_sequence = [];

        for (const i=0; i<sequence.length/6; i++) {
            const sliced = sequence.slice(i*6, i*6+6);
            parsed_sequence.push(
                new CodonNote(sliced, octave)
            )
        }

        if (implant) {
            this.sequence.push(...parsed_sequence);
        }

        return parsed_sequence;
    }

    limit_progression(maxgap = 7) {
        for (const [index, codonnote] of this.sequence.entries()) {
            if (index === 0) {
                continue;
            }

            const this_notenum = codonnote.note_num;
            const prev_notenum = this.sequence[index-1].note_num;

            if (this_notenum < prev_notenum) {
                codonnote.note_num = Math.min(this_notenum, prev_notenum + maxgap);
            } else {
                codonnote.note_num = Math.max(this_notenum, prev_notenum - maxgap);
            }
        }
    }

    schedule_play(start) {
        let accutime = start;

        for (const codonnote of this.sequence) {
            codonnote.schedule_play(accutime);
            accutime += codonnote.gap;
        }
    }
}


export function master_stop(fadeout = 0.02) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeout);

    for (const osc of active_oscs) {
        osc.stop(ctx.currentTime + fadeout); // Ensure fadeout
    }

    // active_oscs.clear();
}