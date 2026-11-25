package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.content.pm.ApplicationInfo
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.time.Instant

/**
 * Своя база слушателя filesDir/capture.db: пойманные уведомления, выбор кнопками, журнал сервиса.
 *
 * Важно: JS эту базу напрямую не открывает. expo-sqlite несёт свою копию SQLite, а две копии SQLite
 * в одном процессе на одном файле портят базу (POSIX-блокировки общие на процесс, см. sqlite.org/howtocorrupt.html).
 * JS обращается к ней только через функции модуля captureQuery / captureExec.
 */
object Store {
  const val DB_NAME = "capture.db"

  /** Известные приложения банков: пакет -> название. Пакеты уточняются по реальным телефонам. */
  val KNOWN_BANKS = linkedMapOf(
    "com.idamob.tinkoff.android" to "Т-Банк",
    "ru.sberbankmobile" to "Сбер",
    "ru.vtb24.mobilebanking.android" to "ВТБ",
    "ru.alfabank.mobile.android" to "Альфа-Банк",
    "ru.ozon.fintech.finance" to "Озон Банк",
    "ru.ozon.app.android" to "Озон",
    "com.yandex.bank" to "Яндекс Банк",
    "ru.gazprombank.android.mobilebank.app" to "Газпромбанк",
    "ru.raiffeisennews" to "Райффайзен",
    "ru.nspk.mirpay" to "Mir Pay",
    // Сервисы: в пуше сумма есть, магазин это сам сервис (см. SERVICE_APPS в core).
    "ru.yandex.taxi" to "Яндекс Go",
  )

  /** Сервисы, у которых магазином в уведомлении с кнопками становится название приложения. */
  val SERVICES = setOf("Яндекс Go")

  /** Источники, добавленные в новых версиях: дописываем их и в уже сохранённый список, один раз. */
  private val ADDED_LATER = listOf("ru.yandex.taxi")

  /** Приложения СМС: стандартное на телефоне плюс распространённые. */
  private val SMS_APPS = setOf(
    "com.google.android.apps.messaging", "com.android.mms", "com.samsung.android.messaging",
    "com.android.messaging", "com.transsion.message", "com.miui.mms",
  )

  fun isSmsApp(context: Context, pkg: String): Boolean =
    pkg in SMS_APPS || pkg == android.provider.Telephony.Sms.getDefaultSmsPackage(context)

  /**
   * Отправитель СМС -> банк. Берём только такие СМС: личная переписка не сохраняется и не пишется в журнал.
   * В уведомлении приложения СМС заголовок: имя отправителя.
   */
  private val SMS_BANKS = listOf(
    Regex("^(900|9000|sberbank|сбербанк|сбер)$", RegexOption.IGNORE_CASE) to "Сбер",
    Regex("^(t-?bank|tinkoff|tbank|т-?банк|тинькофф)$", RegexOption.IGNORE_CASE) to "Т-Банк",
    Regex("^(vtb|втб)$", RegexOption.IGNORE_CASE) to "ВТБ",
    Regex("^(alfa-?bank|alfabank|альфа-?банк)$", RegexOption.IGNORE_CASE) to "Альфа-Банк",
    Regex("^(raiffeisen|райффайзен)$", RegexOption.IGNORE_CASE) to "Райффайзен",
    Regex("^(gazprombank|газпромбанк)$", RegexOption.IGNORE_CASE) to "Газпромбанк",
    Regex("^(ozon ?bank|озон ?банк)$", RegexOption.IGNORE_CASE) to "Озон Банк",
    Regex("^(yandex ?bank|яндекс ?банк)$", RegexOption.IGNORE_CASE) to "Яндекс Банк",
  )

  fun smsBank(sender: String): String? = SMS_BANKS.firstOrNull { it.first.matches(sender.trim()) }?.second

  fun smsEnabled(context: Context) = prefs(context).getBoolean("smsBanks", true)

  /** adb shell cmd notification post пишет от com.android.shell: в debug-сборке это тестовый «банк». */
  const val SHELL = "com.android.shell"

  private const val PREFS = "budget_listener"
  private const val KEY_SOURCES = "sources"

  @Volatile private var db: SQLiteDatabase? = null

