package expo.modules.notificationlistener

import android.app.Notification
import android.content.ComponentName
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.security.MessageDigest

/**
 * Системный сервис: Android сам держит его подключённым и перезапускает после перезагрузки.
 * Работает без запущенного JS и пишет уведомления в SQLite:
 *  - выбранные источники (tracked = 1): все уведомления, с суммой они становятся операциями во «Входящих»;
 *  - остальные приложения: только с суммой в рублях, как кандидаты, чтобы найти пакеты банков на телефоне.
 */
class BudgetNotificationListener : NotificationListenerService() {

  override fun onListenerConnected() {
    Store.logj(this, "info", "listener", "Слушатель уведомлений подключён", "sources" to Store.sources(this).toList())
    Store.prefs(this).edit().putBoolean("listenerConnected", true).apply()
    // Процесс подняли без экрана (перезагрузка, система вернула слушатель): служба и сторож тоже.
    KeepAliveService.start(this, "слушатель подключён")
    Watchdog.schedule(this)
    catchUp()
    // После обновления приложения или перезагрузки Android убирает закреплённый остаток: возвращаем.
    LockStatus.update(this)
  }

  /**
   * Пока сервис был отключён (обновление приложения, система усыпила), пуши не доходили.
   * Те, что ещё висят в шторке, забираем при подключении; повторы отсечёт INSERT OR IGNORE.
   */
  private fun catchUp() {
    try {
      val active = activeNotifications ?: return
      val before = Store.open(this).compileStatement("SELECT COUNT(*) FROM captured_notifications").simpleQueryForLong()
      for (sbn in active) handle(sbn, catchUp = true)
      val added = Store.open(this).compileStatement("SELECT COUNT(*) FROM captured_notifications").simpleQueryForLong() - before
      Store.logj(this, "info", "listener", "Догрузка из шторки при подключении", "active" to active.size, "added" to added)
    } catch (t: Throwable) {
      Store.log(this, "error", "listener", "Догрузка из шторки не удалась", t.toString())
    }
  }

  /** Кто и почему убрал уведомление: свайп, нажатие, кнопка. Только наши и выбранных банков. */
  override fun onNotificationRemoved(sbn: StatusBarNotification, rankingMap: RankingMap?, reason: Int) {
    try {
      val own = sbn.packageName == packageName
      if (!own && !Store.sources(this).contains(sbn.packageName)) return
      val why = when (reason) {
        REASON_CLICK -> "нажали"
        REASON_CANCEL -> "смахнули"
        REASON_CANCEL_ALL -> "очистили все"
        REASON_APP_CANCEL -> "убрало приложение"
        REASON_GROUP_SUMMARY_CANCELED -> "убрали группу"
        REASON_TIMEOUT -> "истекло"
        else -> "причина $reason"
      }
      val title = sbn.notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
      Store.logj(this, "info", if (own) "quick" else "listener",
        if (own) "Наше уведомление убрано: $why" else "Уведомление банка убрано: $why",
        "package" to sbn.packageName, "title" to title, "id" to sbn.id,
        "shownSec" to (System.currentTimeMillis() - sbn.postTime) / 1000)
    } catch (_: Throwable) {}
  }

