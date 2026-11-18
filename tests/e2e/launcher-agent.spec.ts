import { expect, test } from '@playwright/test';

const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });

test('launcher agent edits a draft, sends the final screenshots and reopens the saved project', async ({ page }) => {
  test.setTimeout(90_000);
  let turn = 0;
  const sheetId = 'sheet_1';
  const requests: string[] = [];
  let resumeUpdates: () => void = () => {};
  let resumeChecks: () => void = () => {};
  const updates = new Promise<void>(resolve => { resumeUpdates = resolve; });
  const checks = new Promise<void>(resolve => { resumeChecks = resolve; });
  const endpoint = 'https://api.aitunnel.ru/v1/chat/completions';
  await page.route('https://api.aitunnel.ru/v1/decisions', route => route.fulfill({ json: {
    id: 'decision-test', answers: {
      action: { type: 'choice', choice: 'continue', confidence: .95, probabilities: { continue: .95, revise: .04, restore: .01 } },
      taskSatisfied: { type: 'noul', noul: .1 }
    }, usage: { cost_rub: .001 }
  } }));
  await page.route(endpoint, async route => {
    const request = route.request().postDataJSON();
    expect(request.model).toBe('deepseek-v4.1-flash-1017');
    expect(route.request().headers().authorization).toBe('Bearer test-key');
    expect(request.tools.some((tool: { function: { name: string } }) => tool.function.name === 'wire')).toBe(true);
    requests.push(JSON.stringify(request.messages));
    const steps = [
      [call('finish', { summary: 'Слишком рано', limitations: '' }), call('create_schematic', { name: 'Тест ИИ' })],
      [call('set_targets', { documents: 'both', boardRefs: ['R1', 'R2'],
        boardNets: { MID: [{ref:'R1', pin:'2'}, {ref:'R2', pin:'1'}] } }), call('remember', { plan: 'Два резистора, цепь MID' }), call('set_frame', { sheet: sheetId, designation: 'АБВГ.123456.001 Э3' }),
        call('place_component', { sheet: sheetId, component: 'COMP_R_R1_12_0805', ref: 'R1', x: 60, y: 55 }),
        call('place_component', { sheet: sheetId, component: 'COMP_R_R1_12_0805', ref: 'R2', x: 100, y: 55 }),
        call('wire', { sheet: sheetId, from: { ref: 'R1', pin: '2' }, to: { ref: 'R2', pin: '1' }, net: 'MID' }),
        call('create_board', { width: 60, height: 45 })],
      [call('finish', { summary: 'Нет проверок', limitations: '' })],
      [call('route_trace', { layer: 'TopCopper', net: 'MID', width: .3, points: [{x: 16.95, y: 16}, {x: 16.95, y: 16}] }),
        call('route_trace', { layer: 'TopCopper', net: 'MID', width: .3, points: [{x: 15.05, y: 16}, {x: 31.05, y: 16}] }),
        call('delete_board', { ids: ['missing_trace'] }),
        call('add_via', { x: 16.95, y: 16, net: 'MID', diameter: .6, hole: .3 }),
        call('add_copper_pour', { layer: 'TopCopper', net: 'MID', clearance: .25,
          outline: [{x: 10, y: 10}, {x: 70, y: 10}, {x: 70, y: 55}, {x: 10, y: 55}] }),
        call('check', {}), call('screenshot', { target: 'schematic', sheet: sheetId }), call('screenshot', { target: 'pcb' })],
      [call('finish', { summary: 'Попытка сдать неразведённую плату', limitations: '', status: 'complete' })],
      [call('finish', { summary: 'Схема и плата созданы', limitations: 'Требуется трассировка', status: 'draft' })]
    ];
    expect(steps[turn]).toBeDefined();
    if (turn === 1) await updates;
    if (turn === 2) await checks;
    const tools = steps[turn].map((fn, index) => ({ id: 't' + turn + '_' + index, type: 'function', function: fn }));
    turn++;
    await route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: tools } }] } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки подключения', exact: true }).click();
  await page.getByLabel('Ключ AITUNNEL').fill('test-key');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByLabel('Задание').fill('Создай учебную схему и плату.');
  await page.getByRole('button', { name: 'Запустить агента' }).click();
  await page.getByRole('button', { name: 'Открыть схему', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Просмотр проекта агента' });
  await expect(viewer.locator('.agent-live-status')).toBeVisible();
  const schematic = viewer.getByRole('img', { name: 'Лист схемы' });
  const initialFrame = await schematic.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  resumeUpdates();
  await expect(viewer.getByRole('option', { name: 'Печатная плата' })).toHaveCount(1);
  expect(await schematic.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(initialFrame);
  await viewer.getByRole('combobox', { name: 'Документ' }).selectOption('pcb');
  await expect(viewer.getByRole('img', { name: 'Печатная плата' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Закрыть просмотр' }).click();
  await expect(page.getByRole('button', { name: 'Остановить' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактор схем', exact: true }).click();
  await expect(page).toHaveURL(/module=schematic/);
  resumeChecks();
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(4);
  await page.goBack();
  await expect(page.getByText('Схема и плата созданы')).toBeVisible({ timeout: 25_000 });
  await page.getByRole('tab', { name: 'Проверки', exact: true }).click();
  await expect(page.getByText('Неразведённые связи', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByRole('heading', { name: /незавершённый черновик/ })).toBeVisible();
  await page.getByRole('tab', { name: /^Документы/ }).click();
  await expect(page.getByRole('img', { name: /Снимок ·/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Печатная плата.*PCB/ }).click();
  await expect(page.getByRole('img', { name: 'Снимок · Печатная плата' })).toBeVisible();
  expect(requests[3]).toContain('finalize_project');
  expect(requests[4].match(/data:image\/png;base64,/g)).toHaveLength(2);
  expect(requests[4]).toContain('нулевой сегмент');
  expect(requests[4]).toContain('чужую площадку R1.1');
  expect(requests[4]).toContain('Объекты платы не найдены');
  expect(requests[4]).toContain('Отверстие пересекает SMD-площадку R1.2');
  expect(requests[4]).toContain('зазором до фрезеруемого края');
  expect(requests[5]).toContain('Завершение заблокировано');

  await page.getByRole('button', { name: 'Сохранить копию в проектах' }).click();
  await expect(page.getByText('Копия сохранена в проектах лаунчера.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();
  await page.getByText('План и память', { exact: true }).click();
  await expect(page.getByText('Два резистора, цепь MID')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки подключения', exact: true }).click();
  await expect(page.getByLabel('Ключ AITUNNEL')).toHaveValue('');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: /^Проекты/ }).click();
  await expect(page.getByText('Тест ИИ — ИИ').first()).toBeVisible();
  await page.getByRole('button', { name: 'Открыть схему', exact: true }).click();
  await expect(page).toHaveURL(/module=schematic/);
});
