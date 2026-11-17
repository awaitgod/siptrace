const rect = (x1, y1, x2, y2) => [{ x:x1, y:y1 }, { x:x2, y:y1 }, { x:x2, y:y2 }, { x:x1, y:y2 }];
const keepout = (kind, layer, ...coords) => ({ kind, layer, points: rect(...coords) });
const board = (width, height, layers = 2, clearance = 0.25) => ({ width, height, layers, clearance });
const lock = (ref, x, y, side = 'Top', angle = 0) => ({ ref, x, y, side, angle });
const sheet = (name, form = 'Form1') => ({ name, format:'A4_L', form });

// Fixture requirements are retained outside the agent workspace for independent scoring.
const fixtures = [
  {
    id:'01-dual-rc', name:'Двухканальный RC-фильтр', board:board(52,34),
    refs:'R1 R2 R3 R4 C1 C2', sheets:[sheet('Фильтры')],
    values:{R1:'1 кОм',R2:'2,2 кОм',R3:'1 кОм',R4:'2,2 кОм',C1:'100 нФ',C2:'100 нФ'},
    nets:{IN_A:'R1.1', OUT_A:'R1.2 R2.1 C1.1', IN_B:'R3.1', OUT_B:'R3.2 R4.1 C2.1', GND:'R2.2 R4.2 C1.2 C2.2'},
    pours:[{net:'GND',layer:'BottomCopper',clearance:0.25}],
    notes:'Оба канала — резистор последовательно и резистор с конденсатором шунтом на GND. Выведи IN_A, IN_B, OUT_A, OUT_B и GND именованными портами на схеме. На плате проложи обе выходные цепи и обеспечь физическую связность GND с нижней заливкой.'
  },
  {
    id:'02-mirrored-crossbar', name:'Перекрёстный двухсторонний адаптер', board:board(46,30),
    refs:'R1 R2 R3 R4', nets:{A:'R1.1 R4.2',B:'R1.2 R3.1',C:'R2.1 R3.2',D:'R2.2 R4.1'},
    positions:[lock('R1',10,9),lock('R2',10,21,'Top',180),lock('R3',36,9,'Bottom',90),lock('R4',36,21,'Bottom',270)],
    routeRules:Object.fromEntries(['A','B','C','D'].map(net => [net,{minVias:1,layers:['TopCopper','BottomCopper']}])),
    notes:'Проверь зеркалирование и повороты: для каждой цепи нужны дорожки на обеих сторонах и минимум одно сквозное переходное отверстие вне SMD-площадок.'
  },
  {
    id:'03-inner-layers', name:'Четырёхслойная перемычка', board:board(48,34,4),
    refs:'R1 R2 R3 R4', nets:{BUS_A:'R1.1 R2.1',BUS_B:'R3.1 R4.1'},
    positions:[lock('R1',9,10),lock('R2',39,10),lock('R3',9,24),lock('R4',39,24)],
    keepouts:[keepout('RouteKeepout','TopCopper',20,3,28,31),keepout('RouteKeepout','BottomCopper',20,3,28,31)],
    routeRules:{BUS_A:{minVias:2,layers:['Inner1'],crossLayer:'Inner1'}, BUS_B:{minVias:2,layers:['Inner2'],crossLayer:'Inner2'}},
    notes:'Переход через середину x=24 для BUS_A сделай на Inner1, для BUS_B на Inner2, каждый с двумя сквозными via вне площадок. Не замыкай свободные площадки 2.'
  },
  {
    id:'04-slalom', name:'Трёхцепочечный коридор', board:board(62,42,2,0.35),
    refs:'R1 R2 R3 R4 R5 R6', nets:{SIG_A:'R1.1 R4.1',SIG_B:'R2.1 R5.1',SIG_C:'R3.1 R6.1',RET:'R1.2 R2.2 R3.2 R4.2 R5.2 R6.2'},
    positions:[lock('R1',8,8),lock('R2',8,20),lock('R3',8,32),lock('R4',54,8),lock('R5',54,20),lock('R6',54,32)],
    keepouts:[keepout('RouteKeepout','AllCopper',20,1,25,28),keepout('RouteKeepout','AllCopper',37,14,42,41)],
    notes:'Трассы должны пройти слалом: у первой зоны проход снизу по координатам y>28, у второй сверху по координатам y<14. Не меняй заданные зоны и позиции. Четыре различные электрические цепи должны пройти от левого до правого ряда.'
  },
  {
    id:'05-cutout', name:'Г-образный контур и окно', board:board(60,44),
    refs:'R1 R2 R3 R4', nets:{SENSE:'R1.1 R2.1 R3.1 R4.1', RETURN:'R1.2 R2.2 R3.2 R4.2'},
    outline:[{x:0,y:0},{x:60,y:0},{x:60,y:29},{x:41,y:29},{x:41,y:44},{x:0,y:44}],
    cutouts:[rect(19,12,32,27)],
    positions:[lock('R1',8,9),lock('R2',50,9),lock('R3',8,35),lock('R4',34,36)],
    notes:'Задай фактический Г-образный контур и прямоугольный сквозной вырез по вершинам. Обе сети должны соединить четыре корпуса, дорожки и переходы должны оставаться на материале платы.'
  },
  {
    id:'06-split-pours', name:'Две независимые заливки', board:board(56,38,2,0.3),
    refs:'R1 R2 R3 R4 R5 R6',
    nets:{AGND:'R1.2 R2.2 R3.2',DGND:'R4.2 R5.2 R6.2',SIG_A:'R1.1 R2.1 R3.1',SIG_D:'R4.1 R5.1 R6.1'},
    positions:[lock('R1',10,9),lock('R2',19,17),lock('R3',10,29),lock('R4',46,9),lock('R5',37,17),lock('R6',46,29)],
    keepouts:[keepout('PourKeepout','AllCopper',25,2,31,36)],
    pours:[{net:'AGND',layer:'TopCopper',clearance:0.3},{net:'DGND',layer:'TopCopper',clearance:0.3}],
    notes:'AGND заливай только слева от x=25, DGND только справа от x=31. Каждая заливка должна быть пересчитана и электрически присоединена к своей земле, земли раздельны. Допустимы явные дорожки земли. Соблюди отступы заливок от края платы.'
  },
  {
    id:'07-two-sheet-chain', name:'Двухлистовая цепочка с платой', board:board(48,32),
    refs:'R1 R2 R3 R4 R5 R6', sheets:[sheet('Вход'),sheet('Выход','Form2a')],
    sheetRefs:[['R1','R2','R3'],['R4','R5','R6']],
    values:Object.fromEntries(Array.from({length:6},(_,i)=>['R'+(i+1),'1 кОм'])),
    nets:{IN:'R1.1',N1:'R1.2 R2.1',N2:'R2.2 R3.1',LINK:'R3.2 R4.1',N4:'R4.2 R5.1',N5:'R5.2 R6.1',OUT:'R6.2'},
    notes:'Лист «Вход» содержит R1–R3, лист «Выход» содержит R4–R6. LINK — одна общая сеть через OffPageOut и OffPageIn, IN и OUT — именованные порты. На плате сохрани все назначения, разведи пять связей и проверь соответствие обоим листам.'
  },
  {
    id:'08-custom-header', name:'Учебный разъём с развязкой', board:board(54,36),
    refs:'XT1 XT2 R1 R2 C1', sheets:[sheet('Интерфейс')], values:{R1:'100 Ом',R2:'100 Ом',C1:'100 нФ'},
    nets:{VIN:'XT1.1 XT2.1 C1.1',GND:'XT1.4 XT2.4 C1.2',A_IN:'XT1.2 R1.1',A_OUT:'R1.2 XT2.2',B_IN:'XT1.3 R2.1',B_OUT:'R2.2 XT2.3'},
    positions:[lock('XT1',9,18,'Top',90),lock('XT2',45,18,'Top',270)],
    customRefs:['XT1','XT2'],
    notes:'Оба XT используют одно учебное УГО и одно проектное THT-посадочное место. Источник — это ТЗ. Контакты 1 VIN, 2 A, 3 B, 4 GND, все Passive. Центры площадок по X: −3,81; −1,27; 1,27; 3,81 мм, все y=0. Площадки круглые Ø1,8 мм, сверло 0,9 мм, тело 10×4×5 мм. Не бери другой физический корпус. R1/R2 — последовательные резисторы, C1 — развязка питания.'
  },
  {
    id:'09-dense-ladder', name:'Компактная резистивная матрица', board:board(34,24),
    refs:'R1 R2 R3 R4 R5 R6 R7 R8 R9 R10 R11 R12',
    nets:{ROW1:'R1.1 R2.1 R3.1 R4.1',ROW2:'R5.1 R6.1 R7.1 R8.1',ROW3:'R9.1 R10.1 R11.1 R12.1',
      COL1:'R1.2 R5.2 R9.2',COL2:'R2.2 R6.2 R10.2',COL3:'R3.2 R7.2 R11.2',COL4:'R4.2 R8.2 R12.2'},
    positions:Array.from({length:12},(_,i)=>lock('R'+(i+1),6+i%4*7,5+Math.floor(i/4)*7)),
    notes:'Все 12 корпусов расположи и закрепи по координатам сетки, сторона Top, угол 0. Разведи три строки и четыре столбца как семь независимых сетей. Разрешены сквозные переходы вне площадок.'
  },
  {
    id:'10-trace-classes', name:'Силовая пара и чувствительная цепь', board:board(58,34,2,0.3),
    refs:'R1 R2 R3 R4 R5 R6',
    nets:{SUPPLY:'R1.1 R2.1 R3.1', RETURN:'R1.2 R2.2 R3.2', SENSE:'R4.1 R5.1 R6.1', REF:'R4.2 R5.2 R6.2'},
    positions:[lock('R1',10,8),lock('R2',29,8,'Top',180),lock('R3',48,8),lock('R4',10,25),lock('R5',29,25),lock('R6',48,25)],
    keepouts:[keepout('RouteKeepout','AllCopper',23,14,35,20)],
    routeRules:{SUPPLY:{minWidth:0.8,layers:['TopCopper'],onlyLayers:true},RETURN:{minWidth:0.8,layers:['TopCopper'],onlyLayers:true},
      SENSE:{targetWidth:0.3},REF:{targetWidth:0.3}},
    notes:'Все дорожки SUPPLY и RETURN проложи на TopCopper шириной не менее 0,8 мм. Все дорожки SENSE и REF сделай шириной 0,30 мм. Общий зазор 0,30 мм. Корпуса и запретную зону оставь по ТЗ; изменение глобальной ширины для всей платы одновременно не выполняет требования к классам.'
  }
];

