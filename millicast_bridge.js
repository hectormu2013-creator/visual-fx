// millicast_bridge.js - Receptor Centralizado Dolby Millicast (WebRTC -> 1-a-N Shared fMP4)
// Cumple estrictamente las 5 Reglas Universales Anti-Baneo:
// 1. El servidor en EE.UU. (Railway) actúa como ÚNICO suscriptor frente a Dolby Millicast / Robertsstream.
// 2. Cero ejecución de telemetría Conviva (THEOplayerConvivaConnector jamás se carga).
// 3. Cero exposición de IPs de Venezuela ni multiplicación de sesiones (1 sola conexión WebRTC por pista vista).
// 4. Reempaquetado directo H.264 (-c:v copy) a fMP4 progresivo en memoria (ftyp+moov / moof+mdat) compartido 1-a-N.

const fetch = require('node-fetch');
const WebSocket = require('ws');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { RTCPeerConnection, RTCRtpCodecParameters } = require('werift');
const {
  recordBytesSent,
  onStreamConnectionOpen,
  onStreamConnectionClose,
  registerExclusiveDeviceStream,
  isBandwidthWithinLimits
} = require('./bandwidth_tracker');
const { getRacingScheduleStatus } = require('./schedule_manager');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Registro de metadatos Millicast por trackCode (ej. PHD, FIM, IJN, MGD)
const millicastTrackRegistry = new Map();

// Hubs compartidos 1-a-N activos por trackCode
const millicastSharedHubs = new Map();

// Diagnósticos recientes de Millicast
const millicastDiagnostics = [];
function recordMillicastDiag(trackCode, step, detail = '') {
  millicastDiagnostics.unshift({
    t: new Date().toISOString().slice(11, 19),
    trackCode,
    step,
    detail: String(detail).slice(0, 260)
  });
  if (millicastDiagnostics.length > 40) millicastDiagnostics.pop();
}

function registerMillicastTrack(info) {
  if (!info || !info.trackCode) return;
  const code = info.trackCode.toUpperCase();
  millicastTrackRegistry.set(code, {
    ...info,
    trackCode: code,
    updatedAt: Date.now()
  });
}

function getMillicastSyntheticUrl(trackCode) {
  return `https://ws.rcncdn.com/millicast/live/${encodeURIComponent(trackCode.toUpperCase())}.mp4`;
}

function parseTrackCodeFromSyntheticUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/millicast\/live\/([A-Za-z0-9_-]+)\.mp4/i);
  return m ? m[1].toUpperCase() : null;
}

let urlRefresherFn = null;
const lastLiveUrlRefreshAt = new Map();

function setMillicastUrlRefresher(fn) {
  urlRefresherFn = fn;
}

/**
 * Si el subscriberToken de Millicast (10 min de vida) tiene más de 7 minutos o expiró (401),
 * lo refresca consultando streamlive.php en Robertsstream; si la URL firmada t= también venció (401),
 * pide una URL firmada fresca al puente RTN (máx 1 vez cada 90s por pista).
 */
