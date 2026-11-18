package com.hayder.invoice

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var pdfWeb: WebView
    private lateinit var loader: WebViewAssetLoader

    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // job waiting for the hidden WebView to finish loading
    private var pending: (() -> Unit)? = null

    private val pickImage =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            fileCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        WebView.enableSlowWholeDocumentDraw()
        super.onCreate(savedInstanceState)

        loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val root = FrameLayout(this)

        // Hidden WebView used only to lay out the A4 pages for PDF / print
        pdfWeb = WebView(this)
        setup(pdfWeb)
        pdfWeb.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(r.url)

            override fun onPageFinished(view: WebView, url: String?) {
                val job = pending ?: return
                pending = null
                view.postDelayed({ job() }, 700)
            }
        }
        root.addView(pdfWeb, FrameLayout.LayoutParams(10, 10))

        web = WebView(this)
        setup(web)
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(r.url)
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                pickImage.launch("image/*")
                return true
            }
        }
        web.addJavascriptInterface(Bridge(), "Android")
        root.addView(
            web, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.__back && window.__back()) ? 'y' : 'n'") { r ->
                    if (r == null || !r.contains("y")) finish()
                }
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup(w: WebView) {
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.allowFileAccess = false
        w.settings.textZoom = 100
        w.settings.useWideViewPort = false
        w.settings.loadWithOverviewMode = false
    }

    // ---------- JS bridge ----------
    inner class Bridge {
        @JavascriptInterface
        fun makePdf(html: String, fileName: String, pages: Int) =
            runOnUiThread { renderThen(html, pages) { writePdf(fileName, pages) } }

        @JavascriptInterface
        fun print(html: String, jobName: String, pages: Int) =
            runOnUiThread { renderThen(html, pages) { doPrint(jobName) } }

        @JavascriptInterface
        fun openPdf(fileName: String) = runOnUiThread { sendFile(fileName, false) }

        @JavascriptInterface
        fun sharePdf(fileName: String) = runOnUiThread { sendFile(fileName, true) }
    }

    private fun density() = resources.displayMetrics.density

    private fun renderThen(html: String, pages: Int, job: () -> Unit) {
        val d = density()
        val w = (794 * d).roundToInt()
        val h = (1123 * d * pages).roundToInt()
        pdfWeb.layoutParams = FrameLayout.LayoutParams(w, h)
        pdfWeb.requestLayout()
        pending = job
        pdfWeb.loadDataWithBaseURL(
            "https://appassets.androidplatform.net/assets/",
            html, "text/html", "utf-8", null
        )
    }

    private fun writePdf(fileName: String, pages: Int) {
        try {
            val d = density()
            val pageHpx = 1123f * d
            val scale = 595f / (794f * d)
            val doc = PdfDocument()
            for (i in 0 until pages) {
                val info = PdfDocument.PageInfo.Builder(595, 842, i + 1).create()
                val page = doc.startPage(info)
                val c = page.canvas
                c.save()
                c.scale(scale, scale)
                c.translate(0f, -i * pageHpx)
                c.clipRect(0f, i * pageHpx, 794f * d, (i + 1) * pageHpx)
                pdfWeb.draw(c)
                c.restore()
                doc.finishPage(page)
            }
            val f = cacheFile(fileName)
            FileOutputStream(f).use { doc.writeTo(it) }
            doc.close()
            val where = copyToDownloads(f)
            callback(JSONObject().put("ok", true).put("name", f.name).put("where", where))
        } catch (e: Exception) {
            callback(JSONObject().put("ok", false).put("error", e.message ?: e.toString()))
        }
    }

    private fun doPrint(jobName: String) {
        val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
        val attrs = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
            .build()
        pm.print(jobName, pdfWeb.createPrintDocumentAdapter(jobName), attrs)
    }

    private fun safe(name: String): String {
        val n = name.replace(Regex("[\\\\/:*?\"<>|\\s]+"), "_")
        return if (n.endsWith(".pdf")) n else "$n.pdf"
    }

    private fun cacheFile(name: String): File {
        val dir = File(cacheDir, "exports").apply { mkdirs() }
        return File(dir, safe(name))
    }

    private fun copyToDownloads(f: File): String {
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val cv = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, f.name)
                    put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Invoices")
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                    ?: return ""
                contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } }
                "Download/Invoices/${f.name}"
            } else {
                val dir = File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "Invoices").apply { mkdirs() }
                val out = File(dir, f.name)
                f.copyTo(out, overwrite = true)
                out.absolutePath
            }
        } catch (e: Exception) {
            ""
        }
    }

    private fun sendFile(fileName: String, share: Boolean) {
        try {
            val f = cacheFile(fileName)
            if (!f.exists()) return
            val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
            val i = if (share) Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
            } else Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
            }
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(i, if (share) "مشاركة الفاتورة" else "فتح الفاتورة"))
        } catch (e: Exception) {
            callback(JSONObject().put("ok", false).put("error", "لا يوجد تطبيق لفتح PDF"))
        }
    }

    private fun callback(o: JSONObject) {
        runOnUiThread { web.evaluateJavascript("window.__pdfDone && window.__pdfDone($o)", null) }
    }
}
