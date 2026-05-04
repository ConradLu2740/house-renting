// =============================================
// Electron 主进程 - 窗口管理与系统集成
// =============================================

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// 全局变量
let mainWindow = null;
let tray = null;
let isQuitting = false;

// 窗口配置
const WINDOW_CONFIG = {
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false
    },
    title: '租房区域综合评估与覆盖可视化推荐工具',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#f5f7fa'
};

/**
 * 创建主窗口
 */
function createMainWindow() {
    mainWindow = new BrowserWindow(WINDOW_CONFIG);

    // 加载应用页面
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // 窗口准备好后显示（避免白屏）
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // 窗口关闭处理 - 最小化到托盘而非退出
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // 窗口关闭后清理引用
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 开发工具（开发环境可用）
    // mainWindow.webContents.openDevTools();
}

/**
 * 创建系统托盘
 */
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    tray.setToolTip('租房评估工具');
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // 点击托盘图标显示/隐藏窗口
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

/**
 * 创建应用菜单
 */
function createApplicationMenu() {
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '导出评估结果',
                    accelerator: 'Ctrl+E',
                    click: () => {
                        mainWindow?.webContents.send('menu-export');
                    }
                },
                { type: 'separator' },
                {
                    label: '退出',
                    accelerator: 'Ctrl+Q',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '视图',
            submenu: [
                { role: 'reload', label: '刷新' },
                { role: 'forceReload', label: '强制刷新' },
                { type: 'separator' },
                { role: 'toggleDevTools', label: '开发者工具' },
                { type: 'separator' },
                { role: 'resetZoom', label: '重置缩放' },
                { role: 'zoomIn', label: '放大' },
                { role: 'zoomOut', label: '缩小' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '全屏' }
            ]
        },
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'close', label: '关闭' }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于',
                    click: () => {
                        // 可以弹出一个关于对话框
                        mainWindow?.webContents.send('menu-about');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// =============================================
// IPC 通信处理
// =============================================

// 获取应用版本
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// 获取平台信息
ipcMain.handle('get-platform', () => {
    return process.platform;
});

// 窗口控制
ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

ipcMain.handle('window-close', () => {
    mainWindow?.hide();
});

// =============================================
// 应用生命周期
// =============================================

// 应用准备就绪
app.whenReady().then(() => {
    createMainWindow();
    createTray();
    createApplicationMenu();

    // macOS: 点击 dock 图标重新创建窗口
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        } else {
            mainWindow?.show();
        }
    });
});

// 所有窗口关闭时退出（Windows/Linux）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 应用即将退出
app.on('before-quit', () => {
    isQuitting = true;
});

// 防止多开实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // 当尝试运行第二个实例时，聚焦到第一个实例的窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
