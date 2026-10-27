export interface BaseMap {
    readonly C: number,
    readonly A: number,
    readonly G: number,
    readonly T: number
}

export type PatternMap = readonly [
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number]
];

export interface Wavetable {
    readonly real: number[],
    readonly imag: number[]
}

export class PrimaryUserSettings {
    constructor (
        readonly bound_to: any,
        public bpm: number,
        public default_gain: number,
        public ir: ConvolverNode|null,
        public chord_size: number,
        public periodic_waves: PeriodicWave|PeriodicWave[]|null,
        public wet: number,
    ) {}

    validate(): boolean {
        return (
            this.periodic_waves === null ?
            this.ir === null :
            Array.isArray(this.periodic_waves) ?
            this.chord_size === this.periodic_waves.length :
            this.chord_size === 1 
        );
    }
}

export class SecondaryUserSettings {
    constructor (
        readonly bound_to: any,
        public goofy_mode: boolean = false
    ) {}

    validate(): boolean {
        return true;
    }
}

export class UserSettings {
    constructor(
        readonly bound_to: any,
        public bpm: number,
        public default_gain: number,
        public ir: ConvolverNode|null = null,
        public chord_size: number = 1,
        public periodic_waves: PeriodicWave|PeriodicWave[]|null = null,
        public wet: number = 0.3,
        public goofy_mode: boolean = false
    ) {}

    static from_primaries(primaries: PrimaryUserSettings): UserSettings {
        return new UserSettings(
            primaries.bound_to,
            primaries.bpm,
            primaries.default_gain,
            primaries.ir,
            primaries.chord_size,
            primaries.periodic_waves,
            primaries.wet,
            false
        )
    }

    extract_primaries(): PrimaryUserSettings {
        return new PrimaryUserSettings(
            this.bound_to,
            this.bpm,
            this.default_gain,
            this.ir,
            this.chord_size,
            this.periodic_waves,
            this.wet,
        );
    }

    extract_secondaries(): SecondaryUserSettings {
        return new SecondaryUserSettings(
            this.bound_to,
            this.goofy_mode
        );
    }

    validate(): boolean {
        return this.extract_primaries().validate()
        && this.extract_secondaries().validate();
    }
}