async function ensureFreshSubscriberToken(trackCode, forceRefresh = false) {
  const code = trackCode.toUpperCase();
  let entry = millicastTrackRegistry.get(code);
  if (!entry) return null;

  const ageMs = Date.now() - (entry.tokenIssuedAt || 0);
  if (!forceRefresh && entry.subscriberToken && ageMs < 7 * 60 * 1000) {
    return entry;
  }

  const parseAndStoreHtml = (html, liveUrlUsed) => {
    const streamNameMatch = html.match(/var\s+streamName\s*=\s*["']([^"']+)["']/);
    const accountIdMatch = html.match(/var\s+streamAccountId\s*=\s*["']([^"']+)["']/);
    const subTokenMatch = html.match(/var\s+subscriberToken\s*=\s*["']([^"']+)["']/);
    if (streamNameMatch && accountIdMatch && subTokenMatch) {
      entry.streamName = streamNameMatch[1];
      entry.streamAccountId = accountIdMatch[1];
      entry.subscriberToken = subTokenMatch[1];
      entry.tokenIssuedAt = Date.now();
      if (liveUrlUsed) entry.liveUrl = liveUrlUsed;
      millicastTrackRegistry.set(code, entry);
      recordMillicastDiag(code, 'TOKEN_REFRESH_OK', `stream=${entry.streamName}`);
      return true;
    }
    return false;
  };

  try {
    if (entry.liveUrl && typeof entry.liveUrl === 'object' && entry.liveUrl.liveUrl) {
      entry.liveUrl = entry.liveUrl.liveUrl;
    }
    if (typeof entry.liveUrl === 'string' && entry.liveUrl.startsWith('http')) {
      const res = await fetch(entry.liveUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Referer': entry.referer || 'https://online.rtn.tv/index.php'
        },
        timeout: 10000
      });
      if (res.ok) {
        const html = await res.text();
        if (parseAndStoreHtml(html, entry.liveUrl)) {
          return entry;
        }
      }
    }

    // Si streamlive.php devolvió 401 (firma t= vencida) o no tenía token, refrescar la URL firmada en RTN
    const lastRef = lastLiveUrlRefreshAt.get(code) || 0;
    if (urlRefresherFn && (Date.now() - lastRef) > 45 * 1000) {
      lastLiveUrlRefreshAt.set(code, Date.now());
      const refreshed = await urlRefresherFn(code);
      const freshLiveUrl = (refreshed && typeof refreshed === 'object') ? refreshed.liveUrl : refreshed;
      if (typeof freshLiveUrl === 'string' && freshLiveUrl.startsWith('http')) {
        entry = millicastTrackRegistry.get(code) || entry;
        entry.liveUrl = freshLiveUrl;
        if (refreshed && refreshed.refererUrl) entry.referer = refreshed.refererUrl;
        const res2 = await fetch(freshLiveUrl, {
          headers: {
            'User-Agent': BROWSER_UA,
            'Referer': entry.referer || 'https://online.rtn.tv/index.php'
          },
          timeout: 10000
        });
        if (res2.ok) {
          const html2 = await res2.text();
          parseAndStoreHtml(html2, freshLiveUrl);
        }
      }
    }
  } catch (e) {
    recordMillicastDiag(code, 'TOKEN_REFRESH_ERR', e.message);
  }
  return entry;
}

/**
 * Solicita al Director de Dolby Millicast el WebSocket y JWT de suscripción.
 */
async function subscribeMillicastDirector(entry) {
  const dirRes = await fetch('https://director.millicast.com/api/director/subscribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${entry.subscriberToken}`,
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_UA,
      'Origin': 'https://stream.robertsstream.com',
      'Referer': 'https://stream.robertsstream.com/'
    },
    body: JSON.stringify({
      streamAccountId: entry.streamAccountId,
      streamName: entry.streamName,
      unauthorizedSubscribe: true
    }),
    timeout: 8000
  });

  if (!dirRes.ok) {
    const txt = await dirRes.text().catch(() => '');
    throw new Error(`DIRECTOR_${dirRes.status}:${txt.slice(0, 100)}`);
  }

  const json = await dirRes.json();
  if (!json || json.status !== 'success' || !json.data) {
    throw new Error('DIRECTOR_INVALID_JSON');
  }

  const wsUrl = json.data.wsUrl || (json.data.urls && json.data.urls[0]);
  const jwt = json.data.jwt;
  if (!wsUrl || !jwt) {
    throw new Error('DIRECTOR_MISSING_WS_OR_JWT');
  }

  return { wsUrl, jwt };
}

function createH264OpusPeerConnection() {
  return new RTCPeerConnection({
    bundlePolicy: 'max-bundle',
    codecs: {
      video: [
        new RTCRtpCodecParameters({
          mimeType: 'video/H264',
          clockRate: 90000,
          rtcpFeedback: [
            { type: 'nack' },
            { type: 'nack', parameter: 'pli' },
            { type: 'ccm', parameter: 'fir' },
            { type: 'goog-remb' }
          ],
          parameters: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'
        })
      ],
      audio: [
        new RTCRtpCodecParameters({
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        })
      ]
    }
  });
}

/**
 * Sondeo ultraligero en Millicast para verificar si el hipódromo está transmitiendo video real en vivo.
 * Cierra inmediatamente al recibir los primeros paquetes RTP de video o evento inactive.
 */
