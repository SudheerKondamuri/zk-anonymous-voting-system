"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerkleTree = void 0;
exports.initPoseidon = initPoseidon;
exports.hash2 = hash2;
exports.hash1 = hash1;
exports.toHex = toHex;
exports.toDec = toDec;
const circomlibjs_1 = require("circomlibjs");
let poseidon;
async function initPoseidon() {
    if (!poseidon) {
        poseidon = await (0, circomlibjs_1.buildPoseidon)();
    }
}
function hash2(left, right) {
    const hash = poseidon([left, right]);
    return BigInt(poseidon.F.toString(hash));
}
function hash1(val) {
    const hash = poseidon([val]);
    return BigInt(poseidon.F.toString(hash));
}
function toHex(val) {
    return '0x' + val.toString(16).padStart(64, '0');
}
function toDec(val) {
    return val.toString(10);
}
class MerkleTree {
    depth;
    leaves;
    zeros;
    tree;
    constructor(depth) {
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
    insert(leaf) {
        const index = this.leaves.length;
        this.leaves.push(leaf);
        this.update(index, leaf);
    }
    update(index, val) {
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
    getRoot() {
        const root = this.tree[this.depth][0];
        return root === undefined ? this.zeros[this.depth] : root;
    }
    getProof(index) {
        const proof = [];
        const indices = [];
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
exports.MerkleTree = MerkleTree;
