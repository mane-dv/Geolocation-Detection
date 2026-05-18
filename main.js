const { app, BrowserWindow, dialog, protocol, net, ipcMain } = require('electron')
const path = require('path')
const https = require('https')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

function fetchIPLocation() {
  return new Promise((resolve, reject) => {
    https.get('https://ipapi.co/json/', { headers: { 'User-Agent': 'curl/7.64.1' } }, (res) => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// Renderer asks main process to do the IP fetch (avoids CORS / network sandbox)
ipcMain.handle('fetch-ip-location', async () => {
  try {
    const data = await fetchIPLocation()
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

function getAppIcon() {
  return path.join(__dirname, 'build', 'icon.png')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    title: 'RemoteDeskGeo',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  win.webContents.session.protocol.handle('app', (request) => {
    const url = new URL(request.url)
    const file = url.pathname === '/' || url.pathname.endsWith('.html')
      ? 'index.html'
      : url.pathname.replace(/^\//, '')
    return net.fetch('file://' + path.join(__dirname, 'src', file))
  })

  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'geolocation') {
      dialog.showMessageBox(win, {
        type: 'question',
        title: 'RemoteDeskGeo — Location Access',
        message: 'RemoteDeskGeo wants to access your GPS.',
        detail: 'Allow this app to read your position for work-site range checking?',
        buttons: ['Allow', 'Deny'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => callback(response === 0))
    } else {
      callback(true)
    }
  })

  win.loadURL('app://remotedeskgeo/index.html')
  // win.webContents.openDevTools()
}

app.setName('RemoteDeskGeo')
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getAppIcon())
  }
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