async function probeMillicastTrackIsLive(trackCode) {
  const code = (trackCode || '').toUpperCase();
  const activeHub = millicastSharedHubs.get(code);
  if (activeHub && activeHub.running && (Date.now() - activeHub.lastRtpAt) < 12000) {
    return true;
  }

  const entry = await ensureFreshSubscriberToken(code);
  if (!entry || !entry.subscriberToken) return false;

  let pc = null;
  let ws = null;

  return new Promise(async (resolve) => {
    let settled = false;
    let rtpBytes = 0;
    let rtpPackets = 0;

    const finish = (isLive, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      recordMillicastDiag(code, isLive ? 'PROBE_LIVE' : 'PROBE_OFFAIR', `${reason} (pkts=${rtpPackets},bytes=${rtpBytes})`);
      try { if (ws) ws.close(); } catch (e) {}
      try { if (pc) pc.close(); } catch (e) {}
      resolve(isLive);
    };

    const timer = setTimeout(() => {
      finish(rtpPackets >= 3 && rtpBytes >= 1200, 'timeout');
    }, 5500);

    try {
      const { wsUrl, jwt } = await subscribeMillicastDirector(entry);
      pc = createH264OpusPeerConnection();
      const vt = pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const onRtpHandler = (rtp) => {
        if (settled) return;
        const len = rtp && rtp.payload ? rtp.payload.length : 0;
        if (len > 0) {
          rtpPackets++;
          rtpBytes += len;
          if (rtpPackets >= 4 && rtpBytes >= 1500) {
            finish(true, 'rtp_flowing');
          }
        }
      };

      if (vt.receiver && vt.receiver.defaultTrack && vt.receiver.defaultTrack.onReceiveRtp) {
        vt.receiver.defaultTrack.onReceiveRtp.subscribe(onRtpHandler);
      }
      if (vt.onTrack && vt.onTrack.subscribe) {
        vt.onTrack.subscribe((track) => {
          if (track && track.onReceiveRtp) {
            track.onReceiveRtp.subscribe(onRtpHandler);
          }
        });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(jwt)}`, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Origin': 'https://stream.robertsstream.com'
        },
        handshakeTimeout: 5000
      });

      ws.on('open', () => {
        if (settled) return;
        ws.send(JSON.stringify({
          type: 'cmd',
          name: 'view',
          transId: 1,
          data: {
            streamId: `${entry.streamAccountId}/${entry.streamName}`,
            sdp: pc.localDescription.sdp,
            rts: true
          }
        }));
      });

      ws.on('message', async (raw) => {
        if (settled) return;
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'error') {
            finish(false, `ws_error:${JSON.stringify(msg.data || '').slice(0, 80)}`);
            return;
          }
          if (msg.type === 'event' && msg.name === 'inactive') {
            finish(false, 'event_inactive');
            return;
          }
          if (msg.type === 'event' && msg.name === 'active') {
            recordMillicastDiag(code, 'EVENT_ACTIVE', entry.streamName);
          }
          if (msg.type === 'response' && msg.data && msg.data.sdp) {
            await pc.setRemoteDescription({ type: 'answer', sdp: msg.data.sdp });
          }
        } catch (e) {}
      });

      ws.on('error', (err) => finish(false, `ws_err:${err.message}`));
      ws.on('close', () => {
        if (!settled) finish(rtpPackets >= 3, 'ws_closed');
      });
    } catch (err) {
      finish(false, err.message);
    }
  });
}

function bindSocketRandomPort(sock) {
  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      sock.removeListener('error', reject);
      resolve(sock.address().port);
    });
  });
}

const MAX_CONCURRENT_MILLICAST_HUBS = 8;

/**
 * Inicia el Hub compartido 1-a-N para un hipódromo en Millicast:
 * 1 sola conexión WebRTC desde Railway EE.UU. -> RTP local -> ffmpeg (-c:v copy) -> fMP4 en RAM -> N televisores.
 */
async function startMillicastHubUpstream(hub) {
  if (hub.connecting || hub.running) return;

  const activeOthers = Array.from(millicastSharedHubs.values()).filter(
    h => h.trackCode !== hub.trackCode && (h.running || h.connecting)
  );
  if (activeOthers.length >= MAX_CONCURRENT_MILLICAST_HUBS) {
    activeOthers.sort((a, b) => (a.clients.size - b.clients.size) || ((a.startedAt || 0) - (b.startedAt || 0)));
    const victim = activeOthers[0];
    if (victim && victim.cleanupUpstream) {
      recordMillicastDiag(victim.trackCode, 'HUB_CAP_EVICT', `Liberando cupo para ${hub.trackCode} (máx ${MAX_CONCURRENT_MILLICAST_HUBS} simultáneos)`);
      victim.cleanupUpstream(true);
    }
  }

  hub.connecting = true;
  hub.startedAt = Date.now();
  hub.lastRtpAt = Date.now();
  const code = hub.trackCode;

  const cleanupUpstream = (closeClients = false) => {
    hub.connecting = false;
    hub.running = false;
    hub.initSegment = null;
    hub.latestFragment = null;
    if (hub.pliInterval) {
      clearInterval(hub.pliInterval);
      hub.pliInterval = null;
    }
    if (hub.fastPliInterval) {
      clearInterval(hub.fastPliInterval);
      hub.fastPliInterval = null;
    }
    if (hub.watchdogInterval) {
      clearInterval(hub.watchdogInterval);
      hub.watchdogInterval = null;
    }
    if (hub.ffmpegProc) {
      const proc = hub.ffmpegProc;
      hub.ffmpegProc = null;
      try { proc.kill('SIGKILL'); } catch (e) {}
    }
    if (hub.ws) {
      const w = hub.ws;
      hub.ws = null;
      try { w.close(); } catch (e) {}
    }
    if (hub.pc) {
      const p = hub.pc;
      hub.pc = null;
      try { p.close(); } catch (e) {}
    }
    if (hub.udpSocket) {
      const u = hub.udpSocket;
      hub.udpSocket = null;
      try { u.close(); } catch (e) {}
    }
    if (hub.sdpPath) {
      const sp = hub.sdpPath;
      hub.sdpPath = null;
      try { fs.unlinkSync(sp); } catch (e) {}
    }
    if (closeClients && hub.clients && hub.clients.size > 0) {
      for (const c of Array.from(hub.clients)) {
        try { c.res.end(); } catch (e) {}
      }
      hub.clients.clear();
    }
  };

  hub.cleanupUpstream = cleanupUpstream;

  try {
    let entry = await ensureFreshSubscriberToken(code, false);
    if (!entry || !entry.subscriberToken) {
      throw new Error('NO_MILLICAST_ENTRY');
    }

    let dirData;
    try {
      dirData = await subscribeMillicastDirector(entry);
    } catch (dirErr) {
      if (String(dirErr.message).includes('DIRECTOR_401')) {
        entry = await ensureFreshSubscriberToken(code, true);
        dirData = await subscribeMillicastDirector(entry);
      } else {
        throw dirErr;
      }
    }
    const { wsUrl, jwt } = dirData;
    const udpSocket = dgram.createSocket('udp4');
    const vSocket = dgram.createSocket('udp4');
    const aSocket = dgram.createSocket('udp4');
    const vPort = await bindSocketRandomPort(vSocket);
    const aPort = await bindSocketRandomPort(aSocket);
    // Liberar los puertos de prueba para que ffmpeg pueda hacer bind a vPort y aPort
    await new Promise(r => vSocket.close(r));
    await new Promise(r => aSocket.close(r));

    hub.udpSocket = udpSocket;

    const pc = createH264OpusPeerConnection();
    hub.pc = pc;
    const vt = pc.addTransceiver('video', { direction: 'recvonly' });
    const at = pc.addTransceiver('audio', { direction: 'recvonly' });

    let videoSsrc = null;
    let ffmpegStarted = false;
    let ffmpegStartedAt = 0;
    let hasSeenVideoKeyframe = false;
    let firstVideoRtpAt = 0;
    let spsNalBuf = null;
    let ppsNalBuf = null;

    const startFfmpegProcess = (spropParameterSets = '') => {
      if (ffmpegStarted || !hub.pc) return;
      ffmpegStarted = true;
      ffmpegStartedAt = Date.now();

      const fmtpLine = spropParameterSets
        ? `a=fmtp:96 packetization-mode=1;profile-level-id=42e01f;sprop-parameter-sets=${spropParameterSets}\r\n`
        : `a=fmtp:96 packetization-mode=1;profile-level-id=42e01f\r\n`;

      const sdpContent = [
        'v=0',
        'o=- 0 0 IN IP4 127.0.0.1',
        's=VisualFX-Millicast-Relay',
        'c=IN IP4 127.0.0.1',
        't=0 0',
        `m=video ${vPort} RTP/AVP 96`,
        'a=rtpmap:96 H264/90000',
        'a=framerate:30',
        fmtpLine.trim(),
        `m=audio ${aPort} RTP/AVP 111`,
        'a=rtpmap:111 opus/48000/2',
        ''
      ].join('\r\n');

      const sdpPath = path.join(os.tmpdir(), `vfx_millicast_${code}_${Date.now()}.sdp`);
      fs.writeFileSync(sdpPath, sdpContent, 'utf8');
      hub.sdpPath = sdpPath;

      const ffArgs = [
        '-loglevel', 'warning',
        '-threads', '1',
        '-protocol_whitelist', 'file,udp,rtp,crypto,data',
        '-fflags', '+nobuffer+genpts+igndts+discardcorrupt',
        '-flags', 'low_delay',
        '-fpsprobesize', '0',
        '-analyzeduration', '1800000',
        '-probesize', '1500000',
        '-i', sdpPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-threads', '1',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '48k',
        '-ar', '44100',
        '-ac', '1',
        '-flush_packets', '1',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      ];

      const ffProc = spawn(ffmpegPath, ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      hub.ffmpegProc = ffProc;
      hub.running = true;
      hub.connecting = false;
      hub.lastFragmentAt = Date.now();

      hub.watchdogInterval = setInterval(() => {
        const now = Date.now();
        const rtpSilence = now - (hub.lastRtpAt || now);
        const fragSilence = now - (hub.lastFragmentAt || now);
        if (rtpSilence > 10000 || fragSilence > 12000) {
          recordMillicastDiag(code, 'HUB_WATCHDOG_RESTART', `rtpSilence=${rtpSilence}ms,fragSilence=${fragSilence}ms`);
          cleanupUpstream(true);
        }
      }, 4000);

      let pendingBuf = Buffer.alloc(0);
      let ftypBox = null;
      let moovBox = null;
      let currentMoof = null;

      ffProc.stdout.on('data', (chunk) => {
        hub.lastRtpAt = Date.now();
        hub.lastFragmentAt = Date.now();
        pendingBuf = Buffer.concat([pendingBuf, chunk]);

        while (pendingBuf.length >= 8) {
          const boxSize = pendingBuf.readUInt32BE(0);
          const boxType = pendingBuf.slice(4, 8).toString('ascii');
          if (boxSize < 8 || boxSize > 12 * 1024 * 1024) {
            pendingBuf = Buffer.alloc(0);
            break;
          }
          if (pendingBuf.length < boxSize) break;

          const box = Buffer.from(pendingBuf.slice(0, boxSize));
          pendingBuf = pendingBuf.slice(boxSize);

          if (boxType === 'ftyp') {
            ftypBox = box;
          } else if (boxType === 'moov') {
            moovBox = box;
            if (ftypBox) {
              hub.initSegment = Buffer.concat([ftypBox, moovBox]);
              recordMillicastDiag(code, 'INIT_SEGMENT_READY', `bytes=${hub.initSegment.length}`);
              for (const client of hub.clients) {
                if (!client.sentInit && !client.res.writableEnded) {
                  try {
                    client.res.write(hub.initSegment);
                    client.sentInit = true;
                    recordBytesSent(hub.initSegment.length, client.deviceId);
                  } catch (e) {}
                }
              }
            }
          } else if (boxType === 'moof') {
            currentMoof = box;
          } else if (boxType === 'mdat' && currentMoof) {
            const fragment = Buffer.concat([currentMoof, box]);
            currentMoof = null;
            hub.latestFragment = fragment;

            if (!isBandwidthWithinLimits().allowed || !getRacingScheduleStatus().isRacingAllowed) {
              cleanupUpstream(true);
              return;
            }

            for (const client of Array.from(hub.clients)) {
              if (client.res.writableEnded || client.res.destroyed) {
                hub.clients.delete(client);
                continue;
              }
              try {
                if (!client.sentInit && hub.initSegment) {
                  client.res.write(hub.initSegment);
                  client.sentInit = true;
                  recordBytesSent(hub.initSegment.length, client.deviceId);
                }
                if (client.sentInit) {
                  client.res.write(fragment);
                  recordBytesSent(fragment.length, client.deviceId);
                }
              } catch (e) {
                hub.clients.delete(client);
              }
            }
          }
        }
      });

      ffProc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) recordMillicastDiag(code, 'FFMPEG_LOG', msg.slice(0, 180));
      });

      ffProc.on('close', (exitCode) => {
        if (hub.ffmpegProc !== ffProc) return;
        recordMillicastDiag(code, 'FFMPEG_EXIT', `code=${exitCode}`);
        cleanupUpstream(true);
      });
    };

    let answerSprop = '';

    const forwardVideoRtp = (rtp) => {
      if (!hub.pc || !rtp || !rtp.payload || rtp.payload.length === 0) return;
      hub.lastRtpAt = Date.now();
      if (!videoSsrc && rtp.header && rtp.header.ssrc) {
        videoSsrc = rtp.header.ssrc;
      }
      if (!firstVideoRtpAt) {
        firstVideoRtpAt = Date.now();
        const requestKeyframe = () => {
          if (videoSsrc && vt && vt.receiver) {
            try { vt.receiver.sendRtcpPLI(videoSsrc); } catch (e) {}
          }
        };
        requestKeyframe();
        hub.fastPliInterval = setInterval(() => {
          if (hub.initSegment || !hub.pc) {
            clearInterval(hub.fastPliInterval);
            hub.fastPliInterval = null;
            return;
          }
          requestKeyframe();
        }, 250);
      }

      rtp.header.payloadType = 96;
      const b0 = rtp.payload[0];
      const nalType = b0 & 0x1f;

      if (nalType === 7) {
        spsNalBuf = Buffer.from(rtp.payload);
      } else if (nalType === 8) {
        ppsNalBuf = Buffer.from(rtp.payload);
      } else if (nalType === 24) {
        let offset = 1;
        while (offset + 2 <= rtp.payload.length) {
          const naluSize = rtp.payload.readUInt16BE(offset);
          offset += 2;
          if (naluSize > 0 && offset + naluSize <= rtp.payload.length) {
            const nalu = rtp.payload.slice(offset, offset + naluSize);
            const innerType = nalu[0] & 0x1f;
            if (innerType === 7) spsNalBuf = Buffer.from(nalu);
            else if (innerType === 8) ppsNalBuf = Buffer.from(nalu);
          }
          offset += naluSize;
        }
      }

      if (!ffmpegStarted) {
        if ((spsNalBuf && ppsNalBuf) || (Date.now() - firstVideoRtpAt) > 1200) {
          const computedSprop = (spsNalBuf && ppsNalBuf)
            ? `${spsNalBuf.toString('base64')},${ppsNalBuf.toString('base64')}`
            : answerSprop;
          startFfmpegProcess(computedSprop);
        } else {
          return;
        }
      }

      // Esperar ~220ms tras spawn(ffmpeg) para que el puerto UDP esté enlazado y arrancar en el primer keyframe/SPS en secuencia
      const ffmpegReady = ffmpegStarted && (Date.now() - ffmpegStartedAt) >= 220;
      const isSpsOrStapA = (nalType === 7 || nalType === 24);
      const isIdrStart = (
        nalType === 5 ||
        (nalType === 28 && rtp.payload.length > 1 && (rtp.payload[1] & 0x80) !== 0 && (rtp.payload[1] & 0x1f) === 5)
      );

      if (!hasSeenVideoKeyframe) {
        if (ffmpegReady && (isSpsOrStapA || isIdrStart || (Date.now() - ffmpegStartedAt) > 1400)) {
          hasSeenVideoKeyframe = true;
        } else {
          return;
        }
      }

      try {
        const buf = rtp.serialize();
        udpSocket.send(buf, vPort, '127.0.0.1');
      } catch (e) {}
    };

    const forwardAudioRtp = (rtp) => {
      if (!hub.pc || !rtp || !rtp.payload || rtp.payload.length === 0 || !ffmpegStarted || !hasSeenVideoKeyframe) return;
      rtp.header.payloadType = 111;
      try {
        const buf = rtp.serialize();
        udpSocket.send(buf, aPort, '127.0.0.1');
      } catch (e) {}
    };

    if (vt.receiver && vt.receiver.defaultTrack && vt.receiver.defaultTrack.onReceiveRtp) {
      vt.receiver.defaultTrack.onReceiveRtp.subscribe(forwardVideoRtp);
    }
    if (vt.onTrack && vt.onTrack.subscribe) {
      vt.onTrack.subscribe((track) => {
        if (track && track.onReceiveRtp) track.onReceiveRtp.subscribe(forwardVideoRtp);
      });
    }

    if (at.receiver && at.receiver.defaultTrack && at.receiver.defaultTrack.onReceiveRtp) {
      at.receiver.defaultTrack.onReceiveRtp.subscribe(forwardAudioRtp);
    }
    if (at.onTrack && at.onTrack.subscribe) {
      at.onTrack.subscribe((track) => {
        if (track && track.onReceiveRtp) track.onReceiveRtp.subscribe(forwardAudioRtp);
      });
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(jwt)}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Origin': 'https://stream.robertsstream.com'
      },
      handshakeTimeout: 8000
    });
    hub.ws = ws;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'cmd',
        name: 'view',
        transId: 1,
        data: {
          streamId: `${entry.streamAccountId}/${entry.streamName}`,
          sdp: pc.localDescription.sdp,
          rts: true
        }
      }));
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'response' && msg.data && msg.data.sdp) {
          const answerSdp = msg.data.sdp;
          const spropMatch = answerSdp.match(/sprop-parameter-sets=([^\r\n;]+)/i);
          answerSprop = spropMatch ? spropMatch[1] : '';
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          hub.pliInterval = setInterval(() => {
            if (videoSsrc && vt && vt.receiver) {
              try { vt.receiver.sendRtcpPLI(videoSsrc); } catch (e) {}
            }
          }, 1800);
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      if (hub.ws !== ws) return;
      cleanupUpstream(true);
    });

    ws.on('error', (err) => {
      recordMillicastDiag(code, 'HUB_WS_ERR', err.message);
      cleanupUpstream(true);
    });
  } catch (err) {
    recordMillicastDiag(code, 'HUB_START_ERR', err.message);
    cleanupUpstream(true);
  }
}

function streamMillicastSharedMp4(trackCode, req, res) {
  const code = (trackCode || '').toUpperCase();
  let hub = millicastSharedHubs.get(code);
  if (!hub) {
    hub = {
      trackCode: code,
      clients: new Set(),
      initSegment: null,
      latestFragment: null,
      connecting: false,
      running: false,
      lastRtpAt: 0,
      idleTimer: null,
      cleanupUpstream: null
    };
    millicastSharedHubs.set(code, hub);
  }

  if (hub.idleTimer) {
    clearTimeout(hub.idleTimer);
    hub.idleTimer = null;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Connection', 'keep-alive');

  const deviceId = (req.query && req.query.deviceId) || req.headers['x-device-id'] || 'tv';
  registerExclusiveDeviceStream(deviceId, res, `millicast:${code}`);
  const clientObj = { res, sentInit: false, deviceId, connCounted: true };
  onStreamConnectionOpen();

  if (hub.initSegment) {
    try {
      res.write(hub.initSegment);
      clientObj.sentInit = true;
      recordBytesSent(hub.initSegment.length, deviceId);
      if (hub.latestFragment) {
        res.write(hub.latestFragment);
        recordBytesSent(hub.latestFragment.length, deviceId);
      }
    } catch (e) {}
  }

  hub.clients.add(clientObj);

  if (!hub.running && !hub.connecting) {
    startMillicastHubUpstream(hub);
  }

  const removeClient = () => {
    if (clientObj.connCounted) {
      clientObj.connCounted = false;
      onStreamConnectionClose();
    }
    hub.clients.delete(clientObj);
    if (hub.clients.size === 0 && !hub.idleTimer) {
      hub.idleTimer = setTimeout(() => {
        if (hub.clients.size === 0 && hub.cleanupUpstream) {
          recordMillicastDiag(code, 'HUB_IDLE_STOP', '0 TVs connected for 3m, closing Millicast socket');
          hub.cleanupUpstream();
          hub.initSegment = null;
          hub.latestFragment = null;
        }
      }, 180000);
    }
  };

  req.on('close', removeClient);
  res.on('close', removeClient);
  res.on('error', removeClient);
}

function getMillicastDiagnostics() {
  return {
    registeredTracks: Array.from(millicastTrackRegistry.keys()),
    activeHubs: Array.from(millicastSharedHubs.values()).filter(h => h.running || h.connecting).map(h => ({
      trackCode: h.trackCode,
      running: h.running,
      clients: h.clients.size,
      hasInitSegment: Boolean(h.initSegment)
    })),
    millicastDiagnostics
  };
}

module.exports = {
  registerMillicastTrack,
  setMillicastUrlRefresher,
  getMillicastSyntheticUrl,
  parseTrackCodeFromSyntheticUrl,
  probeMillicastTrackIsLive,
  streamMillicastSharedMp4,
  getMillicastDiagnostics
};
