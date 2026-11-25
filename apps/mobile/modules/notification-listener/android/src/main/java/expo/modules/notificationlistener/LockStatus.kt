package expo.modules.notificationlistener

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Остаток на экране блокировки: тихое закреплённое уведомление «Можно сегодня» с полосой лимита
 * и кнопками «+ Трата» / «Входящие». Обновляется вместе с виджетами. Включается в настройках.
 */
object LockStatus {
  // Обычная важность, но без звука: «тихие» (LOW) Android не показывает на экране блокировки.
  private const val CHANNEL = "budget_today"
  private const val ID = 7001

  // «Держать в памяти» показывает это же уведомление: фоновой службе оно обязательно.
  fun enabled(context: Context) =
    Store.prefs(context).getBoolean("lockStatus", false) || KeepAliveService.enabled(context)

  const val NOTIFICATION_ID = ID

  fun setEnabled(context: Context, on: Boolean) {
    Store.prefs(context).edit().putBoolean("lockStatus", on).apply()
    Store.log(context, "info", "lock", if (on) "Остаток на экране блокировки включён" else "Остаток на экране блокировки выключен")
    if (on) update(context) else if (!enabled(context)) NotificationManagerCompat.from(context).cancel(ID)
  }

  fun update(context: Context) {
    if (!enabled(context)) return
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Store.log(context, "warn", "lock", "Нет разрешения на уведомления, остаток не показан")
      return
    }
    val n = build(context) ?: return
    NotificationManagerCompat.from(context).notify(ID, n)
    Store.logj(context, "info", "lock", "Остаток на экране блокировки обновлён", "title" to n.extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString())
  }

  /**
   * Уведомление «Можно сегодня». Без данных виджета (JS ещё ни разу не писал сводку) для фоновой службы
   * отдаём простое «Бюджет следит за покупками», иначе null.
   */
  fun build(context: Context, placeholder: Boolean = false): android.app.Notification? {
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.deleteNotificationChannel("budget_status")
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Остаток на сегодня", NotificationManager.IMPORTANCE_DEFAULT).apply {
          setSound(null, null)
          enableVibration(false)
          description = "Закреплённое уведомление с остатком на день, видно на экране блокировки"
          setShowBadge(false)
          lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        },
      )
    }
    val v = Widgets.today(context)
    if (v == null) {
      if (!placeholder) return null
      return NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(R.drawable.ic_budget_notif)
        .setContentTitle("Бюджет следит за покупками")
        .setOngoing(true)
        .setSilent(true)
        .setShowWhen(false)
        .setContentIntent(link(context, "budget://", 11))
        .build()
    }
    val rub = QuickActions::formatRub
    val title = if (v.over) "Перерасход ${rub(-v.remaining)}" else "Можно сегодня ${rub(v.remaining)}"
    // Свёрнутый вид: только заголовок и полоса, иначе на узких экранах обрезается. Подробности в раскрытом.
    val text = "Потрачено ${rub(v.spent)} из ${rub(v.limit)}" + if (v.pending > 0) " · ${v.pending} ждут отправки" else ""
    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_budget_notif)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setProgress(100, v.pct, false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      // Своя группа: не склеивается с уведомлениями о покупках.
      .setGroup("budget_status")
      .setSortKey("0")
      .setColor(context.getColor(if (v.over) R.color.w_warn else R.color.w_accent))
      .setContentIntent(link(context, "budget://", 11))
      .addAction(0, "+ Трата", link(context, "budget://add", 12))
      .addAction(0, "Входящие", link(context, "budget://inbox", 13))
    return b.build()
  }

  private fun link(context: Context, uri: String, code: Int): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.setData(Uri.parse(uri))
    return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}
