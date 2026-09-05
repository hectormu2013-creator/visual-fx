# 🏇 Visual-FX: Manual de Instalación, Configuración y Despliegue

**Sistema de Transmisiones de Carreras de Caballos en Directo y Multicanal para Agencias Fenix**

---

## 📋 Tabla de Contenidos
1. [Descripción General](#-descripción-general)
2. [Requisitos del Sistema](#-requisitos-del-sistema)
3. [Instalación Local](#-instalación-local)
4. [Variables de Entorno](#-variables-de-entorno)
5. [Credenciales por Defecto](#-credenciales-por-defecto)
6. [Arquitectura del Proyecto](#-arquitectura-del-proyecto)
7. [Despliegue en la Nube (Render.com)](#-despliegue-en-la-nube-rendercom)
8. [Guía de Operación en Smart TVs y Pantallas](#-guía-de-operación-en-smart-tvs-y-pantallas)
9. [Solución de Problemas (Troubleshooting)](#-solución-de-problemas-troubleshooting)

---

## 🚀 Descripción General

**Visual-FX** es la plataforma centralizada de streaming en tiempo real diseñada para proyectar transmisiones hípicas multicanal en las Agencias Fenix. Permite visualizar hasta 4 canales simultáneos en alta definición (HD), gestionar la autorización de pantallas/televisores por código PIN, auditar usuarios con roles jerárquicos y sincronizar automáticamente las señales oficiales de los hipódromos a través de un puente inteligente con **RTN.tv** y proxy HLS dedicado.

---

## 💻 Requisitos del Sistema

- **Servidor / Host**:
  - Node.js `v18.0.0` o superior.
  - npm `v9.0.0` o superior.
  - Conexión a Internet estable (mínimo 20 Mbps recomendados para 4 streams simultáneos).
- **Clientes / Pantallas**:
  - Navegador web moderno (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
  - Smart TVs o TV Boxes (Android TV, Fire TV Stick, Samsung Tizen, LG WebOS) con navegador web HTML5 compatible con HLS.js.

---

## 📥 Instalación Local

### Paso 1: Ubicarse en el directorio del proyecto
Abre la consola de comandos (PowerShell / Terminal) y navega a la carpeta de Visual-FX:

```bash
cd VISUAL_FX_PARA_GITHUB
```

### Paso 2: Instalar dependencias
Ejecuta el comando para instalar las librerías necesarias:

```bash
npm install
```

Las dependencias principales que se instalarán son:
- `express`: Servidor HTTP REST API.
- `cors`: Manejo de politicas de origen cruzado.
- `jsonwebtoken`: Autenticación segura JWT.
- `node-fetch`: Peticiones HTTP del puente RTN.tv y Proxy HLS.

### Paso 3: Iniciar el servidor

**Modo Desarrollo (con auto-reload):**
```bash
npm run dev
```

**Modo Producción:**
```bash
npm start
```

El servidor iniciará por defecto en el puerto **`3500`**.

### Paso 4: Acceder a la interfaz web
Abre tu navegador e ingresa a:
```text
http://localhost:3500
```

---

## ⚙️ Variables de Entorno

Puedes personalizar la configuración del sistema definiendo las siguientes variables de entorno en tu sistema o en la plataforma de hosting:

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto HTTP en el que escuchará el servidor | `3500` |
| `RTN_USER` | Correo de cuenta oficial en RTN.tv | Configurado internamente |
| `RTN_PASS` | Contraseña de la cuenta en RTN.tv | Configurado internamente |

---

## 🔑 Credenciales por Defecto

El sistema incluye cuentas preconfiguradas con diferentes roles de acceso:

| Usuario | Contraseña | Rol | Acceso |
| :--- | :--- | :--- | :--- |
| `hector_owner` | `admin2026` | **SUPER_ADMIN** | Control total, gestión de usuarios, canales y activación de TVs |
| `jefe_tecnico` | `soporte2026` | **TECH_CHIEF** | Gestión de transmisiones, conmutación de fuentes HLS y soporte técnico |
| `leo1` | `1234` | **AGENCY_MANAGER** | Operación de Agencia Cabimas y control de sus televisores |
| `agencia_caracas` | `fenix123` | **AGENCY_MANAGER** | Operación de Agencia Caracas |
| `agencia_maracaibo` | `fenix123` | **AGENCY_MANAGER** | Operación de Agencia Maracaibo |

---

## 🏗️ Arquitectura del Proyecto

```text
VISUAL_FX_PARA_GITHUB/
├── server.js           # Servidor principal Express, rutas API y manejo de errores
├── channels.js         # Catálogo de los 30 hipódromos principales A-Z
├── rtn_bridge.js       # Integración y scraping/bridge de la API de RTN.tv
├── master_ingest.js    # Ingestor máster que mantiene vivas y sincronizadas las señales
├── stream_proxy.js     # Proxy HLS (.m3u8/.ts) con evasión de CORS y reescritura de manifiestos
├── auth_device.js      # Autenticación JWT, control de roles y activación de TVs por PIN
├── render.yaml         # Blueprint para despliegue automatizado en Render.com
├── package.json        # Configuración del proyecto y scripts Node.js
└── public/             # Frontend SPA (Single Page Application)
    ├── index.html      # Estructura principal de la interfaz multitv y modales
    ├── styles.css      # Estilos visuales dark mode glassmorphism
    ├── app.js          # Lógica del cliente, HLS.js player y navegación por teclado/TV
    └── offair.html     # Pantalla de espera cuando una señal no está transmitiendo
```

---

## ☁️ Despliegue en la Nube (Render.com)

Visual-FX está 100% optimizado para desplegarse en la nube en plataformas como **Render.com**.

### Pasos para desplegar:
1. Sube este proyecto a tu repositorio de **GitHub**.
2. Ingresa a [Render.com](https://render.com) y crea un nuevo **Web Service**.
3. Conecta tu repositorio de GitHub `VISUAL_FX_PARA_GITHUB`.
4. Render detectará automáticamente el archivo `render.yaml`:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Haz clic en **Create Web Service**. ¡Tu enlace seguro HTTPS estará listo en minutos!

---

## 📺 Guía de Operación en Smart TVs y Pantallas

### 1. Vincular un Televisor / Pantalla Nueva
- Al abrir la URL en una nueva TV, se mostrará una pantalla de bloqueo con un **CÓDIGO DE ACTIVACIÓN DE 6 DÍGITOS** (Ej. `FX-4912`).
- El administrador o encargado ingresa al **Panel de Control (⚙️)** en su computadora o teléfono.
- Selecciona la pestaña **"Televisores y Licencias"**, introduce el código PIN y asigna el nombre del TV (ej. `TV 1 - Caja`).
- La pantalla de la TV se desbloqueará de inmediato.

### 2. Atajos de Teclado y Control Remoto (TV Remote)

| Tecla | Acción |
| :--- | :--- |
| <kbd>1</kbd> | Cambiar a vista de **1 Canal** (Pantalla completa centrada) |
| <kbd>2</kbd> | Cambiar a vista de **2 Canales** (Pantalla dividida) |
| <kbd>3</kbd> | Cambiar a vista de **3 Canales** |
| <kbd>4</kbd> | Cambiar a vista de **4 Canales (Matriz 2x2)** |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | Navegar entre los canales activos |
| <kbd>Enter</kbd> | Cambiar el audio al canal seleccionado |
| <kbd>F</kbd> | Alternar modo **Pantalla Completa** |

---

## 🛠️ Solución de Problemas (Troubleshooting)

1. **¿El reproductor dice "Conectando Señal..." y no carga?**
   - Verifica que el stream original `.m3u8` esté activo.
   - El proxy HLS integrado en `/api/stream/proxy` soluciona la mayoría de bloqueos CORS. Si el hipódromo requiere autenticación en RTN.tv, el sistema renovará automáticamente la sesión cada 3 minutos.

2. **¿El puerto 3500 está ocupado al iniciar en Windows?**
   - Puedes cambiar el puerto ejecutando:
     ```powershell
     $env:PORT=4000; npm start
     ```

3. **¿Cómo agregar o actualizar la URL de un hipódromo manualmente?**
   - Ingresa con el usuario `hector_owner` o `jefe_tecnico`.
   - Abre el **Panel de Control (⚙️)** -> pestaña **"Transmisiones Máster"**.
   - Selecciona el hipódromo, pega la nueva URL HLS (`.m3u8`) o Embed y presiona **"ACTUALIZAR SEÑAL"**. La actualización será instantánea para todas las pantallas conectadas.

---
*Agencias Fenix © 2026 • Sistema de Transmisiones Visual-FX*
