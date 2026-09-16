import { nanoid } from 'nanoid';
export const createId = (): string => nanoid(12);
export const createNonce = (): number => Math.floor(Math.random() * 0x7fffffff);
