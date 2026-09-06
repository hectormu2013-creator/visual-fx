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
  - `lottery_engine.js`: Motor de sincronización automática, scraping alternado y sorteos Top 10 de loterías.
  - `lottery_stats.js`: Generador de estadísticas de 30 días, números calientes, atrasados y pronósticos para ticker.
  - `public/`: Interfaces de reproducción e historial (`index.html`, `offair.html`, `visor.html`).
  - `public/images/zodiac/`: Gráficos vectoriales SVG oficiales de los 12 signos zodiacales.
  - `data/`: Persistencia permanente en JSON (`clients.json`, `devices.json`, `lottery_results.json`, `lottery_history.json`).

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
   - Los resultados de loterías y el histórico de 30 días deben persistirse obligatoriamente en `data/lottery_results.json` y `data/lottery_history.json`.
7. **Auto-Autorización y Acceso a Carreras en Vivo:**
   - Las sesiones activas de Super Admin y Clientes deben auto-aprobar la pantalla/consola de gestión para evitar bloqueos por el banner de pantalla no autorizada y permitir la visualización directa e instantánea de transmisiones (`/api/stream/proxy`).
8. **Valores por Defecto de Reproducción:**
   - Las transmisiones de video en vivo deben iniciar con el audio **silenciado por defecto**.
   - Respetar el servicio de encendido asignado (`defaultService`) para cada dispositivo al iniciar.
9. **Estándares de Interfaz para Televisores de Agencias (Loterías y Pizarras):**
   - **Espacio Vertical:** En pantallas TV el espacio es crítico; preferir selectores `<select>` compactos sobre cintillos de píldoras voluminosos.
   - **Reloj en Vivo:** Todo panel de resultados debe mostrar la hora actual en tiempo real con segundos y zona horaria de Venezuela.
   - **Pizarra 4 Columnas:** La cartelera estilo 1000Resultados debe desplegar 4 columnas paralelas con división por categorías (`🐾 Animalitos` vs `🎰 Triples y Signos`).
   - **Tarjeta Destacada (Hero Card):** Debe incluir la barra animada de cuenta regresiva (15s), números gigantes legibles a distancia (`6.2rem` / `3.6rem`) e imágenes oficiales SVG para signos zodiacales.
   - **Cintillo Inferior:** Velocidad pausada (aprox. 160s) con posición fija inferior y padding compensatorio para jamás tapar tarjetas de resultados.
10. **Pantalla Completa Universal (Tecla F y Botón):**
    - Implementar siempre el mecanismo dual: API nativa `requestFullscreen()` + clase CSS `body.app-fullscreen-mode` para compatibilidad total con Smart TVs y WebViews Android.
11. **Síntesis de Voz Natural:**
    - Priorizar voces neuronales/naturales en español (`getBestSpanishVoice()`) con velocidad moderada (`0.90`) y tono cálido (`1.02`), precedido de un chime sintetizado.
12. **Flujo de Despliegue en Render y GitHub:**
    - Proteger contra errores de permisos de GitHub PAT excluyendo `.github/workflows/` si el token no posee ámbito `workflow`.
    - Confirmar despliegues en Render mediante su API REST (`.render_config.json`) verificando estado `live` y respuesta de endpoints de producción.


