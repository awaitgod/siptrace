export const xmlEscape = (text: unknown): string => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
type Matrix = [
    number,
    number,
    number,
    number,
    number,
    number
];
/** Minimal vector recording context for the same renderer used by the editing canvas. */
export class SvgCanvas {
    elements: string[] = [];
    path = '';
    matrix: Matrix = [1, 0, 0, 1, 0, 0];
    stack: any[] = [];
    strokeStyle: any = '#000';
    fillStyle: any = '#000';
    lineWidth = 0.35;
    lineCap = 'butt';
    lineJoin = 'miter';
    globalAlpha = 1;
    font = '3px Arial';
    textAlign = 'left';
    textBaseline = 'alphabetic';
    dash: number[] = [];
    private transformAttr() { return `transform="matrix(${this.matrix.join(' ')})"`; }
    private style(fill = false) { return `${this.transformAttr()} opacity="${this.globalAlpha}" fill="${fill ? xmlEscape(this.fillStyle) : 'none'}" stroke="${fill ? 'none' : xmlEscape(this.strokeStyle)}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : ''}`; }
    save() { this.stack.push({ matrix: [...this.matrix], strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin, globalAlpha: this.globalAlpha, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, dash: [...this.dash] }); }
    restore() { Object.assign(this, this.stack.pop() ?? {}); }
    translate(x: number, y: number) { const [a, b, c, d, e, f] = this.matrix; this.matrix = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]; }
    rotate(r: number) { const [a, b, c, d, e, f] = this.matrix, co = Math.cos(r), si = Math.sin(r); this.matrix = [a * co + c * si, b * co + d * si, c * co - a * si, d * co - b * si, e, f]; }
    scale(x: number, y: number) { const [a, b, c, d, e, f] = this.matrix; this.matrix = [a * x, b * x, c * y, d * y, e, f]; }
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.matrix = [a, b, c, d, e, f]; }
    setLineDash(d: number[]) { this.dash = d; }
    beginPath() { this.path = ''; }
    moveTo(x: number, y: number) { this.path += `M${x} ${y} `; }
    lineTo(x: number, y: number) { this.path += `L${x} ${y} `; }
    closePath() { this.path += 'Z '; }
    rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
    arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false) {
        let span = end - start;
        const full = Math.abs(span) >= Math.PI * 2 - 1e-7;
        if (!full) {
            if (ccw && span > 0)
                span -= Math.PI * 2;
            if (!ccw && span < 0)
                span += Math.PI * 2;
        }
        const x = cx + r * Math.cos(start), y = cy + r * Math.sin(start);
        this.path += `${this.path ? 'L' : 'M'}${x} ${y} `;
        if (full) {
            const mx = cx - r * Math.cos(start), my = cy - r * Math.sin(start);
            this.path += `A${r} ${r} 0 1 ${ccw ? 0 : 1} ${mx} ${my} A${r} ${r} 0 1 ${ccw ? 0 : 1} ${x} ${y} `;
        }
        else
            this.path += `A${r} ${r} 0 ${Math.abs(span) > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)} `;
    }
    stroke() { if (this.path)
        this.elements.push(`<path d="${this.path}" ${this.style()}/>`); }
    fill() { if (this.path)
        this.elements.push(`<path d="${this.path}" ${this.style(true)}/>`); }
    strokeRect(x: number, y: number, w: number, h: number) { this.elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${this.style()}/>`); }
    fillRect(x: number, y: number, w: number, h: number) { this.elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${this.style(true)}/>`); }
    fillText(text: string, x: number, y: number, maxWidth?: number) {
        const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
        const baseline = this.textBaseline === 'middle' ? 'central' : this.textBaseline === 'top' ? 'text-before-edge' : this.textBaseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
        const estimate = this.measureText(text).width, fit = maxWidth && estimate > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
        this.elements.push(`<text x="${x}" y="${y}" ${this.transformAttr()} fill="${xmlEscape(this.fillStyle)}" opacity="${this.globalAlpha}" style="font:${xmlEscape(this.font)}" text-anchor="${anchor}" dominant-baseline="${baseline}"${fit}>${xmlEscape(text)}</text>`);
    }
    measureText(text: string) { return { width: text.length * (parseFloat(/([\d.]+)px/.exec(this.font)?.[1] ?? '3')) * .6 }; }
}
