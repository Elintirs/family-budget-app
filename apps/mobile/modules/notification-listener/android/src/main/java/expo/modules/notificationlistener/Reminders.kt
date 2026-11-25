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
 * Напоминания приложения: лимит 80% и 100%, «завтра списание», итоги месяца, новая версия.
 * Решает, когда показывать, JS (по данным таблицы); здесь только показ. Нажатие открывает ссылку.
 */
object Reminders {
  private const val CHANNEL = "budget_reminders"

  fun show(context: Context, key: String, title: String, text: String, url: String): Boolean {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Store.log(context, "warn", "reminder", "Нет разрешения на уведомления: «$title» не показано")
      return false
    }
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Лимиты, регулярные платежи, итоги месяца, новая версия"
        },
      )
    }
    // Один ключ — одно уведомление: повторный показ заменяет прежний, а не копит дубли.
    val id = 8000 + (key.hashCode() and 0x0FFF)
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.setData(Uri.parse(url))
    val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_budget_notif)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setGroup("budget_reminders")
      .setColor(context.getColor(R.color.w_accent))
      .setContentIntent(pi)
    NotificationManagerCompat.from(context).notify(id, b.build())
    Store.logj(context, "info", "reminder", "Напоминание показано", "key" to key, "title" to title)
    return true
  }
}