  override fun onListenerDisconnected() {
    Store.prefs(this).edit().putBoolean("listenerConnected", false).apply()
    Store.log(this, "warn", "listener", "Слушатель отключён системой, просим переподключить")
    requestRebind(ComponentName(this, BudgetNotificationListener::class.java))
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      handle(sbn)
    } catch (t: Throwable) {
      Store.log(this, "error", "listener", "Ошибка разбора уведомления", t.toString())
    }
  }

  private fun handle(sbn: StatusBarNotification, catchUp: Boolean = false) {
    if (sbn.packageName == packageName) return
    val n = sbn.notification
    val trackedPkg = Store.sources(this).contains(sbn.packageName)
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
      if (trackedPkg) Store.logj(this, "info", "listener", "Сводка группы банка пропущена", "package" to sbn.packageName,
        "title" to n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(), "text" to n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
      return
    }

    val extras = n.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n")
    val text = big ?: lines ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    var tracked = trackedPkg
    var bankLabel: String? = null
    // СМС: только от банков. Личные сообщения не сохраняем, не пишем в журнал, не считаем кандидатами.
    if (Store.isSmsApp(this, sbn.packageName)) {
      bankLabel = Store.smsBank(title) ?: return
      if (!Store.smsEnabled(this)) return
      tracked = true
    }
    val hasMoney = MONEY.containsMatchIn("$title\n$text")
    // Сбор образцов: от выбранных банков храним всё (форматы остатков, подписок, кодов),
    // от остальных приложений только уведомления с суммой в рублях (кандидаты в источники).
    if (!tracked && !hasMoney) return
    if (title.isBlank() && text.isBlank()) {
      if (tracked) Store.logj(this, "info", "listener", "Пустое уведомление банка пропущено", "package" to sbn.packageName, "extras" to extras.keySet().toList())
      return
    }
    val label = bankLabel ?: Store.KNOWN_BANKS[sbn.packageName] ?: appLabel(sbn.packageName)
    // Один и тот же пуш (обновление, повторная выдача) даёт тот же id: INSERT OR IGNORE отсекает повтор.
    // shortcut: две одинаковые покупки без остатка в тексте под тем же ключом уведомления склеятся;
    // postTime в хэш не берём, повторная выдача его меняет. Чинить, если в журнале увидим такие склейки.
    val id = sha1("${sbn.packageName}|${sbn.key}|$title|$text")
    val values = ContentValues().apply {
      put("id", id)
      put("package", sbn.packageName)
      put("app_label", label)
      put("notification_key", sbn.key)
      put("posted_at", sbn.postTime)
      put("title", title)
      put("text", text)
      put("tracked", if (tracked) 1 else 0)
    }
    val inserted = Store.open(this).insertWithOnConflict("captured_notifications", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    if (inserted == -1L) {
      Store.logj(this, "info", "listener", "Повтор уведомления, уже записано", "package" to sbn.packageName, "key" to sbn.key, "title" to title)
      return
    }

    Store.log(
      this,
      "info",
      "listener",
      when {
        tracked && hasMoney && catchUp -> "Поймано из шторки после перерыва: $label"
        tracked && hasMoney -> "Поймано уведомление: $label"
        tracked -> "Уведомление банка без суммы: $label"
        else -> "Кандидат в источники: $label"
      },
      details(sbn, id, title, text, hasMoney),
    )
    NotificationListenerModule.emitCaptured(id, sbn.packageName, tracked)
    // Старые пуши из шторки не дёргаем кнопками: только свежие, до получаса.
    val fresh = !catchUp || System.currentTimeMillis() - sbn.postTime < 30 * 60 * 1000
    if (tracked && hasMoney && fresh) QuickActions.onCaptured(this, id, label, title, text)
    // JS может быть не запущен (приложение давно не открывали): будим разбор и отправку.
    if (tracked && hasMoney) SendKick.kick(this, label)
  }

  /** Всё, что может пригодиться для точного разбора: канал, категория, подтексты, кнопки, ключи extras. */
  private fun details(sbn: StatusBarNotification, id: String, title: String, text: String, hasMoney: Boolean): String {
    val n = sbn.notification
    val e = n.extras
    fun cs(k: String) = e.getCharSequence(k)?.toString()
    return org.json.JSONObject().apply {
      put("id", id)
      put("package", sbn.packageName)
      put("title", title)
      put("text", text)
      put("hasMoney", hasMoney)
      put("shortText", cs(Notification.EXTRA_TEXT))
      put("bigText", cs(Notification.EXTRA_BIG_TEXT))
      put("subText", cs(Notification.EXTRA_SUB_TEXT))
      put("summaryText", cs(Notification.EXTRA_SUMMARY_TEXT))
      put("infoText", cs(Notification.EXTRA_INFO_TEXT))
      put("titleBig", cs(Notification.EXTRA_TITLE_BIG))
      put("lines", e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString(" | "))
      put("ticker", n.tickerText?.toString())
      put("channel", n.channelId)
      put("category", n.category)
      put("group", n.group)
      put("tag", sbn.tag)
      put("notifId", sbn.id)
      put("postTime", sbn.postTime)
      put("when", n.`when`)
      put("delaySec", (System.currentTimeMillis() - sbn.postTime) / 1000)
      put("ongoing", sbn.isOngoing)
      put("actions", org.json.JSONArray(n.actions?.map { it.title?.toString() } ?: emptyList<String>()))
      put("extrasKeys", org.json.JSONArray(e.keySet().toList()))
    }.toString()
  }

  private fun appLabel(pkg: String): String =
    try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      pkg
    }

  companion object {
    /** Сумма в рублях: «523 ₽», «1 290,00 RUB», «150 руб.», «70 112р». */
    val MONEY = Regex("""\d[\d\s  ]*(?:[.,]\d{1,2})?\s?(?:₽|руб|RUB|р(?![а-яёa-z])|р\.)""", RegexOption.IGNORE_CASE)

    fun sha1(s: String): String =
      MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    fun json(s: String): String =
      "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
  }
}
