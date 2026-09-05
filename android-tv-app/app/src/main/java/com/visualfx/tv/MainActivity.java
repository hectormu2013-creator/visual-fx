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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Identificador de Android TV / FireStick para auto-configuración en el frontend
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " VisualFX-AndroidTV/1.0 (Android TV; Leanback)");

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
    }

    private String getServerUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
    }

    // Inyectar eventos de teclado al navegador web (Control Remoto D-Pad)
    private void injectKeyToWeb(String key) {
        if (webView != null) {
            String js = "window.dispatchEvent(new KeyboardEvent('keydown', { key: '" + key + "', bubbles: true }));";
            webView.evaluateJavascript(js, null);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();

            // Salida protegida para evitar desconexiones accidentales
            if (keyCode == KeyEvent.KEYCODE_BACK) {
                if (doubleBackToExitPressedOnce) {
                    finish();
                    return true;
                }
                this.doubleBackToExitPressedOnce = true;
                Toast.makeText(this, R.string.press_again_exit, Toast.LENGTH_SHORT).show();
                new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2000);
                return true;
            }

            // Teclas Numéricas del Control Remoto (1: 1 Canal, 2: 2 Canales, 3: 3 Canales, 4: Matriz 2x2)
            if (keyCode == KeyEvent.KEYCODE_1 || keyCode == KeyEvent.KEYCODE_NUMPAD_1) {
                injectKeyToWeb("1");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_2 || keyCode == KeyEvent.KEYCODE_NUMPAD_2) {
                injectKeyToWeb("2");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_3 || keyCode == KeyEvent.KEYCODE_NUMPAD_3) {
                injectKeyToWeb("3");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_4 || keyCode == KeyEvent.KEYCODE_NUMPAD_4) {
                injectKeyToWeb("4");
                return true;
            }

            // Teclas de Dirección D-Pad
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
                injectKeyToWeb("Enter");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                injectKeyToWeb("ArrowUp");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                injectKeyToWeb("ArrowDown");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                injectKeyToWeb("ArrowLeft");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                injectKeyToWeb("ArrowRight");
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
