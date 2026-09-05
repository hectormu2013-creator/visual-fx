# 📱 Guía Completa de la App Nativa para Android TV y FireStick (`visual-fx-tv.apk`)

Esta guía explica la arquitectura, el flujo de compilación en la nube (GitHub Actions), la distribución y la instalación de la **App Nativa de Visual FX** para **Smart TVs**, **Amazon FireStick**, **Google TV**, **Android TV Boxes** y pantallas de agencias hípicas.

---

## ⚡ 1. ¿Por qué usar la App Nativa / APK en lugar del Navegador?

1. **Aceleración por Hardware Dedicada (GPU):**
   - En navegadores de Smart TV convencionales (como Samsung Tizen o LG webOS), el motor web comparte recursos limitados de CPU con el sistema operativo, lo que causa tirones y saturación de RAM al decodificar más de 2 streams HLS a la vez.
   - La aplicación nativa utiliza decodificación directa por hardware (`WebView` con `hardwareAccelerated="true"` y soporte nativo de códecs H.264/AAC), permitiendo reproducir **hasta 4 pantallas a 60 FPS fluidos**.

2. **Arranque Automático al Encender el TV:**
   - La app incluye un `BootReceiver` con permiso `RECEIVE_BOOT_COMPLETED`.
   - Cuando el encargado de la agencia enciende la regleta eléctrica o el televisor/FireStick, la app se abre sola sin requerir intervención manual.

3. **Modo Kiosk y Pantalla Completa Absoluta:**
   - Oculta barras de navegación, menús de sistema y bordes.
   - Mantiene la pantalla siempre encendida (`FLAG_KEEP_SCREEN_ON`) evitando que el televisor entre en modo reposo o protector de pantalla.

4. **Navegación Intuitiva con Control Remoto (D-Pad):**
   - Soporte para flechas Arriba, Abajo, Izquierda, Derecha, Botón OK / Enter y tecla Atrás.

5. **Seguridad Jerárquica Blindada:**
   - En modo TV, los accesos al panel administrativo de clientes y super admin están estrictamente deshabilitados en la interfaz para prevenir desvinculaciones indebidas por clientes finales o espectadores.

---

## 🚀 2. Compilación Automatizada en la Nube (GitHub Actions)

No necesitas instalar Java ni Android Studio en tu computadora. El repositorio cuenta con un pipeline CI/CD en `.github/workflows/build-apk.yml` que:
1. Detecta cambios en la carpeta `android-tv-app/`.
2. Compila el código en un contenedor Ubuntu con JDK 17 y Android SDK 34.
3. Firma digitalmente el archivo `visual-fx-tv.apk` con `signingConfig debug` para permitir instalación inmediata sin advertencias de firma.
4. Publica automáticamente el archivo ejecutable en **GitHub Releases** bajo el tag `v1.0-tv`.

---

## 📥 3. Instalación Rápida con la App "Downloader" (FireStick y Android TV)

Este es el método más rápido (toma menos de 1 minuto):

1. **En tu FireStick o TV Box:**
   - Ve a la tienda de aplicaciones e instala la app **Downloader** (icono naranja).
2. **Habilitar instalación de aplicaciones desconocidas:**
   - Ve a *Configuración > Mi Fire TV > Opciones para desarrolladores > Instalar apps desconocidas > Downloader: ACTIVADO*.
3. **Descargar e Instalar:**
   - Abre **Downloader** y en la barra escribe la URL corta oficial:
     ```text
     https://visual-fx.onrender.com/app
     ```
   - Pulsa **Go**. La descarga comenzará automáticamente.
   - Al finalizar, pulsa **Instalar** y luego **Abrir**.
4. **Vincular Pantalla:**
   - La pantalla mostrará un **código PIN de 6 dígitos**.
   - El cliente o administrador aprueba el dispositivo desde su panel de control y la transmisión comenzará de inmediato.

---

## 🌐 4. Uso en Samsung Smart TV (Tizen) y LG (webOS)

Los televisores Samsung y LG ejecutan sistemas propietarios (Tizen y webOS) que no admiten archivos `.apk`:

- **Recomendación Operativa:**
  - Para Samsung / LG sin FireStick: Abrir el navegador del TV en `https://visual-fx.onrender.com`.
  - Se recomienda usar **1 o 2 pantallas simultáneas**.
  - Si una agencia requiere **3 o 4 pantallas simultáneas a 60 FPS**, se debe conectar un dispositivo económico como **Amazon FireStick Lite / 4K** o **Xiaomi TV Stick** e instalar la app nativa.
