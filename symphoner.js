export const ctx = new AudioContext();

const digit = {
    A: 0,
    C: 1,
    G: 2,
    T: 3
};


const absolute_master = ctx.createGain();
const active_oscs = new Set();
absolute_master.connect(ctx.destination);


export const standard_pitchmap = [
    { min: 0,  max: 16, note_num: 0 },  // C
    { min: 16, max: 32, note_num: 2 },  // D
    { min: 32, max: 48, note_num: 4 },  // E
    { min: 48, max: 64, note_num: 7 },  // G
];


// http://github.com/GoogleChromeLabs/web-audio-samples/tree/main/src/demos/wavetable-synth/wave-tables
async function load_gcl_wave_table(url) {
    const txt = await (await fetch(url)).text();
    const cleantxt = txt.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleantxt);
}

const base = "https://raw.githubusercontent.com/GoogleChromeLabs/web-audio-samples/refs/heads/main/src/demos/wavetable-synth/wave-tables/";

const [osc1, osc2, osc3, osc4] = await Promise.all(
    ["Chorus_Strings", "Organ_3", "Twelve_OpTines", "Celeste"].map(n => load_gcl_wave_table(base + n))
);

function create_periodic_wave(imag, real = null) {
    return ctx.createPeriodicWave(
        real === null ? new Float32Array(imag.length) : new Float32Array(real),
        new Float32Array(imag)
    )
}

export const standard_oscillator_map = [
    create_periodic_wave(osc1.imag, osc1.real),
    create_periodic_wave(osc2.imag, osc2.real),
    create_periodic_wave(osc3.imag, osc3.real),
    create_periodic_wave(osc4.imag, osc4.real)
]

// SHOUTOUT TO: https://github.com/itsmusician/IR-Library

const standard_ir_urls = [
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Synthesized/Decaying/Funny%20Modulated%20Delay%20Room.wav",
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Synthesized/Decaying/Resonant%20Warbled%20Noise%20Decay%201.wav",
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Synthesized/Decaying/Resonant%20Warbled%20Noise%20Decay%202.wav",
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Synthesized/Decaying/Resonant%20Warbled%20Noise%20Decay%203.wav"
]


async function load_reverb_convolver(ctx, url) {
    try {
        const res = await fetch(url);

        if (!res.ok) {
            console.error("FAILED TO LOAD REVERB (" + res.status + ")")
            return null;
        }

        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const convolver = ctx.createConvolver();

        convolver.buffer = buf;
        return convolver;
    } catch (error) {
        console.log("ERROR (Probable CORS block) " + error);
        return null;
    }
}


export const standard_ir_map = await Promise.all(
    standard_ir_urls.map(url => load_reverb_convolver(ctx, url))
);


export function midi_to_freq(midi_num) {
    return 440 * Math.pow(2, (midi_num-69) / 12);
}


export function base_to_int(letters, digitmap = digit) {
    let num = 0;
    for (const base of letters) {
        num = num * 4 + digitmap[base];
    }
    return num;
}


export function create_reverb_convolver(
    reverb_duration = 0.1,
    reverb_decay = 0.1,
) {
    const length = ctx.sampleRate * reverb_duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, reverb_decay);
        }
    }

    const reverb_convolver = ctx.createConvolver();
    reverb_convolver.buffer = impulse;

    return reverb_convolver;
}


export class Reverb {
    constructor (
        ir_convolver,
        wet=0.3,
        dry=0.7,
        decay=0.1
    ) {
        this.ir = ir_convolver;
        this.wet = ctx.createGain();
        this.dry = ctx.createGain();

        this.wet.value = wet;
        this.dry.value = dry;
        this.decay = decay;
    }

    connect (from, to) {
        from.connect(this.dry).connect(to);
        from.connect(this.ir).connect(this.wet).connect(to);
    }
}


export class CodonNote {
    constructor(seq, octave = 4, gapscale = 0.07, pitchmap = standard_pitchmap, oscmap = standard_oscillator_map) {
        this.pitch_point = base_to_int(seq.slice(0, 3));
        const map = pitchmap.find(dict => this.pitch_point >= dict.min && this.pitch_point < dict.max);

        this.note_num = (1 + octave) * 12 + map.note_num;
        this.gap = Math.max(base_to_int(seq.slice(3, 5)) * gapscale, 2 * gapscale);
        this.color = base_to_int(seq.slice(5,6));
        this.osc_periodic_wave = oscmap[this.color];
    }


