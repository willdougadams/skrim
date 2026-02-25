declare module 'js-sha3' {
    export const keccak_256: {
        (message: string | number[] | Uint8Array | ArrayBuffer): string;
        create(): any;
        update(message: string | number[] | Uint8Array | ArrayBuffer): any;
        hex(): string;
        array(): number[];
    };
}
