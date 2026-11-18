import { readFileSync } from 'node:fs';

const root = process.env.SIPTRACE_REVISION_SEEDS || 'audit/fixtures/agent-revisions';
const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y]) => ({x,y}));
const pads = (...labels) => labels.map(label => {
  const [ref, pin] = label.split('.');
  return {ref, pin};
});

function scenario(id, source, task, modify) {
  const seed = root + '/' + source + '.json';
  const {documents, targets: requirements} = JSON.parse(readFileSync(seed, 'utf8')).draft;
  requirements.board.positions = documents.pcb.components.map(({refDes, x, y, side, angle}) => ({
    ref: refDes, x, y, side, angle
  }));
  modify(requirements);
  return {id, seed, task: 'Отредактируй загруженные схему и связанную плату. Сохрани существующие листы, позиции, неизменённые цепи и их медь. ' + task, requirements};
}

const chain = '09-linked-erc';
const offpage = '10-offpage';
export const scenarios = [
  scenario('11-values-and-eco', chain,
    'Измени номиналы R2, R4 и R7 по контракту и обозначение документа. Сохрани ID всех компонентов и проводов, геометрию схемы и всю медь. Проверь BOM и соответствие связанной PCB.', r => {
      Object.assign(r.values, {R2:'2,2 кОм', R4:'4,7 кОм', R7:'6,8 кОм'});
      r.designation = 'AUD.011 Э3';
    }),
  scenario('12-insert-series-stage', chain,
    'Вставь R9 = 3,3 кОм (COMP_R_R1_12_0805 / PAT_CHIP_2012M) в разрыв N4 между R4 и R5. На схеме место для R9 около (240,90). Сохрани остальные шесть проводов схемы и шесть трасс платы с их ID. Обнови плату по схеме и разведи только затронутые цепи.', r => {
      r.schematicRefs.push('R9');
      r.boardRefs.push('R9');
      r.values.R9 = '3,3 кОм';
      for (const nets of [r.schematicNets,r.boardNets]) {
        nets.N4 = pads('R4.2','R9.1');
        nets.N4B = pads('R9.2','R5.1');
      }
      r.board.positions.push({ref:'R9',x:44,y:22,angle:0,side:'Top'});
    }),
  scenario('13-inter-sheet-rename', offpage,
    'Переименуй межлистовую N3 в LINK_MID на двух листах и плате. Сохрани ID и геометрию обоих портов, проводов, площадок и меди. Переименуй листы по контракту и обнови обозначение. Проверь состав межлистовой цепи и синхронизацию.', r => {
      for (const nets of [r.schematicNets,r.boardNets]) {
        nets.LINK_MID = nets.N3;
        delete nets.N3;
      }
      r.sheets[0].name = 'Каскад А';
      r.sheets[1].name = 'Каскад Б';
      for (const s of r.sheets) s.ports[0].net = 'LINK_MID';
      r.designation = 'AUD.013 Э3';
    }),
  scenario('14-mechanical-cutout', offpage,
    'Добавь на существующую плату вырез и зону запрета трассировки по контракту. Они пересекают старый маршрут N3. Переложи только N3, оставь всю остальную медь и схему неизменной. N3 должна быть шириной 0,45 мм на верхнем слое. Покажи, с какой стороны проложен обход.', r => {
      r.board.cutouts = [rect(24,19,4,6)];
      r.board.keepouts = [{layer:'AllCopper',kind:'RouteKeepout',points:rect(24,13,4,6)}];
      r.board.routes = {N3:{width:.45,allowedLayers:['TopCopper']}};
    }),
  scenario('15-package-and-placement', chain,
    'Измени схему и связанную плату под другой корпус: R6 переведи на PAT_CHIP_1608M, положение (33,26), угол 90°, Top. Сохрани ID R6 на схеме и плате. Сохрани геометрию остальных компонентов и неизменённых трасс. Переложи только N5 и N6 с ширинами из контракта. Проверь, что BOM и PCB используют новый footprint.', r => {
      Object.assign(r.board.positions.find(p => p.ref === 'R6'), {x:33,y:26,angle:90});
      r.board.routes = {N5:{width:.45,allowedLayers:['TopCopper']},N6:{width:.35,allowedLayers:['TopCopper']}};
    })
];
