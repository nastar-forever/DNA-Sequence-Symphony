export const BASES_SET = new Set(["A", "C", "G", "T"]);
export type Base = "A" | "C" | "G" | "T";
export type Codon = `${Base}${Base}${Base}`;

export type DNAString = string & {
    readonly __brand: "DNAString";
    readonly [i: number]: Base;
};

export function to_singular_bases(str: DNAString): Base[] | null {
    if (str.length === 0) {
        return null;
    }

    const bases: Base[] = [];
    for (let i = 0; i < str.length; i++) {
        bases.push(str[i]);
    }

    return bases;
}

export function is_single_base(str: string): str is Base {
    return str.length === 1 && BASES_SET.has(str);
}

export function ensure_acgt(str: string): str is DNAString {
    return /^[ACGT]*$/.test(str);
}

export function is_codon(bases: string): bases is Codon {
    return bases.length === 3 && [...bases].every((char) => BASES_SET.has(char));
}