package com.metahara.homedesk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatDelegate;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    private static final String PREFS = "homedesk_native";
    private static final String KEY_AUTHENTICATED = "authenticated";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        getDelegate().setLocalNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setBackgroundColor(Color.WHITE);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        configureWebView(webView);
        webView.addJavascriptInterface(new NativeBridge(this), "HomeDeskNative");
        configureBackNavigation(webView);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSavePassword(false);
        settings.setSaveFormData(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        String version = "unknown";
        try {
            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        if (version != null) {
            settings.setUserAgentString(settings.getUserAgentString() + " MSFHomeDesk/" + version);
        }

        webView.setBackgroundColor(Color.WHITE);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
    }

    private void configureBackNavigation(WebView webView) {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    private boolean deviceHasInternet() {
        ConnectivityManager manager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private String networkLabel() {
        ConnectivityManager manager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return "Unknown";
        Network network = manager.getActiveNetwork();
        if (network == null) return "No connection";
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        if (capabilities == null) return "Connected";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi-Fi";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "Mobile data";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "VPN";
        return "Connected";
    }

    private String networkType() {
        ConnectivityManager manager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return "none";
        Network network = manager.getActiveNetwork();
        if (network == null) return "none";
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        if (capabilities == null) return "unknown";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ethernet";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "vpn";
        return "unknown";
    }

    private void storeAuthenticated(boolean authenticated) {
        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        preferences.edit().putBoolean(KEY_AUTHENTICATED, authenticated).apply();
    }

    private static class NativeBridge {
        private final WeakReference<MainActivity> activity;

        NativeBridge(MainActivity activity) {
            this.activity = new WeakReference<>(activity);
        }

        @JavascriptInterface
        public boolean isConnected() {
            MainActivity main = activity.get();
            return main != null && main.deviceHasInternet();
        }

        @JavascriptInterface
        public String getLabel() {
            MainActivity main = activity.get();
            return main == null ? "Unknown" : main.networkLabel();
        }

        @JavascriptInterface
        public String getType() {
            MainActivity main = activity.get();
            return main == null ? "none" : main.networkType();
        }

        @JavascriptInterface
        public void setAuthenticated(boolean authenticated) {
            MainActivity main = activity.get();
            if (main != null) main.storeAuthenticated(authenticated);
        }

        @JavascriptInterface
        public void clearAuthenticated() {
            MainActivity main = activity.get();
            if (main != null) main.storeAuthenticated(false);
        }
    }
}
