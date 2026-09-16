import type { BaseElement, ElementType, Point } from '../core/types';
import type { ToolContext } from './types';
import { createId, createNonce } from '../core/ids';
export function world(event:{clientX:number;clientY:number},ctx:ToolContext):Point{return ctx.camera.screenToWorld(ctx.renderer.screenPoint(event))}
export function base(type:ElementType,x:number,y:number,ctx:ToolContext):BaseElement {const s=ctx.appState.value.style;return{id:createId(),type,x,y,width:0,height:0,angle:0,strokeColor:s.strokeColor,backgroundColor:s.backgroundColor,fillStyle:s.fillStyle,strokeWidth:s.strokeWidth,strokeStyle:s.strokeStyle,roughness:s.roughness,opacity:s.opacity,roundness:s.roundness,seed:createNonce(),version:1,versionNonce:createNonce(),isDeleted:false,groupIds:[],locked:false}}
