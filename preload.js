// =============================================
// Electron 预加载脚本 - 安全桥接
// =============================================

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露安全的 API 给前端渲染进程
 * 遵循最小权限原则，只暴露必要功能
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // 应用信息
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),

    // 窗口控制
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowClose: () => ipcRenderer.invoke('window-close'),

    // 菜单事件监听
    onMenuExport: (callback) => ipcRenderer.on('menu-export', callback),
    onMenuAbout: (callback) => ipcRenderer.on('menu-about', callback),

    // 移除监听器
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// 标记当前运行环境为 Electron
contextBridge.exposeInMainWorld('isElectron', true);
