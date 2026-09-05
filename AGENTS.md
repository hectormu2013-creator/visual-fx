# AGENTS.md - Proyecto Visual FX

## Contexto del Proyecto
Este proyecto es el **Sistema SaaS de Transmisión Visual FX**, diseñado para gestión de canales de televisión, retransmisiones HLS, control de OBS WebSocket, conmutación automática de señales en vivo y estados Off-Air.

## Tecnología y Stack
- **Backend:** Node.js (Express, WebSocket `ws`)
- **Frontend:** HTML5, HLS.js, Tailwind CSS / Vanilla CSS
- **Módulos Clave:**
  - `server.js`: Servidor principal Express & WebSocket.
  - `channels.js`: Gestión de lista de canales y URLs HLS.
  - `rtn_bridge.js`: Puente de sincronización RTN / OBS.
  - `master_ingest.js`: Ingesta maestra de transmisión.
  - `public/`: Interfaces de reproducción e historial (`index.html`, `offair.html`, `visor.html`).

## Reglas para la IA (Antigravity Agent)
1. **Scope:** Trabajar únicamente en las funciones del reproductor HLS, puentes WebSocket y la consola de gestión de señales.
2. **Puertos por defecto:** 3000 (Servidor principal) / 8080 (RTN WebSocket).
3. **Persistencia de Canales:** Cualquier cambio en la lista de canales debe actualizar `channels.js` o la fuente de datos correspondiente.
4. **Despliegue:** Preparado para Render / VPS con `render.yaml`.
5. **Jerarquía y Separación de Roles:**
   - **Super Admin (Héctor):** Crea y gestiona organizaciones clientes, define planes, fija cupos máximos de pantallas, administra el catálogo máster de hipódromos y audita la plataforma. **NUNCA** activa pantallas directamente mediante PIN.
   - **Clientes / Encargados (Fenix, etc.):** Activan de forma autónoma sus pantallas ingresando el PIN numérico de 6 dígitos mostrado en el televisor y asignando un nombre único a cada dispositivo.
6. **Persistencia Obligatoria en Disco (`data/`):**
   - Las organizaciones clientes y las pantallas autorizadas deben sincronizarse en archivos JSON permanentes en el directorio `data/` (`clients.json`, `devices.json`). Ningún cambio de cliente o dispositivo debe mantenerse únicamente en memoria volátil.
7. **Auto-Autorización y Acceso a Carreras en Vivo:**
   - Las sesiones activas de Super Admin y Clientes deben auto-aprobar la pantalla/consola de gestión para evitar bloqueos por el banner de pantalla no autorizada y permitir la visualización directa e instantánea de transmisiones (`/api/stream/proxy`).
8. **Valores por Defecto de Reproducción:**
   - Las transmisiones de video en vivo deben iniciar con el audio **silenciado por defecto**.
   - Respetar el servicio de encendido asignado (`defaultService`) para cada dispositivo al iniciar.

