/**
 * Túnel Privado USA (Contabo New Jersey 217.216.84.239) + Sincronizador 1-Clic de 1/ST TV
 * - Abre un túnel SOCKS5 cifrado vía OpenSSH nativo de Windows (indetectable e imbloqueable por operadoras en Venezuela).
 * - Abre una ventana AISLADA de Google Chrome que navega desde EE.UU. (217.216.84.239) sin afectar el Chrome normal de Venezuela (BNC/Banesco).
 * - Al presionar ENTER tras iniciar sesión manualmente en 1st.tv, lee las cookies (incluyendo auth0 SSO HttpOnly) y las activa en Contabo + Supabase.
 */

const { spawn, execFileSync } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const readline = require('readline');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const SSH_EXE = 'C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe';
const SSH_KEY = path.join(os.homedir(), '.ssh', 'contabo_vfx_ed25519');
const CONTABO_HOST = '217.216.84.239';
const SOCKS_PORT = 1089;
const CDP_PORT = 9333;
const CHROME_PROFILE = path.join(__dirname, '..', 'data', 'usa_chrome_profile');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

function findChrome() {
  const fs = require('fs');
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No se encontró Google Chrome instalado en la ruta estándar.');
}

function waitForPort(port, timeoutMs = 12000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Tiempo agotado esperando el puerto local ${port}`));
        } else {
          setTimeout(tryOnce, 350);
        }
      });
    };
    tryOnce();
  });
}

async function readCookiesFromChromeCdp() {
  const verRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { timeout: 5000 });
  const verJson = await verRes.json();
  const wsUrl = verJson.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('No se pudo conectar al puerto local de Chrome USA.');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      reject(new Error('Timeout leyendo cookies de Chrome USA.'));
    }, 6000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id === 1 && msg.result && Array.isArray(msg.result.cookies)) {
          clearTimeout(timer);
          ws.close();
          resolve(msg.result.cookies);
        }
      } catch (e) {}
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function pushCookiesToContaboViaSsh(wpCookie, auth0Cookie) {
  const payloadB64 = Buffer.from(JSON.stringify({ cookie: wpCookie, auth0Cookie }), 'utf8').toString('base64');
  const remoteScript = [
    `const p = JSON.parse(Buffer.from('${payloadB64}', 'base64').toString('utf8'));`,
    `const cfg = require('/opt/visual-fx/ecosystem.config.cjs');`,
    `const pass = cfg.apps[0].env.PASS_HECTOR_OWNER;`,
    `const fetch = require('/opt/visual-fx/node_modules/node-fetch');`,
    `(async () => {`,
    `  const r1 = await fetch('http://127.0.0.1:3500/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: 'hector', password: pass }) });`,
    `  const d1 = await r1.json();`,
    `  const r2 = await fetch('http://127.0.0.1:3500/api/admin/first-tv/cookie', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + d1.token}, body: JSON.stringify(p) });`,
    `  const d2 = await r2.json();`,
    `  console.log(JSON.stringify(d2));`,
    `})();`
  ].join(' ');

  const out = execFileSync(SSH_EXE, [
    '-o', 'StrictHostKeyChecking=accept-new',
    '-i', SSH_KEY,
    `root@${CONTABO_HOST}`,
    `node -e "${remoteScript.replace(/"/g, '\\"')}"`
  ], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(out.trim().split('\n').pop());
}

(async () => {
  console.log('==================================================================');
  console.log(' 🇺🇸 INICIANDO TÚNEL PRIVADO EE.UU. (Contabo New Jersey)');
  console.log('==================================================================');

  const sshArgs = [
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-i', SSH_KEY,
    '-D', `127.0.0.1:${SOCKS_PORT}`,
    '-N',
    `root@${CONTABO_HOST}`
  ];

  const sshProc = spawn(SSH_EXE, sshArgs, { stdio: 'ignore' });
  const cleanup = () => {
    try { sshProc.kill(); } catch (e) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });

  await waitForPort(SOCKS_PORT, 12000);
  console.log(`✅ Túnel cifrado USA activo en 127.0.0.1:${SOCKS_PORT} -> IP salida: ${CONTABO_HOST} (New Jersey, EE.UU.)`);
  console.log('🔒 Tu navegador principal sigue en Venezuela (BNC, Banesco y sistemas locales NO se ven afectados).');

  const chromeExe = findChrome();
  const chromeArgs = [
    `--user-data-dir=${CHROME_PROFILE}`,
    `--proxy-server=socks5://127.0.0.1:${SOCKS_PORT}`,
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://1st.tv/wp-login.php'
  ];

  const chromeProc = spawn(chromeExe, chromeArgs, { detached: false, stdio: 'ignore' });
  await waitForPort(CDP_PORT, 10000).catch(() => {});

  console.log('\n------------------------------------------------------------------');
  console.log(' PASOS PARA ACTIVAR 1/ST TV (35+ CANALES HD GRATIS):');
  console.log(' 1. En la ventana nueva de Chrome que se abrió, inicia sesión en 1st.tv');
  console.log('    con tu cuenta habitual (marca la casilla reCAPTCHA y entra).');
  console.log(' 2. Apenas veas que ya entraste a 1st.tv, vuelve a ESTA ventana');
  console.log('    y presiona [ENTER] para sincronizar automáticamente con Contabo.');
  console.log('    (O deja esta ventana abierta para seguir navegando con IP de EE.UU.)');
  console.log('------------------------------------------------------------------\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askLoop = () => {
    rl.question('👉 Presiona [ENTER] cuando ya hayas iniciado sesión en 1st.tv (o escribe "salir" para cerrar el túnel USA): ', async (ans) => {
      if (ans && ans.trim().toLowerCase() === 'salir') {
        try { chromeProc.kill(); } catch (e) {}
        cleanup();
        process.exit(0);
      }

      try {
        const allCookies = await readCookiesFromChromeCdp();
        const wpList = allCookies.filter(c => c.domain && c.domain.includes('1st.tv'));
        const auth0List = allCookies.filter(c => c.domain && c.domain.includes('1st.com') && (c.name.startsWith('auth0') || c.name.startsWith('did')));

        const hasWpLogin = wpList.some(c => c.name.startsWith('wordpress_logged_in_'));
        if (!hasWpLogin) {
          console.log('⚠️ Todavía no detecto la sesión iniciada en 1st.tv. Completa el login en la ventana de Chrome y vuelve a presionar [ENTER].\n');
          return askLoop();
        }

        const wpCookieStr = wpList.map(c => `${c.name}=${c.value}`).join('; ');
        const auth0CookieStr = auth0List.map(c => `${c.name}=${c.value}`).join('; ');

        console.log('⏳ Enviando sesión 1st.tv + llave SSO Auth0 al servidor Contabo y Supabase...');
        const res = pushCookiesToContaboViaSsh(wpCookieStr, auth0CookieStr);
        if (res && res.success) {
          console.log('\n🎉 ¡LISTO, SOCIO! 1/ST TV QUEDÓ CONECTADO Y RESPALDADO EN CONTABO + SUPABASE.');
          console.log('   Además se capturó la cookie SSO oculta de auth.1st.com para auto-renovación silenciosa.');
          console.log('   Puedes seguir usando esa ventana de Chrome como tu VPN personal de EE.UU. todo el tiempo que quieras.\n');
        } else {
          console.log('⚠️ Respuesta inesperada del servidor:', res);
        }
      } catch (err) {
        console.error('❌ Error leyendo/enviando cookies:', err.message);
      }
      askLoop();
    });
  };
  askLoop();
})();
