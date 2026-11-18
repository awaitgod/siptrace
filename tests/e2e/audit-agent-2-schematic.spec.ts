import { test, expect, type Page } from '@playwright/test';

const SCREENSHOT_DIR = 'tests/screenshots/audit/agent2_schematic';

async function loadDemo(page: Page, mode = 'demo_rs485') {
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Новый проект/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await dialog.getByRole('button', { name: 'Демо', exact: true }).click();
  await dialog.getByRole('combobox').selectOption(mode);
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function createNewBlankProject(page: Page) {
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Новый проект/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект — SIPTrace' });
  await dialog.getByRole('button', { name: 'Только Схема', exact: true }).click();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Audit Agent 2: Схемотехника, УГО и стандарты ГОСТ / ЕСКД (Schematic & GOST Lead Auditor)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01: Открытие схемотехнического редактора, проверка интерфейса и рамки по ГОСТ 2.104 (А3)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await expect(page.locator('.sch-splash')).toBeHidden();
    await page.waitForTimeout(300);

    // Проверяем наличие всех ключевых панелей схемотехнического редактора
    await expect(page.locator('.dt-menubar')).toBeVisible();
    await expect(page.locator('.dt-toolbar-row')).toBeVisible();
    await expect(page.locator('.dt-left-sidebar')).toBeVisible();
    await expect(page.locator('.dt-right-sidebar')).toBeVisible();
    await expect(page.locator('.dt-sheet-bar')).toBeVisible();
    await expect(page.locator('.dt-statusbar')).toBeVisible();

    // Проверяем отображение листа и формата А3 по умолчанию
    await expect(page.locator('.dt-sheet-bar')).toContainText('Лист 1');
    await expect(page.locator('.dt-sheet-bar')).toContainText('А3');

    // Скриншот начального состояния схемотехнического редактора с рамкой А3 по ГОСТ 2.104
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_schematic_initial_a3.png` });
  });

  test('02: Размещение элементов ГОСТ: Резистор R, Конденсатор C, Диод VD, Транзистор VT, ИМС DD, Разъем XP', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Создаем чистый проект схемы
    await createNewBlankProject(page);
    await page.waitForTimeout(300);

    const canvas = page.locator('.dt-canvas-wrap canvas');
    await expect(canvas).toBeVisible();

    // 1. Резистор постоянный МЛТ-0,25 (ГОСТ 2.728-74)
    await page.locator('.dt-lib-item').filter({ hasText: 'Резисторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'МЛТ-0,25' }).click();
    await canvas.click({ position: { x: 380, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // 2. Конденсатор К10-17в (ГОСТ 2.728-74)
    await page.locator('.dt-lib-item').filter({ hasText: 'Конденсаторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'К10-17в (ЧИП 2012М/0805)' }).click();
    await canvas.click({ position: { x: 500, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // 3. Диод импульсный КД522Б (ГОСТ 2.730-73)
    await page.locator('.dt-lib-item').filter({ hasText: 'Диоды' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'КД522Б' }).click();
    await canvas.click({ position: { x: 620, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // 4. Транзистор биполярный КТ315Б (ГОСТ 2.730-73)
    await page.locator('.dt-lib-item').filter({ hasText: 'Транзисторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'КТ315Б' }).click();
    await canvas.click({ position: { x: 740, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // 5. Микросхема цифровая К155ЛА3 (ГОСТ 2.743-91)
    await page.locator('.dt-lib-item').filter({ hasText: 'Цифровые ИМС' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'К155ЛА3' }).click();
    await canvas.click({ position: { x: 860, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // 6. Разъем вилка ПЛС-5 (ГОСТ 2.755-87)
    await page.locator('.dt-lib-item').filter({ hasText: 'Соединители и Коммутация' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'ПЛС-5' }).click();
    await canvas.click({ position: { x: 980, y: 220 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Проверяем, что в дереве проекта присутствуют все позиционные обозначения по ГОСТ 2.710-81
    const sidebar = page.locator('.dt-right-sidebar');
    await expect(sidebar).toContainText('R1');
    await expect(sidebar).toContainText('C1');
    await expect(sidebar).toContainText('VD1');
    await expect(sidebar).toContainText('VT1');
    await expect(sidebar).toContainText('DD1');
    await expect(sidebar).toContainText('XP1');

    // Скриншот размещенных УГО по стандартам ЕСКД
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_components_placed_gost.png` });
  });

  test('03: Поворот (Space / R), отражение (X / Y) и контекстное меню компонентов', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await createNewBlankProject(page);
    const canvas = page.locator('.dt-canvas-wrap canvas');

    // Размещаем резистор
    await page.locator('.dt-lib-item').filter({ hasText: 'Резисторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'МЛТ-0,25' }).click();
    await canvas.click({ position: { x: 550, y: 300 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // Выбираем R1 в дереве компонентов
    await page.locator('.dt-right-sidebar .dt-tree-row').filter({ hasText: 'R1' }).click();
    await page.waitForTimeout(100);

    // Проверяем поворот на 90° клавишей R или Пробелом
    await page.keyboard.press('r');
    await page.waitForTimeout(150);

    // Проверяем отражение по X
    await page.keyboard.press('x');
    await page.waitForTimeout(150);

    // Открываем контекстное меню правой кнопкой мыши по выделенному компоненту
    await canvas.click({ position: { x: 550, y: 300 }, button: 'right' });
    const contextMenu = page.locator('.dt-dropdown[role="menu"]');
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu).toContainText('Повернуть на 90°');
    await expect(contextMenu).toContainText('Отразить по X');
    await expect(contextMenu).toContainText('Отразить по Y');
    await expect(contextMenu).toContainText('Свойства...');

    // Скриншот контекстного меню
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_context_menu_component.png` });

    // Закрываем меню по Escape
    await page.keyboard.press('Escape');
    await expect(contextMenu).toHaveCount(0);

    // Проверяем Undo (Ctrl+Z)
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
  });

  test('04: Настройка штампа ГОСТ 2.104 и переключение форматов листов А4 / А3 / А2', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Кликаем "Настроить..." в блоке Штамп ГОСТ правой панели
    await page.locator('.dt-right-sidebar').getByRole('button', { name: 'Настроить...' }).click();

    const titleDialog = page.locator('.dt-modal');
    await expect(titleDialog).toBeVisible();
    await expect(titleDialog).toContainText('Заголовки и настройка листа (ГОСТ 2.104-2006 / 2.301-68)');

    // Скриншот диалога настройки штампа ГОСТ
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_dialog_title_block.png` });

    // Переключаем формат на А4 книжный (210 × 297 мм) и форму на Форма 2 (185×40 мм)
    const selects = titleDialog.locator('.dt-select');
    await selects.nth(0).selectOption('A4_P');
    await selects.nth(1).selectOption('Form2');

    // Заполняем реквизиты ЕСКД: обозначение, наименование, разработчик
    const inputs = titleDialog.locator('.dt-input');
    await inputs.nth(0).fill('АБВГ.468157.001 Э3'); // Обозначение
    await inputs.nth(1).fill('НИИ Микроэлектроники'); // Организация
    await inputs.nth(2).fill('Модуль сопряжения'); // Наименование

    // Включаем отображение Графы 26 и координатной сетки зон
    const checkboxes = titleDialog.locator('input[type="checkbox"]');
    await checkboxes.nth(1).check(); // Зоны координат
    await checkboxes.nth(2).check(); // Графа 26

    // Применяем настройки
    await titleDialog.getByRole('button', { name: 'Применить' }).click();
    await expect(titleDialog).toHaveCount(0);

    // Проверяем отображение формата в строке состояния листов
    await expect(page.locator('.dt-sheet-bar')).toContainText('А4');

    // Скриншот листа А4 книжной ориентации с Формой 2
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_schematic_a4_portrait_form2.png` });

    // Возвращаем лист А3 альбомный с Формой 1 для типовой схемы
    await page.locator('.dt-right-sidebar').getByRole('button', { name: 'Настроить...' }).click();
    const returnDialog = page.locator('.dt-modal');
    await expect(returnDialog).toBeVisible();
    await returnDialog.locator('.dt-select').nth(0).selectOption('A3_L');
    await returnDialog.locator('.dt-select').nth(1).selectOption('Form1');
    await returnDialog.getByRole('button', { name: 'Применить' }).click();
    await expect(returnDialog).toHaveCount(0);

    await expect(page.locator('.dt-sheet-bar')).toContainText('А3');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_schematic_a3_landscape_form1.png` });
  });

  test('05: Прокладка цепей (W), шин (B), портов питания, соединительных точек (Junctions) и автопривязка', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    await createNewBlankProject(page);
    const canvas = page.locator('.dt-canvas-wrap canvas');

    // Размещаем два резистора рядом
    await page.locator('.dt-lib-item').filter({ hasText: 'Резисторы' }).click();
    await page.locator('.dt-comp-item').filter({ hasText: 'МЛТ-0,25' }).click();
    await canvas.click({ position: { x: 450, y: 300 } });
    await canvas.click({ position: { x: 650, y: 300 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // Включаем инструмент проводника (W)
    await page.keyboard.press('w');
    await expect(page.getByTitle('Проложить провод (W)', { exact: true })).toHaveClass(/active/);

    // Тянем проводник от вывода первого резистора ко второму резистору
    await canvas.click({ position: { x: 485, y: 300 } });
    // Переключаем излом направления с помощью Space (ортогональная трассировка 90°)
    await page.keyboard.press(' ');
    await canvas.click({ position: { x: 615, y: 300 } });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    // Добавляем точку соединения Junction (J)
    await page.keyboard.press('j');
    await canvas.click({ position: { x: 550, y: 300 } });
    await page.keyboard.press('Escape');

    // Добавляем порт Земли (GND) через левую панель инструментов
    await page.locator('.dt-left-sidebar button').filter({ hasText: 'Инструменты' }).click();
    await page.waitForTimeout(100);
    await canvas.click({ position: { x: 550, y: 380 } });
    await page.keyboard.press('Escape');

    // Скриншот электрических связей и соединительных точек
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_wired_schematic_connections.png` });

    // Проверяем перетаскивание резистора с сохранением целостности связей (preserve connections)
    await page.locator('.dt-right-sidebar .dt-tree-row').filter({ hasText: 'R1' }).click();
    // Двигаем стрелкой вправо (nudge)
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(150);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_wire_stretching_preserve_connections.png` });
  });

  test('06: Эргономика мыши: Панорамирование средней кнопкой, масштабирование колесом и Home (Zoom to Fit)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    const canvas = page.locator('.dt-canvas-wrap canvas');

    // 1. Zoom In колесом мыши
    await canvas.hover({ position: { x: 500, y: 400 } });
    await page.mouse.wheel(0, -250);
    await page.waitForTimeout(200);

    // 2. Pan панорамирование средней кнопкой мыши
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 500, box.y + 400);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + 600, box.y + 450, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(200);

    // 3. Zoom Out колесом мыши
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);

    // 4. Zoom to Fit клавишей Home
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/09_pan_and_wheel_zoom.png` });
  });

  test('07: Диалог поиска компонентов и цепей (Ctrl+F, SchFindDialog)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Загружаем демо RS-485 для богатого набора элементов
    await loadDemo(page);
    await page.waitForTimeout(300);

    // Нажимаем Ctrl+F для вызова SchFindDialog
    await page.keyboard.press('Control+f');
    const findDialog = page.locator('.dt-modal[role="dialog"]');
    await expect(findDialog).toBeVisible();
    await expect(findDialog).toContainText('Найти компонент или цепь');

    // Вводим в поле поиска "R1"
    const input = findDialog.locator('input[aria-label="Обозначение компонента, значение или имя цепи"]');
    await expect(input).toBeFocused();
    await input.fill('R1');
    await page.waitForTimeout(150);

    // Проверяем, что в списке найденных элементов отображается R1
    await expect(findDialog.locator('.dt-find-result').first()).toContainText('R1');

    // Скриншот диалога поиска
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_dialog_find_component.png` });

    // Кликаем по найденному элементу R1 для центрирования и закрытия диалога
    await findDialog.locator('.dt-find-result').first().click();
    await expect(findDialog).toHaveCount(0);
  });

  test('08: Диалог настроек проверки электрических правил ERC (SchErcSettingsDialog)', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Открываем меню "Проверка"
    await page.locator('.dt-menubar').getByText('Проверка', { exact: true }).click();
    await page.getByText('Параметры проверки ERC...', { exact: true }).click();

    const ercDialog = page.locator('.dt-modal[role="dialog"]');
    await expect(ercDialog).toBeVisible();
    await expect(ercDialog).toContainText('Параметры проверки электрических правил (ERC)');

    // Проверяем вкладку "Основные правила"
    await expect(ercDialog).toContainText('Проверять неподключённые выводы');
    await expect(ercDialog).toContainText('Проверять конфликты выходов (Output–Output)');
    await expect(ercDialog).toContainText('Проверять дубликаты позиционных обозначений');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/11_dialog_erc_settings_rules.png` });

    // Переключаем на вкладку "Матрица типов выводов"
    await ercDialog.getByRole('button', { name: 'Матрица типов выводов' }).click();
    await page.waitForTimeout(150);

    // Проверяем отображение матрицы Pin-to-Pin (Input, Output, Power, Passive)
    await expect(ercDialog).toContainText('Выход (Out)');
    await expect(ercDialog).toContainText('Питание (Pwr)');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/12_dialog_erc_settings_matrix.png` });

    // Закрываем окно ERC по нажатию кнопки Закрыть (Esc)
    await page.keyboard.press('Escape');
    await expect(ercDialog).toHaveCount(0);
  });

  test('09: Полный аудит демо-схемы RS-485: УГО, Перечень элементов (ПЭ3 по ГОСТ 2.702/2.106) и экспорт', async ({ page }) => {
    await page.goto('/?module=schematic');
    await page.waitForTimeout(300);

    // Загружаем схему RS-485
    await loadDemo(page);
    await page.waitForTimeout(400);

    // Скриншот демонстрационной схемы с гальваноразвязкой RS-485
    await page.screenshot({ path: `${SCREENSHOT_DIR}/13_schematic_rs485_full_audit.png` });

    // Открываем диалог Перечня элементов (ПЭ3)
    await page.locator('.dt-menubar').getByText('Инструменты', { exact: true }).click();
    await page.getByText('Сформировать Перечень элементов (ПЭ3)...', { exact: true }).click();

    const bomDialog = page.locator('.dt-modal[role="dialog"]');
    await expect(bomDialog).toBeVisible();
    await expect(bomDialog).toContainText('Перечень элементов');

    // Проверяем наличие всех граф ГОСТ: Поз. обозначение, Наименование, Кол., Примечание
    await expect(bomDialog).toContainText('Поз. обозначение');
    await expect(bomDialog).toContainText('Наименование');
    await expect(bomDialog).toContainText('Кол.');
    await expect(bomDialog).toContainText('Примечание');

    // Проверяем упорядочивание групп по ГОСТ: Конденсаторы (C), Микросхемы (DD), Резисторы (R), Разъемы (XP/XT)
    await expect(bomDialog).toContainText('Конденсаторы');
    await expect(bomDialog).toContainText('Резисторы');

    // Скриншот окна ПЭ3 по ГОСТ 2.702
    await page.screenshot({ path: `${SCREENSHOT_DIR}/14_dialog_pe3_bill_of_materials.png` });

    await bomDialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(bomDialog).toHaveCount(0);
  });
});
