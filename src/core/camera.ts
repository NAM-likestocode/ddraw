import type { CameraState, Point } from './types';
export class Camera {
 constructor(public state:CameraState,private onChange:()=>void=()=>{}){}
 worldToScreen(p:Point):Point{return{x:p.x*this.state.zoom+this.state.x,y:p.y*this.state.zoom+this.state.y}}
 screenToWorld(p:Point):Point{return{x:(p.x-this.state.x)/this.state.zoom,y:(p.y-this.state.y)/this.state.zoom}}
 pan(dx:number,dy:number):void{this.state.x+=dx;this.state.y+=dy;this.onChange()}
 zoomAt(factor:number,sx:number,sy:number):void{const old=this.state.zoom,next=Math.max(.1,Math.min(30,old*factor));this.state.x=sx-(sx-this.state.x)*(next/old);this.state.y=sy-(sy-this.state.y)*(next/old);this.state.zoom=next;this.onChange()}
 reset():void{this.state.x=0;this.state.y=0;this.state.zoom=1;this.onChange()}
 set(x:number,y:number,zoom:number):void{this.state.x=x;this.state.y=y;this.state.zoom=Math.max(.1,Math.min(30,zoom));this.onChange()}
}
