# 🚀 Hoja de Ruta y Plan de Implementación: Visual-FX SaaS (B2B Multi-Cliente)

**Archivo guardado para implementación futura por solicitud del usuario.**

---

## 📑 Resumen Ejecutivo de la Evolución a SaaS

1. **Rebranding neutro a marca blanca (Visual-FX Platform)**:
   - Marca comercial independiente (**Visual-FX Live Streaming Engine**) perteneciente al Grupo Fenix.
   - Personalización por cliente: logo propio, anuncios y banner dinámico en pantalla.

2. **Esquema de Planes de Suscripción**:
   - `PLAN_FENIX_PERPETUAL`: Licencia corporativa interna ilimitada para Agencias Fenix.
   - `PLAN_DAILY`: Pase de 24 horas para jornadas especiales.
   - `PLAN_WEEKLY`: Pase de 7 días para salas y eventos temporales.
   - `PLAN_MONTHLY`: Suscripción mensual estándar de 30 días.
   - `PLAN_ANNUAL`: Licencia anual de 365 días con descuento.

3. **Cierre & Suspensión Automática de Pantallas por Vencimiento**:
   - Evaluación en tiempo real de `expiresAt`. Si la suscripción expira, la señal de video HLS se bloquea automáticamente.
   - El televisor o dispositivo muestra una pantalla de pago (**Paywall Screen**) con un **Código QR de renovación instantánea** (Pago Móvil, USDT, Zelle) y soporte por WhatsApp.

4. **Diseño Responsive para Móviles y Tablets (PWA)**:
   - Adaptación táctil en teléfonos y tablets.
   - Reproductor fijo (*Sticky Player*) en la parte superior, carousel táctil de 30 hipódromos y función Picture-in-Picture (PiP).

5. **Cintillo Promocional Dinámico (On-Screen Ticker Banner)**:
   - Marquesina inferior en vivo para avisos, ofertas y horarios de carreras programables desde el Panel de Control.

---

## 🏗️ Arquitectura Técnica y Archivos a Modificar en la Fase 2

- `VISUAL_FX_PARA_GITHUB/auth_device.js`: Estructura de suscripciones, `expiresAt`, renovación y estado `EXPIRED`/`SUSPENDED`.
- `VISUAL_FX_PARA_GITHUB/server.js`: Endpoints `/api/admin/devices/renew`, `/api/admin/devices/status`, `/api/admin/ticker/update`.
- `VISUAL_FX_PARA_GITHUB/public/index.html`: Banner paywall de suspensión con QR, cintillo promocional y pestañas de administración de planes.
- `VISUAL_FX_PARA_GITHUB/public/styles.css`: Estilos responsive móviles, animación ticker marquee y pantalla de cuenta vencida.
- `VISUAL_FX_PARA_GITHUB/public/app.js`: Sincronización del cintillo en tiempo real, manejo de Paywall y gestos táctiles.

---
*Guardado en el repositorio de Visual-FX para reanudar en futuras sesiones.*