    schedule_play(
        start,
        value = 0.2,
        enable_fadein = true,
        fadein = 0.015,
        enable_fadeout = true,
        fadeout = 0.015,
        reverb = null
    ) {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(this.osc_periodic_wave);
        osc.frequency.value = midi_to_freq(this.note_num);
        
        const notegain = ctx.createGain();
        osc.connect(notegain);

        if (reverb !== null) {
            reverb.connect(notegain, absolute_master); // THIS IS a Reverb class
        } else {
            notegain.connect(absolute_master);
        }

        if (enable_fadein) {
            if (enable_fadein) {
                notegain.gain.setValueAtTime(0, start);
                notegain.gain.linearRampToValueAtTime(value, start + fadein);

            } else {
                notegain.gain.setValueAtTime(value, start)
            }


            if (enable_fadeout) {
                notegain.gain.setValueAtTime(value, start + this.gap - fadein - fadeout);
                notegain.gain.exponentialRampToValueAtTime(0.0001, start + this.gap);
            }

            osc.start(start);
            osc.stop(start + this.gap);

            active_oscs.add(osc);
            osc.onended = () => active_oscs.delete(osc);
        }

        osc.start(start);
        osc.stop(start + this.gap);

        active_oscs.add(osc);
        osc.onended = () => {
            active_oscs.clear();
            notegain.disconnect();
        };
    }
}


export const standard_reverb_profiles = standard_ir_map.map(val => new Reverb(val))


export class Sequence {
    constructor() {
        this.base_sequence = [];
        this.errors = [];
        this.reverbs = [null, null, null, null];
    }


    async init_reverbs(
        reverb_profiles = standard_reverb_profiles
    ) {
        this.reverbs = reverb_profiles;
        
        this.reverbs.forEach((ir, index) => {
            if (ir===null) this.errors.push("FAILED TO FETCH REVERB IR: "+index)}
        );
    }


    fetch_errors() {
        const errs = [...this.errors];
        this.errors.length = 0;
        return errs;
    }

    append_codonnote(codonnote) {
        this.base_sequence.push(codonnote);
    }

    parse_codonnote(sequence, octave=4, implant = true) {
        sequence = sequence.toUpperCase();

        if (sequence.length === 0 || sequence.length % 6 !== 0 || !/^[ACGT]+$/.test(sequence)) {
            return null;
        }
        
        let parsed_sequence = [];

        for (let i=0; i<sequence.length/6; i++) {
            const sliced = sequence.slice(i*6, i*6+6);
            parsed_sequence.push(
                new CodonNote(sliced, octave)
            )
        }

        if (implant) {
            this.base_sequence.push(...parsed_sequence);
        }

        return parsed_sequence;
    }

    limit_progression(
        notenum_maxgap = 7,
        gap_maxdev = 0.065
    ) {
        const gap_maxgap = gap_maxdev + (this.base_sequence.reduce((accu, curr) => accu + curr.gap, 0) / this.base_sequence.length);

        for (const [index, codonnote] of this.base_sequence.entries()) {
            if (index === 0) {
                continue;
            }

            const this_notenum = codonnote.note_num;
            const prev_notenum = this.base_sequence[index-1].note_num;

            codonnote.gap = Math.min(codonnote.gap, gap_maxgap);

            if (this_notenum < prev_notenum) {
                codonnote.note_num = Math.max(this_notenum, prev_notenum - notenum_maxgap);
            } else {
                codonnote.note_num = Math.min(this_notenum, prev_notenum + notenum_maxgap);
            }
        }
    }

    schedule_play(start) {
        let accutime = start;

        for (const codonnote of this.base_sequence) {
            codonnote.schedule_play(accutime, undefined, undefined, undefined, undefined, undefined, this.reverbs[codonnote.color]);
            accutime += codonnote.gap;
        }
    }
}


export function master_stop(fadeout = 0.02) {
    absolute_master.gain.cancelScheduledValues(ctx.currentTime);
    absolute_master.gain.setValueAtTime(absolute_master.gain.value, ctx.currentTime);
    absolute_master.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeout);

    for (const osc of active_oscs) {
        osc.stop(ctx.currentTime + fadeout); // Ensure fadeout
    }

    // active_oscs.clear();
}


export function master_reset() {
    absolute_master.gain.value = 1;
    active_oscs.clear();
}