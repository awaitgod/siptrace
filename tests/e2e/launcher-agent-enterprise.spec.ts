import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const SCREENSHOT_DIR = 'tests/screenshots/audit/agent';
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });

test.describe('Launcher AI Agent Enterprise E2E Audit', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('comprehensive walkthrough of AI Agent launcher tab: all screens, modals, states, keyboard & mouse interactions', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    let turn = 0;
    const sheetId = 'sheet_1';
    let resumeStep1: () => void = () => {};
    const step1Wait = new Promise<void>(resolve => { resumeStep1 = resolve; });

    const endpoint = 'https://api.aitunnel.ru/v1/chat/completions';
    const decisionEndpoint = 'https://api.aitunnel.ru/v1/decisions';

    // Mock decision controller endpoint
    await page.route(decisionEndpoint, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        id: 'decision-enterprise-test',
        answers: {
          action: { type: 'choice', choice: 'continue', confidence: 0.96, probabilities: { continue: 0.96, revise: 0.03, restore: 0.01 } },
          taskSatisfied: { type: 'noul', noul: 0.1 }
        },
        usage: { cost_rub: 0.001 }
      }
    }));

    // Mock AI chat completions endpoint with controlled turns
    await page.route(endpoint, async route => {
      const request = route.request().postDataJSON();
      expect(route.request().headers().authorization).toBe('Bearer test-enterprise-key');

      const steps = [
        // Turn 0: Initialization & create schematic
        [
          call('finish', { summary: 'Слишком рано', limitations: '' }),
          call('create_schematic', { name: 'Тест ИИ' })
        ],
        // Turn 1: Place components and create board (we will pause here to capture working state)
        [
          call('set_targets', {
            documents: 'both',
            boardRefs: ['R1', 'R2'],
            boardNets: { MID: [{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }] }
          }),
          call('remember', { plan: 'Два резистора 0805, цепь MID, шина земли' }),
          call('set_frame', { sheet: sheetId, designation: 'АБВГ.123456.001 Э3' }),
          call('place_component', { sheet: sheetId, component: 'COMP_R_R1_12_0805', ref: 'R1', x: 60, y: 55 }),
          call('place_component', { sheet: sheetId, component: 'COMP_R_R1_12_0805', ref: 'R2', x: 100, y: 55 }),
          call('wire', { sheet: sheetId, from: { ref: 'R1', pin: '2' }, to: { ref: 'R2', pin: '1' }, net: 'MID' }),
          call('create_board', { width: 60, height: 45 })
        ],
        // Turn 2: Review checks required
        [
          call('finish', { summary: 'Нет проверок', limitations: '' })
        ],
        // Turn 3: Routing, via, pour, check, screenshots
        [
          call('route_trace', { layer: 'TopCopper', net: 'MID', width: 0.3, points: [{ x: 16.95, y: 16 }, { x: 16.95, y: 16 }] }),
          call('route_trace', { layer: 'TopCopper', net: 'MID', width: 0.3, points: [{ x: 15.05, y: 16 }, { x: 31.05, y: 16 }] }),
          call('delete_board', { ids: ['missing_trace'] }),
          call('add_via', { x: 16.95, y: 16, net: 'MID', diameter: 0.6, hole: 0.3 }),
          call('add_copper_pour', { layer: 'TopCopper', net: 'MID', clearance: 0.25, outline: [{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 55 }, { x: 10, y: 55 }] }),
          call('check', {}),
          call('screenshot', { target: 'schematic', sheet: sheetId }),
          call('screenshot', { target: 'pcb' })
        ],
        // Turn 4: Attempt with unrouted blocker rejected
        [
          call('finish', { summary: 'Попытка сдать неразведённую плату', limitations: '', status: 'complete' })
        ],
        // Turn 5: Final draft status with limitations
        [
          call('finish', { summary: 'Схема и плата созданы по ГОСТ', limitations: 'Требуется трассировка цепи MID', status: 'draft' })
        ]
      ];

      if (turn === 1) {
        await step1Wait;
      }

      const tools = steps[turn].map((fn, index) => ({ id: `call_${turn}_${index}`, type: 'function', function: fn }));
      turn++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: tools } }] }
      });
    });

    // Navigate to application root
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // =========================================================================
    // a) Welcome Screen in Light Theme -> 01_welcome_light.png
    // =========================================================================
    // Switch to Light theme via MenuBar "Вид" -> "Светлая тема"
    const menubar = page.locator('.dt-menubar');
    await menubar.getByText('Вид', { exact: true }).click();
    await page.locator('.dt-dropdown-row', { hasText: 'Светлая тема' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Click "ИИ-агент" tab in Launcher left sidebar
    await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();

    // Verify Welcome elements are rendered
    const welcomeHeader = page.getByRole('heading', { name: 'Какое устройство спроектируем?' });
    await expect(welcomeHeader).toBeVisible();
    await expect(page.getByRole('button', { name: 'RC-фильтр' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Делитель напряжения' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Схема и плата' })).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_welcome_light.png` });

    // =========================================================================
    // b) Welcome Screen in Dark Theme -> 02_welcome_dark.png
    // =========================================================================
    // Switch to Dark theme via MenuBar "Вид" -> "Тёмная тема"
    await menubar.getByText('Вид', { exact: true }).click();
    await page.locator('.dt-dropdown-row', { hasText: 'Тёмная тема' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(welcomeHeader).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_welcome_dark.png` });

    // =========================================================================
    // c) Settings Dialog modal -> 03_settings_dialog.png
    // =========================================================================
    // Click Settings button in Agent topbar
    await page.getByRole('button', { name: 'Настройки подключения', exact: true }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Настройки подключения' });
    await expect(settingsDialog).toBeVisible();
    await expect(settingsDialog.getByRole('heading', { name: 'Подключение', exact: true })).toBeVisible();

    // Verify keyboard navigation in settings modal (Tab, Shift+Tab, Escape)
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');

    // Test Esc closes dialog, then re-open
    await page.keyboard.press('Escape');
    await expect(settingsDialog).toBeHidden();
    await page.getByRole('button', { name: 'Настройки подключения', exact: true }).click();
    await expect(settingsDialog).toBeVisible();

    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_settings_dialog.png` });

    // =========================================================================
    // d) Filling in settings & ready composer -> 04_composer_ready.png
    // =========================================================================
    // Fill API key and select / verify model
    const keyInput = page.getByLabel('Ключ AITUNNEL');
    await keyInput.fill('test-enterprise-key');
    const modelInput = page.getByLabel('Модель');
    await expect(modelInput).toHaveValue('deepseek-v4.1-flash-1017');

    // Click "Готово" button or press Enter to close settings
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await expect(settingsDialog).toBeHidden();

    // Mouse click on suggestion pill "Схема и плата"
    const composerTextarea = page.getByRole('textbox', { name: 'Задание', exact: true });
    await page.getByRole('button', { name: 'Схема и плата' }).click();
    await expect(composerTextarea).toHaveValue(/Создай схему и плату/);
    await expect(composerTextarea).toBeFocused();

    // Verify connection status indicator and send button state
    await expect(page.locator('.agent-connection-dot')).toHaveAttribute('data-connected', 'true');
    const sendButton = page.getByRole('button', { name: 'Запустить агента' });
    await expect(sendButton).toBeEnabled();

    // Test Tab / Shift+Tab navigation in composer area
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(composerTextarea).toBeFocused();

    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_composer_ready.png` });

    // =========================================================================
    // e) Active generation state (Thinking / Steps / Activity Log) -> 05_working_state.png
    // =========================================================================
    // Start agent run via Enter in composer textarea
    await page.keyboard.press('Enter');

    // Wait until agent starts and reaches turn 1 where step1Wait pauses execution
    await expect(page.getByRole('button', { name: 'Остановить' })).toBeVisible();
    await expect(page.locator('.agent-thinking')).toBeVisible();

    // Expand Activity Log details to show active execution log
    const activityDetails = page.locator('details.agent-activity');
    await expect(activityDetails).toBeVisible();
    await activityDetails.evaluate((el: HTMLDetailsElement) => { el.open = true; });
    await expect(activityDetails.locator('ol li').first()).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_working_state.png` });

    // Resume execution for remaining turns
    resumeStep1();

    // =========================================================================
    // f) Successfully generated project:
    //    - Schematic in Inspector -> 06_inspector_documents_schematic.png
    //    - PCB in Inspector -> 07_inspector_documents_pcb.png
    //    - Checks in Inspector -> 08_inspector_checks.png
    // =========================================================================
    // Wait for the agent to finish all turns
    await expect(page.getByText('Схема и плата созданы по ГОСТ')).toBeVisible({ timeout: 35_000 });
    await expect(page.getByRole('button', { name: 'Запустить агента' })).toBeVisible();

    // Inspector Tab: Documents (Schematic active)
    const documentsTab = page.getByRole('tab', { name: /^Документы/ });
    await expect(documentsTab).toBeVisible();
    await documentsTab.click();

    // Verify schematic preview & action buttons are present
    await expect(page.getByRole('button', { name: 'Открыть схему', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить копию в проектах' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Выгрузить схему' })).toBeVisible();

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_inspector_documents_schematic.png` });

    // Switch inspector to PCB document via mouse click
    const pcbDocBtn = page.getByRole('button', { name: /Печатная плата.*PCB/ });
    await pcbDocBtn.click();
    await expect(page.getByRole('button', { name: 'Открыть плату', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Выгрузить плату' })).toBeVisible();

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_inspector_documents_pcb.png` });

    // Switch inspector to Checks tab via mouse click
    const checksTab = page.getByRole('tab', { name: 'Проверки', exact: true });
    await checksTab.click();

    // Verify ERC/DRC/unrouted metrics grid and checks summary
    await expect(page.getByRole('heading', { name: /незавершённый черновик/ })).toBeVisible();
    await expect(page.getByText('Неразведённые связи', { exact: true }).locator('..')).toContainText('1');
    await expect(page.getByText('Схема и плата синхронизированы')).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_inspector_checks.png` });

    // =========================================================================
    // g) Live Document Viewer Modal (AgentLiveDocument) -> 09_live_document_viewer.png
    // =========================================================================
    // Switch back to Documents tab and open live viewer
    await documentsTab.click();
    await page.getByRole('button', { name: 'Открыть плату', exact: true }).click();

    const liveViewer = page.getByRole('dialog', { name: 'Просмотр проекта агента' });
    await expect(liveViewer).toBeVisible();
    await expect(liveViewer.getByRole('img', { name: 'Печатная плата' })).toBeVisible();

    // Verify zoom controls interaction: Zoom In, Zoom Out, Fit
    const zoomInBtn = liveViewer.getByRole('button', { name: 'Увеличить масштаб' });
    const zoomOutBtn = liveViewer.getByRole('button', { name: 'Уменьшить масштаб' });
    const fitBtn = liveViewer.getByRole('button', { name: 'Вписать документ' });

    await zoomInBtn.click();
    await expect(liveViewer.getByText('125%')).toBeVisible();
    await zoomOutBtn.click();
    await expect(liveViewer.getByText('100%')).toBeVisible();
    await fitBtn.click();

    // Verify document switching inside viewer
    const docSelect = liveViewer.getByRole('combobox', { name: 'Документ' });
    await docSelect.selectOption(sheetId);
    await expect(liveViewer.getByRole('img', { name: 'Лист схемы' })).toBeVisible();

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09_live_document_viewer.png` });

    // Close live viewer using Close button
    await liveViewer.getByRole('button', { name: 'Закрыть просмотр' }).click();
    await expect(liveViewer).toBeHidden();

    // Test Inspector Collapse & Expand toggle button in agent toolbar
    const inspectorToggle = page.getByRole('button', { name: 'Показать документы и проверки' });
    await inspectorToggle.click();
    await expect(page.locator('.agent-inspector')).toBeHidden();
    await inspectorToggle.click();
    await expect(page.locator('.agent-inspector')).toBeVisible();

    // Test saving project to launcher projects
    await documentsTab.click();
    await page.getByRole('button', { name: 'Сохранить копию в проектах' }).click();
    await expect(page.getByText('Копия сохранена в проектах лаунчера.')).toBeVisible();

    // Navigate to "Проекты" tab and verify the saved project is listed
    await page.getByRole('button', { name: /^Проекты/ }).click();
    await expect(page.getByText('Тест ИИ — ИИ').first()).toBeVisible();

    // Switch back to "ИИ-агент" tab
    await page.getByRole('button', { name: 'ИИ-агент', exact: true }).click();
    await expect(page.getByLabel('ИИ-агент')).toBeVisible();

    // =========================================================================
    // h) Error / Warning State -> 10_error_state.png
    // =========================================================================
    // Override completion endpoint to simulate API authentication/network error (HTTP 401)
    await page.route(endpoint, async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        json: { error: { message: 'Incorrect or expired API key' } }
      });
    });

    // Enter a new prompt into composer
    await composerTextarea.fill('Добавь стабилизатор напряжения 3.3 В и разъём питания.');
    await page.keyboard.press('Enter');

    // Verify warning notification and error message display in chat
    const alertMessage = page.getByRole('alert');
    await expect(alertMessage).toBeVisible();
    await expect(alertMessage).toContainText('Сервер ИИ отклонил ключ или доступ к модели.');
    await expect(page.locator('.agent-message-assistant').last()).toContainText('Сервер ИИ отклонил ключ или доступ к модели.');

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_error_state.png` });
  });
});
