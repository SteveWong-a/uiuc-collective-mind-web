import { app, Menu, Tray, BrowserWindow, shell } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

export function setupTray(mainWindow: BrowserWindow, pullNowFn: () => void, openSettingsFn: () => void) {
  if (tray) return;

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Pull Now',
      click: () => {
        pullNowFn();
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        openSettingsFn();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('UIUC Collective Mind');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}
