package expo.modules.notificationlistener

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat

/**
 * «Держать в памяти»: фоновая служба с закреплённым уведомлением «Можно сегодня».
 *
 * Процесс с такой службой у Android (и у HyperOS) в самом высоком приоритете после открытого экрана:
 * его не выгружают ради памяти и не усыпляют, как обычное приложение. Служба ничего не делает и почти
 * не тратит батарею, она только держит процесс, в котором живут слушатель пушей и отправка.
 * Журнал Елены 11–12.10 (Xiaomi, Android 16): без неё прошивка выгружала приложение на сутки.
 */
class KeepAliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val n = LockStatus.build(this, placeholder = true)
    if (n == null || !enabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      if (Build.VERSION.SDK_INT >= 34)
        startForeground(LockStatus.NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(LockStatus.NOTIFICATION_ID, n)
      Store.log(this, "info", "keepalive", "Держим приложение в памяти")
    } catch (t: Throwable) {
      Store.log(this, "error", "keepalive", "Не удалось запустить фоновую службу", t.toString())
      stopSelf()
      return START_NOT_STICKY
    }
    // Система убила процесс (редко): поднимет службу снова.
    return START_STICKY
  }

  override fun onDestroy() {
    Store.log(this, "info", "keepalive", "Фоновая служба остановлена")
    super.onDestroy()
  }

  companion object {
    fun enabled(context: Context) = Store.prefs(context).getBoolean("keepAlive", false)

    fun setEnabled(context: Context, on: Boolean) {
      Store.prefs(context).edit().putBoolean("keepAlive", on).apply()
      Store.log(context, "info", "keepalive", if (on) "«Держать в памяти» включено" else "«Держать в памяти» выключено")
      if (on) start(context, "настройка")
      else {
        context.stopService(Intent(context, KeepAliveService::class.java))
        // Закреплённое уведомление остаётся, если включено «Остаток на экране блокировки».
        if (LockStatus.enabled(context)) LockStatus.update(context)
        else androidx.core.app.NotificationManagerCompat.from(context).cancel(LockStatus.NOTIFICATION_ID)
      }
    }

    /** Запустить, если включено. Из фона Android 12+ может не дать: тогда поднимет следующий запуск экрана. */
    fun start(context: Context, reason: String) {
      if (!enabled(context)) return
      try {
        ContextCompat.startForegroundService(context, Intent(context, KeepAliveService::class.java))
      } catch (t: Throwable) {
        Store.log(context, "warn", "keepalive", "Служба не запущена ($reason)", t.toString())
      }
    }
  }
}