  fun open(context: Context): SQLiteDatabase {
    db?.let { if (it.isOpen) return it }
    synchronized(this) {
      db?.let { if (it.isOpen) return it }
      val opened = SQLiteDatabase.openDatabase(
        File(context.filesDir, DB_NAME).path,
        null,
        SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING,
      )
      opened.rawQuery("PRAGMA busy_timeout = 5000", null).close()
      opened.execSQL(
        """CREATE TABLE IF NOT EXISTS captured_notifications (
             id TEXT PRIMARY KEY NOT NULL,
             package TEXT NOT NULL,
             app_label TEXT,
             notification_key TEXT,
             posted_at INTEGER NOT NULL,
             title TEXT,
             text TEXT,
             tracked INTEGER NOT NULL DEFAULT 0,
             processed INTEGER NOT NULL DEFAULT 0,
             operation_id TEXT
           )""",
      )
      opened.execSQL(
        """CREATE TABLE IF NOT EXISTS logs (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             ts TEXT NOT NULL,
             level TEXT NOT NULL,
             tag TEXT NOT NULL,
             message TEXT NOT NULL,
             data TEXT
           )""",
      )
      opened.execSQL("CREATE INDEX IF NOT EXISTS captured_pending ON captured_notifications(tracked, processed)")
      opened.execSQL("CREATE INDEX IF NOT EXISTS captured_operation ON captured_notifications(operation_id)")
      QuickActions.ensureTable(opened)
      db = opened
      return opened
    }
  }

  fun isDebug(context: Context) = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

  fun defaultSources(context: Context): Set<String> =
    KNOWN_BANKS.keys + if (isDebug(context)) setOf(SHELL) else emptySet()

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun sources(context: Context): Set<String> {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val saved = p.getStringSet(KEY_SOURCES, null) ?: return defaultSources(context)
    val missing = ADDED_LATER.filter { it !in saved && !p.getBoolean("added:$it", false) }
    if (missing.isEmpty()) return saved
    val next = saved + missing
    p.edit().putStringSet(KEY_SOURCES, next).apply { missing.forEach { putBoolean("added:$it", true) } }.apply()
    return next
  }

  fun setSources(context: Context, packages: Collection<String>) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY_SOURCES, packages.toSet()).apply()
  }

  /** Номера карт в журнал не пишем: длинные цифры -> «•••• 1234». */
  private val CARD = Regex("""\b(?:\d[ -]?){12,19}\b""")

  fun mask(s: String): String = CARD.replace(s) { m -> "•••• " + m.value.filter(Char::isDigit).takeLast(4) }

  /** Лог с полями: Store.logj(ctx, "info", "quick", "Показано", "amount" to 52300, "subs" to listOf(...)). */
  fun logj(context: Context, level: String, tag: String, message: String, vararg fields: Pair<String, Any?>) {
    val o = org.json.JSONObject()
    for ((k, v) in fields) o.put(k, when (v) {
      null -> org.json.JSONObject.NULL
      is Collection<*> -> org.json.JSONArray(v)
      is Array<*> -> org.json.JSONArray(v.toList())
      else -> v
    })
    log(context, level, tag, message, o.toString())
  }

  fun log(context: Context, level: String, tag: String, message: String, data: String? = null) {
    try {
      open(context).insert(
        "logs",
        null,
        ContentValues().apply {
          put("ts", Instant.now().toString())
          put("level", level)
          put("tag", tag)
          put("message", mask(message))
          put("data", data?.let(::mask))
        },
      )
    } catch (_: Throwable) {
      // журнал не должен ронять сервис
    }
  }

  /** Запрос от JS: строки как JSON-массив объектов, типы колонок сохраняются. */
  fun query(context: Context, sql: String, args: List<String>): String {
    val out = org.json.JSONArray()
    open(context).rawQuery(sql, args.toTypedArray()).use { c ->
      while (c.moveToNext()) {
        val o = org.json.JSONObject()
        for (i in 0 until c.columnCount) {
          o.put(
            c.getColumnName(i),
            when (c.getType(i)) {
              android.database.Cursor.FIELD_TYPE_NULL -> org.json.JSONObject.NULL
              android.database.Cursor.FIELD_TYPE_INTEGER -> c.getLong(i)
              android.database.Cursor.FIELD_TYPE_FLOAT -> c.getDouble(i)
              else -> c.getString(i)
            },
          )
        }
        out.put(o)
      }
    }
    return out.toString()
  }

  /** Изменения от JS: пачка [sql, args] в одной транзакции. */
  fun exec(context: Context, statements: List<List<Any?>>) {
    val d = open(context)
    d.beginTransaction()
    try {
      for (st in statements) {
        val sql = st[0] as String
        @Suppress("UNCHECKED_CAST")
        val args = (st.getOrNull(1) as? List<Any?>) ?: emptyList()
        d.execSQL(sql, args.map { it?.let { v -> if (v is Double && v % 1.0 == 0.0) v.toLong() else v } }.toTypedArray())
      }
      d.setTransactionSuccessful()
    } finally {
      d.endTransaction()
    }
  }
}
