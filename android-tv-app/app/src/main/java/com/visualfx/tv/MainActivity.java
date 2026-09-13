package com.visualfx.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String DEFAULT_SERVER_URL = "https://visual-fx.onrender.com";
    private static final String PREFS_NAME = "VisualFxTvPrefs";
    private static final String KEY_SERVER_URL = "server_url";

    private WebView webView;
    private View splashLoadingView;
    private TextView lblLoadingText;
    private boolean doubleBackToExitPressedOnce = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Mantener la pantalla encendida permanentemente en la agencia
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Modo Inmersivo Pantalla Completa (Ocultar barras del sistema)
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.mainWebView);
        splashLoadingView = findViewById(R.id.splashLoadingView);
        lblLoadingText = findViewById(R.id.lblLoadingText);

        applyImmersiveStickyMode();
        setupWebView();

        String targetUrl = getServerUrl();
        webView.loadUrl(targetUrl);
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyImmersiveStickyMode();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private void applyImmersiveStickyMode() {
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        decorView.setSystemUiVisibility(uiOptions);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        // Aceleración Nativa por Hardware (GPU Direct)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setNeedInitialFocus(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Identificador de Android TV / FireStick para auto-configuración en el frontend
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " VisualFX-AndroidTV/1.1 (Android TV; Leanback)");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Auto-conceder permisos para video y audio en directo
                request.grant(request.getResources());
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return super.onConsoleMessage(consoleMessage);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (splashLoadingView != null) {
                    splashLoadingView.setVisibility(View.GONE);
                }
                // Otorgar foco inmediato al WebView al cargar la pantalla
                if (webView != null) {
                    webView.requestFocus();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    if (lblLoadingText != null) {
                        lblLoadingText.setText("Reconectando con el servidor...");
                    }
                    // Reintento automático en caso de micro-cortes de red
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        if (webView != null) {
                            webView.reload();
                        }
                    }, 4000);
                }
            }
        });

        // Asegurar que el WebView tenga foco activo
        webView.requestFocus();
    }

    private String getServerUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
    }

    // Inyectar JavaScript de forma segura al WebView
    private void injectJs(String script) {
        if (webView != null) {
            webView.evaluateJavascript(script, null);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        int action = event.getAction();

        // 1. Salida protegida para evitar desconexiones accidentales
        if (keyCode == KeyEvent.KEYCODE_BACK && action == KeyEvent.ACTION_DOWN) {
            if (doubleBackToExitPressedOnce) {
                finish();
                return true;
            }
            this.doubleBackToExitPressedOnce = true;
            Toast.makeText(this, R.string.press_again_exit, Toast.LENGTH_SHORT).show();
            new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2500);
            return true;
        }

        // 2. Intercepción prioritaria de todas las teclas del control remoto físico en ACTION_DOWN
        if (action == KeyEvent.ACTION_DOWN) {
            switch (keyCode) {
                // Navegación D-Pad Derecha / Siguiente Módulo o Canal
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('ArrowRight');");
                    return true;

                // Navegación D-Pad Izquierda / Anterior Módulo o Canal
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_PAGE_UP:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('ArrowLeft');");
                    return true;

                // Navegación D-Pad Arriba
                case KeyEvent.KEYCODE_DPAD_UP:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('ArrowUp');");
                    return true;

                // Navegación D-Pad Abajo
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('ArrowDown');");
                    return true;

                // Botón Central OK / Enter
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Enter');");
                    return true;

                // Tecla Play/Pausa y Espacio
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                case KeyEvent.KEYCODE_SPACE:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Space');");
                    return true;

                // Acceso directo a Módulo / Grid 1
                case KeyEvent.KEYCODE_1:
                case KeyEvent.KEYCODE_NUMPAD_1:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('1');");
                    return true;

                // Acceso directo a Módulo / Grid 2
                case KeyEvent.KEYCODE_2:
                case KeyEvent.KEYCODE_NUMPAD_2:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('2');");
                    return true;

                // Acceso directo a Módulo / Grid 3
                case KeyEvent.KEYCODE_3:
                case KeyEvent.KEYCODE_NUMPAD_3:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('3');");
                    return true;

                // Acceso directo a Módulo / Grid 4
                case KeyEvent.KEYCODE_4:
                case KeyEvent.KEYCODE_NUMPAD_4:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('4');");
                    return true;

                // Menú, Guía e Información
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_INFO:
                case KeyEvent.KEYCODE_GUIDE:
                case KeyEvent.KEYCODE_SETTINGS:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Menu');");
                    return true;

                // Botones de colores
                case KeyEvent.KEYCODE_PROG_RED:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Red');");
                    return true;

                case KeyEvent.KEYCODE_PROG_GREEN:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Green');");
                    return true;

                case KeyEvent.KEYCODE_PROG_YELLOW:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Yellow');");
                    return true;

                case KeyEvent.KEYCODE_PROG_BLUE:
                    injectJs("window.handleTvRemoteKey && window.handleTvRemoteKey('Blue');");
                    return true;
            }
        }

        // 3. Despacho residual al WebView para cualquier otra tecla no mapeada
        if (webView != null && webView.dispatchKeyEvent(event)) {
            return true;
        }

        return super.dispatchKeyEvent(event);
    }
}
