package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Events("onCaptured")

    OnCreate {
      instance = this@NotificationListenerModule
      // Экран открыт: самое надёжное время поднять фоновую службу и завести сторожа.
      appContext.reactContext?.let {
        KeepAliveService.start(it, "запуск приложения")
        Watchdog.schedule(it)
      }
    }
    OnDestroy { if (instance === this@NotificationListenerModule) instance = null }

    Function("isPermissionGranted") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    Function("openPermissionSettings") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("isIgnoringBatteryOptimizations") {
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      context.startActivity(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    Function("requestRebind") {
      NotificationListenerService.requestRebind(ComponentName(context, BudgetNotificationListener::class.java))
    }

    Function("getSources") { Store.sources(context).toList() }

    Function("setQuickActions") { enabled: Boolean -> Store.prefs(context).edit().putBoolean("quickActions", enabled).apply() }

    Function("setSuggestions") { json: String ->
      val prefs = Store.prefs(context)
      if (prefs.getString("suggestions", null) != json) {
        prefs.edit().putString("suggestions", json).apply()
        val o = org.json.JSONObject(json)
        Store.logj(context, "info", "quick", "Подсказки для кнопок обновлены",
          "merchants" to (o.optJSONObject("byMerchant")?.length() ?: 0), "frequent" to o.optJSONArray("frequent")?.toString())
      }
    }

    /** База слушателя (capture.db) только через эти две функции: JS её напрямую не открывает. */
    Function("captureQuery") { sql: String, args: List<String> -> Store.query(context, sql, args) }
    Function("captureExec") { json: String ->
      val arr = org.json.JSONArray(json)
      val statements = (0 until arr.length()).map { i ->
        val st = arr.getJSONArray(i)
        val args = st.optJSONArray(1)
        listOf<Any?>(st.getString(0), (0 until (args?.length() ?: 0)).map { j -> args!!.get(j).takeIf { it != org.json.JSONObject.NULL } })
      }
      Store.exec(context, statements)
    }

    Function("setWidgetState") { json: String -> Widgets.save(context, json) }

    /** СМС от банков как запасной источник (по умолчанию включено). */
    Function("isSmsBanks") { Store.smsEnabled(context) }
    Function("setSmsBanks") { on: Boolean ->
      Store.prefs(context).edit().putBoolean("smsBanks", on).apply()
      Store.log(context, "info", "sources", if (on) "СМС от банков включены" else "СМС от банков выключены")
    }

    /** Онбординг: тестовое уведомление с кнопками. false: нет разрешения показывать уведомления. */
    Function("showTestNotification") { QuickActions.showTest(context) }

    /** Напоминание (лимит, регулярный платёж, итоги месяца, новая версия): нажатие открывает url. */
    Function("notify") { key: String, title: String, text: String, url: String -> Reminders.show(context, key, title, text, url) }

    /** Автозапуск: у Xiaomi, Huawei, Honor, OPPO, vivo свои экраны; иначе карточка приложения в настройках. */
    Function("openAutostartSettings") {
      val vendor = listOf(
        "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        // TECNO, Infinix, itel (Transsion): «Phone Master» -> автозапуск.
        "com.transsion.phonemaster" to "com.cyin.himgr.autostart.AutoStartActivity",
      )
      for ((pkg, cls) in vendor) {
        val i = android.content.Intent().setClassName(pkg, cls).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(i)
          return@Function pkg
        } catch (_: Throwable) {}
      }
      context.startActivity(
        android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${context.packageName}"))
          .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      "details"
    }

    /** «Держать в памяти»: фоновая служба с закреплённым уведомлением (KeepAliveService). */
    Function("setKeepAlive") { on: Boolean -> KeepAliveService.setEnabled(context, on) }
    Function("isKeepAlive") { KeepAliveService.enabled(context) }

    /** Остаток на экране блокировки (закреплённое уведомление). */
    Function("setLockStatus") { on: Boolean -> LockStatus.setEnabled(context, on) }
    Function("isLockStatus") { LockStatus.enabled(context) }

    /** Android 13+: разрешение показывать уведомления (нужно для кнопок категорий). */
    Function("canPostNotifications") {
      Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    Function("requestPostNotifications") {
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT >= 33 && activity != null) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2202)
      }
    }

    /** Выборы категорий из уведомления (кнопки на заблокированном экране), ещё не применённые. */
    Function("takeQuickChoices") {
      val db = Store.open(context)
      QuickActions.ensureTable(db)
      val out = mutableListOf<Map<String, String>>()
      db.rawQuery("SELECT captured_id, subcategory FROM quick_choices", null).use { c ->
        while (c.moveToNext()) out.add(mapOf("capturedId" to c.getString(0), "subcategory" to c.getString(1)))
      }
      out
    }

    Function("deleteQuickChoice") { capturedId: String ->
      Store.open(context).delete("quick_choices", "captured_id = ?", arrayOf(capturedId))
    }

    /** Иконка установленного приложения как data URI (PNG 96×96); null, если приложения нет. */
    Function("appIcon") { pkg: String -> appIcon(pkg) }

    Function("setSources") { packages: List<String> -> Store.setSources(context, packages) }

    /** Известные банки: установлен ли на телефоне и включён ли как источник. */
    Function("knownBanks") {
      val enabled = Store.sources(context)
      val all = Store.KNOWN_BANKS + if (Store.isDebug(context)) mapOf(Store.SHELL to "Тестовые уведомления (adb)") else emptyMap()
      all.map { (pkg, label) ->
        mapOf("package" to pkg, "label" to label, "installed" to isInstalled(pkg), "enabled" to enabled.contains(pkg))
      }
    }
  }

  private fun appIcon(pkg: String): String? =
    try {
      val drawable = context.packageManager.getApplicationIcon(pkg)
      val size = 96
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      drawable.setBounds(0, 0, size, size)
      drawable.draw(canvas)
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }

  private fun isInstalled(pkg: String): Boolean =
    try {
      context.packageManager.getPackageInfo(pkg, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      pkg == Store.SHELL
    }

  companion object {
    @Volatile private var instance: NotificationListenerModule? = null

    /** Сервис сообщает в JS о новом уведомлении, если приложение сейчас запущено. */
    fun emitCaptured(id: String, pkg: String, tracked: Boolean) {
      instance?.sendEvent("onCaptured", mapOf("id" to id, "package" to pkg, "tracked" to tracked))
    }
  }
}
