// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = ['open-media', 'new-project', 'export-video'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = ['open-media', 'new-project', 'export-video', 'export-progress'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        const listener = (event, ...args) => func(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
      }
      return undefined;
    },
    invoke: (channel, data) => {
      let validChannels = ['open-file-dialog', 'show-save-dialog', 'export-project', 'create-proxy', 'save-project', 'load-project', 'save-autosave', 'load-autosave', 'clear-autosave', 'cancel-export', 'get-metadata'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, data);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
  }
);

console.log('Preload script executed successfully');
