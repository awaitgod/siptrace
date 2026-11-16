import { describe, expect, it } from 'vitest';
import { fixture } from '../fixtures/editorProject';
import { hitTestEntity } from '../../src/core/schematic/hitTesting';
import { transformPoint } from '../../src/core/geometry';

describe('pointer selection tests visible geometry', () => {
    it('does not select the empty interior of an outline rectangle', () => {
        const p=fixture(),s=p.sheets[0];s.shapes.push({id:'outline',type:'rect',x:40,y:40,w:160,h:110,width:.35});
        expect(hitTestEntity(s,'outline',{x:180,y:140},2,p.customComponentDefs)).toBe(false);
        expect(hitTestEntity(s,'outline',{x:40,y:75},2,p.customComponentDefs)).toBe(true);
    });
    it('uses a segment rather than the bounding rectangle for a diagonal line', () => {
        const p=fixture(),s=p.sheets[0];s.shapes.push({id:'line',type:'line',x1:40,y1:40,x2:200,y2:150,width:.35});
        expect(hitTestEntity(s,'line',{x:180,y:60},2,p.customComponentDefs)).toBe(false);
        expect(hitTestEntity(s,'line',{x:120,y:95},2,p.customComponentDefs)).toBe(true);
    });
    it('does not treat the center or bounding-box corners of an unfilled circle as selectable', () => {
        const p=fixture(),s=p.sheets[0];s.shapes.push({id:'circle',type:'circle',cx:170,cy:130,r:40,width:.35});
        expect(hitTestEntity(s,'circle',{x:170,y:130},2,p.customComponentDefs)).toBe(false);
        expect(hitTestEntity(s,'circle',{x:205,y:165},2,p.customComponentDefs)).toBe(false);
        expect(hitTestEntity(s,'circle',{x:210,y:130},2,p.customComponentDefs)).toBe(true);
    });
    it('filled shapes remain selectable by their interior', () => {
        const p=fixture(),s=p.sheets[0];s.shapes.push({id:'filled',type:'rect',x:40,y:40,w:160,h:110,width:.35,fill:true});
        expect(hitTestEntity(s,'filled',{x:180,y:140},2,p.customComponentDefs)).toBe(true);
    });
    it('tests the rotated rectangle outline in its local coordinates', () => {
        const p=fixture(),s=p.sheets[0];s.shapes.push({id:'rotated',type:'rect',x:100,y:100,w:40,h:20,width:.35,angle:90});
        expect(hitTestEntity(s,'rotated',transformPoint(20,10,100,100,90),1,p.customComponentDefs)).toBe(false);
        expect(hitTestEntity(s,'rotated',transformPoint(0,10,100,100,90),1,p.customComponentDefs)).toBe(true);
    });
    it('hits a rotated caption at its displayed position and respects its visibility', () => {
        const p=fixture(),s=p.sheets[0],c=s.components[0];c.labelAngle=90;
        expect(hitTestEntity(s,'refDes@c0',{x:c.x,y:c.y-8},1,p.customComponentDefs)).toBe(true);
        c.showRefDes=false;
        expect(hitTestEntity(s,'refDes@c0',{x:c.x,y:c.y-8},1,p.customComponentDefs)).toBe(false);
    });
});
