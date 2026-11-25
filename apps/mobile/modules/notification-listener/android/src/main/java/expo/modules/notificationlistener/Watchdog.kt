package expo.modules.notificationlistener

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.service.notification.NotificationListenerService

/**
 * Сторож раз в час (и после перезагрузки или обновления приложения): слушатель пушей подключён,
 * фоновая служба запущена, накопленное разобрано и отправлено. Будильник неточный, но срабатывает
 * и в глубоком сне (setAndAllowWhileIdle): точный не нужен и требует отдельного разрешения.
 */
object Watchdog {
  private const val EVERY_MS = 60 * 60 * 1000L
  const val ACTION = "ru.familybudget.WATCHDOG"

  fun schedule(context: Context) {
    val app = context.applicationContext
    val am = app.getSystemService(AlarmManager::class.java) ?: return
    val pi = PendingIntent.getBroadcast(
      app, 21, Intent(app, WatchdogReceiver::class.java).setAction(ACTION),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + EVERY_MS, pi)
  }

  fun run(context: Context, reason: String) {
    val connected = Store.prefs(context).getBoolean("listenerConnected", false)
    if (!connected) {
      Store.log(context, "warn", "watchdog", "Слушатель не подключён, просим переподключить ($reason)")
      NotificationListenerService.requestRebind(ComponentName(context, BudgetNotificationListener::class.java))
    }
    KeepAliveService.start(context, "сторож")
    SendKick.kick(context, "сторож: $reason")
    schedule(context)
  }
}

class WatchdogReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val reason = when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED -> "перезагрузка"
      Intent.ACTION_MY_PACKAGE_REPLACED -> "обновление приложения"
      else -> "раз в час"
    }
    Store.log(context, "info", "watchdog", "Сторож: $reason")
    Watchdog.run(context, reason)
  }
}
