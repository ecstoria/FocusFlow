/**
 * preload.js — FocusFlow secure IPC bridge
 *
 * This file runs in a privileged context but exposes ONLY the specific
 * IPC channels the renderer needs. This replaces nodeIntegration:true
 * and contextIsolation:false with a safe, whitelisted API.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of channels renderer can SEND to main
const SEND_CHANNELS = [
  'window-minimize',
  'window-maximize',
  'window-close',
  'timer-state-changed',
  'timer-finished',
  'timer-is-running',
  'timer-tick',
  'restore-main',
  'theme-changed',
  'theme-sync',
  'set-always-on-top',
  'set-window-width',
  'set-idle-detection',
  'show-mini-context-menu',
  'mini-drag-start',
  'mini-dragging',
  'mini-drag-end',
];

// Whitelist of channels renderer can RECEIVE from main
const RECEIVE_CHANNELS = [
  'remote-pause',
  'remote-reset',
  'remote-end',
  'idle-detected',
  'idle-resumed',
  'mini-position-saved',
  'apply-theme',
  'update-time',
  'mini-drag-start-pos',
  'update-available',
  'update-downloaded',
];

// Whitelist of invoke channels (two-way async)
const INVOKE_CHANNELS = [
  'load-data',
  'save-data',
  'get-data-path',
  'export-csv',
];

contextBridge.exposeInMainWorld('electronAPI', {
  // One-way: renderer → main
  send: (channel, data) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`[preload] Blocked send on unknown channel: ${channel}`);
    }
  },

  // One-way: main → renderer
  on: (channel, callback) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      // Return cleanup function
      return () => ipcRenderer.removeListener(channel, subscription);
    } else {
      console.warn(`[preload] Blocked listener on unknown channel: ${channel}`);
    }
  },

  // Remove a specific listener
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // Two-way: renderer → main → renderer
  invoke: (channel, data) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    } else {
      console.warn(`[preload] Blocked invoke on unknown channel: ${channel}`);
      return Promise.reject(new Error(`Unknown invoke channel: ${channel}`));
    }
  },
});
