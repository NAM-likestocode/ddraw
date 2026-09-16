import type { AppState, SceneStore } from '../core/store';
import type { Camera } from '../core/camera';
import type { Renderer } from '../render/renderer';
import type { ToolId } from '../core/types';
export interface ToolContext { store:SceneStore; appState:AppState; camera:Camera; renderer:Renderer; host:HTMLElement; finishTool():void }
export interface Tool { id:ToolId; cursor:string; onPointerDown?(event:PointerEvent,ctx:ToolContext):void; onPointerMove?(event:PointerEvent,ctx:ToolContext):void; onPointerUp?(event:PointerEvent,ctx:ToolContext):void; onDoubleClick?(event:MouseEvent,ctx:ToolContext):void; onKeyDown?(event:KeyboardEvent,ctx:ToolContext):void; render?(ctx2d:CanvasRenderingContext2D,ctx:ToolContext):void; cancel?(ctx:ToolContext):void }