export const tasks = fixtures.map((fixture, index) => {
  const refs = fixture.refs.split(' ');
  const designation = fixture.sheets ? 'СТРЕСС.2600' + String(index + 1).padStart(2,'0') + ' Э3' : undefined;
  const requirement = {...fixture, refs, designation,
    outline:fixture.outline ?? rect(0,0,fixture.board.width,fixture.board.height),
    nets:Object.fromEntries(Object.entries(fixture.nets).map(([net, pins])=>[net,pins.split(' ')]))};
  const { board, outline, nets, positions, sheets, sheetRefs, values, keepouts, cutouts, pours } = requirement;
  const spec = { designation, sheets, sheetRefs, values, board, outline, refs, nets, positions, keepouts, cutouts, pours };
  return { id:fixture.id, name:fixture.name, requirement,
    task:[
      'Задание ' + fixture.id + ' «' + fixture.name + '». Создай ' + (sheets ? 'принципиальную схему Э3 и связанную плату' : 'только самостоятельную плату, без схемы') + '.',
      'Точные исходные данные (мм, углы в градусах): ' + JSON.stringify(spec) + '.',
      'Все R — библиотечные резисторы 0805, все C — библиотечные неполярные конденсаторы 0805. ТЗ задаёт учебные сети и монтажную геометрию. Назначения площадок исчерпывающие; отдельно не указанные площадки оставь без сети.',
      'Если не указаны координаты, выбери их сам. Для перечисленных positions соблюди координаты с допуском 0,1 мм, сторону, угол и закрепление. Вершины заданы в абсолютных координатах. Не добавляй другие корпуса, цепи, зоны и заливки.',
      fixture.notes,
      'Разведи все связи с соблюдением заданного зазора. Проверь последнюю ревизию по составу сетей, ERC/DRC, неразведённым связям и геометрии. Предупреждения шелкографии библиотечных корпусов допустимы с конкретным пояснением. Результат — редактируемые документы и честный итог проверки.'
    ].join('\n')
  };
});
