export const BASES_SET = new Set(["A", "C", "G", "T"]);
export function to_singular_bases(str) {
    if (str.length === 0) {
        return null;
    }
    const bases = [];
    for (let i = 0; i < str.length; i++) {
        bases.push(str[i]);
    }
    return bases;
}
export function is_single_base(str) {
    return str.length === 1 && BASES_SET.has(str);
}
export function ensure_acgt(str) {
    return /^[ACGT]*$/.test(str);
}
export function is_codon(bases) {
    return bases.length === 3 && [...bases].every((char) => BASES_SET.has(char));
}
