package com.company.assettracker;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Light-only connectivity gate shown before the Capacitor WebView.
 *
 * It renders the self-contained connection check from the APK assets. Once the
 * check succeeds, the page tries to open the portal; that navigation is
 * intercepted here and passed to the real Capacitor BridgeActivity instead of
 * keeping the remote portal inside this plain WebView.
 */
public class LaunchActivity extends AppCompatActivity {
    private static final String SERVER_HOST = "house.taild2df63.ts.net";
    private static final String CHECK_ASSET = "public/index.html";
    private static final String CHECK_BASE_URL = "https://localhost/";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        getDelegate().setLocalNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_launch);
        webView = findViewById(R.id.launchWebView);
        configureWebView(webView);
        webView.loadDataWithBaseURL(
                CHECK_BASE_URL,
                readAsset(CHECK_ASSET),
                "text/html",
                "UTF-8",
                null
        );
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setSupportMultipleWindows(false);

        view.setBackgroundColor(Color.parseColor("#F8FAFC"));
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isPortal(uri)) {
                    openPortal();
                } else {
                    openExternal(uri);
                }
                return true;
            }
        });
    }

    private boolean isPortal(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        return host.equals(SERVER_HOST)
                || host.endsWith(".ts.net")
                || host.endsWith(".tailscale.net");
    }

    private void openPortal() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // No app can handle the link; stay on the connection screen.
        }
    }

    private String readAsset(String path) {
        try (InputStream input = getAssets().open(path)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (Exception error) {
            return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /></head>"
                    + "<body style=\"margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;"
                    + "color:#0f172a;font-family:system-ui,sans-serif;text-align:center;padding:24px\">"
                    + "<div><h1 style=\"font-size:1.4rem\">HomeDesk</h1>"
                    + "<p style=\"color:#64748b\">Unable to load the connection check.</p></div>"
                    + "</body></html>";
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
