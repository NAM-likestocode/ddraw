import type {Tool} from './types';import {pickAndInsertImage} from '../io/images';export const imageTool=():Tool=>({id:'image',cursor:'copy',onPointerDown(_e,ctx){void pickAndInsertImage(ctx)}});
