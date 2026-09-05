# 📱 Guía de Empaquetado APK Nativa para FireStick y Android TV (`visual-fx-tv.apk`)

Esta guía explica detalladamente cómo compilar, distribuir e instalar la **App Nativa de Visual-FX** en televisores **Smart TV**, **Amazon FireStick**, **TV Boxes Android** y monitores de agencias hípicas.

---

## ⚡ ¿Por qué usar la App Nativa / APK?
1. **Rendimiento 60 FPS en Carreras:** Pasa directamente al chip decodificador de video GPU del televisor, eliminando entrecortes de video y congelamiento de memoria JS.
2. **Auto-Inicio al Encender la TV:** Al conectar el televisor de la agencia hípica o encender el FireStick, la aplicación se abre sola en el servicio asignado.
3. **Instalación Ultra-Fácil con Downloader:** No requiere Google Play Store. Se instala en 10 segundos desde la app gratuita **Downloader**.

---

## 🛠️ Método 1: Compilar la APK Nativa con Capacitor (Paso a Paso)

### Requisitos Previos:
- Node.js instalado.
- Android Studio instalado (con SDK de Android 11+).

### Comandos de Compilación:
```bash
# 1. Instalar dependencias de Capacitor en el proyecto
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Inicializar la app de Android TV
npx cap init "Visual-FX TV" "com.visualfx.tv" --web-dir public

# 3. Agregar plataforma Android
npx cap add android

# 4. Copiar archivos web actualizados y abrir en Android Studio
npx cap copy
npx cap open android
```

En Android Studio:
1. Ir a **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
2. Copiar el archivo `.apk` generado a la carpeta `public/visual-fx-tv.apk` del servidor.

---

## 📲 Método 2: Instalación en Amazon FireStick y Android TV usando "Downloader"

1. **En la TV o Firestick:**
   - Ir a la tienda de aplicaciones (Appstore / Play Store) e instalar la aplicación gratuita **Downloader** (icono naranja).
2. **Permitir Apps de fuentes desconocidas:**
   - Ir a *Configuración > Mi Fire TV > Opciones para desarrolladores > Instalar apps desconocidas > Downloader: ACTIVADO*.
3. **Descargar e Instalar:**
   - Abrir **Downloader** e ingresar el código corto o la dirección IP/Dominio de tu servidor:
     `http://TU-SERVIDOR:3500/app`
   - Presionar **Go**. La APK se descargará y aparecerá el botón **INSTALAR**.
4. ¡Listo! La App quedará guardada en el menú principal del televisor con su icono nativo de **Visual-FX TV**.

---

## 🌐 Método 3: Instalación PWA (Smart TV LG webOS, Samsung Tizen y Android)

Para televisores Samsung o LG sin FireStick:
1. Abrir el navegador del Smart TV e ingresar a la URL del sistema (`http://TU-SERVIDOR:3500`).
2. En la barra de menú o configuraciones del navegador, seleccionar **"Agregar a Pantalla de Inicio"** o **"Instalar Aplicación Visual-FX"**.
3. La App se guardará como un acceso directo nativo en el Home Dashboard del televisor.
