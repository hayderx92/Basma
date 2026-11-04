package com.hayder.basma

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.location.LocationManagerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var pendingLocId: String? = null

    private val locPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
            val id = pendingLocId ?: return@registerForActivityResult
            pendingLocId = null
            val granted = res[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                    res[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (granted) fetchLocation(id) else reply(id, err("تم رفض إذن الموقع. فعّله من إعدادات التطبيق."))
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        @Suppress("DEPRECATION")
        web.settings.databaseEnabled = true
        web.settings.allowFileAccess = false
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
        }
        web.addJavascriptInterface(Bridge(), "Android")
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.__back && window.__back()) ? 'y' : 'n'") { r ->
                    if (r == null || !r.contains("y")) finish()
                }
            }
        })
    }

    // ---------- JS bridge ----------
    inner class Bridge {
        @JavascriptInterface
        fun biometric(id: String, title: String) = runOnUiThread { doBiometric(id, title) }

        @JavascriptInterface
        fun getLocation(id: String) = runOnUiThread { requestLocation(id) }

        @JavascriptInterface
        fun deviceId(): String =
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

        @JavascriptInterface
        fun deviceModel(): String = "${Build.MANUFACTURER} ${Build.MODEL}"

        @JavascriptInterface
        fun shareFile(name: String, content: String, mime: String) =
            runOnUiThread { doShareFile(name, content, mime) }

        @JavascriptInterface
        fun shareText(text: String) = runOnUiThread {
            val i = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            startActivity(Intent.createChooser(i, "مشاركة"))
        }
    }

    private fun err(msg: String): JSONObject = JSONObject().put("ok", false).put("error", msg)

    private fun reply(id: String, obj: JSONObject) {
        val js = "window.__native(${JSONObject.quote(id)}, $obj)"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    // ---------- Fingerprint ----------
    private fun doBiometric(id: String, title: String) {
        val can = BiometricManager.from(this).canAuthenticate(BIOMETRIC_STRONG)
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            val msg = when (can) {
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                    "لا توجد بصمة مسجّلة بالموبايل. سجّل بصمتك من إعدادات الموبايل أولاً."
                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                    "هذا الجهاز لا يحتوي حساس بصمة."
                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                    "حساس البصمة غير متاح حالياً، حاول بعد قليل."
                else -> "لا يمكن استخدام البصمة على هذا الجهاز (رمز $can)."
            }
            reply(id, err(msg))
            return
        }
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    reply(id, JSONObject().put("ok", true))
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    reply(id, err(errString.toString()).put("cancel",
                        errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                                errorCode == BiometricPrompt.ERROR_USER_CANCELED))
                }
            })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("ضع إصبعك على حساس البصمة")
            .setNegativeButtonText("إلغاء")
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .setConfirmationRequired(false)
            .build()
        prompt.authenticate(info)
    }

    // ---------- Location ----------
    private fun requestLocation(id: String) {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (!fine) {
            pendingLocId = id
            locPermission.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
            return
        }
        fetchLocation(id)
    }

    @SuppressLint("MissingPermission")
    private fun fetchLocation(id: String) {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!LocationManagerCompat.isLocationEnabled(lm)) {
            reply(id, err("خدمة الموقع (GPS) مطفأة. شغّلها وأعد المحاولة."))
            return
        }
        val providers = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER) &&
            lm.isProviderEnabled(LocationManager.FUSED_PROVIDER)
        ) providers.add(LocationManager.FUSED_PROVIDER)
        if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) providers.add(LocationManager.GPS_PROVIDER)
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) providers.add(LocationManager.NETWORK_PROVIDER)
        if (providers.isEmpty()) {
            reply(id, err("لا يوجد مزوّد موقع مفعّل."))
            return
        }

        val handler = Handler(Looper.getMainLooper())
        val signals = mutableListOf<CancellationSignal>()
        val listeners = mutableListOf<LocationListener>()
        var finished = false
        var best: Location? = null
        var pending = providers.size

        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            signals.forEach { runCatching { it.cancel() } }
            listeners.forEach { runCatching { lm.removeUpdates(it) } }
            val l = best
            if (l == null) reply(id, err("تعذّر تحديد موقعك. اقترب من شباك أو مكان مفتوح وأعد المحاولة."))
            else reply(id, locJson(l))
        }

        fun onLoc(l: Location?) {
            if (finished) return
            pending--
            val b = best
            if (l != null && (b == null || l.accuracy < b.accuracy)) best = l
            val nb = best
            if ((nb != null && nb.accuracy <= 40f) || pending <= 0) finish()
        }

        for (p in providers) {
            if (Build.VERSION.SDK_INT >= 30) {
                val s = CancellationSignal()
                signals.add(s)
                lm.getCurrentLocation(p, s, ContextCompat.getMainExecutor(this)) { l -> onLoc(l) }
            } else {
                val ll = object : LocationListener {
                    override fun onLocationChanged(location: Location) = onLoc(location)
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                }
                listeners.add(ll)
                @Suppress("DEPRECATION")
                lm.requestSingleUpdate(p, ll, Looper.getMainLooper())
            }
        }
        handler.postDelayed({ finish() }, 25_000)
    }

    private fun locJson(l: Location): JSONObject {
        val mock = if (Build.VERSION.SDK_INT >= 31) l.isMock else {
            @Suppress("DEPRECATION")
            l.isFromMockProvider
        }
        return JSONObject()
            .put("ok", true)
            .put("lat", l.latitude)
            .put("lng", l.longitude)
            .put("acc", l.accuracy.toDouble())
            .put("mock", mock)
    }

    // ---------- Share export ----------
    private fun doShareFile(name: String, content: String, mime: String) {
        try {
            val dir = File(cacheDir, "exports").apply { mkdirs() }
            val safe = name.replace(Regex("[^\\w.\\-]"), "_")
            val f = File(dir, safe)
            f.writeText(content, Charsets.UTF_8)
            val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
            val i = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(i, "مشاركة التقرير"))
        } catch (e: Exception) {
            web.evaluateJavascript("window.toast && toast(${JSONObject.quote("فشل التصدير: " + e.message)})", null)
        }
    }
}
