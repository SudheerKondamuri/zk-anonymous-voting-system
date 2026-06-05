import { buildPoseidon } from 'circomlibjs';

let poseidon: any;

export async function initPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
    }
}

export function hash2(left: bigint, right: bigint): bigint {
    const hash = poseidon([left, right]);
    return BigInt(poseidon.F.toString(hash));
}

export function hash1(val: bigint): bigint {
    const hash = poseidon([val]);
    return BigInt(poseidon.F.toString(hash));
}

export function toHex(val: bigint): string {
    return '0x' + val.toString(16).padStart(64, '0');
}

export function toDec(val: bigint): string {
    return val.toString(10);
}

export class MerkleTree {
    public depth: number;
    public leaves: bigint[];
    public zeros: bigint[];
    public tree: { [level: number]: { [index: number]: bigint } };

    constructor(depth: number) {
        this.depth = depth;
        this.leaves = [];
        this.zeros = new Array(depth + 1);
        this.zeros[0] = 0n;
        for (let i = 0; i < depth; i++) {
            this.zeros[i + 1] = hash2(this.zeros[i], this.zeros[i]);
        }
        this.tree = {};
        for (let i = 0; i <= depth; i++) {
            this.tree[i] = {};
        }
    }

    public insert(leaf: bigint) {
        const index = this.leaves.length;
        this.leaves.push(leaf);
        this.update(index, leaf);
    }

    private update(index: number, val: bigint) {
        let currentIndex = index;
        let currentVal = val;
        this.tree[0][currentIndex] = currentVal;
        for (let i = 0; i < this.depth; i++) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            let sibling = this.tree[i][siblingIndex];
            if (sibling === undefined) {
                sibling = this.zeros[i];
            }
            const left = isRight ? sibling : currentVal;
            const right = isRight ? currentVal : sibling;
            currentVal = hash2(left, right);
            currentIndex = Math.floor(currentIndex / 2);
            this.tree[i + 1][currentIndex] = currentVal;
        }
    }

    public getRoot(): bigint {
        const root = this.tree[this.depth][0];
        return root === undefined ? this.zeros[this.depth] : root;
    }

    public getProof(index: number) {
        const proof: bigint[] = [];
        const indices: number[] = [];
        let currentIndex = index;
        for (let i = 0; i < this.depth; i++) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            let sibling = this.tree[i][siblingIndex];
            if (sibling === undefined) {
                sibling = this.zeros[i];
            }
            proof.push(sibling);
            indices.push(isRight ? 1 : 0);
            currentIndex = Math.floor(currentIndex / 2);
        }
        return { proof, indices };
    }
}
